import type {
  HttpTransport,
  RunBounds,
  SaturationInfo,
  TraversalPort,
} from '../../engine/ports.js';
import type { WorkUnit } from '../../engine/types.js';
import { fetchClassCatalogue } from './classes.js';
import { mergeRanked, NameHarvester, STATIC_SURNAME_BIGRAMS } from './name-probes.js';
import type { SessionState } from './session.js';

export interface TraversalCursor {
  readonly dateFrom: string;
  readonly dateTo: string;
  /**
   * Present only for a frontier seed search (core-frontier-crawl, "Seed
   * Harvesting and Prioritization") — an exact-match CPF harvested from a
   * prior detail page, carried through so `TRF5Site.discover()` can search
   * by it. Absent (`undefined`) for every phase-1 unit `TRF5Traversal.seed()`
   * produces, so phase-1 behavior is unchanged by this addition.
   */
  readonly seedCpf?: string | undefined;
  /**
   * Present only at partition level 3 (design.md D1): a single-day,
   * single-class cell that still saturated after class expansion. Carries
   * one name-substring value applied to `nomeParte` (trf5-adapter spec,
   * "Name-Substring Partition Level"). Absent for every unit above this
   * level, so phase-1/phase-2 behavior below the name level is unchanged.
   */
  readonly nameProbe?: string | undefined;
}

export interface TraversalConfig {
  readonly transport: HttpTransport;
  readonly session: SessionState;
  /**
   * Bounds how many name-probe children a saturated single-day class cell may
   * produce (trf5-adapter spec, "Name-Probe Budget"). `0` disables the level
   * entirely — the pre-change behavior. Optional so every existing caller
   * that never mentions the name axis keeps exactly today's two-level cascade.
   */
  readonly maxNameProbes?: number;
  /**
   * Shared with `TRF5SiteConfig.harvester` by the composition root (task 1.3
   * of this change) — the one new coupling design.md D2 introduces. Defaults
   * to a fresh, empty harvester so a caller that never wires one still gets
   * the deterministic static-dictionary floor whenever maxNameProbes > 0.
   */
  readonly harvester?: NameHarvester;
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

/**
 * Levels 1 and 2. Every unit declares its dimensions from the date layer up —
 * date alone before class expansion, date + class after it. Date is the first
 * partition layer this adapter ever applies, so a unit that has not descended
 * any further still says WHAT it partitioned on, instead of leaving an empty
 * bag that makes its coverage record less analyzable than a deeper one's
 * (observed on a live run: 23 of 53 records carried `dimensions: {}`).
 *
 * A single-day window declares the bare day rather than a collapsed
 * `day..day` range, so `date` carries the same shape here as it does in
 * {@link nameProbeUnit} and a consumer can group across levels on one key.
 */
function windowUnit(
  dateFrom: string,
  dateTo: string,
  facetValue: string | null,
  seedCpf?: string,
): WorkUnit<TraversalCursor> {
  const windowKey = `${dateFrom}..${dateTo}`;
  const seedSuffix = seedCpf === undefined ? '' : `|seed:${seedCpf}`;
  return {
    unitKey: facetValue ? `${windowKey}|${facetValue}${seedSuffix}` : `${windowKey}${seedSuffix}`,
    windowKey,
    facetValue,
    label: windowKey,
    cursor: seedCpf === undefined ? { dateFrom, dateTo } : { dateFrom, dateTo, seedCpf },
    dimensions: {
      date: dateFrom === dateTo ? dateFrom : windowKey,
      ...(facetValue === null ? {} : { class: facetValue }),
    },
  };
}

/**
 * Level-3 child: one name-substring probe applied to a saturated single-day
 * class cell (trf5-adapter spec, "Name-Substring Partition Level"). The probe
 * rides in both the cursor (round-tripped to `nomeParte` by `TRF5Site`) and
 * `dimensions` (core-coverage-accounting delta), so a residual `truncated`
 * cell names exactly which day/class/probe combination is still incomplete.
 * `facetValue` stays the class — the declared facet coverage counts (D5).
 */
function nameProbeUnit(
  day: string,
  facetValue: string,
  nameProbe: string,
): WorkUnit<TraversalCursor> {
  const windowKey = `${day}..${day}`;
  const unitKey = `${windowKey}|${facetValue}|${nameProbe}`;
  return {
    unitKey,
    windowKey,
    facetValue,
    label: unitKey,
    cursor: { dateFrom: day, dateTo: day, nameProbe },
    dimensions: { date: day, class: facetValue, nameProbe },
  };
}

/**
 * Date window x judicial class x name-substring (docs/RESEARCH.md §3). `seed()`
 * produces one unfaceted unit per day for the general sweep. `split()` retains
 * multi-day bisection for range-first frontier units, then lazily expands a
 * saturated sweep day into per-class units, and a single-day
 * class cell that is STILL saturated into name-probe units (design.md D3).
 * Each level is fetched/computed only once its parent is proven saturated.
 */
export class TRF5Traversal implements TraversalPort<TraversalCursor> {
  readonly facetName = 'classeJudicial';
  private maxFacetValues = 0;
  private readonly maxNameProbes: number;
  private readonly harvester: NameHarvester;
  /**
   * Per single-day-class cell: probes already emitted, keyed by the cell's
   * own unitKey. Guards against re-emitting the same probe if `split()` is
   * ever called again for the same cell (design.md D10, "Resume") — the
   * trf5-adapter spec's "MUST NOT emit a name probe it has already emitted
   * for the same cell".
   */
  private readonly usedNameProbes = new Map<string, Set<string>>();

  constructor(private readonly config: TraversalConfig) {
    this.maxNameProbes = config.maxNameProbes ?? 0;
    this.harvester = config.harvester ?? new NameHarvester();
  }

  seed(bounds: RunBounds): Promise<readonly WorkUnit<TraversalCursor>[]> {
    this.maxFacetValues = bounds.maxFacetValues;
    const units: WorkUnit<TraversalCursor>[] = [];
    for (let day = bounds.dateFrom; day <= bounds.dateTo; day = addDays(day, 1)) {
      units.push(windowUnit(day, day, null));
    }
    return Promise.resolve(units);
  }

  async split(
    unit: WorkUnit<TraversalCursor>,
    _saturated: SaturationInfo,
  ): Promise<readonly WorkUnit<TraversalCursor>[] | null> {
    const { dateFrom, dateTo, seedCpf, nameProbe } = unit.cursor;

    // L1 — multi-day window: bisect. Never reached with a nameProbe present —
    // the name level exists only once a window is already a single day.
    if (dateFrom !== dateTo) {
      const mid = addDays(dateFrom, Math.floor(daysBetween(dateFrom, dateTo) / 2));
      const nextDay = addDays(mid, 1);
      return [
        windowUnit(dateFrom, mid, unit.facetValue, seedCpf),
        windowUnit(nextDay, dateTo, unit.facetValue, seedCpf),
      ];
    }

    if (unit.facetValue === null) {
      // L2 — single day, no class yet: expand to per-class units, the only
      // point where `classeJudicial` is fetched (design.md D4).

      // A frontier seed search has no judicial class to expand into (core-frontier-crawl,
      // "Mandatory Date Range on Seed Searches": the same recursive bisection is reused,
      // never the facet-expansion branch, which would silently drop the seed filter —
      // every child windowUnit below carries no seedCpf field at all). A single day still
      // saturated by a seed search cannot be subdivided further on this axis.
      if (seedCpf !== undefined) return null;

      const classes = await fetchClassCatalogue(this.config.transport, this.config.session);
      const bounded = classes.slice(0, this.maxFacetValues);
      if (bounded.length === 0) return null;
      return bounded.map((cls) => windowUnit(dateFrom, dateFrom, cls.label));
    }

    // Single day, already carries a judicial class.
    if (nameProbe === undefined) {
      // L3 — name-substring expansion (trf5-adapter spec, "Name-Substring
      // Partition Level"). Fires only here: after class expansion, only on a
      // cell that is STILL saturated, never before the class level and never
      // while the window spans more than one day (both guaranteed above).
      if (this.maxNameProbes === 0) return null; // level disabled — pre-change behavior

      const used = this.usedNameProbes.get(unit.unitKey) ?? new Set<string>();
      const queue = mergeRanked(STATIC_SURNAME_BIGRAMS, this.harvester.ranked(used)).filter(
        (probe) => !used.has(probe),
      );
      const bounded = queue.slice(0, this.maxNameProbes);
      if (bounded.length === 0) return null;

      this.usedNameProbes.set(unit.unitKey, new Set([...used, ...bounded]));
      return bounded.map((probe) => nameProbeUnit(dateFrom, unit.facetValue!, probe));
    }

    // L4 — class + name probe still saturated: nomeParte accepts a single
    // substring, and two substrings cannot be conjoined. Irreducible -> the
    // engine records this cell as a `truncated` gap.
    return null;
  }
}
