import type { LogEvent, Logger } from '../../engine/ports.js';

/**
 * Redacts personal-data-bearing fields by name before an event reaches the
 * wrapped `Logger` (core-run-control-and-output, "Personal Data Handling
 * Rules"). Keyed on field name only — never on sniffing values — so a
 * CPF-shaped string under an unlisted key is left untouched, exactly as a
 * value-sniffing approach would get wrong for a non-personal-data lookalike.
 * Same composable-decorator shape as `withJitter`/`withCap` (engine/backoff.ts).
 */
const REDACTED_FIELD_NAMES: ReadonlySet<string> = new Set([
  'cpf',
  'partyName',
  'jsessionid',
  'viewState',
  'ca',
]);

const REDACTED_PLACEHOLDER = '[REDACTED]';

export function withRedaction(inner: Logger): Logger {
  return {
    log(event: LogEvent): void {
      inner.log(redact(event));
    },
  };
}

function redact(event: LogEvent): LogEvent {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event.fields)) {
    fields[key] = REDACTED_FIELD_NAMES.has(key) ? REDACTED_PLACEHOLDER : value;
  }
  return { ...event, fields };
}
