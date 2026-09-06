import { createHash } from 'node:crypto';
import type { CoverageRecord, LedgerEntry } from './ports.js';

/**
 * Pure arithmetic over the append-only coverage/failure ledgers (design.md D5,
 * core-coverage-accounting). Nothing here does I/O — reading the JSONL files
 * into memory is the infra stores' job (`infra/storage/jsonl-*.ts`).
 */

/**
 * Saturation and cell state are judged against the adapter-declared cap only.
 * `declaredCap === null` means the adapter declares no result-page cap at all
 * (design.md D11) — such a cell never saturates and is always `complete`.
 */
export function classifyCellState(
  resultCount: number,
  declaredCap: number | null,
): 'complete' | 'truncated' {
  if (declaredCap === null) return 'complete';
  return resultCount < declaredCap ? 'complete' : 'truncated';
}

export function isSaturated(resultCount: number, declaredCap: number | null): boolean {
  if (declaredCap === null) return false;
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
    // `subdivided` is not a coverage gap and not a terminal state of its own —
    // its real coverage is carried forward by its own children's records, so
    // it contributes to none of the three tallies (core-coverage-accounting,
    // "Run Summary Arithmetic"). Branching explicitly, rather than a
    // catch-all `else failed += 1`, is what stops it being miscounted.
    if (record.state === 'complete') complete += 1;
    else if (record.state === 'truncated') truncated += 1;
    else if (record.state === 'failed') failed += 1;
  }
  return { complete, truncated, failed };
}

export interface PartitionInvariantResult {
  readonly windowKey: string;
  readonly unfilteredCount: number;
  readonly facetSum: number;
  readonly holds: boolean;
  /**
   * Present only for a deeper-than-facet check (core-coverage-accounting
   * delta): the facet value whose recorded `subdivided` count is being
   * compared against the summed counts of the deeper cells that extend it.
   * Absent (`undefined`) for the day-level check, so every existing
   * day-level result keeps exactly its pre-change shape. Named generically
   * on purpose — the engine never learns which dimension an adapter
   * subdivided by.
   */
  readonly facetValue?: string;
}

function dimensionKeys(record: CoverageRecord): ReadonlySet<string> {
  return new Set(Object.keys(record.dimensions));
}

/**
 * True when `child`'s adapter-declared dimensions bag is a strict superset of
 * `parent`'s — i.e. `child` represents one (or more) partition levels deeper
 * than `parent`. Judged purely from the SHAPE of the dimensions bag (its key
 * set), never from any concrete key name: `dimensions` is opaque to the
 * engine everywhere else, and the engine MUST NOT learn a concrete adapter
 * dimension name (core-coverage-accounting delta, "the core does not learn a
 * concrete name field"). This is what lets a completely different adapter's
 * own extra partition level — whatever it calls its own dimensions — be
 * recognized by this exact same code, with zero engine changes.
 */
function isDeeperPartition(parent: CoverageRecord, child: CoverageRecord): boolean {
  const parentKeys = dimensionKeys(parent);
  const childKeys = dimensionKeys(child);
  if (childKeys.size <= parentKeys.size) return false;
  for (const key of parentKeys) {
    if (!childKeys.has(key)) return false;
  }
  return true;
}

/**
 * True when some other record sharing the same partition lineage (`siblings`)
 * has a dimensions bag that `record`'s own bag strictly extends — i.e.
 * `record` is itself a deeper partition of some sibling, not a
 * partition-level representative in its own right.
 */
function isDeeperThanSomeSibling(
  record: CoverageRecord,
  siblings: readonly CoverageRecord[],
): boolean {
  return siblings.some((other) => other !== record && isDeeperPartition(other, record));
}

function latestByObservedAt(records: readonly CoverageRecord[]): CoverageRecord | undefined {
  return records.reduce<CoverageRecord | undefined>(
    (latest, record) => (!latest || record.observedAt >= latest.observedAt ? record : latest),
    undefined,
  );
}

/**
 * Verifies the partition invariant at every level (core-coverage-accounting
 * delta, "Partition Invariant Verification"): for each day, the per-class
 * sum MUST be >= the unfiltered day count; additionally, for any class cell
 * recorded `subdivided` into a deeper partition level, the sum of its own
 * deeper children MUST be >= that class cell's recorded (saturated) count.
 * A "deeper child" is recognized purely from the SHAPE of the adapter's own
 * `dimensions` bag (see `isDeeperPartition`) — never from any concrete key
 * name, so this works identically for any adapter's own extra partition
 * level. Each parent count is sourced from that parent's own persisted
 * coverage cell, never assumed from the declared cap.
 */
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
    // Latest-by-observedAt wins — the same rule summarizeRunCoverage already
    // applies — never the first array match. A stale earlier observation
    // (e.g. an interrupted first attempt later re-observed as `subdivided`
    // after saturation) must never shadow the current persisted parent.
    const unfiltered = latestByObservedAt(group.filter((record) => record.facetValue === null));

    // Grouped by facetValue so "deeper than a sibling" is judged only against
    // records that actually share a partition lineage (the same class),
    // never against an unrelated facetValue's own records.
    const byFacet = new Map<string, CoverageRecord[]>();
    for (const record of group) {
      if (record.facetValue === null) continue;
      const bucket = byFacet.get(record.facetValue);
      if (bucket) bucket.push(record);
      else byFacet.set(record.facetValue, [record]);
    }

    // Day-level: only the shallowest record per facetValue counts toward the
    // day sum — a deeper partition's own count is represented one level down
    // instead, never double-counted on top of its own shallower record.
    const classRecords: CoverageRecord[] = [];
    for (const facetGroup of byFacet.values()) {
      for (const record of facetGroup) {
        if (!isDeeperThanSomeSibling(record, facetGroup)) classRecords.push(record);
      }
    }
    if (unfiltered && classRecords.length > 0) {
      const facetSum = classRecords.reduce((sum, record) => sum + record.resultCount, 0);
      results.push({
        windowKey,
        unfilteredCount: unfiltered.resultCount,
        facetSum,
        holds: facetSum >= unfiltered.resultCount,
      });
    }

    // One partition level down: the shallowest record per facetValue (the
    // class cell) vs. the sum of every record strictly deeper than it,
    // whatever shape that deeper level's own dimensions bag uses.
    for (const [facetValue, facetGroup] of byFacet) {
      const shallow = facetGroup.filter((record) => !isDeeperThanSomeSibling(record, facetGroup));
      const parent = latestByObservedAt(shallow);
      if (!parent) continue;

      const children = facetGroup.filter((record) => isDeeperPartition(parent, record));
      if (children.length === 0) continue;

      const facetSum = children.reduce((sum, record) => sum + record.resultCount, 0);
      results.push({
        windowKey,
        facetValue,
        unfilteredCount: parent.resultCount,
        facetSum,
        holds: facetSum >= parent.resultCount,
      });
    }
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
