/**
 * Payload-generic engine types. Nothing here references a concrete site,
 * field name, or business concept — see design.md D1/D2/D9.
 */

/** Outcome of a single fetch attempt, exactly the four kinds core-resilience-policy requires. */
export type FetchOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | {
      readonly kind: 'transient';
      readonly status: number | null;
      readonly retryAfterMs: number | null;
    }
  | { readonly kind: 'sessionExpired' }
  | { readonly kind: 'hostDefect'; readonly reason: string }
  | {
      readonly kind: 'permanentError';
      readonly reason: 'notFound' | 'invalidTokenShell' | 'schemaMismatch';
    };

/** What the retry policy decides to do with a classified `FetchOutcome`. */
export type RetryDecision =
  | { readonly action: 'retryAfter'; readonly delayMs: number }
  | { readonly action: 'reprimeAndRetryNow' }
  | { readonly action: 'requeue' } // 429: the global cooldown owns the wait
  | { readonly action: 'recordAndStop' }; // -> failure ledger

/** One unit of discoverable work. Cursor and facet value are opaque to the engine. */
export interface WorkUnit<TCursor> {
  readonly unitKey: string; // opaque to the engine; adapter-generated, stable
  readonly windowKey: string; // opaque; engine only groups/compares by equality
  readonly facetValue: string | null;
  readonly label: string; // human-readable, for logs and coverage records
  readonly cursor: TCursor; // opaque JSON, round-tripped byte-identical
}
