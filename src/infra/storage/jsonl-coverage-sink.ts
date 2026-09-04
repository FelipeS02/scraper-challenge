import type { CoverageRecord, CoverageSink } from '../../engine/ports.js';
import { appendJsonlLine } from './jsonl.js';

/** Writes `coverage.jsonl` — a separate file from `items.jsonl`, never interleaved (D5). */
export class JsonlCoverageSink implements CoverageSink {
  constructor(private readonly filePath: string) {}

  write(record: CoverageRecord): Promise<void> {
    appendJsonlLine(this.filePath, record);
    return Promise.resolve();
  }
}
