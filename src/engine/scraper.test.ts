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
  OutputRecord,
  RunBounds,
  SitePort,
  StoredDocument,
  TraversalPort,
} from './ports.js';
import { Pool } from './pool.js';
import { RateLimiter } from './rate-limiter.js';
import type { RetryPolicyConfig } from './retry-policy.js';
import { Scraper } from './scraper.js';
import type { FetchOutcome, WorkUnit } from './types.js';

/** Minimal non-TRF5 test payload — the loop is proven generic (design.md D1). */
interface TestItem {
  readonly id: string;
}
interface TestDoc {
  readonly id: string;
}

/** Scripted, per-key outcome queues — never touches a live host or a real fake timer surprise. */
class ScriptedSite implements SitePort<TestItem, TestDoc> {
  readonly resultPageCap = 5;
  readonly identityKeyName = 'id';
  discoverCalls = 0;
  fetchCalls = 0;
  reprimeCalls = 0;
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
  constructor(private readonly units: readonly WorkUnit<{ readonly day: string }>[]) {}
  seed(): Promise<readonly WorkUnit<{ readonly day: string }>[]> {
    return Promise.resolve(this.units);
  }
  split(): Promise<null> {
    return Promise.resolve(null);
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
  concurrency?: number;
}): {
  scraper: Scraper<TestItem, TestDoc, { readonly day: string }>;
  itemSink: MemoryItemSink;
  documentSink: MemoryDocumentSink;
  coverageSink: MemoryCoverageSink;
  checkpointStore: MemoryCheckpointStore;
  failureLedger: MemoryFailureLedger;
} {
  const itemSink = overrides.itemSink ?? new MemoryItemSink();
  const documentSink = overrides.documentSink ?? new MemoryDocumentSink();
  const coverageSink = overrides.coverageSink ?? new MemoryCoverageSink();
  const checkpointStore = overrides.checkpointStore ?? new MemoryCheckpointStore();
  const failureLedger = overrides.failureLedger ?? new MemoryFailureLedger();

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
    runId: 'run-1',
    schemaVersion: 1,
  });

  return { scraper, itemSink, documentSink, coverageSink, checkpointStore, failureLedger };
}

describe('Scraper — two-stage discover -> fetch loop', () => {
  it('still writes the item when its document fetch fails, and records the document failure', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-A' }], new Map([['item-A', [{ id: 'doc-1' }]]])),
    ]);
    site.scriptFetch('item-A', 'doc-1', [{ kind: 'permanentError', reason: 'notFound' }]);

    const { scraper, itemSink, failureLedger } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
    });

    await scraper.run(bounds);

    expect(itemSink.records).toHaveLength(1);
    expect(itemSink.records[0]?.itemId).toBe('item-A');
    expect(failureLedger.entries).toHaveLength(1);
    expect(failureLedger.entries[0]).toMatchObject({ itemId: 'item-A', documentId: 'doc-1' });
  });

  it('skips the fetch stage entirely when discovery fails', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('B', [{ kind: 'permanentError', reason: 'invalidTokenShell' }]);

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

    const { scraper, itemSink } = buildScraper({ site, traversal: new StubTraversal([unit('A')]) });

    const runPromise = scraper.run(bounds);
    await vi.advanceTimersByTimeAsync(4999);
    expect(itemSink.records).toHaveLength(0); // still cooling down — Retry-After wins over the 1000ms backoff stub
    await vi.advanceTimersByTimeAsync(1);
    await runPromise;

    expect(itemSink.records).toHaveLength(1);
    expect(site.discoverCalls).toBe(2); // requeued: discovery re-issued once cooldown elapsed
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
    const { scraper, itemSink } = buildScraper({
      site,
      traversal: new StubTraversal([unit('A')]),
      documentSink,
    });

    await scraper.run(bounds);

    expect(itemSink.records).toHaveLength(1);
    expect(documentSink.writes).toEqual([{ path: 'item-A/doc-1.pdf', bytes }]);
  });

  it('writes no file when the document fetch fails, while still writing the item and the ledger entry', async () => {
    const site = new ScriptedSite();
    site.scriptDiscover('A', [
      okDiscover([{ id: 'item-A' }], new Map([['item-A', [{ id: 'doc-1' }]]])),
    ]);
    site.scriptFetch('item-A', 'doc-1', [{ kind: 'permanentError', reason: 'notFound' }]);

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
