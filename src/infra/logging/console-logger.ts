import type { LogEvent, LogLevel, Logger } from '../../engine/ports.js';

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Writes every event to stderr only, one JSON object per line — stdout stays
 * reserved for human-facing run output (dry-run forecast, run summary),
 * per core-run-control-and-output's "Structured Run Observability".
 */
export class ConsoleLogger implements Logger {
  constructor(private readonly threshold: LogLevel = 'info') {}

  log(event: LogEvent): void {
    if (LEVEL_RANK[event.level] < LEVEL_RANK[this.threshold]) return;
    process.stderr.write(`${JSON.stringify(event)}\n`);
  }
}
