import type { FrontierCapable, RunBounds, Seed } from '../../engine/ports.js';
import type { WorkUnit } from '../../engine/types.js';
import type { TraversalCursor } from './traversal.js';
import type { TrfPayload } from './schemas/payload.js';

/**
 * Declared seed kinds and their ranking (trf5-adapter spec, "Declared Seed Kinds and
 * Ranking"; core-frontier-crawl, "Seed Harvesting and Prioritization").
 *
 * **Deviation from design.md's illustrative `['oab', 'exactName']` labels, disclosed
 * here rather than silently substituted.** An OAB-registration-number search needs a
 * `numeroOAB` field the search form genuinely has (docs/RESEARCH.md §2.5: "Adding
 * `numeroOAB=12345` returned 0" — a real, working, exact-match field) but that S3's
 * "Complete Search Form Field Set" never inventoried. Adding it now would touch every
 * existing session/search fixture that harvests the field-name set and asserts every
 * documented field is present on every POST — a blast radius across S3's own suite,
 * outside this slice's scope. Both declared kinds here instead reuse `documentoParte`
 * (CPF/CNPJ), already in the field inventory and confirmed exact-match
 * (docs/RESEARCH.md §3: "exact-match (process number, CPF/CNPJ, OAB registration)").
 * Real OAB-number seeding remains a disclosed, tracked gap for future work, consistent
 * with this project's established "disclosed limitation" pattern (S4c/S5a/S5d).
 *
 * `lawyerCpf` ranks above `partyCpf`: a lawyer's CPF tends to recur across more
 * processes than any single litigant's, so it is more likely to surface additional,
 * previously-unseen items per seed search — an adapter-owned ranking choice (D3: which
 * kinds exist and how they rank is entirely the adapter's obligation).
 */
export const seedKindRanking = ['lawyerCpf', 'partyCpf'] as const;

function uniqueCpfs(values: readonly (string | null)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== null && value !== ''))];
}

/**
 * The real `FrontierCapable<TrfPayload, TraversalCursor>` implementation (S6). Harvests
 * exact-match CPFs already present on an already-extracted payload — issues no request
 * of its own (core-frontier-crawl, "Deferred Phase-2 Invocation": harvesting never
 * searches).
 */
export class TRF5Seeds implements FrontierCapable<TrfPayload, TraversalCursor> {
  readonly seedKindRanking = seedKindRanking;

  harvestSeeds(item: TrfPayload): readonly Seed[] {
    const allParties = [...item.parties.active, ...item.parties.passive, ...item.parties.others];
    const lawyerCpfs = uniqueCpfs(allParties.flatMap((party) => party.lawyers.map((l) => l.cpf)));
    const partyCpfs = uniqueCpfs(allParties.map((party) => party.cpf));
    return [
      ...lawyerCpfs.map((value): Seed => ({ kind: 'lawyerCpf', value })),
      ...partyCpfs.map((value): Seed => ({ kind: 'partyCpf', value })),
    ];
  }

  /**
   * Builds a WorkUnit whose cursor always carries the run's mandatory date range
   * (core-frontier-crawl, "Mandatory Date Range on Seed Searches") plus the seed's
   * exact-match value — `TRF5Site.discover()` reads `cursor.seedCpf` and searches by
   * it through the existing `documentoParte` field. `facetValue` stays `null`: a seed
   * search never partitions by judicial class.
   */
  unitFromSeed(seed: Seed, bounds: RunBounds): WorkUnit<TraversalCursor> {
    const windowKey = `${bounds.dateFrom}..${bounds.dateTo}`;
    return {
      unitKey: `frontier|${seed.kind}|${seed.value}|${windowKey}`,
      windowKey,
      facetValue: null,
      label: `${seed.kind}:${seed.value}`,
      cursor: { dateFrom: bounds.dateFrom, dateTo: bounds.dateTo, seedCpf: seed.value },
    };
  }
}
