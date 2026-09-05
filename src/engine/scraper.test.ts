import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CheckpointRecord,
  CheckpointStore,
  Clock,
  CoverageRecord,
  CoverageSink,
  DiscoverResult,
  DocumentSink,
  FailureLedger,
  ItemSink,
  LedgerEntry,
  LogEvent,
  Logger,
  OutputRecord,
  RunBounds,
  SaturationInfo,
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

/** Minimal non-TRF5 test payload — the loop is proven generic (design.md D1). */
interface TestItem {
  readonly id: string;
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
  concurrency?: number;
  maxSplitDepth?: number;
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
    rateLimiter: new RateLimiter(),
    retryPolicy,
    clock: new FakeClock(),
    itemSink,
    documentSink,
    coverageSink,
    checkpointStore,
    failureLedger,
    logger,
    maxSplitDepth: overrides.maxSplitDepth ?? 3,
    runId: 'run-1',
    schemaVersion: 1,
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
