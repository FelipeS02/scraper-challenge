import type { FetchOutcome } from './types.js';

/**
 * Transport-boundary status classification (design.md "Validity chain": "404
 * (case 4) and 429/5xx/timeout (case 6) are classified at the transport
 * boundary before the chain runs"). This is protocol truth (RFC 9110), not
 * site truth — a second portal must not re-derive it. 404 is deliberately NOT
 * classified here; it stays wherever the adapter's own `fetchDocument`
 * already places it (design.md D12: adapter-owned reason detail).
 */
const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

/**
 * Parses a `Retry-After` header value (delta-seconds only, RFC 9110 §10.2.3).
 * The HTTP-date form is a deliberate, disclosed narrowing (S5g task 5g.3): it
 * would need the injected `Clock` to resolve "now" against, and no response
 * observed against this host has ever carried one. An absent, negative, or
 * non-numeric value returns `null`, leaving `?? config.backoff(attempt)` (the
 * existing fallback in `retry-policy.ts`/`scraper.ts`) as the only remaining branch.
 */
export function parseRetryAfterMs(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds)) return null;
  return seconds * 1000;
}

/**
 * Classifies an HTTP status at the transport boundary, before any content-
 * based validity chain runs. Returns `null` for every status the site's own
 * content-based classification must own — including every status this host
 * actually uses for failure today (docs/RESEARCH.md §5: 200 for cases 1/2/3/5,
 * a plain 302 for the document-download redirect) — so this is a narrow
 * precedence, never a replacement for content-based classification.
 */
export function classifyHttpStatus(
  status: number,
  headers: Readonly<Record<string, string>>,
): FetchOutcome<never> | null {
  if (!TRANSIENT_STATUSES.has(status)) return null;
  return {
    kind: 'transient',
    status,
    retryAfterMs: parseRetryAfterMs(headers['retry-after']),
  };
}
