import { describe, expect, it } from 'vitest';
import type { CoverageRecord } from '../engine/ports.js';
import {
  formatFrontierRunSummary,
  formatRunSummary,
  printFrontierRunSummary,
  printRunSummary,
} from './summary.js';

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
