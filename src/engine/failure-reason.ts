import type { FetchOutcome } from './types.js';

/**
 * Converts an exhausted outcome to the portable text stored by failure ledgers.
 * Callers retain the adapter's detail without teaching the engine its vocabulary.
 */
export function describeFailureReason(outcome: FetchOutcome<unknown>): string {
  switch (outcome.kind) {
    case 'transient':
      return `transient:${outcome.status ?? 'unknown'}`;
    case 'sessionExpired':
      return 'sessionExpired';
    case 'hostDefect':
      return outcome.reason;
    case 'permanentError':
      return outcome.detail === null ? outcome.reason : `${outcome.reason}:${outcome.detail}`;
    case 'ok':
      return 'ok';
  }
}
