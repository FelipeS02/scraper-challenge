import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses every worker once one trips the cooldown, and resumes only after it elapses', async () => {
    const limiter = new RateLimiter();
    const resolvedOrder: string[] = [];

    await limiter.acquire(); // worker A passes the (initially open) gate
    limiter.tripCooldown(5000); // worker A observed a 429

    const workerB = limiter.acquire().then(() => resolvedOrder.push('B'));
    const workerC = limiter.acquire().then(() => resolvedOrder.push('C'));

    await vi.advanceTimersByTimeAsync(1000);
    expect(resolvedOrder).toEqual([]); // both still paused mid-cooldown

    await vi.advanceTimersByTimeAsync(4000);
    await Promise.all([workerB, workerC]);
    expect(resolvedOrder).toEqual(['B', 'C']);
  });

  it('lets a requeued unit return to the work queue instead of being marked permanently failed', async () => {
    const limiter = new RateLimiter();
    const queue = ['unit-a', 'unit-b'];

    const failedUnit = queue.shift();
    limiter.tripCooldown(1000);
    if (failedUnit) queue.push(failedUnit);

    await vi.advanceTimersByTimeAsync(1000);

    expect(queue).toEqual(['unit-b', 'unit-a']);
  });
});
