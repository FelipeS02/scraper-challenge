import { describe, expect, it } from 'vitest';
import { classifyHttpStatus, parseRetryAfterMs } from './http-status.js';

/**
 * Transport-boundary status classification (design.md "Validity chain": "404
 * (case 4) and 429/5xx/timeout (case 6) are classified at the transport
 * boundary before the chain runs"). This is protocol truth (RFC 9110), not
 * TRF5 truth — the S5f "no fixture is written by hand" rule governs response
 * BODIES the portal invents, not a status line or a header (S5g launch note).
 */
describe('classifyHttpStatus — 429/5xx transient precedence, before any content classification', () => {
  it('classifies 429 as transient, carrying the status and no Retry-After', () => {
    expect(classifyHttpStatus(429, {})).toEqual({
      kind: 'transient',
      status: 429,
      retryAfterMs: null,
    });
  });

  it('carries a parsed Retry-After delay onto the 429 outcome', () => {
    expect(classifyHttpStatus(429, { 'retry-after': '5' })).toEqual({
      kind: 'transient',
      status: 429,
      retryAfterMs: 5000,
    });
  });

  it('classifies 502, 503, and 504 as transient, each carrying its own status', () => {
    for (const status of [502, 503, 504]) {
      expect(classifyHttpStatus(status, {})).toEqual({
        kind: 'transient',
        status,
        retryAfterMs: null,
      });
    }
  });

  it('returns null for 200 and 302 so content-based classification still owns every status this host actually uses for failure', () => {
    // docs/RESEARCH.md §5: this host answers 200 for cases 1/2/3/5, and a plain
    // 302 is the normal document-download redirect (documents.ts).
    expect(classifyHttpStatus(200, {})).toBeNull();
    expect(classifyHttpStatus(302, {})).toBeNull();
  });

  it('returns null for 404 — that classification stays where documents.ts already places it, never relocated here', () => {
    expect(classifyHttpStatus(404, {})).toBeNull();
  });
});

describe('parseRetryAfterMs — delta-seconds only (5g.3, a deliberate disclosed narrowing)', () => {
  it('converts a delta-seconds value to milliseconds', () => {
    expect(parseRetryAfterMs('5')).toBe(5000);
  });

  it('converts a zero delta-seconds value to zero milliseconds', () => {
    expect(parseRetryAfterMs('0')).toBe(0);
  });

  it('returns null for an HTTP-date value — no observed response has ever carried one', () => {
    expect(parseRetryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
  });

  it('returns null for a negative value', () => {
    expect(parseRetryAfterMs('-1')).toBeNull();
  });

  it('returns null for a non-numeric value', () => {
    expect(parseRetryAfterMs('soon')).toBeNull();
  });

  it('returns null when the header is absent', () => {
    expect(parseRetryAfterMs(undefined)).toBeNull();
  });
});
