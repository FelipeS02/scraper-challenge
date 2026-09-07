import type { LogEvent, LogLevel, Logger } from '../../engine/ports.js';

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Renders one field value on a single line. Scalars print verbatim; anything
 * structured falls back to compact JSON, so a nested value is still readable
 * without ever breaking the one-event-one-line contract a tailing terminal
 * depends on.
 */
function renderValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? String(value);
}

/**
 * `null`/`undefined` fields are dropped rather than rendered as `field=null`:
 * an absent value carries no progress information, and printing it only
 * crowds the line the operator is trying to read at a glance.
 */
function renderFields(fields: Readonly<Record<string, unknown>>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${renderValue(value)}`)
    .join(' ');
}

/**
 * Writes every event to stderr only, one human-readable line per event —
 * stdout stays reserved for human-facing run output (dry-run forecast, run
 * summary), per core-run-control-and-output's "Structured Run Observability".
 *
 * The line shape is `LEVEL event field=value ...`. Machine-readable JSONL is
 * still available and unchanged through `--log-format jsonl` (`JsonlLogger`),
 * which is what tooling should parse; this renderer exists so a live run is
 * legible to the person watching it, which raw JSON on a terminal is not.
 */
export class ConsoleLogger implements Logger {
  constructor(private readonly threshold: LogLevel = 'info') {}

  log(event: LogEvent): void {
    if (LEVEL_RANK[event.level] < LEVEL_RANK[this.threshold]) return;
    const fields = renderFields(event.fields);
    const line = fields.length > 0 ? `${event.event} ${fields}` : event.event;
    process.stderr.write(`${event.level.toUpperCase().padEnd(5)} ${line}\n`);
  }
}
