import { join } from 'node:path';
import type { AdapterStateStore } from '../../engine/ports.js';
import { appendJsonlLine, readJsonlFile } from './jsonl.js';

/** One JSONL file per key under `directory` (phase-2 only, D3 — frontier seeds). */
export class JsonlAdapterStateStore implements AdapterStateStore {
  constructor(private readonly directory: string) {}

  read(key: string): Promise<readonly unknown[]> {
    return Promise.resolve(readJsonlFile<unknown>(this.pathFor(key)).records);
  }

  append(key: string, value: unknown): Promise<void> {
    appendJsonlLine(this.pathFor(key), value);
    return Promise.resolve();
  }

  private pathFor(key: string): string {
    return join(this.directory, `${key}.jsonl`);
  }
}
