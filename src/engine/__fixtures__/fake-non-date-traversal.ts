import type { WorkUnit } from '../types.js';
import type { RunBounds, SaturationInfo, TraversalPort } from '../ports.js';

export interface RegionCursor {
  readonly regionFrom: number;
  readonly regionTo: number;
}

function regionUnit(regionFrom: number, regionTo: number): WorkUnit<RegionCursor> {
  const windowKey = `${regionFrom}..${regionTo}`;
  return {
    unitKey: windowKey,
    windowKey,
    facetValue: null,
    label: `region ${windowKey}`,
    cursor: { regionFrom, regionTo },
  };
}

/**
 * Pairs with `FakeNonDateSite`. Partitions by a numeric "region" range via
 * bisection — the same shape as `TRF5Traversal`'s date bisection (design.md
 * Partitioning), proving the mechanism is not date-specific. `RunBounds` is
 * engine-declared and literally date-shaped (`dateFrom`/`dateTo`); this fake
 * repurposes those two opaque strings as the region range's numeric bounds —
 * see the portability-audit finding in apply-progress.md for what this cost.
 */
export class FakeNonDateTraversal implements TraversalPort<RegionCursor> {
  readonly facetName = 'region';

  seed(bounds: RunBounds): Promise<readonly WorkUnit<RegionCursor>[]> {
    const regionFrom = Number(bounds.dateFrom);
    const regionTo = Number(bounds.dateTo);
    return Promise.resolve([regionUnit(regionFrom, regionTo)]);
  }

  split(
    unit: WorkUnit<RegionCursor>,
    _saturated: SaturationInfo,
  ): Promise<readonly WorkUnit<RegionCursor>[] | null> {
    const { regionFrom, regionTo } = unit.cursor;
    if (regionFrom === regionTo) return Promise.resolve(null); // already a single region

    const mid = regionFrom + Math.floor((regionTo - regionFrom) / 2);
    return Promise.resolve([regionUnit(regionFrom, mid), regionUnit(mid + 1, regionTo)]);
  }
}
