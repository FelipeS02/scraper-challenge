import { describe, expect, it } from 'vitest';
import { Budget, unboundedBudget } from '../../budget.js';
import {
  harvestAndPersistSeeds,
  rankSeeds,
  runFrontierCrawl,
  SEEDS_STATE_KEY,
  type PersistedSeed,
} from '../../frontier.js';
import type {
  AdapterStateStore,
  DiscoverResult,
  FailureLedger,
  FrontierCapable,
  ItemSink,
  LedgerEntry,
  OutputRecord,
  RunBounds,
  SaturationInfo,
  Seed,
  SitePort,
  StoredDocument,
  TraversalPort,
} from '../../ports.js';
import { RateLimiter } from '../../rate-limiter.js';
import type { FetchOutcome, WorkUnit } from '../../types.js';

/**
 * Frontier crawl (core-frontier-crawl) — proven against a fake, non-TRF5 adapter, the
 * same portability discipline the rest of `engine/` uses (design.md D1).
 */

interface FakeItem {
  readonly id: string;
}
interface FakeDoc {
  readonly id: string;
}
interface FakeCursor {
  readonly seedValue: string;
}

class MemoryAdapterStateStore implements AdapterStateStore {
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

class MemoryItemSink implements ItemSink<FakeItem> {
  readonly records: OutputRecord<FakeItem>[] = [];
  write(record: OutputRecord<FakeItem>): Promise<void> {
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

class FakeFrontierCapable implements FrontierCapable<FakeItem, FakeCursor> {
  readonly seedKindRanking = ['high', 'low'];

  harvestSeeds(item: FakeItem): readonly Seed[] {
    return [{ kind: 'low', value: item.id }];
  }

  unitFromSeed(seed: Seed, bounds: RunBounds): WorkUnit<FakeCursor> {
    return {
      unitKey: `frontier|${seed.kind}|${seed.value}`,
      windowKey: `${bounds.dateFrom}..${bounds.dateTo}`,
      facetValue: null,
      label: seed.value,
      cursor: { seedValue: seed.value },
    };
  }
}

/** Scripted discover outcomes keyed by unitKey — a search issued with no script throws. */
class ScriptedFrontierSite implements SitePort<FakeItem, FakeDoc> {
  readonly identityKeyName = 'id';
  discoverCalls: string[] = [];
  private readonly script = new Map<string, FetchOutcome<DiscoverResult<FakeItem, FakeDoc>>[]>();

  constructor(readonly resultPageCap: number | null = 5) {}

  scriptDiscover(
    unitKey: string,
    outcomes: FetchOutcome<DiscoverResult<FakeItem, FakeDoc>>[],
  ): void {
    this.script.set(unitKey, [...outcomes]);
  }

  itemId(item: FakeItem): string {
    return item.id;
  }
  documentId(doc: FakeDoc): string {
    return doc.id;
  }
  sourceUrl(item: FakeItem): string {
    return `fake://item/${item.id}`;
  }
  discover(unit: WorkUnit<unknown>): Promise<FetchOutcome<DiscoverResult<FakeItem, FakeDoc>>> {
    this.discoverCalls.push(unit.unitKey);
    const next = this.script.get(unit.unitKey)?.shift();
    if (!next) throw new Error(`no scripted discover outcome for ${unit.unitKey}`);
    return Promise.resolve(next);
  }
  fetchDocument(): Promise<FetchOutcome<StoredDocument>> {
    throw new Error('frontier crawl never fetches documents in this slice');
  }
  reprimeSession(): Promise<void> {
    return Promise.resolve();
  }
  withDocumentOutcome(item: FakeItem): FakeItem {
    return item;
  }
}

class StubFrontierTraversal implements TraversalPort<FakeCursor> {
  readonly facetName = 'fakeFacet';
  splitCalls = 0;
  private readonly splitScript = new Map<string, readonly WorkUnit<FakeCursor>[] | null>();

  scriptSplit(unitKey: string, children: readonly WorkUnit<FakeCursor>[] | null): void {
    this.splitScript.set(unitKey, children);
  }
  seed(): Promise<readonly WorkUnit<FakeCursor>[]> {
    return Promise.resolve([]);
  }
  split(
    unit: WorkUnit<FakeCursor>,
    _saturated: SaturationInfo,
  ): Promise<readonly WorkUnit<FakeCursor>[] | null> {
    this.splitCalls += 1;
    return Promise.resolve(this.splitScript.get(unit.unitKey) ?? null);
  }
}

function okDiscover(items: readonly FakeItem[]): FetchOutcome<DiscoverResult<FakeItem, FakeDoc>> {
  return { kind: 'ok', value: { items, documentsByItemId: new Map(), count: items.length } };
}

const bounds: RunBounds = { dateFrom: '2026-01-01', dateTo: '2026-01-01', maxFacetValues: 1 };
const clock = { now: () => new Date('2026-01-01T00:00:00.000Z'), sleep: () => Promise.resolve() };

describe('rankSeeds (core-frontier-crawl, "Seed Harvesting and Prioritization")', () => {
  it('selects the higher-ranked seed kind first, for seeds from the same cell state', () => {
    const persisted: PersistedSeed[] = [
      { seed: { kind: 'low', value: 'l1' }, cellState: 'complete' },
      { seed: { kind: 'high', value: 'h1' }, cellState: 'complete' },
    ];

    const ranked = rankSeeds(persisted, ['high', 'low']);

    expect(ranked).toEqual([
      { kind: 'high', value: 'h1' },
      { kind: 'low', value: 'l1' },
    ]);
  });

  it('schedules truncated-cell seeds before complete-cell seeds, regardless of kind ranking', () => {
    const persisted: PersistedSeed[] = [
      { seed: { kind: 'high', value: 'h1' }, cellState: 'complete' },
      { seed: { kind: 'low', value: 'l1' }, cellState: 'truncated' },
    ];

    const ranked = rankSeeds(persisted, ['high', 'low']);

    expect(ranked).toEqual([
      { kind: 'low', value: 'l1' },
      { kind: 'high', value: 'h1' },
    ]);
  });
});

describe('harvestAndPersistSeeds (core-frontier-crawl, "Deferred Phase-2 Invocation")', () => {
  it('persists every harvested seed tagged with the given cell state, issuing no request', async () => {
    const stateStore = new MemoryAdapterStateStore();
    const frontierCapable = new FakeFrontierCapable();

    await harvestAndPersistSeeds(frontierCapable, stateStore, { id: 'item-1' }, 'truncated');

    const persisted = await stateStore.read(SEEDS_STATE_KEY);
    expect(persisted).toEqual([{ seed: { kind: 'low', value: 'item-1' }, cellState: 'truncated' }]);
  });
});

describe('runFrontierCrawl — reads seeds a prior process persisted (core-frontier-crawl, "Frontier run consumes seeds from a prior process")', () => {
  it('reads and searches seeds from a store it never wrote to itself', async () => {
    const stateStore = new MemoryAdapterStateStore();
    await stateStore.append(SEEDS_STATE_KEY, {
      seed: { kind: 'low', value: 's1' },
      cellState: 'complete',
    });

    const site = new ScriptedFrontierSite();
    site.scriptDiscover('frontier|low|s1', [okDiscover([{ id: 'item-1' }])]);
    const itemSink = new MemoryItemSink();

    const result = await runFrontierCrawl({
      site,
      frontierCapable: new FakeFrontierCapable(),
      traversal: new StubFrontierTraversal(),
      stateStore,
      itemSink,
      failureLedger: new MemoryFailureLedger(),
      rateLimiter: new RateLimiter(0),
      budget: unboundedBudget(),
      clock,
      bounds,
      runId: 'frontier-run-1',
      schemaVersion: 1,
    });

    expect(result.seedsProcessed).toBe(1);
    expect(result.newItemsFound).toBe(1);
    expect(itemSink.records).toEqual([
      {
        schemaVersion: 1,
        itemId: 'item-1',
        scrapedAt: '2026-01-01T00:00:00.000Z',
        sourceUrl: 'fake://item/item-1',
        runId: 'frontier-run-1',
        payload: { id: 'item-1' },
      },
    ]);
  });
});

describe('runFrontierCrawl — yield-decay stop condition (core-frontier-crawl, "Yield-Decay Stop Condition")', () => {
  it('stops issuing further seed searches once a rolling window of seeds yields zero new items', async () => {
    const stateStore = new MemoryAdapterStateStore();
    const seedValues = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
    for (const value of seedValues) {
      await stateStore.append(SEEDS_STATE_KEY, {
        seed: { kind: 'low', value },
        cellState: 'complete',
      });
    }

    const site = new ScriptedFrontierSite();
    // s1 finds a genuinely new item; s2..s8 would all re-find the SAME item —
    // zero new for each, if the run ever reached them.
    site.scriptDiscover('frontier|low|s1', [okDiscover([{ id: 'item-1' }])]);
    for (const value of seedValues.slice(1)) {
      site.scriptDiscover(`frontier|low|${value}`, [okDiscover([{ id: 'item-1' }])]);
    }

    const result = await runFrontierCrawl({
      site,
      frontierCapable: new FakeFrontierCapable(),
      traversal: new StubFrontierTraversal(),
      stateStore,
      itemSink: new MemoryItemSink(),
      failureLedger: new MemoryFailureLedger(),
      rateLimiter: new RateLimiter(0),
      budget: unboundedBudget(),
      clock,
      bounds,
      runId: 'frontier-run-1',
      schemaVersion: 1,
      yieldDecayWindowSize: 3,
    });

    // s1 (yield) + s2..s4 (3 consecutive zero-yield seeds close the window) —
    // never reaches s5..s8. If yield decay never tripped, every scripted
    // outcome above would be consumed and the assertion below would fail.
    expect(result.seedsProcessed).toBe(4);
    expect(site.discoverCalls).toEqual([
      'frontier|low|s1',
      'frontier|low|s2',
      'frontier|low|s3',
      'frontier|low|s4',
    ]);
  });
});

describe('runFrontierCrawl — request budget ceiling (core-frontier-crawl, "Request Budget Ceiling")', () => {
  it('stops at the configured request ceiling even while every seed keeps yielding new items', async () => {
    const stateStore = new MemoryAdapterStateStore();
    const seedValues = ['s1', 's2', 's3', 's4', 's5'];
    for (const value of seedValues) {
      await stateStore.append(SEEDS_STATE_KEY, {
        seed: { kind: 'low', value },
        cellState: 'complete',
      });
    }

    const site = new ScriptedFrontierSite();
    for (const [index, value] of seedValues.entries()) {
      site.scriptDiscover(`frontier|low|${value}`, [okDiscover([{ id: `item-${index}` }])]);
    }

    const budget = new Budget({
      maxItems: null,
      maxDocuments: 0,
      documentsPerItem: null,
      maxRequests: 2, // reached well before all 5 seeds' new items would decay yield
    });

    const result = await runFrontierCrawl({
      site,
      frontierCapable: new FakeFrontierCapable(),
      traversal: new StubFrontierTraversal(),
      stateStore,
      itemSink: new MemoryItemSink(),
      failureLedger: new MemoryFailureLedger(),
      rateLimiter: new RateLimiter(0),
      budget,
      clock,
      bounds,
      runId: 'frontier-run-1',
      schemaVersion: 1,
    });

    expect(result.seedsProcessed).toBe(2);
    expect(site.discoverCalls).toHaveLength(2);
  });
});

describe('runFrontierCrawl — saturated seed search bisects, reusing traversal.split() (core-frontier-crawl, "Mandatory Date Range on Seed Searches")', () => {
  it('splits a saturated seed search the same way phase 1 does, and searches the resulting children', async () => {
    const stateStore = new MemoryAdapterStateStore();
    await stateStore.append(SEEDS_STATE_KEY, {
      seed: { kind: 'low', value: 's1' },
      cellState: 'complete',
    });

    const site = new ScriptedFrontierSite(1); // resultPageCap 1 — saturates on a single item
    site.scriptDiscover('frontier|low|s1', [okDiscover([{ id: 'item-1' }])]);
    site.scriptDiscover('frontier|low|s1-child', [okDiscover([{ id: 'item-2' }])]);

    const traversal = new StubFrontierTraversal();
    const childUnit: WorkUnit<FakeCursor> = {
      unitKey: 'frontier|low|s1-child',
      windowKey: bounds.dateFrom,
      facetValue: null,
      label: 's1-child',
      cursor: { seedValue: 's1' },
    };
    traversal.scriptSplit('frontier|low|s1', [childUnit]);

    const itemSink = new MemoryItemSink();
    const result = await runFrontierCrawl({
      site,
      frontierCapable: new FakeFrontierCapable(),
      traversal,
      stateStore,
      itemSink,
      failureLedger: new MemoryFailureLedger(),
      rateLimiter: new RateLimiter(0),
      budget: unboundedBudget(),
      clock,
      bounds,
      runId: 'frontier-run-1',
      schemaVersion: 1,
    });

    // split() is called once for the saturated parent (scripted, returns the
    // child) and once more for the child itself — it also saturates at
    // resultPageCap 1, and is legitimately unscripted (returns null, the
    // existing default), proving reuse never loops forever on an unscripted
    // saturated leaf.
    expect(traversal.splitCalls).toBe(2);
    expect(result.newItemsFound).toBe(2);
    expect(itemSink.records.map((r) => r.itemId).sort()).toEqual(['item-1', 'item-2']);
  });
});

describe('runFrontierCrawl - unresolved-row and failed-seed ledger parity', () => {
  it('records one entry per unresolved row and a failed seed, then continues to the next seed', async () => {
    const stateStore = new MemoryAdapterStateStore();
    await stateStore.append(SEEDS_STATE_KEY, {
      seed: { kind: 'high', value: 'broken-seed' },
      cellState: 'complete',
    });
    await stateStore.append(SEEDS_STATE_KEY, {
      seed: { kind: 'low', value: 'partial-seed' },
      cellState: 'complete',
    });
    const site = new ScriptedFrontierSite();
    site.scriptDiscover('frontier|high|broken-seed', [
      { kind: 'hostDefect', reason: 'errorUnexpected.seam with PersistenceException' },
    ]);
    site.scriptDiscover('frontier|low|partial-seed', [
      {
        kind: 'ok',
        value: {
          items: [{ id: 'resolved-item' }],
          documentsByItemId: new Map(),
          count: 2,
          unresolved: [
            { itemId: 'process-1', reason: 'adapter reason one' },
            { itemId: 'process-2', reason: 'adapter reason two' },
          ],
        },
      },
    ]);
    const failureLedger = new MemoryFailureLedger();

    const result = await runFrontierCrawl({
      site,
      frontierCapable: new FakeFrontierCapable(),
      traversal: new StubFrontierTraversal(),
      stateStore,
      itemSink: new MemoryItemSink(),
      failureLedger,
      rateLimiter: new RateLimiter(0),
      budget: unboundedBudget(),
      clock,
      bounds,
      runId: 'frontier-run-1',
      schemaVersion: 1,
    });

    expect(result).toEqual({ seedsProcessed: 2, newItemsFound: 1 });
    expect(site.discoverCalls).toEqual(['frontier|high|broken-seed', 'frontier|low|partial-seed']);
    expect(failureLedger.entries).toEqual([
      expect.objectContaining({
        itemId: 'frontier|high|broken-seed',
        documentId: null,
        reason: 'errorUnexpected.seam with PersistenceException',
      }),
      expect.objectContaining({
        itemId: 'process-1',
        documentId: null,
        reason: 'adapter reason one',
      }),
      expect.objectContaining({
        itemId: 'process-2',
        documentId: null,
        reason: 'adapter reason two',
      }),
    ]);
  });
});
