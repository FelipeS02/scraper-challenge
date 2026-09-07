import type { ItemSink, OutputRecord } from '../../engine/ports.js';
import { appendJsonlLine } from './jsonl.js';

/** Writes `items.jsonl` — append-only, one record per line (D5). */
export class JsonlItemSink<TItem> implements ItemSink<TItem> {
  constructor(private readonly filePath: string) {}

  write(record: OutputRecord<TItem>): Promise<void> {
    appendJsonlLine(this.filePath, record);
    return Promise.resolve();
  }
}
