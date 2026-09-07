import type { BackoffStrategy } from './backoff.js';
import type { FetchOutcome, RetryDecision } from './types.js';

/**
 * Maps a `FetchOutcome` to a `RetryDecision` (core-resilience-policy). A 429 status
 * routes to `requeue`: the global rate-limiter cooldown owns the wait (design.md D6),
 * not this policy. Every other transient status uses `retryAfter`, where a server
 * `Retry-After` value always overrides the computed backoff delay.
 */
export interface RetryPolicyConfig {
  readonly backoff: BackoffStrategy; // MUST already be capped (withCap)
  readonly transientCap: number; // default: 5
  readonly hostDefectCap: number; // default: 1-2
  readonly sessionExpiredCap: number; // default: 1 (single replay)
}

export function decide(
  outcome: FetchOutcome<unknown>,
  attempt: number,
  config: RetryPolicyConfig,
): RetryDecision {
  switch (outcome.kind) {
    case 'ok':
      throw new Error('decide() must not be called for a successful outcome');
    case 'transient':
      if (attempt > config.transientCap) return { action: 'recordAndStop' };
      if (outcome.status === 429) return { action: 'requeue' };
      return { action: 'retryAfter', delayMs: outcome.retryAfterMs ?? config.backoff(attempt) };
    case 'sessionExpired':
      return attempt <= config.sessionExpiredCap
        ? { action: 'reprimeAndRetryNow' }
        : { action: 'recordAndStop' };
    case 'hostDefect':
      return attempt <= config.hostDefectCap
        ? { action: 'retryAfter', delayMs: config.backoff(attempt) }
        : { action: 'recordAndStop' };
    case 'permanentError':
      return { action: 'recordAndStop' };
  }
}
