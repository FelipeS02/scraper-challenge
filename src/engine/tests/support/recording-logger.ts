import type { LogEvent, Logger } from '../../ports.js';

/** In-memory `Logger` for asserting emitted events in tests — never spies on `console`. */
export class RecordingLogger implements Logger {
  readonly events: LogEvent[] = [];

  log(event: LogEvent): void {
    this.events.push(event);
  }
}
