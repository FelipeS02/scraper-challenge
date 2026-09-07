import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureResponse, StubTransport } from './adapters/trf5/__fixtures__/stub-transport.js';
import type { TrfPayload } from './adapters/trf5/schemas/payload.js';
import type { ScrapeArgs } from './cli/args.js';
import type { Clock, CoverageRecord, OutputRecord } from './engine/ports.js';
import { deriveMaxSplitDepth, runScraper } from './main.js';

/**
 * Task 9.3: drives the whole composition through a stubbed transport, proving
 * the WIRING — that a run reaches every sink and writes the expected envelope
 * — rather than re-testing behavior `scraper.test.ts`/`site.test.ts` already
 * cover. Never touches the network (per S5e's scope: only the `--dry-run`
 * half of task 9.6 is exercised; a real live run is manual-only).
 */

const FAKE_CLOCK: Clock = {
  now: () => new Date('2026-01-01T00:00:00.000Z'),
  sleep: () => Promise.resolve(),
};

function scrapeArgs(overrides: Partial<ScrapeArgs> = {}): ScrapeArgs {
  return {
    command: 'scrape',
    dateFrom: '2026-01-01',
    dateTo: '2026-01-01',
    maxDays: 31,
    maxFacetValues: 20,
    maxNameProbes: 30,
    maxItems: null,
    maxDocuments: 10,
    documentsPerItem: null,
    maxRequests: null,
    requestSpacingMs: 0, // wiring test on real timers: politeness spacing would only add wall time
    logLevel: 'error',
    logFormat: 'console',
    dryRun: false,
    frontier: false,
    ...overrides,
  };
}

let outputDir: string;
let pdfsDir: string;

afterEach(() => {
  if (outputDir) rmSync(outputDir, { recursive: true, force: true });
  if (pdfsDir) rmSync(pdfsDir, { recursive: true, force: true });
});

describe('deriveMaxSplitDepth — design.md D4 constraint (maxSplitDepth >= ceil(log2(range_days)) + 2)', () => {
  it('covers a single day: 0 bisection hops + 1 class + 1 name level', () => {
    expect(deriveMaxSplitDepth('2026-09-03', '2026-09-03')).toBe(2);
  });

  it('covers a 10-day window: ceil(log2(10)) = 4 bisection hops + 2', () => {
    expect(deriveMaxSplitDepth('2026-09-01', '2026-09-10')).toBe(6);
  });

  it('covers a one-year window: ceil(log2(365)) = 9 bisection hops + 2 (design.md D4 worked example: 11)', () => {
    expect(deriveMaxSplitDepth('2026-01-01', '2026-12-31')).toBe(11);
  });
});

describe('runScraper — the composition root wiring (S5e)', () => {
  it('a run driven with a stubbed transport reaches the sinks and writes the expected envelope', async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'pje-main-test-'));
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'), // TRF5Traversal's own explicit prime
      fixtureResponse(200, 'text/html', 'priming-page-1.html'), // TRF5Site.discover()'s lazy internal prime
      fixtureResponse(200, 'text/xml', 'search-ok.xml'), // 3 rows
      fixtureResponse(200, 'text/html', 'detail-page-valid-no-documents.html'), // row 1 detail
      fixtureResponse(200, 'text/html', 'detail-page-valid-no-documents.html'), // row 2 detail
      fixtureResponse(200, 'text/html', 'detail-page-valid-no-documents.html'), // row 3 detail
    ]);

    pdfsDir = mkdtempSync(join(tmpdir(), 'pje-main-test-pdfs-'));
    await runScraper(scrapeArgs(), {
      transport,
      clock: FAKE_CLOCK,
      outputDir,
      logsDir: join(outputDir, 'logs'),
      pdfsDir,
      runId: 'test-run-1',
    });

    const itemLines = readFileSync(join(outputDir, 'items.jsonl'), 'utf-8').trim().split('\n');
    // All three rows resolve to the same fixture's processNumber — Scraper's
    // own dedup-by-identity-key collapses them to one write, proving dedup
    // is wired too, not only discovery.
    expect(itemLines).toHaveLength(1);
    const record = JSON.parse(itemLines[0]!) as OutputRecord<TrfPayload>;
    expect(record).toMatchObject({
      schemaVersion: 1,
      itemId: '0798765-43.2024.4.05.8300',
      scrapedAt: '2026-01-01T00:00:00.000Z',
      runId: 'test-run-1',
    });
    expect(record.payload.processNumber).toBe('0798765-43.2024.4.05.8300');

    const coverageLines = readFileSync(join(outputDir, 'coverage.jsonl'), 'utf-8')
      .trim()
      .split('\n');
    const coverage = JSON.parse(coverageLines[0]!) as CoverageRecord;
    expect(coverage.state).toBe('complete');
    expect(coverage.resultCount).toBe(3);
  });

  it('retry-failed drives the same composition without discovery bounds', async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'pje-main-retry-test-'));
    pdfsDir = mkdtempSync(join(tmpdir(), 'pje-main-retry-test-pdfs-'));
    const transport = new StubTransport([fixtureResponse(200, 'text/html', 'priming-page-1.html')]);

    await runScraper(
      { command: 'retry-failed' },
      {
        transport,
        clock: FAKE_CLOCK,
        outputDir,
        logsDir: join(outputDir, 'logs'),
        pdfsDir,
        runId: randomUUID(),
      },
    );

    // No failure ledger exists yet in a fresh output dir — retryFailedDocuments()
    // loads an empty ledger and returns without writing any item, proving the
    // retry-failed command path is wired end to end without erroring.
    expect(() => readFileSync(join(outputDir, 'items.jsonl'), 'utf-8')).toThrow();
  });

  it('persists a fetched document under pdfsDir, separate from outputDir (the real `pdfs/` layout .gitignore/README have documented since S1)', async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'pje-main-test-doc-out-'));
    pdfsDir = mkdtempSync(join(tmpdir(), 'pje-main-test-doc-pdfs-'));
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'), // TRF5Traversal's own explicit prime
      fixtureResponse(200, 'text/html', 'priming-page-1.html'), // TRF5Site.discover()'s lazy internal prime
      fixtureResponse(200, 'text/xml', 'search-ok.xml'), // 3 rows, deduped to 1 item
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'), // row 1 detail — 8 real documents
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'), // row 2 detail (same item, skipped)
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'), // row 3 detail (same item, skipped)
      // `detail-page-valid.html`'s first document (DOM order) is a
      // born-digital row (S5j, design.md D14) -- the two-step viewer-then-
      // PDF flow, not the legacy 302-follow.
      fixtureResponse(200, 'text/html', 'document-viewer-born-digital.html'), // viewer GET
      fixtureResponse(200, 'application/pdf', 'document-sample.pdf'), // Gerar PDF POST, no redirect
    ]);

    await runScraper(scrapeArgs({ documentsPerItem: 1 }), {
      transport,
      clock: FAKE_CLOCK,
      outputDir,
      logsDir: join(outputDir, 'logs'),
      pdfsDir,
      runId: 'test-run-doc',
    });

    // The born-digital row's own anchor text is a screen-reader-only
    // "Visualizar documentos" prefix glued onto the real descriptive label
    // ("24/02/2026 14:57:27 - Despacho (Despacho)"); task 5i.14 strips that
    // prefix structurally, and task 5i.6's per-character slug sanitization
    // keeps the rest descriptive instead of collapsing the whole label to a
    // bare id for containing "/"/":" (documents.test.ts proves the mechanism
    // directly; this is the end-to-end proof through the real composition).
    const expectedPath = join(
      pdfsDir,
      '0123456-78.2026.4.05.8100',
      // The label's own trailing "(Despacho)" is dropped from the slug — the
      // type lives in `documentType` now, and repeating it here only produced
      // "...-despacho-despacho.pdf".
      '6884889-24-02-2026-14-57-27-despacho.pdf',
    );
    expect(readFileSync(expectedPath)).toHaveLength(135);
    // Never written under outputDir — the two roots stay separate.
    expect(() => readFileSync(join(outputDir, '0123456-78.2026.4.05.8100'))).toThrow();
  });
});

describe('runScraper — frontier seed harvesting and crawl (S6, core-frontier-crawl)', () => {
  it('a plain scrape (no --frontier) persists harvested seeds to output/state/seeds.jsonl', async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'pje-main-frontier-harvest-'));
    pdfsDir = mkdtempSync(join(tmpdir(), 'pje-main-frontier-harvest-pdfs-'));
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      fixtureResponse(200, 'text/xml', 'search-ok.xml'), // 3 rows, same processNumber
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'), // real parties/CPFs
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'),
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'),
    ]);

    await runScraper(scrapeArgs({ maxDocuments: 0 }), {
      transport,
      clock: FAKE_CLOCK,
      outputDir,
      logsDir: join(outputDir, 'logs'),
      pdfsDir,
      runId: 'test-run-harvest',
    });

    const seedLines = readFileSync(join(outputDir, 'state', 'seeds.jsonl'), 'utf-8')
      .trim()
      .split('\n');
    expect(seedLines.length).toBeGreaterThan(0);
    const seeds = seedLines.map((line) => JSON.parse(line) as { seed: { kind: string } });
    expect(seeds.some((s) => s.seed.kind === 'partyCpf' || s.seed.kind === 'lawyerCpf')).toBe(true);
  });

  it('scrape --frontier reads seeds a prior process persisted and searches them, writing any new item found', async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'pje-main-frontier-crawl-'));
    pdfsDir = mkdtempSync(join(tmpdir(), 'pje-main-frontier-crawl-pdfs-'));
    // Simulates a prior process's own output — this test never runs a sweep first.
    mkdirSync(join(outputDir, 'state'), { recursive: true });
    writeFileSync(
      join(outputDir, 'state', 'seeds.jsonl'),
      `${JSON.stringify({
        seed: { kind: 'partyCpf', value: '000.000.000-00' },
        cellState: 'truncated',
      })}\n`,
    );

    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'), // TRF5Traversal's own explicit prime
      fixtureResponse(200, 'text/html', 'priming-page-1.html'), // TRF5Site.discover()'s lazy internal prime
      fixtureResponse(200, 'text/xml', 'search-ok.xml'), // 3 rows, same processNumber -> dedups to 1
      fixtureResponse(200, 'text/html', 'detail-page-valid-no-documents.html'),
      fixtureResponse(200, 'text/html', 'detail-page-valid-no-documents.html'),
      fixtureResponse(200, 'text/html', 'detail-page-valid-no-documents.html'),
    ]);

    await runScraper(scrapeArgs({ frontier: true }), {
      transport,
      clock: FAKE_CLOCK,
      outputDir,
      logsDir: join(outputDir, 'logs'),
      pdfsDir,
      runId: 'test-run-frontier',
    });

    const itemLines = readFileSync(join(outputDir, 'items.jsonl'), 'utf-8').trim().split('\n');
    expect(itemLines).toHaveLength(1);
    // Exactly the seed's own search + its 3 detail fetches (plus the two
    // priming GETs) were issued — never a second seed search.
    expect(transport.requests).toHaveLength(6);
    // The distinguishing proof this actually ran the FRONTIER path, not a
    // plain sweep that happened to produce the same shape: the search POST
    // carries the persisted seed's own CPF as documentoParte.
    const searchRequest = transport.requests[2];
    expect(searchRequest?.body).toContain(encodeURIComponent('000.000.000-00'));
  });
});

describe('runScraper - frontier failure-ledger wiring', () => {
  it('persists a failed seed search through the composed frontier failure ledger', async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'pje-main-frontier-ledger-'));
    pdfsDir = mkdtempSync(join(tmpdir(), 'pje-main-frontier-ledger-pdfs-'));
    mkdirSync(join(outputDir, 'state'), { recursive: true });
    writeFileSync(
      join(outputDir, 'state', 'seeds.jsonl'),
      `${JSON.stringify({
        seed: { kind: 'partyCpf', value: '000.000.000-00' },
        cellState: 'complete',
      })}\n`,
    );
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      fixtureResponse(200, 'text/html', 'host-defect.html'),
    ]);

    await runScraper(scrapeArgs({ frontier: true }), {
      transport,
      clock: FAKE_CLOCK,
      outputDir,
      logsDir: join(outputDir, 'logs'),
      pdfsDir,
      runId: 'test-run-frontier-ledger',
    });

    const entries = readFileSync(join(outputDir, 'state', 'failures.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map(
        (line) => JSON.parse(line) as { itemId: string; documentId: string | null; reason: string },
      );
    expect(entries).toEqual([
      expect.objectContaining({
        itemId: 'frontier|partyCpf|000.000.000-00|2026-01-01..2026-01-01',
        documentId: null,
        reason: 'errorUnexpected.seam with PersistenceException',
      }),
    ]);
  });
});
