import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../../rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0); // spacing is measured against the clock, so pin its origin
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses every worker once one trips the cooldown, and resumes only after it elapses', async () => {
    const limiter = new RateLimiter(0); // spacing off: this test is about the cooldown alone
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

  it('spaces consecutive grants by the configured politeness interval', async () => {
    const limiter = new RateLimiter(500);
    const grantedAt: number[] = [];

    await limiter.acquire();
    grantedAt.push(Date.now());

    const second = limiter.acquire().then(() => grantedAt.push(Date.now()));
    await vi.advanceTimersByTimeAsync(499);
    expect(grantedAt).toHaveLength(1); // still spacing

    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(grantedAt).toEqual([0, 500]);
  });

  it('never delays a request that already waited longer than the spacing on its own', async () => {
    const limiter = new RateLimiter(500);

    await limiter.acquire();
    await vi.advanceTimersByTimeAsync(900); // the request itself took longer than the spacing

    let resolved = false;
    const next = limiter.acquire().then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    await next;

    expect(resolved).toBe(true);
    expect(Date.now()).toBe(900); // granted immediately, no artificial padding
  });

  it('serializes concurrent acquisitions so spacing holds across parallel workers', async () => {
    const limiter = new RateLimiter(200);
    const grantedAt: number[] = [];

    const workers = [
      limiter.acquire().then(() => grantedAt.push(Date.now())),
      limiter.acquire().then(() => grantedAt.push(Date.now())),
      limiter.acquire().then(() => grantedAt.push(Date.now())),
    ];

    await vi.advanceTimersByTimeAsync(400);
    await Promise.all(workers);

    expect(grantedAt).toEqual([0, 200, 400]);
  });

  it('lets a cooldown tripped during the spacing wait still gate the grant', async () => {
    const limiter = new RateLimiter(500);

    await limiter.acquire(); // granted at t=0

    let resolvedAt: number | null = null;
    const gated = limiter.acquire().then(() => {
      resolvedAt = Date.now();
    });

    await vi.advanceTimersByTimeAsync(100);
    limiter.tripCooldown(3000); // a 429 lands while the next request is only spacing

    await vi.advanceTimersByTimeAsync(400); // spacing alone would have released it here
    expect(resolvedAt).toBeNull();

    await vi.advanceTimersByTimeAsync(2700);
    await gated;
    expect(resolvedAt).toBe(3100); // the cooldown, not the spacing, decided
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
