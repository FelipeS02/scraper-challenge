import { createHash } from 'node:crypto';
import type { CoverageRecord, LedgerEntry } from './ports.js';

/**
 * Pure arithmetic over the append-only coverage/failure ledgers (design.md D5,
 * core-coverage-accounting). Nothing here does I/O — reading the JSONL files
 * into memory is the infra stores' job (`infra/storage/jsonl-*.ts`).
 */

/** Saturation and cell state are judged against the adapter-declared cap only. */
export function classifyCellState(
  resultCount: number,
  declaredCap: number,
): 'complete' | 'truncated' {
  return resultCount < declaredCap ? 'complete' : 'truncated';
}

export function isSaturated(resultCount: number, declaredCap: number): boolean {
  return resultCount >= declaredCap;
}

/** SHA-1 of the sorted item-id set — comparing two observations verifies idempotence. */
export function computeSetHash(itemIds: readonly string[]): string {
  const sorted = [...itemIds].sort();
  return `sha1:${createHash('sha1').update(sorted.join('\n')).digest('hex')}`;
}

export interface RunSummary {
  readonly complete: number;
  readonly truncated: number;
  readonly failed: number;
}

/**
 * Exactly-once cell accounting at read time: the latest observation per
 * `unitKey` wins. Earlier observations remain valid for their own timestamp
 * (core-coverage-accounting "Observation-Timestamped Completeness") — this
 * function only decides what counts toward the *current* run summary.
 */
export function summarizeRunCoverage(records: readonly CoverageRecord[]): RunSummary {
  const latestByUnit = new Map<string, CoverageRecord>();
  for (const record of records) {
    const existing = latestByUnit.get(record.unitKey);
    if (!existing || record.observedAt >= existing.observedAt) {
      latestByUnit.set(record.unitKey, record);
    }
  }

  let complete = 0;
  let truncated = 0;
  let failed = 0;
  for (const record of latestByUnit.values()) {
    if (record.state === 'complete') complete += 1;
    else if (record.state === 'truncated') truncated += 1;
    else failed += 1;
  }
  return { complete, truncated, failed };
}

export interface PartitionInvariantResult {
  readonly windowKey: string;
  readonly unfilteredCount: number;
  readonly facetSum: number;
  readonly holds: boolean;
}

/** For each day, the per-facet-value sum MUST be >= the unfiltered day count. */
export function verifyPartitionInvariant(
  records: readonly CoverageRecord[],
): readonly PartitionInvariantResult[] {
  const byWindow = new Map<string, CoverageRecord[]>();
  for (const record of records) {
    const group = byWindow.get(record.windowKey);
    if (group) group.push(record);
    else byWindow.set(record.windowKey, [record]);
  }

  const results: PartitionInvariantResult[] = [];
  for (const [windowKey, group] of byWindow) {
    const unfiltered = group.find((record) => record.facetValue === null);
    const facetRecords = group.filter((record) => record.facetValue !== null);
    if (!unfiltered || facetRecords.length === 0) continue;

    const facetSum = facetRecords.reduce((sum, record) => sum + record.resultCount, 0);
    results.push({
      windowKey,
      unfilteredCount: unfiltered.resultCount,
      facetSum,
      holds: facetSum >= unfiltered.resultCount,
    });
  }
  return results;
}

/**
 * Document-level failures eligible for `retry-failed`: excludes discovery-stage
 * failures (`documentId === null`, core-coverage-accounting "Separate Checkpoint
 * and Failure Ledger Concerns") and any entry already followed by a matching
 * `resolved: true` line (resolution is appended, never edits/deletes the original).
 */
export function pendingDocumentFailures(entries: readonly LedgerEntry[]): readonly LedgerEntry[] {
  const isResolved = (target: LedgerEntry): boolean =>
    entries.some(
      (entry) =>
        entry.resolved === true &&
        entry.itemId === target.itemId &&
        entry.documentId === target.documentId,
    );

  return entries.filter(
    (entry) => entry.documentId !== null && entry.resolved !== true && !isResolved(entry),
  );
}
