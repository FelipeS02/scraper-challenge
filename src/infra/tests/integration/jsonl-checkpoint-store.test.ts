import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckpointRecord } from '../../../engine/ports.js';
import { JsonlCheckpointStore } from '../../storage/jsonl-checkpoint-store.js';

describe('JsonlCheckpointStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pje-checkpoint-store-'));
    filePath = join(dir, 'checkpoints.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a cursor as byte-identical JSON, with no transformation of its fields', async () => {
    const store = new JsonlCheckpointStore(filePath);
    const cursor = { day: '2026-01-01', nestedFacet: { classCode: 'APELAÇÃO CÍVEL', page: 2 } };
    const record: CheckpointRecord = {
      unitKey: 'unit-1',
      windowKey: '2026-01-01',
      facetValue: null,
      label: '2026-01-01',
      cursor,
      resultCount: 12,
      state: 'complete',
      observedAt: '2026-01-01T00:00:00.000Z',
    };

    await store.put(record);
    const loaded = await store.load();

    expect(loaded.get('unit-1')?.cursor).toEqual(cursor);
    expect(JSON.stringify(loaded.get('unit-1')?.cursor)).toBe(JSON.stringify(cursor));
  });

  it('round-trips facetValue and label alongside cursor — a checkpoint describes a complete WorkUnit', async () => {
    const store = new JsonlCheckpointStore(filePath);
    const record: CheckpointRecord = {
      unitKey: '2026-01-01|APELAÇÃO CÍVEL',
      windowKey: '2026-01-01',
      facetValue: 'APELAÇÃO CÍVEL',
      label: '2026-01-01 / APELAÇÃO CÍVEL',
      cursor: { day: '2026-01-01' },
      resultCount: 30,
      state: 'subdivided',
      observedAt: '2026-01-01T00:00:00.000Z',
    };

    await store.put(record);
    const loaded = await store.load();

    expect(loaded.get(record.unitKey)?.facetValue).toBe('APELAÇÃO CÍVEL');
    expect(loaded.get(record.unitKey)?.label).toBe('2026-01-01 / APELAÇÃO CÍVEL');
  });

  it('keeps only the latest-by-observedAt record per unitKey on load', async () => {
    const store = new JsonlCheckpointStore(filePath);
    await store.put({
      unitKey: 'unit-1',
      windowKey: '2026-01-01',
      facetValue: null,
      label: '2026-01-01',
      cursor: { day: '2026-01-01' },
      resultCount: 0,
      state: 'failed',
      observedAt: '2026-01-01T00:00:00.000Z',
    });
    await store.put({
      unitKey: 'unit-1',
      windowKey: '2026-01-01',
      facetValue: null,
      label: '2026-01-01',
      cursor: { day: '2026-01-01' },
      resultCount: 3,
      state: 'complete',
      observedAt: '2026-01-02T00:00:00.000Z',
    });

    const loaded = await store.load();

    expect(loaded.size).toBe(1);
    expect(loaded.get('unit-1')?.state).toBe('complete');
  });
  it('normalizes a legacy checkpoint without unresolvedItemCount to zero', async () => {
    const store = new JsonlCheckpointStore(filePath);
    const legacy = {
      unitKey: 'legacy-unit',
      windowKey: '2026-01-01',
      facetValue: null,
      label: 'legacy',
      cursor: { day: '2026-01-01' },
      resultCount: 1,
      state: 'complete',
      observedAt: '2026-01-01T00:00:00.000Z',
    };
    writeFileSync(filePath, `${JSON.stringify(legacy)}\n`);

    const loaded = await store.load();

    expect(loaded.get('legacy-unit')?.unresolvedItemCount).toBe(0);
  });
});
