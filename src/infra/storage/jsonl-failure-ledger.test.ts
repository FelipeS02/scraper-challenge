import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../../engine/ports.js';
import { JsonlFailureLedger } from './jsonl-failure-ledger.js';

describe('JsonlFailureLedger', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pje-failure-ledger-'));
    filePath = join(dir, 'failures.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keys a discovery-stage failure by itemId with a null documentId', async () => {
    const ledger = new JsonlFailureLedger(filePath);
    const entry: LedgerEntry = {
      itemId: 'unit-1',
      documentId: null,
      reason: 'permanentError:notFound',
      observedAt: '2026-01-01T00:00:00.000Z',
    };

    await ledger.record(entry);
    const entries = await ledger.load();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ itemId: 'unit-1', documentId: null });
  });

  it('keys a document-stage failure by itemId+documentId and carries the item/doc payload', async () => {
    const ledger = new JsonlFailureLedger(filePath);
    const entry: LedgerEntry = {
      itemId: 'item-1',
      documentId: 'doc-1',
      reason: 'transient:503',
      observedAt: '2026-01-01T00:00:00.000Z',
      item: { id: 'item-1', label: 'Synthetic Item' },
      doc: { id: 'doc-1' },
    };

    await ledger.record(entry);
    const entries = await ledger.load();

    expect(entries[0]).toMatchObject({
      itemId: 'item-1',
      documentId: 'doc-1',
      item: { id: 'item-1', label: 'Synthetic Item' },
      doc: { id: 'doc-1' },
    });
  });

  it('resolves by appending a resolved:true line, never editing or deleting the original', async () => {
    const ledger = new JsonlFailureLedger(filePath);
    await ledger.record({
      itemId: 'item-1',
      documentId: 'doc-1',
      reason: 'transient:503',
      observedAt: '2026-01-01T00:00:00.000Z',
    });

    await ledger.resolve('item-1', 'doc-1');
    const entries = await ledger.load();

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ itemId: 'item-1', documentId: 'doc-1', reason: 'transient:503' });
    expect(entries[0]?.resolved).not.toBe(true);
    expect(entries[1]).toMatchObject({ itemId: 'item-1', documentId: 'doc-1', resolved: true });
  });
});
