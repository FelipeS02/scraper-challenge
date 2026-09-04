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
  readonly runId: string;
  readonly schemaVersion: number;
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
      return outcome.reason;
    case 'ok':
      return 'ok';
  }
}

export class Scraper<TItem, TDoc, TCursor> {
  private readonly seenItemIds = new Set<string>();

  constructor(private readonly config: ScraperConfig<TItem, TDoc, TCursor>) {}

  async run(bounds: RunBounds): Promise<void> {
    const checkpoints = await this.config.checkpointStore.load();
    const seeded = await this.config.traversal.seed(bounds);
    const queue: WorkUnit<TCursor>[] = seeded.filter((candidate) => {
      const checkpoint = checkpoints.get(candidate.unitKey);
      return !checkpoint || checkpoint.state === 'failed';
    });

    const workerSlots = Math.max(1, Math.min(this.config.pool.concurrency, queue.length));
    await this.config.pool.run(
      Array.from({ length: workerSlots }, (_, index) => index),
      async () => {
        for (;;) {
          const unit = queue.shift();
          if (!unit) return;
          const requeue = await this.processUnit(unit);
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
          await this.config.documentSink.write(result.value.fileName, result.value.bytes);
        }
        await this.config.failureLedger.resolve(entry.itemId, entry.documentId);
      } else if (!result.requeue) {
        await this.config.failureLedger.record({
          itemId: entry.itemId,
          documentId: entry.documentId,
          reason: describeOutcome(result.outcome),
          observedAt: this.config.clock.now().toISOString(),
          item,
          doc,
        });
      }
    }
  }

  /** Returns `true` when the unit must be requeued (429 cooldown owns the wait). */
  private async processUnit(unit: WorkUnit<TCursor>): Promise<boolean> {
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
      const itemId = this.config.site.itemId(item);
      if (this.seenItemIds.has(itemId)) continue;
      this.seenItemIds.add(itemId); // synchronous claim — no await between check and set

      const docs = documentsByItemId.get(itemId) ?? [];
      let unitRequeue = false;
      for (const doc of docs) {
        const docResult = await this.runWithRetry(() => this.config.site.fetchDocument(item, doc));
        if (docResult.ok) {
          // Persistence is the engine's concern, driven through DocumentSink — the
          // adapter only returns bytes (trf5-adapter spec, "Document Persistence to
          // Disk"). A failed fetch never reaches here, so no file is ever written for it.
          if (docResult.value.fileName) {
            await this.config.documentSink.write(docResult.value.fileName, docResult.value.bytes);
          }
          continue;
        }
        if (docResult.requeue) {
          unitRequeue = true;
          break;
        }
        await this.config.failureLedger.record({
          itemId,
          documentId: this.config.site.documentId(doc),
          reason: describeOutcome(docResult.outcome),
          observedAt: this.config.clock.now().toISOString(),
          item,
          doc,
        });
      }
      if (unitRequeue) return true;

      await this.config.itemSink.write(this.buildEnvelope(item, itemId));
    }

    await this.config.coverageSink.write(this.buildCoverageRecord(unit, discoverResult.value));
    await this.config.checkpointStore.put({
      unitKey: unit.unitKey,
      windowKey: unit.windowKey,
      cursor: unit.cursor,
      state: classifyCellState(discoverResult.value.count, this.config.site.resultPageCap),
      observedAt: this.config.clock.now().toISOString(),
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
          await this.config.clock.sleep(decision.delayMs);
          attempt += 1;
          continue;
        case 'reprimeAndRetryNow':
          await this.config.site.reprimeSession();
          attempt += 1;
          continue;
        case 'requeue': {
          const retryAfterMs = outcome.kind === 'transient' ? outcome.retryAfterMs : null;
          this.config.rateLimiter.tripCooldown(
            retryAfterMs ?? this.config.retryPolicy.backoff(attempt),
          );
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
      state: classifyCellState(result.count, cap),
      resultCount: result.count,
      declaredCap: cap,
      saturated: result.count >= cap,
      itemSetHash: computeSetHash(itemIds),
      observedAt: this.config.clock.now().toISOString(),
      failureReason: null,
      dimensions: {},
    };
  }
}
