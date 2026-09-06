import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unboundedBudget } from '../../engine/budget.js';
import type {
  CheckpointRecord,
  CheckpointStore,
  Clock,
  CoverageRecord,
  CoverageSink,
  DocumentSink,
  FailureLedger,
  HttpRequest,
  HttpResponse,
  HttpTransport,
  ItemSink,
  LedgerEntry,
  OutputRecord,
  RunBounds,
  TraversalPort,
} from '../../engine/ports.js';
import { Pool } from '../../engine/pool.js';
import { RateLimiter } from '../../engine/rate-limiter.js';
import type { RetryPolicyConfig } from '../../engine/retry-policy.js';
import { Scraper } from '../../engine/scraper.js';
import type { WorkUnit } from '../../engine/types.js';
import { RecordingLogger } from '../../engine/__fixtures__/recording-logger.js';
import { fixtureResponse } from './__fixtures__/stub-transport.js';
import type { DocumentRow } from './parsing/detail-page.js';
import type { TrfPayload } from './schemas/payload.js';
import { TRF5Site } from './site.js';
import type { TraversalCursor } from './traversal.js';

/**
 * S5g task 5g.6 — the test the full-change verify report found missing:
 * `rate-limiter.test.ts` already proves `RateLimiter` in isolation, and
 * passed throughout, which is exactly why it never caught that nothing in
 * production ever called `tripCooldown`. This drives `engine/scraper.ts` end
 * to end over a stubbed transport with the REAL `TRF5Site` (production
 * `site.ts` -> `search.ts` -> `classifyHttpStatus`), so the 429 outcome is
 * constructed by production code, never scripted directly onto a fake site
 * the way `scraper.test.ts`'s own "429 wait-duration composition" test does.
 */

const PRIMING_URL = 'stub://pjeconsulta/ConsultaPublica/listView.seam';

function unit(dateFrom: string): WorkUnit<TraversalCursor> {
  return {
    unitKey: `${dateFrom}..${dateFrom}`,
    windowKey: `${dateFrom}..${dateFrom}`,
    facetValue: null,
    label: dateFrom,
    cursor: { dateFrom, dateTo: dateFrom },
  };
}

/** The same real captured structural shell as `site.test.ts`'s local `searchFragment`, zero rows. */
function emptySearchResponse(): HttpResponse {
  const xml =
    '<?xml version="1.0" encoding="ISO-8859-1"?>\n' +
    '<html><body><div id="fPP:processosGridPanel"><table class="rich-table">' +
    '<tbody id="fPP:processosTable:tb"></tbody></table></div></body></html>';
  return {
    status: 200,
    headers: { 'content-type': 'text/xml' },
    body: new TextEncoder().encode(xml),
  };
}

/**
 * Responds by request CONTENT, never by call order — the two concurrent
 * workers' requests interleave in an order this test does not control or
 * need to predict. The unit seeded from `2026-01-01` gets a 429 on its first
 * search POST and a normal empty result on every later one; every other
 * unit always gets a normal empty result.
 */
class KeyedTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  private unitACalls = 0;

  send(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    if (req.method === 'GET' && req.url === PRIMING_URL) {
      return Promise.resolve(fixtureResponse(200, 'text/html', 'priming-page-1.html'));
    }
    const body = typeof req.body === 'string' ? req.body : '';
    if (body.includes(encodeURIComponent('01/01/2026'))) {
      this.unitACalls += 1;
      if (this.unitACalls === 1) {
        return Promise.resolve({
          status: 429,
          headers: { 'retry-after': '3' },
          body: new Uint8Array(),
        });
      }
    }
    return Promise.resolve(emptySearchResponse());
  }
}

class StubTraversal implements TraversalPort<TraversalCursor> {
  readonly facetName = 'classeJudicial';
  constructor(private readonly units: readonly WorkUnit<TraversalCursor>[]) {}
  seed(): Promise<readonly WorkUnit<TraversalCursor>[]> {
    return Promise.resolve(this.units);
  }
  split(): Promise<readonly WorkUnit<TraversalCursor>[] | null> {
    return Promise.resolve(null);
  }
}

class MemoryItemSink implements ItemSink<TrfPayload> {
  readonly records: OutputRecord<TrfPayload>[] = [];
  write(record: OutputRecord<TrfPayload>): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

class MemoryDocumentSink implements DocumentSink {
  write(): Promise<number> {
    return Promise.resolve(0);
  }
}

class MemoryCoverageSink implements CoverageSink {
  readonly records: CoverageRecord[] = [];
  write(record: CoverageRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

class MemoryCheckpointStore implements CheckpointStore {
  readonly records: CheckpointRecord[] = [];
  load(): Promise<ReadonlyMap<string, CheckpointRecord>> {
    return Promise.resolve(new Map(this.records.map((r) => [r.unitKey, r])));
  }
  put(record: CheckpointRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

class MemoryFailureLedger implements FailureLedger {
  readonly entries: LedgerEntry[] = [];
  load(): Promise<readonly LedgerEntry[]> {
    return Promise.resolve(this.entries);
  }
  record(entry: LedgerEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
  resolve(): Promise<void> {
    return Promise.resolve();
  }
}

const FAKE_CLOCK: Clock = {
  now: () => new Date('2026-01-01T00:00:00.000Z'),
  sleep: () => Promise.resolve(),
};

const retryPolicy: RetryPolicyConfig = {
  backoff: () => 1000,
  transientCap: 5,
  hostDefectCap: 2,
  sessionExpiredCap: 1,
};

describe('Scraper + TRF5Site — a real 429 response trips the global cooldown (core-resilience-policy, "Global 429 Cooldown")', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pauses every worker for the cooldown duration and returns the failed unit to the queue, never the failure ledger', async () => {
    const transport = new KeyedTransport();
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });
    // Pre-primed once, synchronously before the run starts, so both workers'
    // concurrent `ensureSession()` calls see an already-primed session rather
    // than racing to prime it twice — a pre-existing, disclosed race in
    // `TRF5Site.ensureSession()` that is not this task's concern.
    await site.reprimeSession();

    const units = [unit('2026-01-01'), unit('2026-02-01'), unit('2026-03-01')];
    const logger = new RecordingLogger();
    const failureLedger = new MemoryFailureLedger();
    const checkpointStore = new MemoryCheckpointStore();

    const scraper = new Scraper<TrfPayload, DocumentRow, TraversalCursor>({
      site,
      traversal: new StubTraversal(units),
      pool: new Pool(2),
      rateLimiter: new RateLimiter(0), // politeness spacing off: this suite drives a stub transport on real timers
      retryPolicy,
      clock: FAKE_CLOCK,
      itemSink: new MemoryItemSink(),
      documentSink: new MemoryDocumentSink(),
      coverageSink: new MemoryCoverageSink(),
      checkpointStore,
      failureLedger,
      logger,
      budget: unboundedBudget(),
      runId: 'run-s5g-cooldown',
      schemaVersion: 1,
      maxSplitDepth: 1,
    });

    const bounds: RunBounds = { dateFrom: '2026-01-01', dateTo: '2026-03-01', maxFacetValues: 1 };
    const runPromise = scraper.run(bounds);

    // Flush every microtask that does not depend on a real timer: both
    // workers' first search POST resolves (one 429, the others empty-ok),
    // and the 429 branch's own `rateLimiter.tripCooldown(3000)` call runs —
    // all of that is plain Promise chaining, never a `setTimeout`.
    await vi.advanceTimersByTimeAsync(0);

    const cooldownEvent = logger.events.find((e) => e.event === 'cooldown.triggered');
    expect(cooldownEvent).toMatchObject({
      level: 'warn',
      fields: { attempt: 1, cooldownMs: 3000 },
    });
    // The failed unit is not in the failure ledger — it is still in flight.
    expect(failureLedger.entries).toHaveLength(0);

    // Still cooling down 1ms before Retry-After elapses: no worker has been
    // able to issue a further request since the cooldown tripped, so the run
    // has not finished.
    await vi.advanceTimersByTimeAsync(2999);
    expect(checkpointStore.records.some((r) => r.unitKey === '2026-01-01..2026-01-01')).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await runPromise;

    // Every unit — including the requeued one — eventually completes, and
    // none of them lands in the failure ledger: the 429 is a global pause,
    // never a permanent failure (core-resilience-policy, "Global 429
    // Cooldown", "the failed unit returns to the work queue rather than
    // being marked permanently failed").
    expect(checkpointStore.records.map((r) => r.unitKey).sort()).toEqual([
      '2026-01-01..2026-01-01',
      '2026-02-01..2026-02-01',
      '2026-03-01..2026-03-01',
    ]);
    expect(failureLedger.entries).toHaveLength(0);
    // Exactly one 429 was ever produced — the retry after cooldown succeeds.
    expect(transport.requests.filter((r) => r.method === 'POST')).toHaveLength(4);
  });
});
