import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FsDocumentSink } from './fs-document-sink.js';

// `renameSync`/`statSync` are call-through by default (see beforeEach) — only
// the crash-simulation and persisted-size tests below override them for a
// single call via mockImplementationOnce.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync), statSync: vi.fn(actual.statSync) };
});

describe('FsDocumentSink — Document Persistence to Disk (trf5-adapter spec)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pje-document-sink-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the per-process directory and writes bytes matching the fetched body exactly', async () => {
    const sink = new FsDocumentSink(dir);
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const written = await sink.write('0123456-78.2026.4.05.8100/12452668-decisao.pdf', bytes);

    const finalPath = join(dir, '0123456-78.2026.4.05.8100', '12452668-decisao.pdf');
    expect(existsSync(finalPath)).toBe(true);
    expect(new Uint8Array(readFileSync(finalPath))).toEqual(bytes);
    expect(written).toBe(bytes.byteLength);
  });

  it('leaves no lingering temp file after a successful write', async () => {
    const sink = new FsDocumentSink(dir);
    await sink.write('proc-1/doc-1.pdf', new Uint8Array([9]));

    expect(readdirSync(join(dir, 'proc-1'))).toEqual(['doc-1.pdf']);
  });

  it('a write interrupted before the rename completes leaves no file that reads as complete at the final path', async () => {
    const sink = new FsDocumentSink(dir);
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw new Error('simulated crash before rename');
    });

    await expect(sink.write('proc-1/doc-1.pdf', new Uint8Array([9]))).rejects.toThrow(
      'simulated crash',
    );

    expect(existsSync(join(dir, 'proc-1', 'doc-1.pdf'))).toBe(false);
  });

  it('reports the size actually persisted on disk, not the byte length it received', async () => {
    const sink = new FsDocumentSink(dir);
    // The mocked size (999) deliberately differs from the 3-byte input: if
    // write() ever hardcoded `bytes.byteLength` instead of reading the real
    // file back, this test would still pass by coincidence in every other
    // case in this file, because none of them exercise a size mismatch.
    vi.mocked(statSync).mockImplementationOnce(
      () => ({ size: 999 }) as ReturnType<typeof statSync>,
    );

    const written = await sink.write('proc-1/doc-1.pdf', new Uint8Array([1, 2, 3]));

    expect(written).toBe(999);
  });
});
