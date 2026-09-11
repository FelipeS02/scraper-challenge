import { describe, expect, it } from 'vitest';
import { NullLogger } from '../../logging/null-logger.js';

describe('NullLogger', () => {
  it('accepts any event and does nothing', () => {
    const logger = new NullLogger();
    expect(logger.log({ level: 'error', event: 'document.failed', fields: { itemId: 'x' } })).toBe(
      undefined,
    );
  });
});
