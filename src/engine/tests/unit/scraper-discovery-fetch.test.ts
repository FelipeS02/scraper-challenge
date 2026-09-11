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
