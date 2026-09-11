import { summarizeRunCoverage, verifyPartitionInvariant } from '../engine/coverage.js';
import type { FrontierRunResult } from '../engine/frontier.js';
import type { PartitionInvariantResult } from '../engine/coverage.js';
import type { CoverageRecord } from '../engine/ports.js';

/**
 * Per-cell state is blind to gaps that exist only ACROSS cells: every facet of
 * an under-covering split can be individually `complete` while the split as a
 * whole lost items. `verifyPartitionInvariant` is the only check that sees
 * that, so the summary reports it rather than leaving a known gap unstated
 * (core-coverage-accounting, "Partition Invariant Verification").
 */
function formatPartitionInvariant(records: readonly CoverageRecord[]): readonly string[] {
  const results = verifyPartitionInvariant(records);
  if (results.length === 0) return [];

  const broken = results.filter((result) => !result.holds);
  if (broken.length === 0) {
    return ['', `Partition invariant: holds across ${results.length} checked split(s).`];
  }

  return [
    '',
    'Partition invariant VIOLATED — a split recovered fewer items than its parent,',
    'so these windows are measurably incomplete regardless of per-cell state:',
    ...broken.map((result) => `  ${describeBrokenPartition(result)}`),
  ];
}

function describeBrokenPartition(result: PartitionInvariantResult): string {
  const shortfall = result.unfilteredCount - result.facetSum;
  const scope =
    result.facetValue === undefined
      ? result.windowKey
      : `${result.windowKey} | ${result.facetValue}`;
  const noun = shortfall === 1 ? 'item' : 'items';
  return `${scope}: parent ${result.unfilteredCount}, partition sum ${result.facetSum} — ${shortfall} ${noun} unaccounted for`;
}

/**
 * Prints exactly `summarizeRunCoverage`'s counts — no independent completeness
 * claim (core-coverage-accounting, "Run Summary Arithmetic"; S5c made the
 * arithmetic `subdivided`-aware, this consumes it rather than re-deriving it) —
 * followed by the cross-cell partition check, which no per-cell tally can make.
 */
export function formatRunSummary(records: readonly CoverageRecord[]): readonly string[] {
  const { complete, truncated, failed, unresolvedItemCount } = summarizeRunCoverage(records);
  return [
    'Run summary (measured, not certified):',
    `  complete: ${complete}`,
    `  truncated: ${truncated}`,
    `  failed: ${failed}`,
    `  unresolved items: ${unresolvedItemCount}`,
    ...formatPartitionInvariant(records),
  ];
}

/** Human-facing run output stays on stdout, never interleaved with log events (spec). */
export function printRunSummary(
  records: readonly CoverageRecord[],
  write: (line: string) => void = (line) => console.log(line),
): void {
  for (const line of formatRunSummary(records)) write(line);
}

/**
 * Stated plainly, never softened (core-frontier-crawl, "Documented Unmeasurable Bias"):
 * a seed harvested from an already-found item biases discovery toward already-connected
 * data, and a frontier run has no way to measure the portion of the site it never saw —
 * coverage can grow without the unknown portion shrinking measurably.
 */
const FRONTIER_BIAS_NOTICE =
  'Frontier-crawl coverage gains are UNMEASURED and self-reinforcing: a seed harvested ' +
  'from an already-found item biases discovery toward already-connected data, and this ' +
  'run cannot measure the portion of the site it never saw.';

export function formatFrontierRunSummary(result: FrontierRunResult): readonly string[] {
  return [
    'Frontier run summary:',
    `  seeds processed: ${result.seedsProcessed}`,
    `  new items found: ${result.newItemsFound}`,
    '',
    FRONTIER_BIAS_NOTICE,
  ];
}

/** Human-facing frontier run output — same discipline as `printRunSummary`. */
export function printFrontierRunSummary(
  result: FrontierRunResult,
  write: (line: string) => void = (line) => console.log(line),
): void {
  for (const line of formatFrontierRunSummary(result)) write(line);
}
