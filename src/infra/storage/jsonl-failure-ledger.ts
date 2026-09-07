import type { FailureLedger, LedgerEntry } from '../../engine/ports.js';
import { appendJsonlLine, readJsonlFile } from './jsonl.js';

/**
 * Writes/loads `output/state/failures.jsonl`. Keyed by itemId+documentId
 * (`null` documentId = discovery-stage failure). `resolve()` appends a
 * `resolved: true` line — it never edits or deletes the original entry.
 */
export class JsonlFailureLedger implements FailureLedger {
  constructor(private readonly filePath: string) {}

  load(): Promise<readonly LedgerEntry[]> {
    return Promise.resolve(readJsonlFile<LedgerEntry>(this.filePath).records);
  }

  record(entry: LedgerEntry): Promise<void> {
    appendJsonlLine(this.filePath, entry);
    return Promise.resolve();
  }

  resolve(itemId: string, documentId: string | null): Promise<void> {
    const resolution: LedgerEntry = {
      itemId,
      documentId,
      reason: 'resolved',
      observedAt: new Date().toISOString(),
      resolved: true,
    };
    appendJsonlLine(this.filePath, resolution);
    return Promise.resolve();
  }
}
