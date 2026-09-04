import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputRecord } from '../../engine/ports.js';
import { readJsonlFile } from './jsonl.js';
import { JsonlItemSink } from './jsonl-item-sink.js';

interface FakePayload {
  readonly label: string;
}

function record(itemId: string): OutputRecord<FakePayload> {
  return {
    schemaVersion: 1,
    itemId,
    scrapedAt: '2026-01-01T00:00:00.000Z',
    sourceUrl: `fake://item/${itemId}`,
    runId: 'run-1',
    payload: { label: `Synthetic ${itemId}` },
  };
}

describe('JsonlItemSink', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pje-item-sink-'));
    filePath = join(dir, 'items.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends one JSON object per line, never a JSON array', async () => {
    const sink = new JsonlItemSink<FakePayload>(filePath);
    await sink.write(record('a'));
    await sink.write(record('b'));

    const raw = readFileSync(filePath, 'utf-8');
    expect(raw.trimEnd().split('\n')).toHaveLength(2);
    expect(raw.trimEnd().startsWith('[')).toBe(false);
  });

  it('leaves every already-written line valid after a run is killed mid-way (3 writes -> 3 valid lines)', async () => {
    const sink = new JsonlItemSink<FakePayload>(filePath);
    await sink.write(record('a'));
    await sink.write(record('b'));
    await sink.write(record('c'));
    // No explicit flush/close call — each write() is a synchronous append,
    // so a kill "here" already leaves exactly these 3 lines valid.

    const { records, warnings } = readJsonlFile<OutputRecord<FakePayload>>(filePath);
    expect(records).toHaveLength(3);
    expect(records.map((r) => r.itemId)).toEqual(['a', 'b', 'c']);
    expect(warnings).toHaveLength(0);
  });

  it('never mutates an already-written line when the same item is observed again', async () => {
    const sink = new JsonlItemSink<FakePayload>(filePath);
    await sink.write(record('a'));
    await sink.write(record('a'));

    const { records } = readJsonlFile<OutputRecord<FakePayload>>(filePath);
    expect(records).toHaveLength(2);
  });

  it('drops a torn final line with a warning at load, keeping the valid lines', () => {
    appendFileSync(filePath, `${JSON.stringify(record('a'))}\n`, 'utf-8');
    appendFileSync(filePath, '{"itemId":"b","payload":{"lab', 'utf-8'); // torn, no trailing newline

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { records, warnings } = readJsonlFile<OutputRecord<FakePayload>>(filePath);
    warnSpy.mockRestore();

    expect(records).toHaveLength(1);
    expect(records[0]?.itemId).toBe('a');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/torn/i);
  });

  it('treats a malformed non-final line as fatal', () => {
    appendFileSync(filePath, '{"itemId":"a","broken\n', 'utf-8');
    appendFileSync(filePath, `${JSON.stringify(record('b'))}\n`, 'utf-8');

    expect(() => readJsonlFile<OutputRecord<FakePayload>>(filePath)).toThrow(/malformed/i);
  });
});
