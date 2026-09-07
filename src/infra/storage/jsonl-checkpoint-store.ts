import type { CheckpointRecord, CheckpointStore } from '../../engine/ports.js';
import { appendJsonlLine, readJsonlFile } from './jsonl.js';

/**
 * Writes/loads `output/state/checkpoints.jsonl`. Cursor is opaque JSON,
 * round-tripped byte-identical — this store performs no transformation on it
 * (core-scraping-engine "Opaque Checkpoint Persistence").
 */
export class JsonlCheckpointStore implements CheckpointStore {
  constructor(private readonly filePath: string) {}

  load(): Promise<ReadonlyMap<string, CheckpointRecord>> {
    const { records } = readJsonlFile<CheckpointRecord>(this.filePath);
    const latest = new Map<string, CheckpointRecord>();
    for (const record of records) {
      const normalized = { ...record, unresolvedItemCount: record.unresolvedItemCount ?? 0 };
      const existing = latest.get(normalized.unitKey);
      if (!existing || record.observedAt >= existing.observedAt) {
        latest.set(normalized.unitKey, normalized);
      }
    }
    return Promise.resolve(latest);
  }

  put(record: CheckpointRecord): Promise<void> {
    appendJsonlLine(this.filePath, record);
    return Promise.resolve();
  }
}
