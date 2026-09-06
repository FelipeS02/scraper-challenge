import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NameHarvester } from './adapters/trf5/name-probes.js';
import { primeSession } from './adapters/trf5/session.js';
import { TRF5Seeds } from './adapters/trf5/seeds.js';
import { resultPageCap, TRF5Site } from './adapters/trf5/site.js';
import { TRF5Traversal } from './adapters/trf5/traversal.js';
import { parseArgs, type ParsedArgs } from './cli/args.js';
import { forecastRun, printDryRunForecast } from './cli/dry-run.js';
import { printFrontierRunSummary, printRunSummary } from './cli/summary.js';
import { exponential, withCap, withJitter } from './engine/backoff.js';
import { Budget, clampDateRange, unboundedBudget } from './engine/budget.js';
import { runFrontierCrawl } from './engine/frontier.js';
import { Pool } from './engine/pool.js';
import type { Clock, CoverageRecord, HttpTransport, Logger, RunBounds } from './engine/ports.js';
import { DEFAULT_REQUEST_SPACING_MS, RateLimiter } from './engine/rate-limiter.js';
import type { RetryPolicyConfig } from './engine/retry-policy.js';
import { Scraper } from './engine/scraper.js';
import { SystemClock } from './infra/clock.js';
import { AxiosTransport } from './infra/http/axios-transport.js';
import { ConsoleLogger } from './infra/logging/console-logger.js';
import { JsonlLogger } from './infra/logging/jsonl-logger.js';
import { withRedaction } from './infra/logging/redacting-logger.js';
import { FsDocumentSink } from './infra/storage/fs-document-sink.js';
import { readJsonlFile } from './infra/storage/jsonl.js';
import { JsonlAdapterStateStore } from './infra/storage/jsonl-adapter-state-store.js';
import { JsonlCheckpointStore } from './infra/storage/jsonl-checkpoint-store.js';
import { JsonlCoverageSink } from './infra/storage/jsonl-coverage-sink.js';
import { JsonlFailureLedger } from './infra/storage/jsonl-failure-ledger.js';
import { JsonlItemSink } from './infra/storage/jsonl-item-sink.js';

/**
 * The composition root (S5e task 9.2): the one file allowed to know every
 * side of the seam exists (design.md). `new` throughout — no DI container,
 * no adapter registry, no config-file indirection (design.md, "Declined
 * Abstractions").
 */
const PRIMING_URL = 'https://pjett.trf5.jus.br/pjeconsulta/ConsultaPublica/listView.seam';
const SCHEMA_VERSION = 1;
const POOL_CONCURRENCY = 2;
const POLITENESS_SPACING_MS = 500;

// design.md "Retry mapping" defaults: base 1s, factor 2, jitter 0.3, cap 60s.
const RETRY_POLICY: RetryPolicyConfig = {
  backoff: withCap(60_000)(withJitter(0.3)(exponential(1000, 2))),
  transientCap: 5,
  hostDefectCap: 2,
  sessionExpiredCap: 1,
};

// A misbehaving split() cannot loop forever, but a wide date range legitimately
// bisects several times before the facet branch ever runs — generous rather
// than tuned to any one --max-days value (core-scraping-engine, "Saturation-
// Driven Subdivision"). Used as a floor by deriveMaxSplitDepth below so an
// unusually short run window never REDUCES today's headroom.
const DEFAULT_MAX_SPLIT_DEPTH = 20;

/**
 * design.md D4: `maxSplitDepth >= ceil(log2(range_days)) + 2` — +1 for class
 * expansion, +1 for the name-substring level trf5-name-substring-axis adds.
 * Derived from the actually configured run window rather than a bare
 * hardcoded number, so a wide `--max-days` (or `--to` minus `--from`) can
 * never silently truncate the name level as a false `truncated` gap. The
 * caller (`runScraper` below) floors this at `DEFAULT_MAX_SPLIT_DEPTH` so a
 * short window never gets LESS headroom than every run had before this
 * change.
 */
export function deriveMaxSplitDepth(dateFrom: string, dateTo: string): number {
  const rangeDays =
    Math.round(
      (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  const bisectionHops = rangeDays <= 1 ? 0 : Math.ceil(Math.log2(rangeDays));
  return bisectionHops + 2;
}

export interface RunDeps {
  readonly transport: HttpTransport;
  readonly clock: Clock;
  readonly outputDir: string;
  readonly logsDir: string;
  /**
   * Root a fetched document is persisted under — its own top-level directory,
   * never nested inside `outputDir` (`.gitignore`/README have documented a
   * separate `pdfs/` since S1; `FsDocumentSink` was wired against
   * `outputDir/documents` instead until this slice, a drift no test caught
   * because no test exercised a real document fetch end to end through
   * `main.ts`).
   */
  readonly pdfsDir: string;
  readonly runId: string;
}

function resolveLogger(args: ParsedArgs, deps: RunDeps): Logger {
  const level = args.command === 'scrape' ? args.logLevel : 'info';
  const inner =
    args.command === 'scrape' && args.logFormat === 'jsonl'
      ? new JsonlLogger(deps.runId, deps.logsDir, level)
      : new ConsoleLogger(level);
  return withRedaction(inner);
}

/**
 * Composes every real adapter/infra implementation into one `Scraper` and
 * drives it. `main()` below calls this with real dependencies; `main.test.ts`
 * (task 9.3) calls it directly with a stubbed transport and a fake clock,
 * proving the wiring without touching the network.
 *
 * `retry-failed` still primes a session for `TRF5Traversal`'s constructor
 * even though `retryFailedDocuments()` never calls `traversal.split()` —
 * `ScraperConfig` requires `traversal` unconditionally, and splitting that
 * requirement into a second config shape is a bigger change than this task
 * asks for. Disclosed as a known minor inefficiency, not silently absorbed.
 */
export async function runScraper(args: ParsedArgs, deps: RunDeps): Promise<void> {
  const logger = resolveLogger(args, deps);
  const session = await primeSession(deps.transport, PRIMING_URL);
  // Shared, run-wide instance (trf5-name-substring-axis task 1.3): TRF5Site
  // WRITES to it during discover() (row party names), TRF5Traversal READS
  // from it during split() (name-probe ranking) — the one new coupling
  // design.md D2 introduces.
  const nameHarvester = new NameHarvester();
  const site = new TRF5Site({
    transport: deps.transport,
    primingUrl: PRIMING_URL,
    harvester: nameHarvester,
  });
  const maxNameProbes = args.command === 'scrape' ? args.maxNameProbes : 0;
  const traversal = new TRF5Traversal({
    transport: deps.transport,
    session,
    maxNameProbes,
    harvester: nameHarvester,
  });
  // Harvesting is unconditional across every `scrape`, on or off `--frontier`
  // (core-frontier-crawl, "Plain scrape does not run frontier crawl": seeds
  // are persisted regardless; only *searching* them is deferred). This same
  // store is what `scrape --frontier` reads from in a later, separate process.
  const seedStateStore = new JsonlAdapterStateStore(join(deps.outputDir, 'state'));
  const frontierCapable = new TRF5Seeds();

  const budget =
    args.command === 'scrape'
      ? new Budget({
          maxItems: args.maxItems,
          maxDocuments: args.maxDocuments,
          documentsPerItem: args.documentsPerItem,
          maxRequests: args.maxRequests,
        })
      : unboundedBudget();

  // Computed once, shared by the frontier branch and the phase-1 sweep below
  // (design.md D4): `deriveMaxSplitDepth` needs the same clamped window
  // `scraper.run()`/`runFrontierCrawl` will actually search.
  const bounds: RunBounds | null =
    args.command === 'scrape'
      ? {
          ...clampDateRange(args.dateFrom, args.dateTo, args.maxDays),
          maxFacetValues: args.maxFacetValues,
        }
      : null;

  // core-frontier-crawl, "Deferred Phase-2 Invocation": a `--frontier` run
  // replaces the phase-1 sweep entirely for this invocation — it never runs
  // both in the same process.
  if (args.command === 'scrape' && args.frontier && bounds) {
    const result = await runFrontierCrawl({
      site,
      frontierCapable,
      traversal,
      stateStore: seedStateStore,
      itemSink: new JsonlItemSink(join(deps.outputDir, 'items.jsonl')),
      rateLimiter: new RateLimiter(args.requestSpacingMs),
      budget,
      clock: deps.clock,
      logger,
      bounds,
      runId: deps.runId,
      schemaVersion: SCHEMA_VERSION,
    });
    printFrontierRunSummary(result);
    return;
  }

  // design.md D4: floored at DEFAULT_MAX_SPLIT_DEPTH so a short window never
  // gets less headroom than every run had before this change; `retry-failed`
  // never calls split() at all, so it just gets the floor.
  const maxSplitDepth =
    bounds !== null
      ? Math.max(DEFAULT_MAX_SPLIT_DEPTH, deriveMaxSplitDepth(bounds.dateFrom, bounds.dateTo))
      : DEFAULT_MAX_SPLIT_DEPTH;

  const scraper = new Scraper({
    site,
    traversal,
    pool: new Pool(POOL_CONCURRENCY),
    rateLimiter: new RateLimiter(
      args.command === 'scrape' ? args.requestSpacingMs : DEFAULT_REQUEST_SPACING_MS,
    ),
    retryPolicy: RETRY_POLICY,
    clock: deps.clock,
    itemSink: new JsonlItemSink(join(deps.outputDir, 'items.jsonl')),
    documentSink: new FsDocumentSink(deps.pdfsDir),
    coverageSink: new JsonlCoverageSink(join(deps.outputDir, 'coverage.jsonl')),
    checkpointStore: new JsonlCheckpointStore(join(deps.outputDir, 'state', 'checkpoints.jsonl')),
    failureLedger: new JsonlFailureLedger(join(deps.outputDir, 'state', 'failures.jsonl')),
    logger,
    budget,
    runId: deps.runId,
    schemaVersion: SCHEMA_VERSION,
    maxSplitDepth,
    ...(args.command === 'scrape'
      ? { frontierSeedHarvest: { frontierCapable, stateStore: seedStateStore } }
      : {}),
  });

  if (args.command === 'retry-failed' || bounds === null) {
    await scraper.retryFailedDocuments();
  } else {
    await scraper.run(bounds);
  }

  const { records } = readJsonlFile<CoverageRecord>(join(deps.outputDir, 'coverage.jsonl'), logger);
  printRunSummary(records);
}

/** The real CLI entry point behind `pnpm scrape` / `pnpm retry-failed` (package.json). */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  if (args.command === 'scrape' && args.dryRun) {
    // Zero discovery requests by construction: forecastRun accepts no
    // transport/site at all (core-run-control-and-output, "Dry-Run Forecast").
    printDryRunForecast(
      forecastRun(args.dateFrom, args.dateTo, {
        maxDays: args.maxDays,
        maxItems: args.maxItems,
        maxDocuments: args.maxDocuments,
        maxRequests: args.maxRequests,
        resultPageCap,
        politenessSpacingMs: POLITENESS_SPACING_MS,
      }),
    );
    return;
  }

  await runScraper(args, {
    // The composition root is the one place that knows both the site and the
    // transport, so it supplies the origin the site's relative URLs resolve
    // against — the `fPP` form action and the document 302's `Location`.
    transport: new AxiosTransport({ baseUrl: new URL(PRIMING_URL).origin }),
    clock: new SystemClock(),
    outputDir: 'output',
    logsDir: 'logs',
    pdfsDir: 'pdfs',
    runId: randomUUID(),
  });
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
