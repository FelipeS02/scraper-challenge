import type {
  HttpTransport,
  RunBounds,
  SaturationInfo,
  TraversalPort,
} from '../../engine/ports.js';
import type { WorkUnit } from '../../engine/types.js';
import { fetchClassCatalogue } from './classes.js';
import type { SessionState } from './session.js';

export interface TraversalCursor {
  readonly dateFrom: string;
  readonly dateTo: string;
}

export interface TraversalConfig {
  readonly transport: HttpTransport;
  readonly session: SessionState;
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round(
    (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000,
  );
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function windowUnit(
  dateFrom: string,
  dateTo: string,
  facetValue: string | null,
): WorkUnit<TraversalCursor> {
  const windowKey = `${dateFrom}..${dateTo}`;
  return {
    unitKey: facetValue ? `${windowKey}|${facetValue}` : windowKey,
    windowKey,
    facetValue,
    label: windowKey,
    cursor: { dateFrom, dateTo },
  };
}

/**
 * Date window x judicial class (docs/RESEARCH.md §3). `seed()` produces one unfaceted
 * unit for the whole run window; `split()` bisects a saturated multi-day window, then
 * lazily expands a saturated single day into per-class units (design.md D4) — the only
 * point where `classeJudicial` is fetched, and only once that day is proven saturated.
 */
export class TRF5Traversal implements TraversalPort<TraversalCursor> {
  readonly facetName = 'classeJudicial';
  private maxFacetValues = 0;

  constructor(private readonly config: TraversalConfig) {}

  seed(bounds: RunBounds): Promise<readonly WorkUnit<TraversalCursor>[]> {
    this.maxFacetValues = bounds.maxFacetValues;
    return Promise.resolve([windowUnit(bounds.dateFrom, bounds.dateTo, null)]);
  }

  async split(
    unit: WorkUnit<TraversalCursor>,
    _saturated: SaturationInfo,
  ): Promise<readonly WorkUnit<TraversalCursor>[] | null> {
    const { dateFrom, dateTo } = unit.cursor;

    if (dateFrom !== dateTo) {
      const mid = addDays(dateFrom, Math.floor(daysBetween(dateFrom, dateTo) / 2));
      const nextDay = addDays(mid, 1);
      return [
        windowUnit(dateFrom, mid, unit.facetValue),
        windowUnit(nextDay, dateTo, unit.facetValue),
      ];
    }

    if (unit.facetValue !== null) return null; // already expanded once — cannot subdivide further

    const classes = await fetchClassCatalogue(this.config.transport, this.config.session);
    const bounded = classes.slice(0, this.maxFacetValues);
    if (bounded.length === 0) return null;
    return bounded.map((cls) => windowUnit(dateFrom, dateFrom, cls.label));
  }
}
