import { describe, expect, it } from 'vitest';
import type { CoverageRecord, LedgerEntry } from './ports.js';
import {
  classifyCellState,
  computeSetHash,
  pendingDocumentFailures,
  summarizeRunCoverage,
  verifyPartitionInvariant,
} from './coverage.js';

function coverageRecord(overrides: Partial<CoverageRecord> = {}): CoverageRecord {
  return {
    schemaVersion: 1,
    runId: 'run-1',
    phase: 'sweep',
    unitKey: 'unit-1',
    windowKey: '2026-01-01',
    facetValue: null,
    state: 'complete',
    resultCount: 1,
    declaredCap: 30,
    saturated: false,
    itemSetHash: 'sha1:deadbeef',
    observedAt: '2026-01-01T00:00:00.000Z',
    failureReason: null,
    dimensions: {},
    ...overrides,
  };
}

describe('classifyCellState', () => {
  it('classifies a cell under the adapter-declared cap as complete', () => {
    expect(classifyCellState(12, 30)).toBe('complete');
  });

  it('classifies a cell at or above the adapter-declared cap as truncated', () => {
    expect(classifyCellState(30, 30)).toBe('truncated');
  });

  it('judges saturation against the adapter-declared cap, not a hardcoded value', () => {
    // A different adapter declares a much smaller cap; the same resultCount that would
    // be "complete" for a cap of 30 must be "truncated" for a cap of 5.
    expect(classifyCellState(5, 5)).toBe('truncated');
    expect(classifyCellState(5, 30)).toBe('complete');
  });
});

describe('computeSetHash', () => {
  it('produces matching hashes for the same set of ids observed twice', () => {
    const first = computeSetHash(['b', 'a', 'c']);
    const second = computeSetHash(['a', 'b', 'c']);
    expect(first).toBe(second);
    expect(first).toMatch(/^sha1:[0-9a-f]{40}$/);
  });

  it('reports a differing hash when the underlying set changed, as an observation not an error', () => {
    const before = computeSetHash(['a', 'b']);
    const after = computeSetHash(['a', 'b', 'c']);
    expect(before).not.toBe(after);
  });
});

describe('summarizeRunCoverage', () => {
  it('reports exact counts derived from the ledger, not an estimate', () => {
    const records: CoverageRecord[] = [
      ...Array.from({ length: 100 }, (_, i) => coverageRecord({ unitKey: `c-${i}`, state: 'complete' })),
      ...Array.from({ length: 5 }, (_, i) => coverageRecord({ unitKey: `t-${i}`, state: 'truncated' })),
      ...Array.from({ length: 2 }, (_, i) => coverageRecord({ unitKey: `f-${i}`, state: 'failed' })),
    ];

    expect(summarizeRunCoverage(records)).toEqual({ complete: 100, truncated: 5, failed: 2 });
  });

  it('does not treat an earlier complete observation as invalidated by a later re-check', () => {
    const t1 = coverageRecord({
      unitKey: 'unit-x',
      state: 'complete',
      observedAt: '2026-01-01T00:00:00.000Z',
    });
    const t2 = coverageRecord({
      unitKey: 'unit-x',
      state: 'truncated',
      observedAt: '2026-01-02T00:00:00.000Z',
    });

    const summary = summarizeRunCoverage([t1, t2]);

    // The run summary counts the latest observation (exactly-once cell accounting)...
    expect(summary).toEqual({ complete: 0, truncated: 1, failed: 0 });
    // ...but the original T1 record itself is untouched and still reads `complete`.
    expect(t1.state).toBe('complete');
  });
});

describe('verifyPartitionInvariant', () => {
  it('passes when the per-facet-value sum exceeds the unfiltered day count', () => {
    const records: CoverageRecord[] = [
      coverageRecord({ windowKey: '2026-01-01', facetValue: null, resultCount: 30 }),
      coverageRecord({ windowKey: '2026-01-01', facetValue: 'A', resultCount: 20 }),
      coverageRecord({ windowKey: '2026-01-01', facetValue: 'B', resultCount: 25 }),
    ];

    const results = verifyPartitionInvariant(records);

    expect(results).toEqual([
      { windowKey: '2026-01-01', unfilteredCount: 30, facetSum: 45, holds: true },
    ]);
  });

  it('flags a violation rather than silently accepting the discrepancy', () => {
    const records: CoverageRecord[] = [
      coverageRecord({ windowKey: '2026-01-02', facetValue: null, resultCount: 30 }),
      coverageRecord({ windowKey: '2026-01-02', facetValue: 'A', resultCount: 10 }),
    ];

    const results = verifyPartitionInvariant(records);

    expect(results).toEqual([
      { windowKey: '2026-01-02', unfilteredCount: 30, facetSum: 10, holds: false },
    ]);
  });
});

describe('pendingDocumentFailures', () => {
  function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
    return {
      itemId: 'item-1',
      documentId: 'doc-1',
      reason: 'transient:503',
      observedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('excludes a discovery-stage failure (documentId null) from document retry candidates', () => {
    const entries = [entry({ documentId: null })];
    expect(pendingDocumentFailures(entries)).toHaveLength(0);
  });

  it('excludes a document failure that already has a matching resolution entry', () => {
    const entries = [
      entry({ itemId: 'item-1', documentId: 'doc-1' }),
      entry({ itemId: 'item-1', documentId: 'doc-1', resolved: true, reason: 'resolved' }),
    ];
    expect(pendingDocumentFailures(entries)).toHaveLength(0);
  });

  it('includes an unresolved document failure', () => {
    const entries = [entry({ itemId: 'item-2', documentId: 'doc-2' })];
    const pending = pendingDocumentFailures(entries);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ itemId: 'item-2', documentId: 'doc-2' });
  });
});
