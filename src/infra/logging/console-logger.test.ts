import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from './console-logger.js';

describe('ConsoleLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to stderr only, never to stdout', () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const logger = new ConsoleLogger();
    logger.log({ level: 'info', event: 'unit.started', fields: { unitKey: 'A' } });

    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(stderrWrite).toHaveBeenCalledTimes(1);
    const written = stderrWrite.mock.calls[0]?.[0];
    expect(JSON.parse(String(written).trim())).toEqual({
      level: 'info',
      event: 'unit.started',
      fields: { unitKey: 'A' },
    });
  });

  it('emits nothing when the event level is below the configured threshold', () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const logger = new ConsoleLogger('warn');
    logger.log({ level: 'info', event: 'unit.started', fields: {} });

    expect(stderrWrite).not.toHaveBeenCalled();
    expect(stdoutWrite).not.toHaveBeenCalled();
  });
});
