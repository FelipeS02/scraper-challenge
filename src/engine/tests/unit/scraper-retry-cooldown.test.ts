/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Budget, unboundedBudget } from '../../budget.js';
import { SEEDS_STATE_KEY } from '../../frontier.js';
import type {
  AdapterStateStore,
  CheckpointRecord,
  CheckpointStore,
  Clock,
  CoverageRecord,
  CoverageSink,
  DiscoverResult,
  DocumentFetchOutcome,
  DocumentSink,
  FailureLedger,
  FrontierCapable,
  ItemSink,
  LedgerEntry,
  LogEvent,
  Logger,
  OutputRecord,
  RunBounds,
  SaturationInfo,
  Seed,
  SitePort,
  StoredDocument,
  TraversalPort,
} from '../../ports.js';
import { Pool } from '../../pool.js';
import { RateLimiter } from '../../rate-limiter.js';
import type { RetryPolicyConfig } from '../../retry-policy.js';
import { Scraper } from '../../scraper.js';
import type { FetchOutcome, WorkUnit } from '../../types.js';
import { RecordingLogger } from '../support/recording-logger.js';

/** Always throws — proves a failing Logger never fails or changes a run's outcome. */
class ThrowingLogger implements Logger {
  log(_event: LogEvent): void {
    throw new Error('simulated logger failure');
  }
}

/** One document's engine-observable fetch state within a TestItem (task 5i.1). */
interface TestDocState {
  readonly id: string;
  readonly fetchStatus: 'fetched' | 'skipped' | 'failed';
  readonly byteLength: number | null;
  readonly fileName: string | null;
  readonly contentType: string | null;
}

/**
 * Minimal non-TRF5 test payload — the loop is proven generic (design.md D1).
 * `documents` is optional and omitted by every test that does not care about
 * the write-back this slice adds (task 5i.1/5i.2); `withDocumentOutcome`
 * below is a no-op when it is absent.
 */
interface TestItem {
  readonly id: string;
  readonly documents?: readonly TestDocState[];
}
interface TestDoc {
  readonly id: string;
}

/** Scripted, per-key outcome queues — never touches a live host or a real fake timer surprise. */
class ScriptedSite implements SitePort<TestItem, TestDoc> {
  readonly identityKeyName = 'id';
  discoverCalls = 0;
  fetchCalls = 0;
  reprimeCalls = 0;
  readonly discoveredUnits: WorkUnit<unknown>[] = [];

  constructor(readonly resultPageCap: number | null = 5) {}
  private readonly discoverScript = new Map<
    string,
    FetchOutcome<DiscoverResult<TestItem, TestDoc>>[]
  >();
  private readonly fetchScript = new Map<string, FetchOutcome<StoredDocument>[]>();

  itemId(item: TestItem): string {
    return item.id;
  }
  documentId(doc: TestDoc): string {
    return doc.id;
  }
  sourceUrl(item: TestItem): string {
    return `test://item/${item.id}`;
  }

  scriptDiscover(
    unitKey: string,
    outcomes: FetchOutcome<DiscoverResult<TestItem, TestDoc>>[],
  ): void {
    this.discoverScript.set(unitKey, [...outcomes]);
  }
  scriptFetch(itemId: string, docId: string, outcomes: FetchOutcome<StoredDocument>[]): void {
    this.fetchScript.set(`${itemId}:${docId}`, [...outcomes]);
  }

  discover(unit: WorkUnit<unknown>): Promise<FetchOutcome<DiscoverResult<TestItem, TestDoc>>> {
    this.discoverCalls += 1;
    this.discoveredUnits.push(unit);
    const next = this.discoverScript.get(unit.unitKey)?.shift();
    if (!next) throw new Error(`no scripted discover outcome for ${unit.unitKey}`);
    return Promise.resolve(next);
  }

  fetchDocument(item: TestItem, doc: TestDoc): Promise<FetchOutcome<StoredDocument>> {
    this.fetchCalls += 1;
    const key = `${item.id}:${doc.id}`;
    const next = this.fetchScript.get(key)?.shift();
    if (!next) throw new Error(`no scripted fetch outcome for ${key}`);
    return Promise.resolve(next);
  }

  reprimeSession(): Promise<void> {
    this.reprimeCalls += 1;
    return Promise.resolve();
  }

  /** No-op when the test item carries no `documents` array at all. */
  withDocumentOutcome(item: TestItem, doc: TestDoc, outcome: DocumentFetchOutcome): TestItem {
    if (!item.documents) return item;
    return {
      ...item,
      documents: item.documents.map((row) =>
        row.id === doc.id
          ? {
              ...row,
              fetchStatus: outcome.fetchStatus,
              byteLength: outcome.byteLength,
              fileName: outcome.fileName,
              contentType: outcome.contentType,
            }
          : row,
      ),
    };
  }
}

class StubTraversal implements TraversalPort<{ readonly day: string }> {
  readonly facetName = 'testFacet';
  readonly splitCalls: {
    unit: WorkUnit<{ readonly day: string }>;
    saturated: SaturationInfo;
  }[] = [];
  private readonly splitScript = new Map<
    string,
    readonly WorkUnit<{ readonly day: string }>[] | null
  >();

  constructor(private readonly units: readonly WorkUnit<{ readonly day: string }>[]) {}

  seed(): Promise<readonly WorkUnit<{ readonly day: string }>[]> {
    return Promise.resolve(this.units);
  }

  /** Absent from the script -> split() returns `null` (the existing default behavior). */
  scriptSplit(
    unitKey: string,
    children: readonly WorkUnit<{ readonly day: string }>[] | null,
  ): void {
    this.splitScript.set(unitKey, children);
  }

  split(
    unit: WorkUnit<{ readonly day: string }>,
    saturated: SaturationInfo,
  ): Promise<readonly WorkUnit<{ readonly day: string }>[] | null> {
    this.splitCalls.push({ unit, saturated });
    return Promise.resolve(this.splitScript.get(unit.unitKey) ?? null);
  }
}

class MemoryItemSink implements ItemSink<TestItem> {
  readonly records: OutputRecord<TestItem>[] = [];
  write(record: OutputRecord<TestItem>): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

class MemoryDocumentSink implements DocumentSink {
  readonly writes: { path: string; bytes: Uint8Array }[] = [];
  write(path: string, bytes: Uint8Array): Promise<number> {
    this.writes.push({ path, bytes });
    return Promise.resolve(bytes.byteLength);
  }
}

class MemoryCoverageSink implements CoverageSink {
  readonly records: CoverageRecord[] = [];
  write(record: CoverageRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

class MemoryCheckpointStore implements CheckpointStore {
  readonly records: CheckpointRecord[] = [];
  putFailsOnCall: number | null = null;
  private calls = 0;
  load(): Promise<ReadonlyMap<string, CheckpointRecord>> {
    const latest = new Map<string, CheckpointRecord>();
    for (const record of this.records) latest.set(record.unitKey, record);
    return Promise.resolve(latest);
  }
  put(record: CheckpointRecord): Promise<void> {
    this.calls += 1;
    if (this.putFailsOnCall === this.calls) return Promise.reject(new Error('simulated crash'));
    this.records.push(record);
    return Promise.resolve();
  }
}

class MemoryFailureLedger implements FailureLedger {
  readonly entries: LedgerEntry[] = [];
  load(): Promise<readonly LedgerEntry[]> {
    return Promise.resolve(this.entries);
  }
  record(entry: LedgerEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
  resolve(itemId: string, documentId: string | null): Promise<void> {
    this.entries.push({
      itemId,
      documentId,
      reason: 'resolved',
      observedAt: '2026-01-01T00:00:00.000Z',
      resolved: true,
    });
    return Promise.resolve();
  }
}

class MemorySeedStateStore implements AdapterStateStore {
  private readonly data = new Map<string, unknown[]>();
  read(key: string): Promise<readonly unknown[]> {
    return Promise.resolve(this.data.get(key) ?? []);
  }
  append(key: string, value: unknown): Promise<void> {
    const existing = this.data.get(key) ?? [];
    existing.push(value);
    this.data.set(key, existing);
    return Promise.resolve();
  }
}

/** One `low`-kind seed per item id — pairs with the frontier seed-harvest tests below. */
class FakeFrontierCapable implements FrontierCapable<TestItem, { readonly day: string }> {
  readonly seedKindRanking = ['low'];
  harvestSeeds(item: TestItem): readonly Seed[] {
    return [{ kind: 'low', value: item.id }];
  }
  unitFromSeed(): WorkUnit<{ readonly day: string }> {
    throw new Error('not exercised by this suite — engine/frontier.test.ts owns unitFromSeed use');
  }
}

class FakeClock implements Clock {
  private current = new Date('2026-01-01T00:00:00.000Z');
  now(): Date {
    return this.current;
  }
  sleep(ms: number): Promise<void> {
    this.current = new Date(this.current.getTime() + ms);
    return Promise.resolve();
  }
}

const retryPolicy: RetryPolicyConfig = {
  backoff: () => 1000,
  transientCap: 5,
  hostDefectCap: 2,
  sessionExpiredCap: 1,
};

const bounds: RunBounds = { dateFrom: '2026-01-01', dateTo: '2026-01-01', maxFacetValues: 1 };

function unit(unitKey: string): WorkUnit<{ readonly day: string }> {
  return {
    unitKey,
    windowKey: '2026-01-01',
    facetValue: null,
    label: unitKey,
    cursor: { day: '2026-01-01' },
  };
}

function unitWithDimensions(
  unitKey: string,
  dimensions: Readonly<Record<string, unknown>>,
): WorkUnit<{ readonly day: string }> {
  return { ...unit(unitKey), dimensions };
}

function okDiscover(
  items: readonly TestItem[],
  documentsByItemId: ReadonlyMap<string, readonly TestDoc[]>,
): FetchOutcome<DiscoverResult<TestItem, TestDoc>> {
  return { kind: 'ok', value: { items, documentsByItemId, count: items.length } };
}

function buildScraper(overrides: {
  site: ScriptedSite;
  traversal: TraversalPort<{ readonly day: string }>;
  itemSink?: MemoryItemSink;
  documentSink?: MemoryDocumentSink;
  coverageSink?: MemoryCoverageSink;
  checkpointStore?: MemoryCheckpointStore;
  failureLedger?: MemoryFailureLedger;
  logger?: Logger;
  budget?: Budget;
  concurrency?: number;
  maxSplitDepth?: number;
  frontierSeedHarvest?: {
    readonly frontierCapable: FrontierCapable<TestItem, { readonly day: string }>;
    readonly stateStore: AdapterStateStore;
  };
}): {
  scraper: Scraper<TestItem, TestDoc, { readonly day: string }>;
  itemSink: MemoryItemSink;
  documentSink: MemoryDocumentSink;
  coverageSink: MemoryCoverageSink;
  checkpointStore: MemoryCheckpointStore;
  failureLedger: MemoryFailureLedger;
  logger: Logger;
} {
  const itemSink = overrides.itemSink ?? new MemoryItemSink();
  const documentSink = overrides.documentSink ?? new MemoryDocumentSink();
  const coverageSink = overrides.coverageSink ?? new MemoryCoverageSink();
  const checkpointStore = overrides.checkpointStore ?? new MemoryCheckpointStore();
  const failureLedger = overrides.failureLedger ?? new MemoryFailureLedger();
  const logger = overrides.logger ?? new RecordingLogger();

  const scraper = new Scraper({
    site: overrides.site,
    traversal: overrides.traversal,
    pool: new Pool(overrides.concurrency ?? 1),
    // Spacing off: this suite drives a stub site directly (no real transport),
    // and the politeness interval (engine/rate-limiter.ts, "always on" since
    // the request-spacing slice) would only add wall-clock time to tests that
    // exercise retry/cooldown/dedup/checkpoint behavior, none of which is
    // about spacing — same fix already applied to the other suites that hit
    // this (`git log`, "space requests by a politeness interval").
    rateLimiter: new RateLimiter(0),
    retryPolicy,
    clock: new FakeClock(),
    itemSink,
    documentSink,
    coverageSink,
    checkpointStore,
    failureLedger,
    logger,
    budget: overrides.budget ?? unboundedBudget(),
    maxSplitDepth: overrides.maxSplitDepth ?? 3,
    runId: 'run-1',
    schemaVersion: 1,
    ...(overrides.frontierSeedHarvest
      ? { frontierSeedHarvest: overrides.frontierSeedHarvest }
      : {}),
  });

  return { scraper, itemSink, documentSink, coverageSink, checkpointStore, failureLedger, logger };
}

describe('Scraper — 429 wait-duration composition', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('requeues the unit and lets the global cooldown own the wait, honoring Retry-After precedence', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      { kind: 'transient', status: 429, retryAfterMs: 5000 },
      okDiscover([{ id: 'item-A' }], new Map()),
    ]);

    const { scraper, itemSink, logger } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
    });

    const runPromise = scraper.run(bounds);
    await vi.advanceTimersByTimeAsync(4999);
    expect(itemSink.records).toHaveLength(0); // still cooling down — Retry-After wins over the 1000ms backoff stub
    await vi.advanceTimersByTimeAsync(1);
    await runPromise;

    expect(itemSink.records).toHaveLength(1);
    expect(site.discoverCalls).toBe(2); // requeued: discovery re-issued once cooldown elapsed

    const recorded = logger as RecordingLogger;
    const cooldown = recorded.events.find((event) => event.event === 'cooldown.triggered');
    expect(cooldown).toMatchObject({ level: 'warn', fields: { attempt: 1, cooldownMs: 5000 } });
  });

  it('keeps the item and its documents when a 429 persists past transientCap on ONE document — never requeues the whole unit (task 5i.10/5i.11: the S5j-disclosed item-loss defect)', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-A' }], new Map([['item-A', [{ id: 'doc-1' }, { id: 'doc-2' }]]])),
    ]);
    // transientCap is 5 (top-of-file retryPolicy): attempts 1-5 all decide
    // 'requeue' (429 is unconditional below the cap); attempt 6 exceeds the
    // cap and decides 'recordAndStop' regardless of outcome kind — so 6
    // scripted 429s are needed to observe genuine exhaustion, not 5.
    site.scriptFetch('item-A', 'doc-1', [
      { kind: 'transient', status: 429, retryAfterMs: 3000 }, // Retry-After honoured on attempt 1
      { kind: 'transient', status: 429, retryAfterMs: null }, // falls back to the 1000ms backoff stub
      { kind: 'transient', status: 429, retryAfterMs: null },
      { kind: 'transient', status: 429, retryAfterMs: null },
      { kind: 'transient', status: 429, retryAfterMs: null },
      { kind: 'transient', status: 429, retryAfterMs: null },
    ]);
    site.scriptFetch('item-A', 'doc-2', [
      {
        kind: 'ok',
        value: {
          documentId: 'doc-2',
          byteLength: 2,
          contentType: null,
          fileName: 'item-A/doc-2.pdf',
          bytes: new Uint8Array([1, 2]),
        },
      },
    ]);

    const { scraper, itemSink, documentSink, failureLedger, logger } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
    });

    const runPromise = scraper.run(bounds);
    await vi.advanceTimersByTimeAsync(20000); // generous: 3000 + 4x1000 = 7000ms of cooldowns
    await runPromise;

    // (a) the item is still written — never silently dropped.
    expect(itemSink.records).toHaveLength(1);
    expect(itemSink.records[0]?.itemId).toBe('item-A');
    // (b) doc-1's exhausted 429 is ledgered, keyed to the right document.
    expect(failureLedger.entries).toHaveLength(1);
    expect(failureLedger.entries[0]).toMatchObject({ itemId: 'item-A', documentId: 'doc-1' });
    expect(failureLedger.entries[0]?.reason).toBe('transient:429');
    // (c) the loop continued to doc-2 — never requeued the whole item/unit.
    expect(documentSink.writes).toEqual([
      { path: 'item-A/doc-2.pdf', bytes: new Uint8Array([1, 2]) },
    ]);
    expect(site.discoverCalls).toBe(1); // discover() was never re-issued — no unit requeue happened

    // The global cooldown still trips on every 429, and Retry-After still
    // wins over the computed backoff on the attempt that carries it (D6
    // unweakened by this fix).
    // 5 requeue decisions (attempts 1-5, each <= transientCap) trip the
    // cooldown; the 6th attempt exceeds transientCap and decides
    // recordAndStop directly (decide() checks the attempt cap before the 429
    // special-case) — six fetch attempts were made, but only five cooldowns.
    const recorded = logger as RecordingLogger;
    const cooldowns = recorded.events.filter((event) => event.event === 'cooldown.triggered');
    expect(cooldowns).toHaveLength(5);
    expect(cooldowns[0]).toMatchObject({ fields: { attempt: 1, cooldownMs: 3000 } });
    expect(cooldowns[1]).toMatchObject({ fields: { attempt: 2, cooldownMs: 1000 } });
  });

  it('still requeues the whole unit on a discovery-level 429 — task 5i.10/5i.11 leaves this path untouched (nothing is claimed yet at discover time)', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      { kind: 'transient', status: 429, retryAfterMs: 1000 },
      okDiscover([{ id: 'item-A' }], new Map()),
    ]);

    const { scraper, itemSink } = buildScraper({ site, traversal: new StubTraversal([unit('A')]) });

    const runPromise = scraper.run(bounds);
    await vi.advanceTimersByTimeAsync(1000);
    await runPromise;

    expect(site.discoverCalls).toBe(2); // requeued and re-discovered, exactly as before this slice
    expect(itemSink.records).toHaveLength(1);
  });
});
