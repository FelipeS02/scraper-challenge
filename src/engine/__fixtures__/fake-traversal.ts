import type { WorkUnit } from '../types.js';
import type { RunBounds, SaturationInfo, TraversalPort } from '../ports.js';

/** Pairs with `FakeSite`; not TRF5. */
export class FakeTraversal implements TraversalPort<{ readonly day: string }> {
  readonly facetName = 'fakeFacet';

  seed(bounds: RunBounds): Promise<readonly WorkUnit<{ readonly day: string }>[]> {
    const cursor = { day: bounds.dateFrom };
    return Promise.resolve([
      {
        unitKey: `${bounds.dateFrom}-A`,
        windowKey: bounds.dateFrom,
        facetValue: null,
        label: 'Fake unit A',
        cursor,
      },
      {
        unitKey: `${bounds.dateFrom}-B`,
        windowKey: bounds.dateFrom,
        facetValue: null,
        label: 'Fake unit B',
        cursor,
      },
    ]);
  }

  split(
    _unit: WorkUnit<{ readonly day: string }>,
    _saturated: SaturationInfo,
  ): Promise<readonly WorkUnit<{ readonly day: string }>[] | null> {
    return Promise.resolve(null); // the fake never saturates
  }
}
