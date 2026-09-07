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
  });

  it('renders a readable line carrying the event name and its fields, never raw JSON', () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    new ConsoleLogger().log({
      level: 'info',
      event: 'unit.started',
      fields: { unitKey: 'day:2026-08-24', depth: 2, label: 'AND nomeParte=SILVA' },
    });

    const written = String(stderrWrite.mock.calls[0]?.[0]);
    expect(written).toContain('unit.started');
    expect(written).toContain('day:2026-08-24');
    expect(written).toContain('depth=2');
    expect(written).toContain('AND nomeParte=SILVA');
    expect(written.endsWith('\n')).toBe(true);
    expect(() => {
      JSON.parse(written.trim());
    }).toThrow();
  });

  it('omits fields whose value is null or undefined rather than printing empty placeholders', () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    new ConsoleLogger().log({
      level: 'warn',
      event: 'fetch.retry',
      fields: { attempt: 2, reason: 'transient:429', label: null },
    });

    const written = String(stderrWrite.mock.calls[0]?.[0]);
    expect(written).toContain('reason=transient:429');
    expect(written).not.toContain('label');
  });

  it('renders a single line even when a field value is a nested object', () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    new ConsoleLogger().log({
      level: 'info',
      event: 'unit.completed',
      fields: { nested: { a: 1 } },
    });

    const written = String(stderrWrite.mock.calls[0]?.[0]);
    expect(written.trim().split('\n')).toHaveLength(1);
    expect(written).toContain('nested=');
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
