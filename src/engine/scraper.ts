import type { Budget } from './budget.js';
import { classifyCellState, computeSetHash, pendingDocumentFailures } from './coverage.js';
import type { Pool } from './pool.js';
import type {
  CheckpointStore,
  Clock,
  CoverageRecord,
  CoverageSink,
  DiscoverResult,
  DocumentSink,
  FailureLedger,
  ItemSink,
  LogLevel,
  Logger,
  OutputRecord,
  RunBounds,
  SitePort,
  TraversalPort,
} from './ports.js';
import type { RateLimiter } from './rate-limiter.js';
import { decide, type RetryPolicyConfig } from './retry-policy.js';
import type { FetchOutcome, WorkUnit } from './types.js';

/**
 * The two-stage discover -> fetch loop (core-scraping-engine), wired to Pool +
 * RetryPolicy + RateLimiter. Never references a concrete site (design.md D1).
 */
export interface ScraperConfig<TItem, TDoc, TCursor> {
  readonly site: SitePort<TItem, TDoc>;
  readonly traversal: TraversalPort<TCursor>;
  readonly pool: Pool;
  readonly rateLimiter: RateLimiter;
  readonly retryPolicy: RetryPolicyConfig;
  readonly clock: Clock;
  readonly itemSink: ItemSink<TItem>;
  readonly documentSink: DocumentSink;
  readonly coverageSink: CoverageSink;
  readonly checkpointStore: CheckpointStore;
  readonly failureLedger: FailureLedger;
  readonly logger: Logger;
  /**
   * Shared, run-wide bound tracker (core-run-control-and-output, "CLI Bound
   * Enforcement" + "Default Request Ceiling Requiring Override"). One instance per
   * run — the document ceiling is global, not per-cell.
   */
  readonly budget: Budget;
  readonly runId: string;
  readonly schemaVersion: number;
  /**
   * Bounds how many times a single work-unit lineage may be subdivided.
   * Exceeding it is treated exactly as a `null` result from `split()` — a
   * misbehaving port whose children never shrink the work cannot loop
   * forever (core-scraping-engine, "Saturation-Driven Subdivision").
   */
  readonly maxSplitDepth: number;
}

type RetryOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly requeue: boolean; readonly outcome: FetchOutcome<T> };

function describeOutcome(outcome: FetchOutcome<unknown>): string {
  switch (outcome.kind) {
    case 'transient':
      return `transient:${outcome.status ?? 'unknown'}`;
    case 'sessionExpired':
      return 'sessionExpired';
    case 'hostDefect':
      return outcome.reason;
    case 'permanentError':
      // Same convention `transient:${status}` already uses: the site-agnostic
      // reason crosses the seam alone; adapter-owned detail rides beside it,
      // still visible to an operator reading failures.jsonl (design.md D12).
      return outcome.detail === null ? outcome.reason : `${outcome.reason}:${outcome.detail}`;
    case 'ok':
      return 'ok';
  }
}

export class Scraper<TItem, TDoc, TCursor> {
  private readonly seenItemIds = new Set<string>();
  /**
   * Engine-owned split-depth bookkeeping, keyed by `unitKey` — never a field
   * on the adapter-generated `WorkUnit`, because the engine must not make an
   * adapter maintain the engine's own loop-safety state (design.md
   * Partitioning). A unit absent from this map is at depth 0 (seeded).
   */
  private readonly splitDepth = new Map<string, number>();

  constructor(private readonly config: ScraperConfig<TItem, TDoc, TCursor>) {}

  /**
   * Fire-and-forget event emission (core-run-control-and-output, "Structured
   * Run Observability"): a throwing `Logger` must never fail, delay, or alter
   * a run's outcome, so the engine absorbs it here rather than trusting every
   * implementation to catch its own throw.
   */
  private emit(level: LogLevel, event: string, fields: Readonly<Record<string, unknown>>): void {
    try {
      this.config.logger.log({ level, event, fields });
    } catch {
      // Absorbed by design — see the method comment above.
    }
  }

  async run(bounds: RunBounds): Promise<void> {
    const checkpoints = await this.config.checkpointStore.load();
    const isPending = (unitKey: string): boolean => {
      const checkpoint = checkpoints.get(unitKey);
      return !checkpoint || checkpoint.state === 'failed';
    };

    const seeded = await this.config.traversal.seed(bounds);
    const queue: WorkUnit<TCursor>[] = seeded.filter((candidate) => isPending(candidate.unitKey));

    // Resume: a `subdivided` checkpoint's persisted WorkUnit is reconstructed
    // and passed straight to split() — never to discover() again (design.md
    // D10, "Resume"). Re-issuing the parent's discover would return the same
    // capped set it already recorded, a wasted request that teaches the
    // engine nothing; skipping the parent outright would instead strand
    // every child a kill interrupted, since children exist only in the
    // in-memory queue.
    for (const checkpoint of checkpoints.values()) {
      if (checkpoint.state !== 'subdivided') continue;
      const reconstructed: WorkUnit<TCursor> = {
        unitKey: checkpoint.unitKey,
        windowKey: checkpoint.windowKey,
        facetValue: checkpoint.facetValue,
        label: checkpoint.label,
        cursor: checkpoint.cursor as TCursor,
      };
      const cap = this.config.site.resultPageCap;
      // The observed count from the moment this parent was ledgered
      // `subdivided`, read back verbatim off its own checkpoint — never the
      // declared cap. A site whose search reports more matches than it
      // displays would otherwise have its real coverage number silently
      // replaced by a plausible-looking substitute.
      const children = await this.config.traversal.split(reconstructed, {
        resultCount: checkpoint.resultCount,
        cap,
      });
      if (!children) continue;
      for (const child of children) {
        if (!isPending(child.unitKey)) continue;
        this.splitDepth.set(child.unitKey, 1);
        queue.push(child);
      }
    }

    const workerSlots = Math.max(1, Math.min(this.config.pool.concurrency, queue.length));
    await this.config.pool.run(
      Array.from({ length: workerSlots }, (_, index) => index),
      async () => {
        for (;;) {
          const unit = queue.shift();
          if (!unit) return;
          // Both axes stop the whole run, never just this unit: an exhausted
          // item ceiling means no further discovery should even be attempted,
          // and an exhausted request ceiling bounds every remaining fetch
          // (core-run-control-and-output, "CLI Bound Enforcement").
          if (!this.config.budget.canRecordItem() || !this.config.budget.canSpendRequest()) return;
          const requeue = await this.processUnit(unit, queue);
          if (requeue) queue.push(unit);
        }
      },
    );
  }

  /** Retries only the document fetch for a pending ledger failure — never re-discovers its cell. */
  async retryFailedDocuments(): Promise<void> {
    const entries = await this.config.failureLedger.load();
    for (const entry of pendingDocumentFailures(entries)) {
      if (entry.item === undefined || entry.doc === undefined || entry.documentId === null)
        continue;
      const item = entry.item as TItem;
      const doc = entry.doc as TDoc;
      const result = await this.runWithRetry(() => this.config.site.fetchDocument(item, doc));

      if (result.ok) {
        if (result.value.fileName) {
          const bytesWritten = await this.config.documentSink.write(
            result.value.fileName,
            result.value.bytes,
          );
          this.emit('info', 'document.persisted', {
            itemId: entry.itemId,
            documentId: entry.documentId,
            path: result.value.fileName,
            bytesWritten,
          });
        }
        await this.config.failureLedger.resolve(entry.itemId, entry.documentId);
      } else if (!result.requeue) {
        const reason = describeOutcome(result.outcome);
        this.emit('warn', 'document.failed', {
          itemId: entry.itemId,
          documentId: entry.documentId,
          reason,
        });
        await this.config.failureLedger.record({
          itemId: entry.itemId,
          documentId: entry.documentId,
          reason,
          observedAt: this.config.clock.now().toISOString(),
          item,
          doc,
        });
      }
    }
  }

  /** Returns `true` when the unit must be requeued (429 cooldown owns the wait). */
  private async processUnit(unit: WorkUnit<TCursor>, queue: WorkUnit<TCursor>[]): Promise<boolean> {
    this.emit('info', 'unit.started', { unitKey: unit.unitKey, windowKey: unit.windowKey });

    this.config.budget.recordRequest();
    const discoverResult = await this.runWithRetry(() => this.config.site.discover(unit));

    if (!discoverResult.ok) {
      if (discoverResult.requeue) return true;
      await this.config.failureLedger.record({
        itemId: unit.unitKey,
        documentId: null,
        reason: describeOutcome(discoverResult.outcome),
        observedAt: this.config.clock.now().toISOString(),
      });
      return false;
    }

    const { items, documentsByItemId } = discoverResult.value;
    for (const item of items) {
      // Stops collecting further items once --max-items is reached; the cell
      // still proceeds to its coverage/checkpoint record below, never erroring
      // the run (core-run-control-and-output, "Max-items bound").
      if (!this.config.budget.canRecordItem()) break;
      const itemId = this.config.site.itemId(item);
      if (this.seenItemIds.has(itemId)) continue;
      this.seenItemIds.add(itemId); // synchronous claim — no await between check and set
      this.config.budget.recordItem();

      const docs = documentsByItemId.get(itemId) ?? [];
      let unitRequeue = false;
      for (const doc of docs) {
        // Stops fetching further documents once --max-documents (default 10)
        // or --documents-per-item is reached, across the whole run — the
        // ceiling is global, not per-cell (core-run-control-and-output,
        // "Max-documents bound stops document fetching").
        if (!this.config.budget.canFetchDocument(itemId) || !this.config.budget.canSpendRequest())
          break;
        this.config.budget.recordDocument(itemId);
        this.config.budget.recordRequest();
        const docResult = await this.runWithRetry(() => this.config.site.fetchDocument(item, doc));
        if (docResult.ok) {
          // Persistence is the engine's concern, driven through DocumentSink — the
          // adapter only returns bytes (trf5-adapter spec, "Document Persistence to
          // Disk"). A failed fetch never reaches here, so no file is ever written for it.
          if (docResult.value.fileName) {
            const bytesWritten = await this.config.documentSink.write(
              docResult.value.fileName,
              docResult.value.bytes,
            );
            this.emit('info', 'document.persisted', {
              itemId,
              documentId: this.config.site.documentId(doc),
              path: docResult.value.fileName,
              bytesWritten,
            });
          }
          continue;
        }
        if (docResult.requeue) {
          unitRequeue = true;
          break;
        }
        {
          const reason = describeOutcome(docResult.outcome);
          const documentId = this.config.site.documentId(doc);
          this.emit('warn', 'document.failed', { itemId, documentId, reason });
          await this.config.failureLedger.record({
            itemId,
            documentId,
            reason,
            observedAt: this.config.clock.now().toISOString(),
            item,
            doc,
          });
        }
      }
      if (unitRequeue) return true;

      await this.config.itemSink.write(this.buildEnvelope(item, itemId));
    }

    const cap = this.config.site.resultPageCap;
    const resultCount = discoverResult.value.count;
    let state: 'complete' | 'truncated' | 'subdivided' = classifyCellState(resultCount, cap);

    if (state === 'truncated' && cap !== null) {
      // classifyCellState only returns 'truncated' when a cap is declared, so
      // this cell is genuinely saturated — never true for a null-cap adapter
      // (core-coverage-accounting, "Site with no declared cap never saturates").
      this.emit('warn', 'unit.saturated', { unitKey: unit.unitKey, resultCount, cap });

      const depth = this.splitDepth.get(unit.unitKey) ?? 0;
      if (depth < this.config.maxSplitDepth) {
        const children = await this.config.traversal.split(unit, { resultCount, cap });
        if (children !== null) {
          state = 'subdivided';
          for (const child of children) {
            this.splitDepth.set(child.unitKey, depth + 1);
            queue.push(child);
          }
        }
        // else: split() reports it cannot subdivide further -> stays
        // 'truncated', the explicit fallback (never the only path).
      }
      // else: max split depth already reached -> treated exactly as a `null`
      // split result, without calling split() again for this lineage.
    }

    await this.config.coverageSink.write(
      this.buildCoverageRecord(unit, discoverResult.value, state),
    );
    await this.config.checkpointStore.put({
      unitKey: unit.unitKey,
      windowKey: unit.windowKey,
      facetValue: unit.facetValue,
      label: unit.label,
      cursor: unit.cursor,
      resultCount,
      state,
      observedAt: this.config.clock.now().toISOString(),
    });
    this.emit('info', 'unit.completed', {
      unitKey: unit.unitKey,
      windowKey: unit.windowKey,
      state,
    });
    return false;
  }

  /** One request through the global rate-limiter gate, decided by RetryPolicy. */
  private async runWithRetry<T>(fetchFn: () => Promise<FetchOutcome<T>>): Promise<RetryOutcome<T>> {
    let attempt = 1;
    for (;;) {
      await this.config.rateLimiter.acquire();
      const outcome = await fetchFn();
      if (outcome.kind === 'ok') return { ok: true, value: outcome.value };

      const decision = decide(outcome, attempt, this.config.retryPolicy);
      switch (decision.action) {
        case 'retryAfter':
          this.emit('warn', 'fetch.retry', { attempt, delayMs: decision.delayMs });
          await this.config.clock.sleep(decision.delayMs);
          attempt += 1;
          continue;
        case 'reprimeAndRetryNow':
          this.emit('warn', 'session.reprimed', { attempt });
          await this.config.site.reprimeSession();
          attempt += 1;
          continue;
        case 'requeue': {
          const retryAfterMs = outcome.kind === 'transient' ? outcome.retryAfterMs : null;
          const cooldownMs = retryAfterMs ?? this.config.retryPolicy.backoff(attempt);
          this.emit('warn', 'cooldown.triggered', { attempt, cooldownMs });
          this.config.rateLimiter.tripCooldown(cooldownMs);
          return { ok: false, requeue: true, outcome };
        }
        case 'recordAndStop':
          return { ok: false, requeue: false, outcome };
      }
    }
  }

  private buildEnvelope(item: TItem, itemId: string): OutputRecord<TItem> {
    return {
      schemaVersion: this.config.schemaVersion,
      itemId,
      scrapedAt: this.config.clock.now().toISOString(),
      sourceUrl: this.config.site.sourceUrl(item),
      runId: this.config.runId,
      payload: item,
    };
  }

  private buildCoverageRecord(
    unit: WorkUnit<TCursor>,
    result: DiscoverResult<TItem, TDoc>,
    state: 'complete' | 'truncated' | 'subdivided',
  ): CoverageRecord {
    const itemIds = result.items.map((item) => this.config.site.itemId(item));
    const cap = this.config.site.resultPageCap;
    return {
      schemaVersion: this.config.schemaVersion,
      runId: this.config.runId,
      phase: 'sweep',
      unitKey: unit.unitKey,
      windowKey: unit.windowKey,
      facetValue: unit.facetValue,
      state,
      resultCount: result.count,
      declaredCap: cap,
      // A site with no declared cap never saturates (design.md D11) — this
      // guard, not a bare `>=` comparison, is what keeps `null` from being
      // silently coerced into "every count saturates" by JS's `>=` operator.
      saturated: cap !== null && result.count >= cap,
      itemSetHash: computeSetHash(itemIds),
      observedAt: this.config.clock.now().toISOString(),
      failureReason: null,
      dimensions: {},
    };
  }
}
