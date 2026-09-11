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
