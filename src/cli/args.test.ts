import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_DOCUMENTS, DEFAULT_MAX_REQUESTS } from '../engine/budget.js';
import { DEFAULT_REQUEST_SPACING_MS } from '../engine/rate-limiter.js';
import { parseArgs, type ScrapeArgs } from './args.js';

describe('parseArgs — scrape command', () => {
  it('parses the complete documented flag set', () => {
    const args = parseArgs([
      'scrape',
      '--from',
      '2026-01-01',
      '--to',
      '2026-01-31',
      '--max-days',
      '10',
      '--max-facet-values',
      '5',
      '--max-items',
      '200',
      '--max-documents',
      '15',
      '--documents-per-item',
      '3',
      '--max-requests',
      '1000',
      '--request-spacing',
      '1200',
      '--log-level',
      'debug',
      '--log-format',
      'jsonl',
    ]) as ScrapeArgs;

    expect(args).toMatchObject({
      command: 'scrape',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      maxDays: 10,
      maxFacetValues: 5,
      maxItems: 200,
      maxDocuments: 15,
      documentsPerItem: 3,
      maxRequests: 1000,
      requestSpacingMs: 1200,
      logLevel: 'debug',
      logFormat: 'jsonl',
      dryRun: false,
    });
  });

  it('defaults request spacing to the documented politeness interval', () => {
    const args = parseArgs(['scrape', '--from', '2026-01-01', '--to', '2026-01-01']) as ScrapeArgs;

    expect(args.requestSpacingMs).toBe(DEFAULT_REQUEST_SPACING_MS);
  });

  it('accepts zero spacing but rejects a negative interval', () => {
    const zeroed = parseArgs([
      'scrape',
      '--from',
      '2026-01-01',
      '--to',
      '2026-01-01',
      '--request-spacing',
      '0',
    ]) as ScrapeArgs;
    expect(zeroed.requestSpacingMs).toBe(0);

    expect(() =>
      parseArgs([
        'scrape',
        '--from',
        '2026-01-01',
        '--to',
        '2026-01-01',
        '--request-spacing',
        '-1',
      ]),
    ).toThrow(/--request-spacing/);
  });

  it('applies documented defaults when optional flags are omitted', () => {
    const args = parseArgs(['scrape', '--from', '2026-01-01', '--to', '2026-01-01']) as ScrapeArgs;

    expect(args.maxDocuments).toBe(DEFAULT_MAX_DOCUMENTS);
    expect(args.maxRequests).toBe(DEFAULT_MAX_REQUESTS);
    expect(args.logLevel).toBe('info');
    expect(args.logFormat).toBe('console');
    expect(args.maxItems).toBeNull();
    expect(args.documentsPerItem).toBeNull();
    expect(args.dryRun).toBe(false);
  });

  it('requires --from and --to — an unbounded date range is never reachable by omission', () => {
    expect(() => parseArgs(['scrape', '--to', '2026-01-01'])).toThrow(/--from/);
    expect(() => parseArgs(['scrape', '--from', '2026-01-01'])).toThrow(/--to/);
  });

  it('only the literal "unbounded" disables --max-requests — never reachable by omission', () => {
    const unbounded = parseArgs([
      'scrape',
      '--from',
      '2026-01-01',
      '--to',
      '2026-01-01',
      '--max-requests',
      'unbounded',
    ]) as ScrapeArgs;
    expect(unbounded.maxRequests).toBeNull();

    const omitted = parseArgs([
      'scrape',
      '--from',
      '2026-01-01',
      '--to',
      '2026-01-01',
    ]) as ScrapeArgs;
    expect(omitted.maxRequests).toBe(DEFAULT_MAX_REQUESTS);
  });

  it('sets dryRun when --dry-run is present', () => {
    const args = parseArgs([
      'scrape',
      '--from',
      '2026-01-01',
      '--to',
      '2026-01-01',
      '--dry-run',
    ]) as ScrapeArgs;
    expect(args.dryRun).toBe(true);
  });

  it('rejects an unrecognized --log-level', () => {
    expect(() =>
      parseArgs(['scrape', '--from', '2026-01-01', '--to', '2026-01-01', '--log-level', 'loud']),
    ).toThrow(/--log-level/);
  });
});

describe('parseArgs — retry-failed command', () => {
  it('parses with no further flags required', () => {
    expect(parseArgs(['retry-failed'])).toEqual({ command: 'retry-failed' });
  });
});

describe('parseArgs — unknown command', () => {
  it('rejects a command that is neither scrape nor retry-failed', () => {
    expect(() => parseArgs(['crawl'])).toThrow(/unknown command/);
    expect(() => parseArgs([])).toThrow(/unknown command/);
  });
});
