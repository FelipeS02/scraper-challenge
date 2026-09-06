import { describe, expect, it } from 'vitest';
import type { CoverageRecord, LedgerEntry } from './ports.js';
import {
  classifyCellState,
  computeSetHash,
  isSaturated,
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

  it('never classifies a cell as truncated when the adapter declares no cap (null)', () => {
    expect(classifyCellState(0, null)).toBe('complete');
    expect(classifyCellState(30, null)).toBe('complete');
    expect(classifyCellState(1_000_000, null)).toBe('complete');
  });
});

describe('isSaturated', () => {
  it('is true at or above the adapter-declared cap', () => {
    expect(isSaturated(30, 30)).toBe(true);
    expect(isSaturated(29, 30)).toBe(false);
  });

  it('is always false when the adapter declares no cap (null)', () => {
    expect(isSaturated(0, null)).toBe(false);
    expect(isSaturated(1_000_000, null)).toBe(false);
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
      ...Array.from({ length: 100 }, (_, i) =>
        coverageRecord({ unitKey: `c-${i}`, state: 'complete' }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        coverageRecord({ unitKey: `t-${i}`, state: 'truncated' }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        coverageRecord({ unitKey: `f-${i}`, state: 'failed' }),
      ),
    ];

    expect(summarizeRunCoverage(records)).toEqual({ complete: 100, truncated: 5, failed: 2 });
  });

  it('excludes a subdivided parent from all three tallies, counting only its children', () => {
    const records: CoverageRecord[] = [
      coverageRecord({ unitKey: 'parent', state: 'subdivided', resultCount: 30 }),
      coverageRecord({ unitKey: 'child-1', state: 'complete' }),
      coverageRecord({ unitKey: 'child-2', state: 'truncated' }),
    ];

    expect(summarizeRunCoverage(records)).toEqual({ complete: 1, truncated: 1, failed: 0 });
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

  it('sources the unfiltered count from the LATEST facetValue-null record, never the first array match', () => {
    // A stale earlier observation (e.g. an interrupted first attempt, later re-observed
    // as `subdivided` after saturation) must never shadow the current persisted parent.
    const records: CoverageRecord[] = [
      coverageRecord({
        windowKey: '2026-01-03',
        facetValue: null,
        resultCount: 12,
        state: 'complete',
        observedAt: '2026-01-03T00:00:00.000Z',
      }),
      coverageRecord({
        windowKey: '2026-01-03',
        facetValue: null,
        resultCount: 30,
        state: 'subdivided',
        observedAt: '2026-01-03T01:00:00.000Z',
      }),
      coverageRecord({ windowKey: '2026-01-03', facetValue: 'A', resultCount: 20 }),
      coverageRecord({ windowKey: '2026-01-03', facetValue: 'B', resultCount: 25 }),
    ];

    const results = verifyPartitionInvariant(records);

    expect(results).toEqual([
      { windowKey: '2026-01-03', unfilteredCount: 30, facetSum: 45, holds: true },
    ]);
  });

  it('compares a subdivided class cell against the sum of its own name-probe children (one level down, core-coverage-accounting delta)', () => {
    const dims = (nameProbe: string) => ({
      date: '2026-09-03',
      class: 'APELACAO CIVEL',
      nameProbe,
    });
    const records: CoverageRecord[] = [
      coverageRecord({
        windowKey: '2026-09-03',
        facetValue: 'APELACAO CIVEL',
        unitKey: '2026-09-03..2026-09-03|APELACAO CIVEL',
        resultCount: 30,
        state: 'subdivided',
      }),
      coverageRecord({
        windowKey: '2026-09-03',
        facetValue: 'APELACAO CIVEL',
        unitKey: '2026-09-03..2026-09-03|APELACAO CIVEL|SEGURO SOCIAL',
        resultCount: 45,
        dimensions: dims('SEGURO SOCIAL'),
      }),
      coverageRecord({
        windowKey: '2026-09-03',
        facetValue: 'APELACAO CIVEL',
        unitKey: '2026-09-03..2026-09-03|APELACAO CIVEL|DA SILVA',
        resultCount: 40,
        dimensions: dims('DA SILVA'),
      }),
      coverageRecord({
        windowKey: '2026-09-03',
        facetValue: 'APELACAO CIVEL',
        unitKey: '2026-09-03..2026-09-03|APELACAO CIVEL|REGIONAL DE',
        resultCount: 55,
        dimensions: dims('REGIONAL DE'),
      }),
    ];

    const results = verifyPartitionInvariant(records);

    expect(results).toEqual([
      {
        windowKey: '2026-09-03',
        facetValue: 'APELACAO CIVEL',
        unfilteredCount: 30,
        facetSum: 140,
        holds: true,
      },
    ]);
  });

  it('flags a name-probe-level violation rather than silently accepting the discrepancy', () => {
    const records: CoverageRecord[] = [
      coverageRecord({
        windowKey: '2026-09-04',
        facetValue: 'AGRAVO DE INSTRUMENTO',
        unitKey: '2026-09-04..2026-09-04|AGRAVO DE INSTRUMENTO',
        resultCount: 30,
        state: 'subdivided',
      }),
      coverageRecord({
        windowKey: '2026-09-04',
        facetValue: 'AGRAVO DE INSTRUMENTO',
        unitKey: '2026-09-04..2026-09-04|AGRAVO DE INSTRUMENTO|DA SILVA',
        resultCount: 10,
        dimensions: { date: '2026-09-04', class: 'AGRAVO DE INSTRUMENTO', nameProbe: 'DA SILVA' },
      }),
    ];

    const results = verifyPartitionInvariant(records);

    expect(results).toEqual([
      {
        windowKey: '2026-09-04',
        facetValue: 'AGRAVO DE INSTRUMENTO',
        unfilteredCount: 30,
        facetSum: 10,
        holds: false,
      },
    ]);
  });

  it('detects a deeper partition level from dimension-bag SHAPE alone, never from a concrete key name (core-coverage-accounting delta: "the core does not learn a concrete name field")', () => {
    // A hypothetical, unrelated third partition axis a DIFFERENT adapter might
    // declare — no "nameProbe" key anywhere. The engine must recognize this
    // exactly like any other deeper partition, from shape alone.
    const records: CoverageRecord[] = [
      coverageRecord({
        windowKey: '2026-09-05',
        facetValue: 'SOME CLASS',
        unitKey: '2026-09-05..2026-09-05|SOME CLASS',
        resultCount: 30,
        state: 'subdivided',
      }),
      coverageRecord({
        windowKey: '2026-09-05',
        facetValue: 'SOME CLASS',
        unitKey: '2026-09-05..2026-09-05|SOME CLASS|REGION-A',
        resultCount: 20,
        dimensions: { date: '2026-09-05', class: 'SOME CLASS', region: 'REGION-A' },
      }),
      coverageRecord({
        windowKey: '2026-09-05',
        facetValue: 'SOME CLASS',
        unitKey: '2026-09-05..2026-09-05|SOME CLASS|REGION-B',
        resultCount: 15,
        dimensions: { date: '2026-09-05', class: 'SOME CLASS', region: 'REGION-B' },
      }),
    ];

    const results = verifyPartitionInvariant(records);

    expect(results).toEqual([
      {
        windowKey: '2026-09-05',
        facetValue: 'SOME CLASS',
        unfilteredCount: 30,
        facetSum: 35,
        holds: true,
      },
    ]);
  });

  it('degenerate case: an adapter that declares no dimensions anywhere produces no deeper-partition entries at all', () => {
    const records: CoverageRecord[] = [
      coverageRecord({ windowKey: '2026-09-06', facetValue: null, resultCount: 30 }),
      coverageRecord({ windowKey: '2026-09-06', facetValue: 'A', resultCount: 20 }),
      coverageRecord({ windowKey: '2026-09-06', facetValue: 'B', resultCount: 15 }),
    ];

    const results = verifyPartitionInvariant(records);

    // Only the pre-existing day-level check fires; nothing has a dimensions
    // bag that is a strict superset of anything else in its own facetValue
    // bucket, so zero class-level entries are ever produced.
    expect(results).toEqual([
      { windowKey: '2026-09-06', unfilteredCount: 30, facetSum: 35, holds: true },
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
