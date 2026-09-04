import type { LogEvent, Logger } from '../../engine/ports.js';

/** Default no-op `Logger` — for wherever a run has no explicit destination configured. */
export class NullLogger implements Logger {
  log(_event: LogEvent): void {
    // Intentionally does nothing.
  }
}
