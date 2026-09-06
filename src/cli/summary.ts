import { summarizeRunCoverage } from '../engine/coverage.js';
import type { FrontierRunResult } from '../engine/frontier.js';
import type { CoverageRecord } from '../engine/ports.js';

/**
 * Prints exactly `summarizeRunCoverage`'s counts — no independent completeness
 * claim (core-coverage-accounting, "Run Summary Arithmetic"; S5c made the
 * arithmetic `subdivided`-aware, this consumes it rather than re-deriving it).
 */
export function formatRunSummary(records: readonly CoverageRecord[]): readonly string[] {
  const { complete, truncated, failed } = summarizeRunCoverage(records);
  return [
    'Run summary (measured, not certified):',
    `  complete: ${complete}`,
    `  truncated: ${truncated}`,
    `  failed: ${failed}`,
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
