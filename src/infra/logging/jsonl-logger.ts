import { join } from 'node:path';
import type { LogEvent, LogLevel, Logger } from '../../engine/ports.js';
import { appendJsonlLine } from '../storage/jsonl.js';

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Appends one JSON object per line to `logs/run-<runId>.jsonl`, reusing the
 * same append-only, UTF-8-explicit primitive as the S2a JSONL sinks
 * (`infra/storage/jsonl.ts`). Diagnostic only — never replayed into program
 * state, so it carries no torn-line contract; that standard belongs to the
 * sinks whose records drive coverage arithmetic (design.md D5).
 */
export class JsonlLogger implements Logger {
  private readonly filePath: string;

  constructor(
    runId: string,
    logsDir: string,
    private readonly threshold: LogLevel = 'info',
  ) {
    this.filePath = join(logsDir, `run-${runId}.jsonl`);
  }

  log(event: LogEvent): void {
    if (LEVEL_RANK[event.level] < LEVEL_RANK[this.threshold]) return;
    appendJsonlLine(this.filePath, event);
  }
}
