import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CoverageRecord } from '../../engine/ports.js';
import { readJsonlFile } from './jsonl.js';
import { JsonlCoverageSink } from './jsonl-coverage-sink.js';
import { JsonlItemSink } from './jsonl-item-sink.js';

function coverageRecord(unitKey: string): CoverageRecord {
  return {
    schemaVersion: 1,
    runId: 'run-1',
    phase: 'sweep',
    unitKey,
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
  };
}

describe('JsonlCoverageSink', () => {
  let dir: string;
  let coveragePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pje-coverage-sink-'));
    coveragePath = join(dir, 'coverage.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends one coverage record per line, round-tripping through readJsonlFile', async () => {
    const sink = new JsonlCoverageSink(coveragePath);
    await sink.write(coverageRecord('cell-1'));
    await sink.write(coverageRecord('cell-2'));

    const { records } = readJsonlFile<CoverageRecord>(coveragePath);
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.unitKey)).toEqual(['cell-1', 'cell-2']);
  });

  it('never interleaves coverage records into the items file (separate files, task 2.14)', async () => {
    const itemsPath = join(dir, 'items.jsonl');
    const itemSink = new JsonlItemSink<{ readonly label: string }>(itemsPath);
    const coverageSink = new JsonlCoverageSink(coveragePath);

    await itemSink.write({
      schemaVersion: 1,
      itemId: 'item-1',
      scrapedAt: '2026-01-01T00:00:00.000Z',
      sourceUrl: 'fake://item/1',
      runId: 'run-1',
      payload: { label: 'Synthetic' },
    });
    await coverageSink.write(coverageRecord('cell-1'));

    const itemsRaw = readFileSync(itemsPath, 'utf-8');
    const coverageRaw = readFileSync(coveragePath, 'utf-8');

    expect(itemsRaw).toContain('"itemId"');
    expect(itemsRaw).not.toContain('"unitKey"');
    expect(coverageRaw).toContain('"unitKey"');
    expect(coverageRaw).not.toContain('"itemId"');
  });
});
