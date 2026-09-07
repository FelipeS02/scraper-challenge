import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Budget, unboundedBudget } from './budget.js';
import { SEEDS_STATE_KEY } from './frontier.js';
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
} from './ports.js';
import { Pool } from './pool.js';
import { RateLimiter } from './rate-limiter.js';
import type { RetryPolicyConfig } from './retry-policy.js';
import { Scraper } from './scraper.js';
import type { FetchOutcome, WorkUnit } from './types.js';
import { RecordingLogger } from './__fixtures__/recording-logger.js';

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

describe('Scraper — two-stage discover -> fetch loop', () => {
  it('still writes the item when its document fetch fails, and records the document failure', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-A' }], new Map([['item-A', [{ id: 'doc-1' }]]])),
    ]);
    site.scriptFetch('item-A', 'doc-1', [
      { kind: 'permanentError', reason: 'notFound', detail: null },
    ]);

    const { scraper, itemSink, failureLedger, logger } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
    });

    await scraper.run(bounds);

    expect(itemSink.records).toHaveLength(1);
    expect(itemSink.records[0]?.itemId).toBe('item-A');
    expect(failureLedger.entries).toHaveLength(1);
    expect(failureLedger.entries[0]).toMatchObject({ itemId: 'item-A', documentId: 'doc-1' });

    const recorded = logger as RecordingLogger;
    const documentFailed = recorded.events.find((event) => event.event === 'document.failed');
    expect(documentFailed).toMatchObject({
      level: 'warn',
      fields: { itemId: 'item-A', documentId: 'doc-1', reason: 'notFound' },
    });
  });

  it('skips the fetch stage entirely when discovery fails', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('B', [
      { kind: 'permanentError', reason: 'invalidReference', detail: 'invalidTokenShell' },
    ]);

    const { scraper, itemSink, failureLedger } = buildScraper({
      site,
      traversal: new StubTraversal([unit('B')]),
    });

    await scraper.run(bounds);

    expect(itemSink.records).toHaveLength(0);
    expect(site.fetchCalls).toBe(0);
    expect(failureLedger.entries).toHaveLength(1);
    expect(failureLedger.entries[0]).toMatchObject({ itemId: 'B', documentId: null });
  });
});

describe('Scraper — budget enforcement (core-run-control-and-output)', () => {
  it('stops collecting further items once --max-items is reached, still proceeding to summary', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [okDiscover([{ id: 'item-A' }, { id: 'item-B' }], new Map())]);

    const budget = new Budget({
      maxItems: 1,
      maxDocuments: 10,
      documentsPerItem: null,
      maxRequests: null,
    });
    const { scraper, itemSink } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
      budget,
    });

    await scraper.run(bounds);

    expect(itemSink.records).toHaveLength(1);
    expect(itemSink.records[0]?.itemId).toBe('item-A');
  });

  it('stops fetching further documents once --max-documents is reached, across the whole run', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-A' }], new Map([['item-A', [{ id: 'doc-1' }, { id: 'doc-2' }]]])),
    ]);
    site.scriptFetch('item-A', 'doc-1', [
      {
        kind: 'ok',
        value: {
          documentId: 'doc-1',
          byteLength: 1,
          contentType: null,
          fileName: 'a.pdf',
          bytes: new Uint8Array(),
        },
      },
    ]);

    const budget = new Budget({
      maxItems: null,
      maxDocuments: 1,
      documentsPerItem: null,
      maxRequests: null,
    });
    const { scraper, itemSink, documentSink } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
      budget,
    });

    await scraper.run(bounds);

    expect(documentSink.writes).toHaveLength(1);
    expect(site.fetchCalls).toBe(1); // doc-2's fetch is never issued once the ceiling is reached
    expect(itemSink.records).toHaveLength(1); // the item is still written despite the truncated document loop
  });
});

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

describe('Scraper — dedup by adapter-declared identity key and envelope shape', () => {
  it('writes the same item once across two overlapping cells, with the exact mandatory envelope', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-X' }], new Map([['item-X', [{ id: 'doc-1' }]]])),
    ]);
    site.scriptDiscover('B', [
      okDiscover([{ id: 'item-X' }], new Map([['item-X', [{ id: 'doc-1' }]]])),
    ]);
    site.scriptFetch('item-X', 'doc-1', [
      {
        kind: 'ok',
        value: {
          documentId: 'doc-1',
          byteLength: 1,
          contentType: null,
          fileName: null,
          bytes: new Uint8Array([1]),
        },
      },
    ]);

    const { scraper, itemSink } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A'), unit('B')]),
      concurrency: 2,
    });

    await scraper.run(bounds);

    expect(itemSink.records).toHaveLength(1);
    expect(Object.keys(itemSink.records[0] ?? {}).sort()).toEqual(
      ['itemId', 'payload', 'runId', 'schemaVersion', 'scrapedAt', 'sourceUrl'].sort(),
    );
    expect(itemSink.records[0]).toEqual({
      schemaVersion: 1,
      itemId: 'item-X',
      scrapedAt: '2026-01-01T00:00:00.000Z',
      sourceUrl: 'test://item/item-X',
      runId: 'run-1',
      payload: { id: 'item-X' },
    });
    // the second occurrence is a dedup hit — its document is never re-fetched
    expect(site.fetchCalls).toBe(1);
  });
});

describe('Scraper — checkpoint carries the whole opaque WorkUnit', () => {
  it('persists facetValue and label alongside cursor, not just the cursor', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [okDiscover([{ id: 'item-A' }], new Map())]);

    const facetedUnit: WorkUnit<{ readonly day: string }> = {
      unitKey: 'A',
      windowKey: '2026-01-01',
      facetValue: 'APELAÇÃO CÍVEL',
      label: '2026-01-01 / APELAÇÃO CÍVEL',
      cursor: { day: '2026-01-01' },
    };

    const { scraper, checkpointStore } = buildScraper({
      site,
      traversal: new StubTraversal([facetedUnit]),
    });

    await scraper.run(bounds);

    expect(checkpointStore.records[0]).toMatchObject({
      unitKey: 'A',
      facetValue: 'APELAÇÃO CÍVEL',
      label: '2026-01-01 / APELAÇÃO CÍVEL',
      // The observed result count at discovery time, not a value derived from
      // the declared cap — this is what lets a later resume reconstruct real
      // SaturationInfo instead of fabricating it (design.md D10, "Re-split
      // inputs").
      resultCount: 1,
    });
  });
});

describe('Scraper — write ordering and crash-resume', () => {
  it('writes items, then coverage, then checkpoint, in that order', async () => {
    const order: string[] = [];
    const site = new ScriptedSite();
    site.scriptDiscover('A', [okDiscover([{ id: 'item-A' }], new Map())]);

    const itemSink = new MemoryItemSink();
    const originalItemWrite = itemSink.write.bind(itemSink);
    itemSink.write = (record) => {
      order.push('items');
      return originalItemWrite(record);
    };
    const coverageSink = new MemoryCoverageSink();
    const originalCoverageWrite = coverageSink.write.bind(coverageSink);
    coverageSink.write = (record) => {
      order.push('coverage');
      return originalCoverageWrite(record);
    };
    const checkpointStore = new MemoryCheckpointStore();
    const originalPut = checkpointStore.put.bind(checkpointStore);
    checkpointStore.put = (record) => {
      order.push('checkpoint');
      return originalPut(record);
    };

    const { scraper } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
      itemSink,
      coverageSink,
      checkpointStore,
    });

    await scraper.run(bounds);

    expect(order).toEqual(['items', 'coverage', 'checkpoint']);
  });

  it('resumes without re-issuing discovery for an already-complete cell after a crash', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [okDiscover([{ id: 'item-A' }], new Map())]);
    site.scriptDiscover('B', [okDiscover([{ id: 'item-B' }], new Map())]);

    const checkpointStore = new MemoryCheckpointStore();
    checkpointStore.putFailsOnCall = 2; // B's checkpoint write is the simulated kill point

    const { scraper } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A'), unit('B')]),
      checkpointStore,
    });

    await expect(scraper.run(bounds)).rejects.toThrow('simulated crash');
    expect(checkpointStore.records).toHaveLength(1); // only A's checkpoint survived the crash
    expect(checkpointStore.records[0]?.unitKey).toBe('A');
    expect(site.discoverCalls).toBe(2); // A once, B once (before the crash)

    // Resume: a fresh scraper over the same checkpoint store. A has no scripted
    // discover outcome left — if it were re-discovered, ScriptedSite would throw.
    site.scriptDiscover('B', [okDiscover([{ id: 'item-B' }], new Map())]);
    const resumeItemSink = new MemoryItemSink();
    const { scraper: resumeScraper } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A'), unit('B')]),
      checkpointStore,
      itemSink: resumeItemSink,
    });

    await resumeScraper.run(bounds);

    expect(site.discoverCalls).toBe(3); // no extra discover call for A — only B's resume attempt
    expect(resumeItemSink.records.map((record) => record.itemId)).toEqual(['item-B']);
    expect(checkpointStore.records.map((record) => record.unitKey).sort()).toEqual(['A', 'B']);
  });

  it('retrying a failed document re-issues only fetchDocument, never the cell discovery', async () => {
    const site = new ScriptedSite();
    site.scriptFetch('item-A', 'doc-1', [
      {
        kind: 'ok',
        value: {
          documentId: 'doc-1',
          byteLength: 1,
          contentType: null,
          fileName: null,
          bytes: new Uint8Array([1]),
        },
      },
    ]);

    const failureLedger = new MemoryFailureLedger();
    failureLedger.entries.push({
      itemId: 'item-A',
      documentId: 'doc-1',
      reason: 'permanentError:notFound',
      observedAt: '2026-01-01T00:00:00.000Z',
      item: { id: 'item-A' },
      doc: { id: 'doc-1' },
    });

    const { scraper } = buildScraper({ site, traversal: new StubTraversal([]), failureLedger });

    await scraper.retryFailedDocuments();

    expect(site.discoverCalls).toBe(0);
    expect(site.fetchCalls).toBe(1);
    expect(failureLedger.entries.some((entry) => entry.resolved === true)).toBe(true);
  });

  it('retryFailedDocuments writes the recovered document through DocumentSink', async () => {
    const site = new ScriptedSite();
    const bytes = new Uint8Array([9, 9]);
    site.scriptFetch('item-A', 'doc-1', [
      {
        kind: 'ok',
        value: {
          documentId: 'doc-1',
          byteLength: bytes.byteLength,
          contentType: null,
          fileName: 'item-A/doc-1.pdf',
          bytes,
        },
      },
    ]);

    const failureLedger = new MemoryFailureLedger();
    failureLedger.entries.push({
      itemId: 'item-A',
      documentId: 'doc-1',
      reason: 'permanentError:notFound',
      observedAt: '2026-01-01T00:00:00.000Z',
      item: { id: 'item-A' },
      doc: { id: 'doc-1' },
    });

    const documentSink = new MemoryDocumentSink();
    const { scraper } = buildScraper({
      site,
      traversal: new StubTraversal([]),
      failureLedger,
      documentSink,
    });

    await scraper.retryFailedDocuments();

    expect(documentSink.writes).toEqual([{ path: 'item-A/doc-1.pdf', bytes }]);
  });

  it('retries a ledgered 429 document under the global cooldown without re-discovering its cell, resolving the ledger once it succeeds (task 5i.12)', async () => {
    vi.useFakeTimers();
    try {
      const site = new ScriptedSite();
      const bytes = new Uint8Array([7]);
      site.scriptFetch('item-A', 'doc-1', [
        { kind: 'transient', status: 429, retryAfterMs: 1000 },
        {
          kind: 'ok',
          value: {
            documentId: 'doc-1',
            byteLength: 1,
            contentType: null,
            fileName: 'item-A/doc-1.pdf',
            bytes,
          },
        },
      ]);

      const failureLedger = new MemoryFailureLedger();
      failureLedger.entries.push({
        itemId: 'item-A',
        documentId: 'doc-1',
        reason: 'transient:429',
        observedAt: '2026-01-01T00:00:00.000Z',
        item: { id: 'item-A' },
        doc: { id: 'doc-1' },
      });

      const documentSink = new MemoryDocumentSink();
      const { scraper } = buildScraper({
        site,
        traversal: new StubTraversal([]),
        failureLedger,
        documentSink,
      });

      const retryPromise = scraper.retryFailedDocuments();
      await vi.advanceTimersByTimeAsync(1000);
      await retryPromise;

      // Never re-discovered its cell — the whole point of retry-failed.
      expect(site.discoverCalls).toBe(0);
      expect(site.fetchCalls).toBe(2); // the 429 attempt, then the successful retry
      expect(documentSink.writes).toEqual([{ path: 'item-A/doc-1.pdf', bytes }]);
      expect(failureLedger.entries.some((entry) => entry.resolved === true)).toBe(true);
      // Never re-recorded as a second, un-resolved failure entry (the
      // requeueOnRateLimit:false fix — task 5i.12).
      expect(failureLedger.entries.filter((entry) => !entry.resolved)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Scraper — document persistence (Document Persistence to Disk)', () => {
  it('writes a successfully fetched document through the DocumentSink using the real bytes', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-A' }], new Map([['item-A', [{ id: 'doc-1' }]]])),
    ]);
    const bytes = new Uint8Array([1, 2, 3]);
    site.scriptFetch('item-A', 'doc-1', [
      {
        kind: 'ok',
        value: {
          documentId: 'doc-1',
          // Deliberately wrong: the engine must never treat this as the persisted
          // size. Only the sink's own write() result — checked in
          // infra/storage/fs-document-sink.test.ts — is the source of truth for
          // "bytes actually written".
          byteLength: 999,
          contentType: null,
          fileName: 'item-A/doc-1.pdf',
          bytes,
        },
      },
    ]);

    const documentSink = new MemoryDocumentSink();
    const { scraper, itemSink, logger } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
      documentSink,
    });

    await scraper.run(bounds);

    expect(itemSink.records).toHaveLength(1);
    expect(documentSink.writes).toEqual([{ path: 'item-A/doc-1.pdf', bytes }]);

    const recorded = logger as RecordingLogger;
    const persisted = recorded.events.find((event) => event.event === 'document.persisted');
    expect(persisted).toMatchObject({
      level: 'info',
      fields: { itemId: 'item-A', documentId: 'doc-1', path: 'item-A/doc-1.pdf', bytesWritten: 3 },
    });
  });

  it('writes no file when the document fetch fails, while still writing the item and the ledger entry', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-A' }], new Map([['item-A', [{ id: 'doc-1' }]]])),
    ]);
    site.scriptFetch('item-A', 'doc-1', [
      { kind: 'permanentError', reason: 'notFound', detail: null },
    ]);

    const documentSink = new MemoryDocumentSink();
    const { scraper, itemSink, failureLedger } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
      documentSink,
    });

    await scraper.run(bounds);

    expect(documentSink.writes).toHaveLength(0);
    expect(itemSink.records).toHaveLength(1);
    expect(failureLedger.entries).toHaveLength(1);
  });
});

describe('Scraper — document-outcome write-back (task 5i.1/5i.2: the payload tells the truth)', () => {
  it("writes fetchStatus:'fetched', the sink's real byteLength, and fileName back onto the item's matching document entry", async () => {
    const site = new ScriptedSite();
    const bytes = new Uint8Array([1, 2, 3]);
    site.scriptFetch('item-A', 'doc-1', [
      {
        kind: 'ok',
        value: {
          documentId: 'doc-1',
          byteLength: 999, // deliberately wrong — the write-back must use the sink's real size
          // Unlike byteLength, contentType is carried through verbatim: it is a
          // record of what the host declared, and the engine has nothing truer
          // to replace it with.
          contentType: 'text/plain',
          fileName: 'item-A/doc-1.pdf',
          bytes,
        },
      },
    ]);
    site.scriptFetch('item-A', 'doc-2', [
      { kind: 'permanentError', reason: 'notFound', detail: null },
    ]);

    const itemWithDocs: TestItem = {
      id: 'item-A',
      documents: [
        {
          id: 'doc-1',
          fetchStatus: 'skipped',
          byteLength: null,
          fileName: null,
          contentType: null,
        },
        {
          id: 'doc-2',
          fetchStatus: 'skipped',
          byteLength: null,
          fileName: null,
          contentType: null,
        },
        // never attempted
        {
          id: 'doc-3',
          fetchStatus: 'skipped',
          byteLength: null,
          fileName: null,
          contentType: null,
        },
      ],
    };
    site.scriptDiscover('A', [
      okDiscover([itemWithDocs], new Map([['item-A', [{ id: 'doc-1' }, { id: 'doc-2' }]]])),
    ]);

    const documentSink = new MemoryDocumentSink();
    const { scraper, itemSink } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
      documentSink,
    });

    await scraper.run(bounds);

    expect(itemSink.records).toHaveLength(1);
    const persistedDocs = itemSink.records[0]!.payload.documents;
    expect(persistedDocs).toEqual([
      {
        id: 'doc-1',
        fetchStatus: 'fetched',
        byteLength: 3,
        fileName: 'item-A/doc-1.pdf',
        // Carried from the adapter's StoredDocument: the fetch captured what
        // the host declared it was sending, so the payload records it too.
        contentType: 'text/plain',
      },
      { id: 'doc-2', fetchStatus: 'failed', byteLength: null, fileName: null, contentType: null },
      // Never attempted — untouched, still 'skipped', proving the engine only
      // calls withDocumentOutcome for a document it actually tried.
      { id: 'doc-3', fetchStatus: 'skipped', byteLength: null, fileName: null, contentType: null },
    ]);
  });
});

describe('Scraper — saturation-driven subdivision (Saturation-Driven Subdivision)', () => {
  it('calls split() on a saturated unit, enqueues its children, and records the parent as subdivided', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover(
        [{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }, { id: 'item-4' }, { id: 'item-5' }],
        new Map(),
      ),
    ]);
    site.scriptDiscover('A-child-1', [okDiscover([{ id: 'item-6' }], new Map())]);
    site.scriptDiscover('A-child-2', [okDiscover([{ id: 'item-7' }], new Map())]);

    const traversal = new StubTraversal([unit('A')]);
    traversal.scriptSplit('A', [unit('A-child-1'), unit('A-child-2')]);

    const { scraper, itemSink, coverageSink } = buildScraper({ site, traversal });

    await scraper.run(bounds);

    expect(traversal.splitCalls).toHaveLength(1);
    expect(traversal.splitCalls[0]?.unit.unitKey).toBe('A');
    expect(traversal.splitCalls[0]?.saturated).toEqual({ resultCount: 5, cap: 5 });

    // The parent's own discovered items are real items and are still written
    // (saturation is a cell-bookkeeping concern, not an item-discarding one);
    // the two children's items are written on top, proving they were actually
    // enqueued and processed, not merely requested.
    expect(itemSink.records.map((r) => r.itemId).sort()).toEqual([
      'item-1',
      'item-2',
      'item-3',
      'item-4',
      'item-5',
      'item-6',
      'item-7',
    ]);
    const parentCoverage = coverageSink.records.find((r) => r.unitKey === 'A');
    expect(parentCoverage).toMatchObject({ state: 'subdivided', resultCount: 5 });
  });

  it('records a truncated gap and enqueues nothing when split() returns null (regression: null-split path unchanged)', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover(
        [{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }, { id: 'item-4' }, { id: 'item-5' }],
        new Map(),
      ),
    ]);

    const traversal = new StubTraversal([unit('A')]); // scriptSplit never called -> split() returns null

    const { scraper, coverageSink } = buildScraper({ site, traversal });

    await scraper.run(bounds);

    expect(traversal.splitCalls).toHaveLength(1);
    const parentCoverage = coverageSink.records.find((r) => r.unitKey === 'A');
    expect(parentCoverage).toMatchObject({ state: 'truncated' });
  });

  it('bounds a lineage to the configured max split depth, recording truncated without calling split() again', async () => {
    const site = new ScriptedSite();
    const saturatedPage = () =>
      okDiscover(
        [{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }, { id: 'item-4' }, { id: 'item-5' }],
        new Map(),
      );
    site.scriptDiscover('A', [saturatedPage()]);
    site.scriptDiscover('A-child', [saturatedPage()]); // still saturated at depth 1

    const traversal = new StubTraversal([unit('A')]);
    traversal.scriptSplit('A', [unit('A-child')]);
    // Deliberately NOT scripting a split for 'A-child' — if the engine called
    // split() on it anyway, ScriptedTraversal would return null by default,
    // which would mask the depth-bound bug. splitCalls.length is the real
    // assertion below, not the child's resulting state alone.

    const { scraper, coverageSink } = buildScraper({ site, traversal, maxSplitDepth: 1 });

    await scraper.run(bounds);

    // Only the parent (depth 0 < maxSplitDepth 1) was ever split.
    expect(traversal.splitCalls).toHaveLength(1);
    expect(traversal.splitCalls[0]?.unit.unitKey).toBe('A');
    // SaturationInfo carries only resultCount/cap — depth is engine-owned
    // state, never handed to the port.
    expect(Object.keys(traversal.splitCalls[0]?.saturated ?? {}).sort()).toEqual([
      'cap',
      'resultCount',
    ]);

    const childCoverage = coverageSink.records.find((r) => r.unitKey === 'A-child');
    expect(childCoverage).toMatchObject({ state: 'truncated' });

    // The child WorkUnit that actually reached discover() carries exactly the
    // adapter-declared WorkUnit shape — no depth field was ever attached to it.
    const childDiscoverArg = site.discoveredUnits.find((u) => u.unitKey === 'A-child');
    expect(childDiscoverArg).toBeDefined();
    expect(Object.keys(childDiscoverArg ?? {}).sort()).toEqual([
      'cursor',
      'facetValue',
      'label',
      'unitKey',
      'windowKey',
    ]);
  });

  it('resumes a subdivided checkpoint by re-splitting it directly, never re-discovering, skipping already-complete children, and passes the persisted observed result count — not the declared cap — as SaturationInfo', async () => {
    const site = new ScriptedSite(); // declares resultPageCap: 5 (default)
    // 'A' (the subdivided parent) is deliberately NOT scripted for discover —
    // if the engine re-discovered it, ScriptedSite would throw.
    site.scriptDiscover('A-child-2', [okDiscover([{ id: 'item-2' }], new Map())]);

    const traversal = new StubTraversal([unit('A')]); // seed() returns the same top-level unit as the original run
    traversal.scriptSplit('A', [unit('A-child-1'), unit('A-child-2')]);

    const checkpointStore = new MemoryCheckpointStore();
    checkpointStore.records.push({
      unitKey: 'A',
      windowKey: '2026-01-01',
      facetValue: null,
      label: 'A',
      cursor: { day: '2026-01-01' },
      // Deliberately greater than the site's declared cap (5): a site whose
      // search reports more matches than it displays can persist a
      // resultCount the cap alone could never produce. Passing `cap` here
      // instead of this value is exactly the fabrication this test exists to
      // catch.
      resultCount: 7,
      state: 'subdivided',
      observedAt: '2026-01-01T00:00:00.000Z',
    });
    checkpointStore.records.push({
      unitKey: 'A-child-1',
      windowKey: '2026-01-01',
      facetValue: null,
      label: 'A-child-1',
      cursor: { day: '2026-01-01' },
      resultCount: 1,
      state: 'complete',
      observedAt: '2026-01-01T00:00:00.000Z',
    });

    const { scraper, itemSink } = buildScraper({ site, traversal, checkpointStore });

    await scraper.run(bounds);

    // Only A-child-2 was ever discovered: A was reconstructed and re-split
    // directly, never re-discovered; A-child-1 was skipped as already complete.
    expect(site.discoverCalls).toBe(1);
    expect(traversal.splitCalls).toHaveLength(1);
    expect(traversal.splitCalls[0]?.unit.unitKey).toBe('A');
    // The real assertion for this test's title: SaturationInfo carries the
    // persisted observed count (7), never the declared cap (5) substituted
    // for it.
    expect(traversal.splitCalls[0]?.saturated).toEqual({ resultCount: 7, cap: 5 });
    expect(itemSink.records.map((r) => r.itemId)).toEqual(['item-2']);
  });

  it('never treats a null-cap site as saturated, regardless of result count', async () => {
    const site = new ScriptedSite(null); // declares no result-page cap (design.md D11)
    site.scriptDiscover('A', [
      okDiscover(
        [{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }, { id: 'item-4' }, { id: 'item-5' }],
        new Map(),
      ),
    ]);

    const traversal = new StubTraversal([unit('A')]);
    const { scraper, coverageSink } = buildScraper({ site, traversal });

    await scraper.run(bounds);

    expect(traversal.splitCalls).toHaveLength(0); // never asked to subdivide
    const record = coverageSink.records.find((r) => r.unitKey === 'A');
    expect(record).toMatchObject({ state: 'complete', saturated: false, declaredCap: null });
  });
});

describe('Scraper — WorkUnit.dimensions pass-through (core-coverage-accounting delta, generic pass-through only)', () => {
  it('carries an adapter-declared dimensions bag onto the coverage record unchanged', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [okDiscover([{ id: 'item-1' }], new Map())]);

    const dimensions = { date: '2026-01-01', class: 'APELACAO CIVEL', nameProbe: 'DA SILVA' };
    const traversal = new StubTraversal([unitWithDimensions('A', dimensions)]);

    const { scraper, coverageSink } = buildScraper({ site, traversal });

    await scraper.run(bounds);

    const record = coverageSink.records.find((r) => r.unitKey === 'A');
    expect(record?.dimensions).toEqual(dimensions);
  });

  it('defaults to an empty dimensions bag when the adapter declares none (unchanged for every existing WorkUnit)', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [okDiscover([{ id: 'item-1' }], new Map())]);

    const traversal = new StubTraversal([unit('A')]);
    const { scraper, coverageSink } = buildScraper({ site, traversal });

    await scraper.run(bounds);

    const record = coverageSink.records.find((r) => r.unitKey === 'A');
    expect(record?.dimensions).toEqual({});
  });
});

describe('Scraper — site-agnostic failure vocabulary (Site-Agnostic Failure Vocabulary)', () => {
  it("ledgers just the reason when a permanentError's detail is null", async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-A' }], new Map([['item-A', [{ id: 'doc-1' }]]])),
    ]);
    site.scriptFetch('item-A', 'doc-1', [
      { kind: 'permanentError', reason: 'notFound', detail: null },
    ]);

    const { scraper, failureLedger } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
    });

    await scraper.run(bounds);

    expect(failureLedger.entries[0]?.reason).toBe('notFound');
  });

  it('ledgers reason:detail when a permanentError carries adapter-owned detail — same convention as transient:${status}', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-A' }], new Map([['item-A', [{ id: 'doc-1' }]]])),
    ]);
    site.scriptFetch('item-A', 'doc-1', [
      { kind: 'permanentError', reason: 'invalidReference', detail: 'invalidTokenShell' },
    ]);

    const { scraper, failureLedger } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
    });

    await scraper.run(bounds);

    expect(failureLedger.entries[0]?.reason).toBe('invalidReference:invalidTokenShell');
  });
});

describe('Scraper — frontier seed harvesting (core-frontier-crawl, "Deferred Phase-2 Invocation")', () => {
  it('persists no seeds at all when frontierSeedHarvest is not configured — plain scrape unaffected', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [okDiscover([{ id: 'item-A' }], new Map())]);

    const { scraper, itemSink } = buildScraper({ site, traversal: new StubTraversal([unit('A')]) });

    await scraper.run(bounds);

    expect(itemSink.records).toHaveLength(1); // the run itself is unaffected either way
  });

  it("harvests and persists every written item's seeds, tagged by the cell's own complete/truncated state", async () => {
    const site = new ScriptedSite(1); // resultPageCap 1 — 'A' (2 items) saturates
    site.scriptDiscover('A', [okDiscover([{ id: 'item-A' }, { id: 'item-B' }], new Map())]);
    site.scriptDiscover('B', [okDiscover([{ id: 'item-C' }], new Map())]); // 1 item, cap 1 — B is also saturated

    const traversal = new StubTraversal([unit('A'), unit('B')]);
    // Neither cell is scripted to split — both fall through to 'truncated',
    // exactly the state this test needs (task 6.1's own scenario cares about
    // truncated vs. complete tagging, not subdivision).

    const stateStore = new MemorySeedStateStore();
    const { scraper } = buildScraper({
      site,
      traversal,
      frontierSeedHarvest: { frontierCapable: new FakeFrontierCapable(), stateStore },
    });

    await scraper.run(bounds);

    const persisted = await stateStore.read(SEEDS_STATE_KEY);
    expect(persisted).toEqual(
      expect.arrayContaining([
        { seed: { kind: 'low', value: 'item-A' }, cellState: 'truncated' },
        { seed: { kind: 'low', value: 'item-B' }, cellState: 'truncated' },
        { seed: { kind: 'low', value: 'item-C' }, cellState: 'truncated' },
      ]),
    );
    expect(persisted).toHaveLength(3);
    // Harvesting issues zero requests of its own — discover() was called
    // exactly once per unit, nothing more (core-frontier-crawl, "Plain scrape
    // does not run frontier crawl": no frontier searches, ever, from this path).
    expect(site.discoverCalls).toBe(2);
  });

  it("tags a non-saturated cell's seeds as complete, never truncated", async () => {
    const site = new ScriptedSite(5); // resultPageCap 5 — 1 item never saturates
    site.scriptDiscover('A', [okDiscover([{ id: 'item-A' }], new Map())]);

    const stateStore = new MemorySeedStateStore();
    const { scraper } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
      frontierSeedHarvest: { frontierCapable: new FakeFrontierCapable(), stateStore },
    });

    await scraper.run(bounds);

    const persisted = await stateStore.read(SEEDS_STATE_KEY);
    expect(persisted).toEqual([{ seed: { kind: 'low', value: 'item-A' }, cellState: 'complete' }]);
  });
});

describe('Scraper — structured run observability (Structured Run Observability)', () => {
  it('emits unit.started before discovery and unit.completed after the checkpoint write', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [okDiscover([{ id: 'item-A' }], new Map())]);

    const { scraper, logger } = buildScraper({ site, traversal: new StubTraversal([unit('A')]) });

    await scraper.run(bounds);

    const recorded = logger as RecordingLogger;
    const startedIndex = recorded.events.findIndex((event) => event.event === 'unit.started');
    const completedIndex = recorded.events.findIndex((event) => event.event === 'unit.completed');

    expect(startedIndex).toBeGreaterThanOrEqual(0);
    expect(completedIndex).toBeGreaterThan(startedIndex);
    expect(recorded.events[startedIndex]).toMatchObject({
      level: 'info',
      fields: { unitKey: 'A', windowKey: '2026-01-01' },
    });
    expect(recorded.events[completedIndex]).toMatchObject({
      level: 'info',
      fields: { unitKey: 'A', windowKey: '2026-01-01', state: 'complete' },
    });
  });

  it('emits unit.saturated when a cell result count reaches the declared cap', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover(
        [{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }, { id: 'item-4' }, { id: 'item-5' }],
        new Map(),
      ),
    ]);

    const { scraper, logger } = buildScraper({ site, traversal: new StubTraversal([unit('A')]) });

    await scraper.run(bounds);

    const recorded = logger as RecordingLogger;
    const saturated = recorded.events.find((event) => event.event === 'unit.saturated');
    expect(saturated).toMatchObject({
      level: 'warn',
      fields: { unitKey: 'A', resultCount: 5, cap: 5 },
    });
  });

  it('emits fetch.retry with attempt and delay when a transient 5xx failure is retried', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      { kind: 'transient', status: 503, retryAfterMs: null },
      okDiscover([{ id: 'item-A' }], new Map()),
    ]);

    const { scraper, logger } = buildScraper({ site, traversal: new StubTraversal([unit('A')]) });

    await scraper.run(bounds);

    const recorded = logger as RecordingLogger;
    const retry = recorded.events.find((event) => event.event === 'fetch.retry');
    expect(retry).toMatchObject({ level: 'warn', fields: { attempt: 1, delayMs: 1000 } });
  });

  it('emits session.reprimed when a sessionExpired outcome triggers a re-prime', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      { kind: 'sessionExpired' },
      okDiscover([{ id: 'item-A' }], new Map()),
    ]);

    const { scraper, logger } = buildScraper({ site, traversal: new StubTraversal([unit('A')]) });

    await scraper.run(bounds);

    expect(site.reprimeCalls).toBe(1);
    const recorded = logger as RecordingLogger;
    const reprimed = recorded.events.find((event) => event.event === 'session.reprimed');
    expect(reprimed).toMatchObject({ level: 'warn', fields: { attempt: 1 } });
  });

  it('a Logger that throws does not fail the run or change its outcome', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-A' }], new Map([['item-A', [{ id: 'doc-1' }]]])),
    ]);
    site.scriptFetch('item-A', 'doc-1', [
      {
        kind: 'ok',
        value: {
          documentId: 'doc-1',
          byteLength: 1,
          contentType: null,
          fileName: 'item-A/doc-1.pdf',
          bytes: new Uint8Array([1]),
        },
      },
    ]);

    const { scraper, itemSink, coverageSink, checkpointStore } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
      logger: new ThrowingLogger(),
    });

    await expect(scraper.run(bounds)).resolves.toBeUndefined();

    expect(itemSink.records).toHaveLength(1);
    expect(itemSink.records[0]?.itemId).toBe('item-A');
    expect(coverageSink.records).toHaveLength(1);
    expect(checkpointStore.records).toHaveLength(1);
  });
});

describe('Scraper - unresolved discovery rows', () => {
  it('emits complete coverage and checkpoint records with the unresolved count for an under-cap partial discovery', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      {
        kind: 'ok',
        value: {
          items: [{ id: 'item-1' }],
          documentsByItemId: new Map(),
          count: 2,
          unresolved: [{ itemId: 'process-2', reason: 'adapter-specific failure text' }],
        },
      },
    ]);

    const { scraper, coverageSink, checkpointStore } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
    });

    await scraper.run(bounds);

    expect(coverageSink.records).toEqual([
      expect.objectContaining({
        unitKey: 'A',
        state: 'complete',
        resultCount: 2,
        unresolvedItemCount: 1,
      }),
    ]);
    expect(checkpointStore.records).toEqual([
      expect.objectContaining({
        unitKey: 'A',
        state: 'complete',
        unresolvedItemCount: 1,
      }),
    ]);
  });

  it('emits subdivided coverage and checkpoint records with the unresolved count for a saturated partial discovery', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      {
        kind: 'ok',
        value: {
          items: [{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }, { id: 'item-4' }],
          documentsByItemId: new Map(),
          count: 5,
          unresolved: [{ itemId: 'process-5', reason: 'adapter-specific failure text' }],
        },
      },
    ]);
    site.scriptDiscover('A-child', [okDiscover([{ id: 'item-child' }], new Map())]);

    const traversal = new StubTraversal([unit('A')]);
    traversal.scriptSplit('A', [unit('A-child')]);
    const { scraper, coverageSink, checkpointStore } = buildScraper({ site, traversal });

    await scraper.run(bounds);

    expect(coverageSink.records.find((record) => record.unitKey === 'A')).toMatchObject({
      state: 'subdivided',
      resultCount: 5,
      unresolvedItemCount: 1,
    });
    expect(checkpointStore.records.find((record) => record.unitKey === 'A')).toMatchObject({
      state: 'subdivided',
      unresolvedItemCount: 1,
    });
  });

  it('ledgers each adapter-declared row identity, preserves count-based splitting, and persists the unresolved count', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      {
        kind: 'ok',
        value: {
          items: [{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }, { id: 'item-4' }],
          documentsByItemId: new Map(),
          count: 5,
          unresolved: [{ itemId: 'process-5', reason: 'adapter-specific failure text' }],
        },
      },
    ]);
    const traversal = new StubTraversal([unit('A')]);
    const { scraper, coverageSink, checkpointStore, failureLedger } = buildScraper({
      site,
      traversal,
    });

    await scraper.run(bounds);

    expect(failureLedger.entries).toEqual([
      expect.objectContaining({
        itemId: 'process-5',
        documentId: null,
        reason: 'adapter-specific failure text',
      }),
    ]);
    expect(traversal.splitCalls).toHaveLength(1);
    expect(traversal.splitCalls[0]?.saturated).toEqual({ resultCount: 5, cap: 5 });
    expect(coverageSink.records[0]).toMatchObject({
      state: 'truncated',
      resultCount: 5,
      unresolvedItemCount: 1,
    });
    expect(checkpointStore.records[0]).toMatchObject({
      state: 'truncated',
      unresolvedItemCount: 1,
    });
  });
});
