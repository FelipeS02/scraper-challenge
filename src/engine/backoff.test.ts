import { describe, expect, it } from 'vitest';
import { exponential, withCap, withJitter } from './backoff.js';

describe('exponential backoff', () => {
  it('grows per attempt with base 1000ms and factor 2', () => {
    const strategy = exponential(1000, 2);

    expect(strategy(1)).toBe(1000);
    expect(strategy(2)).toBe(2000);
    expect(strategy(3)).toBe(4000);
  });
});

describe('withJitter', () => {
  it('keeps every computed delay within +/-30% of the base delay for the same attempt', () => {
    const base = exponential(1000, 2);
    const jittered = withJitter(0.3)(base);
    const baseDelay = base(2); // 2000ms

    for (let i = 0; i < 50; i++) {
      const delay = jittered(2);
      expect(delay).toBeGreaterThanOrEqual(baseDelay * 0.7);
      expect(delay).toBeLessThanOrEqual(baseDelay * 1.3);
    }
  });
});

describe('withCap', () => {
  it('never exceeds the cap at attempt 12', () => {
    const strategy = withCap(60000)(exponential(1000, 2));

    expect(strategy(12)).toBeLessThanOrEqual(60000);
  });
});
