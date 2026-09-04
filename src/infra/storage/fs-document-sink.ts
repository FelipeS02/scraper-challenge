import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { DocumentSink } from '../../engine/ports.js';

/**
 * Persists fetched document bytes under the run's document output directory
 * (trf5-adapter spec, "Document Persistence to Disk"). Crash-safe by the same
 * temp-file-then-rename standard as the S2a JSONL sinks (design.md D5): bytes
 * are written in full to a sibling temp file first, then atomically renamed
 * into place, so a killed run never leaves a partially-written file that
 * later reads as complete at the final path.
 */
export class FsDocumentSink implements DocumentSink {
  constructor(private readonly rootDir: string) {}

  write(relativePath: string, bytes: Uint8Array): Promise<number> {
    const finalPath = join(this.rootDir, relativePath);
    mkdirSync(dirname(finalPath), { recursive: true });
    const tempPath = `${finalPath}.tmp-${randomUUID()}`;

    try {
      writeFileSync(tempPath, bytes);
      renameSync(tempPath, finalPath);
    } catch (error) {
      rmSync(tempPath, { force: true }); // best-effort: never leave a stray temp file behind
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    return Promise.resolve(statSync(finalPath).size);
  }
}
