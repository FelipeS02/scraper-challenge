import type { Budget } from './budget.js';
import type {
  AdapterStateStore,
  Clock,
  FrontierCapable,
  ItemSink,
  Logger,
  RunBounds,
  Seed,
  SitePort,
  TraversalPort,
} from './ports.js';
import type { RateLimiter } from './rate-limiter.js';
import type { WorkUnit } from './types.js';

/**
 * Phase-2 frontier crawl (core-frontier-crawl spec) — a separate, later, off-by-default
 * verification run over seeds harvested during an earlier phase-1 `scrape`. Reuses
 * every phase-1 mechanism it can rather than re-implementing it: `SitePort.discover`
 * for the actual search, `TraversalPort.split` for saturation bisection, `Budget` for
 * the hard request ceiling, and the exact `OutputRecord` envelope for item persistence
 * (design.md D1, "reuse, never re-implement"). Nothing here touches `engine/scraper.ts`'s
 * own phase-1 loop.
 */

const SEEDS_STATE_KEY_LITERAL = 'seeds';
/** The `AdapterStateStore` key every persisted seed lives under. */
export const SEEDS_STATE_KEY = SEEDS_STATE_KEY_LITERAL;

/** A seed harvested during a run, tagged with the cell state it came from. */
export interface PersistedSeed {
  readonly seed: Seed;
  readonly cellState: 'truncated' | 'complete';
}

/**
 * Harvests `item`'s seeds and persists each one, tagged with `cellState`, so a later
 * `scrape --frontier` invocation can prioritize seeds harvested from a `truncated` cell
 * (core-frontier-crawl, "Seed Harvesting and Prioritization"). Issues no request —
 * `harvestSeeds` only reads fields already present on an already-fetched item, which is
 * what lets this run unconditionally during every `scrape`, on or off `--frontier`
 * (core-frontier-crawl, "Plain scrape does not run frontier crawl": harvesting still
 * happens, only *searching* the harvested seeds is deferred).
 */
export async function harvestAndPersistSeeds<TItem, TCursor>(
  frontierCapable: FrontierCapable<TItem, TCursor>,
  stateStore: AdapterStateStore,
  item: TItem,
  cellState: 'truncated' | 'complete',
): Promise<void> {
  for (const seed of frontierCapable.harvestSeeds(item)) {
    const persisted: PersistedSeed = { seed, cellState };
    await stateStore.append(SEEDS_STATE_KEY, persisted);
  }
}

/**
 * Orders a persisted seed queue (core-frontier-crawl, "Seed Harvesting and
 * Prioritization"): a `truncated`-cell seed always precedes a `complete`-cell seed,
 * regardless of kind ranking; within the same cell state, `seedKindRanking`'s declared
 * order wins. A kind absent from `seedKindRanking` sorts last, never first.
 */
export function rankSeeds(
  persisted: readonly PersistedSeed[],
  seedKindRanking: readonly string[],
): readonly Seed[] {
  const kindRank = new Map(seedKindRanking.map((kind, index) => [kind, index]));
  const cellStateRank = (state: 'truncated' | 'complete'): number =>
    state === 'truncated' ? 0 : 1;

  return [...persisted]
    .sort((a, b) => {
      const stateDiff = cellStateRank(a.cellState) - cellStateRank(b.cellState);
      if (stateDiff !== 0) return stateDiff;
      const rankA = kindRank.get(a.seed.kind) ?? Number.MAX_SAFE_INTEGER;
      const rankB = kindRank.get(b.seed.kind) ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    })
    .map((p) => p.seed);
}

/** A rolling window of this many consecutive zero-new-item seeds stops the crawl. */
export const DEFAULT_YIELD_DECAY_WINDOW = 5;
/** Same default as `main.ts`'s phase-1 `MAX_SPLIT_DEPTH` — a misbehaving split() cannot loop forever. */
export const DEFAULT_MAX_SPLIT_DEPTH = 20;

export interface FrontierRunConfig<TItem, TDoc, TCursor> {
  readonly site: SitePort<TItem, TDoc>;
  readonly frontierCapable: FrontierCapable<TItem, TCursor>;
  readonly traversal: TraversalPort<TCursor>;
  readonly stateStore: AdapterStateStore;
  readonly itemSink: ItemSink<TItem>;
  readonly rateLimiter: RateLimiter;
  /** Reused, never re-implemented (task 6.10): the same hard ceiling S5b built for phase 1. */
  readonly budget: Budget;
  readonly clock: Clock;
  readonly logger?: Logger | undefined;
  readonly bounds: RunBounds;
  readonly runId: string;
  readonly schemaVersion: number;
  readonly yieldDecayWindowSize?: number | undefined;
  readonly maxSplitDepth?: number | undefined;
}

export interface FrontierRunResult {
  readonly seedsProcessed: number;
  readonly newItemsFound: number;
}

interface QueuedUnit<TCursor> {
  readonly unit: WorkUnit<TCursor>;
  readonly depth: number;
}

/**
 * Runs the frontier crawl to completion: consumes the ranked seed queue, one search per
 * seed (plus any saturation-driven children), until either the yield-decay window closes
 * or the request budget is exhausted — two INDEPENDENT stops, checked separately, plus
 * the ranking itself as a third, self-limiting mechanism (never an unbounded crawl).
 */
export async function runFrontierCrawl<TItem, TDoc, TCursor>(
  config: FrontierRunConfig<TItem, TDoc, TCursor>,
): Promise<FrontierRunResult> {
  const persisted = (await config.stateStore.read(SEEDS_STATE_KEY)) as readonly PersistedSeed[];
  const queue = rankSeeds(persisted, config.frontierCapable.seedKindRanking);
  const yieldWindowSize = config.yieldDecayWindowSize ?? DEFAULT_YIELD_DECAY_WINDOW;
  const maxSplitDepth = config.maxSplitDepth ?? DEFAULT_MAX_SPLIT_DEPTH;

  const seenItemIds = new Set<string>();
  const yieldWindow: number[] = [];
  let seedsProcessed = 0;
  let newItemsFound = 0;

  for (const seed of queue) {
    if (!config.budget.canSpendRequest()) break;
    seedsProcessed += 1;
    let newItemsThisSeed = 0;

    const stack: QueuedUnit<TCursor>[] = [
      { unit: config.frontierCapable.unitFromSeed(seed, config.bounds), depth: 0 },
    ];

    while (stack.length > 0) {
      if (!config.budget.canSpendRequest()) break;
      const next = stack.pop();
      if (!next) break;
      const { unit, depth } = next;

      await config.rateLimiter.acquire();
      config.budget.recordRequest();
      const result = await config.site.discover(unit);
      if (result.kind !== 'ok') continue; // a failed seed search is skipped, not retried, in this slice

      for (const item of result.value.items) {
        const itemId = config.site.itemId(item);
        if (seenItemIds.has(itemId)) continue;
        seenItemIds.add(itemId);
        newItemsThisSeed += 1;
        newItemsFound += 1;
        await config.itemSink.write({
          schemaVersion: config.schemaVersion,
          itemId,
          scrapedAt: config.clock.now().toISOString(),
          sourceUrl: config.site.sourceUrl(item),
          runId: config.runId,
          payload: item,
        });
      }

      const cap = config.site.resultPageCap;
      const saturated = cap !== null && result.value.count >= cap;
      if (saturated && depth < maxSplitDepth) {
        const children = await config.traversal.split(unit, {
          resultCount: result.value.count,
          cap,
        });
        if (children) {
          for (const child of children) stack.push({ unit: child, depth: depth + 1 });
        }
      }
    }

    yieldWindow.push(newItemsThisSeed > 0 ? 1 : 0);
    if (yieldWindow.length > yieldWindowSize) yieldWindow.shift();
    if (yieldWindow.length === yieldWindowSize && yieldWindow.every((y) => y === 0)) break;
  }

  return { seedsProcessed, newItemsFound };
}
