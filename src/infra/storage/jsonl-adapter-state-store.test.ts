import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonlAdapterStateStore } from './jsonl-adapter-state-store.js';

describe('JsonlAdapterStateStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pje-adapter-state-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends values under a key and reads them back in order', async () => {
    const store = new JsonlAdapterStateStore(dir);

    await store.append('seeds', { kind: 'oab', value: '12345-PE' });
    await store.append('seeds', { kind: 'exactName', value: 'Synthetic Party Name' });

    const values = await store.read('seeds');
    expect(values).toEqual([
      { kind: 'oab', value: '12345-PE' },
      { kind: 'exactName', value: 'Synthetic Party Name' },
    ]);
  });

  it('isolates values under different keys', async () => {
    const store = new JsonlAdapterStateStore(dir);

    await store.append('seeds', { kind: 'oab', value: '1' });
    await store.append('other', { kind: 'exactName', value: '2' });

    expect(await store.read('seeds')).toEqual([{ kind: 'oab', value: '1' }]);
    expect(await store.read('other')).toEqual([{ kind: 'exactName', value: '2' }]);
  });

  it('returns an empty list for a key that was never appended to', async () => {
    const store = new JsonlAdapterStateStore(dir);
    expect(await store.read('never-touched')).toEqual([]);
  });
});
