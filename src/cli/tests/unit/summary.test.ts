import { describe, expect, it } from 'vitest';
import type { CoverageRecord } from '../../../engine/ports.js';
import {
  formatFrontierRunSummary,
  formatRunSummary,
  printFrontierRunSummary,
  printRunSummary,
} from '../../summary.js';

function coverageRecord(overrides: Partial<CoverageRecord>): CoverageRecord {
  return {
    schemaVersion: 1,
    runId: 'run-1',
    phase: 'sweep',
    unitKey: 'unit-1',
    windowKey: '2026-01-01',
    facetValue: null,
    state: 'complete',
    resultCount: 5,
    declaredCap: 30,
    saturated: false,
    itemSetHash: 'sha1:x',
    observedAt: '2026-01-01T00:00:00.000Z',
    failureReason: null,
    dimensions: {},
    ...overrides,
  };
}

describe('formatRunSummary', () => {
  it("prints exactly summarizeRunCoverage's counts, with no independent completeness claim", () => {
    const records = [
      coverageRecord({ unitKey: 'a', state: 'complete' }),
      coverageRecord({ unitKey: 'b', state: 'truncated' }),
      coverageRecord({ unitKey: 'c', state: 'failed' }),
      // a subdivided parent contributes to none of the three tallies (S5c, D10) —
      // the summary must not invent a fourth number or double-count it.
      coverageRecord({ unitKey: 'd', state: 'subdivided' }),
    ];

    const lines = formatRunSummary(records);

    expect(lines.join('\n')).toContain('complete: 1');
    expect(lines.join('\n')).toContain('truncated: 1');
    expect(lines.join('\n')).toContain('failed: 1');
    expect(lines.join('\n')).not.toMatch(/subdivided:\s*\d/);
  });

  it('reflects only the latest observation per unitKey, exactly as summarizeRunCoverage does', () => {
    const records = [
      coverageRecord({ unitKey: 'a', state: 'truncated', observedAt: '2026-01-01T00:00:00.000Z' }),
      coverageRecord({ unitKey: 'a', state: 'subdivided', observedAt: '2026-01-02T00:00:00.000Z' }),
    ];

    const lines = formatRunSummary(records);

    expect(lines.join('\n')).toContain('complete: 0');
    expect(lines.join('\n')).toContain('truncated: 0');
    expect(lines.join('\n')).toContain('failed: 0');
  });
});

describe('printRunSummary', () => {
  it('writes the formatted lines to the given sink, human-facing output only', () => {
    const written: string[] = [];
    printRunSummary([coverageRecord({})], (line) => written.push(line));
    expect(written.length).toBeGreaterThan(0);
    expect(written.join('\n')).toContain('complete: 1');
  });
});

describe('formatFrontierRunSummary (core-frontier-crawl, "Documented Unmeasurable Bias")', () => {
  it('states plainly that frontier-crawl coverage gains are unmeasured and self-reinforcing', () => {
    const lines = formatFrontierRunSummary({ seedsProcessed: 4, newItemsFound: 2 });

    const text = lines.join('\n');
    expect(text).toContain('seeds processed: 4');
    expect(text).toContain('new items found: 2');
    expect(text).toMatch(/unmeasured/i);
    expect(text).toMatch(/self-reinforcing/i);
  });
});

describe('printFrontierRunSummary', () => {
  it('writes the formatted lines to the given sink', () => {
    const written: string[] = [];
    printFrontierRunSummary({ seedsProcessed: 1, newItemsFound: 0 }, (line) => written.push(line));
    expect(written.join('\n')).toContain('seeds processed: 1');
  });
});

describe('formatRunSummary partition invariant (core-coverage-accounting, "Partition Invariant Verification")', () => {
  /** A saturated day subdivided into facets that recover fewer items than the day itself. */
  const underCoveringSplit = [
    coverageRecord({
      unitKey: 'day',
      windowKey: '2026-01-05..2026-01-05',
      state: 'subdivided',
      resultCount: 30,
      saturated: true,
      dimensions: { date: '2026-01-05' },
    }),
    coverageRecord({
      unitKey: 'day|A',
      windowKey: '2026-01-05..2026-01-05',
      facetValue: 'A',
      resultCount: 29,
      dimensions: { date: '2026-01-05', class: 'A' },
    }),
    coverageRecord({
      unitKey: 'day|B',
      windowKey: '2026-01-05..2026-01-05',
      facetValue: 'B',
      resultCount: 0,
      dimensions: { date: '2026-01-05', class: 'B' },
    }),
  ];

  it('reports a split whose facets recover fewer items than their parent, with the shortfall', () => {
    const text = formatRunSummary(underCoveringSplit).join('\n');

    expect(text).toMatch(/partition/i);
    expect(text).toContain('2026-01-05..2026-01-05');
    expect(text).toContain('30');
    expect(text).toContain('29');
    expect(text).toMatch(/1 item/);
  });

  it('never lets a cell that passed its own state check hide a partition gap', () => {
    const text = formatRunSummary(underCoveringSplit).join('\n');

    // Every facet cell is individually `complete`; the gap exists only in the
    // arithmetic ACROSS cells, which is exactly what the summary must surface.
    expect(text).toContain('complete: 2');
    expect(text).toMatch(/unaccounted/i);
  });

  it('states that the invariant held when every split closes, rather than staying silent', () => {
    const text = formatRunSummary([
      coverageRecord({
        unitKey: 'day',
        windowKey: '2026-01-06..2026-01-06',
        state: 'subdivided',
        resultCount: 30,
        saturated: true,
        dimensions: { date: '2026-01-06' },
      }),
      coverageRecord({
        unitKey: 'day|A',
        windowKey: '2026-01-06..2026-01-06',
        facetValue: 'A',
        resultCount: 31,
        dimensions: { date: '2026-01-06', class: 'A' },
      }),
    ]).join('\n');

    expect(text).toMatch(/partition/i);
    expect(text).not.toMatch(/unaccounted/i);
  });

  it('says nothing about partitions when the run subdivided nothing at all', () => {
    const text = formatRunSummary([coverageRecord({})]).join('\n');

    expect(text).not.toMatch(/partition/i);
  });
});

describe('formatRunSummary unresolved items', () => {
  it('prints unresolved rows on a separate tally line rather than folding them into complete', () => {
    const lines = formatRunSummary([coverageRecord({ unresolvedItemCount: 2 })]);

    expect(lines.join('\n')).toContain('complete: 1');
    expect(lines.join('\n')).toContain('unresolved items: 2');
  });
});
