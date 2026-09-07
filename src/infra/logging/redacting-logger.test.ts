import { describe, expect, it } from 'vitest';
import type { LogEvent, Logger } from '../../engine/ports.js';
import { withRedaction } from './redacting-logger.js';

/** Local recorder — does not depend on `engine/__fixtures__/recording-logger.ts` (S5a task 5.15,
 * not yet created at this point in the task order). */
class RecordingLogger implements Logger {
  readonly events: LogEvent[] = [];
  log(event: LogEvent): void {
    this.events.push(event);
  }
}

describe('withRedaction', () => {
  it('redacts personal-data-bearing fields by name, leaving every other field byte-identical', () => {
    const inner = new RecordingLogger();
    const logger = withRedaction(inner);

    logger.log({
      level: 'info',
      event: 'session.reprimed',
      fields: {
        cpf: '123.456.789-00',
        partyName: 'Maria da Silva',
        jsessionid: 'ABCDEF123456',
        viewState: '-1234567890',
        ca: 'opaque-token-value',
        unitKey: '2026-01-01',
        attempt: 2,
      },
    });

    expect(inner.events).toHaveLength(1);
    expect(inner.events[0]?.fields).toEqual({
      cpf: '[REDACTED]',
      partyName: '[REDACTED]',
      jsessionid: '[REDACTED]',
      viewState: '[REDACTED]',
      ca: '[REDACTED]',
      unitKey: '2026-01-01', // pass-through, byte-identical
      attempt: 2,
    });
    expect(inner.events[0]?.level).toBe('info');
    expect(inner.events[0]?.event).toBe('session.reprimed');
  });

  it('redacts by field name only, never by sniffing a CPF-shaped value under an unlisted key', () => {
    const inner = new RecordingLogger();
    const logger = withRedaction(inner);

    logger.log({
      level: 'info',
      event: 'unit.started',
      fields: { referenceNumber: '123.456.789-00' }, // CPF-shaped value, unlisted key
    });

    expect(inner.events[0]?.fields).toEqual({ referenceNumber: '123.456.789-00' });
  });
});
