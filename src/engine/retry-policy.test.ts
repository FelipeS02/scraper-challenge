import { describe, expect, it } from 'vitest';
import type { FetchOutcome } from './types.js';
import { decide, type RetryPolicyConfig } from './retry-policy.js';

const config: RetryPolicyConfig = {
  backoff: (attempt: number) => attempt * 1000,
  transientCap: 5,
  hostDefectCap: 2,
  sessionExpiredCap: 1,
};

describe('decide — transient outcome', () => {
  it('schedules backoff via retryAfter when the attempt count is within the cap', () => {
    const outcome: FetchOutcome<never> = { kind: 'transient', status: 503, retryAfterMs: null };

    expect(decide(outcome, 1, config)).toEqual({ action: 'retryAfter', delayMs: 1000 });
  });

  it('records and stops once the transient cap is reached', () => {
    const outcome: FetchOutcome<never> = { kind: 'transient', status: 503, retryAfterMs: null };

    expect(decide(outcome, 6, config)).toEqual({ action: 'recordAndStop' });
  });

  it('routes a 429 status to requeue so the global cooldown owns the wait', () => {
    const outcome: FetchOutcome<never> = { kind: 'transient', status: 429, retryAfterMs: 5000 };

    expect(decide(outcome, 1, config)).toEqual({ action: 'requeue' });
  });

  it('lets a server Retry-After override the computed backoff delay', () => {
    const outcome: FetchOutcome<never> = { kind: 'transient', status: 503, retryAfterMs: 5000 };

    expect(decide(outcome, 1, config)).toEqual({ action: 'retryAfter', delayMs: 5000 });
  });
});

describe('decide — sessionExpired outcome', () => {
  it('re-primes and retries immediately with zero delay within the replay cap', () => {
    const outcome: FetchOutcome<never> = { kind: 'sessionExpired' };

    expect(decide(outcome, 1, config)).toEqual({ action: 'reprimeAndRetryNow' });
  });

  it('records and stops once the single-replay cap is exhausted', () => {
    const outcome: FetchOutcome<never> = { kind: 'sessionExpired' };

    expect(decide(outcome, 2, config)).toEqual({ action: 'recordAndStop' });
  });
});

describe('decide — hostDefect outcome', () => {
  it('retries within the 1-2 attempt cap', () => {
    const outcome: FetchOutcome<never> = { kind: 'hostDefect', reason: 'PersistenceException' };

    expect(decide(outcome, 2, config)).toEqual({ action: 'retryAfter', delayMs: 2000 });
  });

  it('records and stops once the cap is reached', () => {
    const outcome: FetchOutcome<never> = { kind: 'hostDefect', reason: 'PersistenceException' };

    expect(decide(outcome, 3, config)).toEqual({ action: 'recordAndStop' });
  });
});

describe('decide — permanentError outcome', () => {
  it('never retries', () => {
    const outcome: FetchOutcome<never> = { kind: 'permanentError', reason: 'notFound' };

    expect(decide(outcome, 1, config)).toEqual({ action: 'recordAndStop' });
  });
});
