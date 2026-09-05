import { summarizeRunCoverage } from '../engine/coverage.js';
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
