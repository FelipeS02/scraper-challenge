import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemClock } from '../../clock.js';

describe('SystemClock — the real Clock implementation, wired inline by main.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('now() returns the current wall-clock time', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    expect(new SystemClock().now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('sleep(ms) resolves only after the requested delay elapses', async () => {
    const clock = new SystemClock();
    let resolved = false;
    const pending = clock.sleep(1000).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(resolved).toBe(true);
  });
});
