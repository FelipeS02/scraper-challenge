import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  CheckpointRecord,
  CheckpointStore,
  Clock,
  CoverageRecord,
  CoverageSink,
  DocumentSink,
  FailureLedger,
  ItemSink,
  LedgerEntry,
  LogEvent,
  Logger,
  OutputRecord,
  RunBounds,
} from '../ports.js';
import { unboundedBudget } from '../budget.js';
import { Pool } from '../pool.js';
import { RateLimiter } from '../rate-limiter.js';
import type { RetryPolicyConfig } from '../retry-policy.js';
import { Scraper } from '../scraper.js';
import { FakeNonDateSite, type FakeRegionItem } from './fake-non-date-site.js';
import { FakeNonDateTraversal } from './fake-non-date-traversal.js';

/** No-op `Logger` — never `infra/logging/`, which `engine/**` must not import. */
class NoopLogger implements Logger {
  log(_event: LogEvent): void {
    // intentionally does nothing
  }
}

/**
 * A second portability proof (in addition to `portability.test.ts`'s
 * `FakeSite`/`FakeTraversal`), deliberately partitioning along a NON-date
 * dimension and declaring no result-page cap in the second scenario — proving
 * the engine's saturation/split path (core-scraping-engine, "Saturation-Driven
 * Subdivision") makes no date-shaped or numeric-cap-shaped assumption.
 */

class MemoryItemSink implements ItemSink<FakeRegionItem> {
  readonly records: OutputRecord<FakeRegionItem>[] = [];
  write(record: OutputRecord<FakeRegionItem>): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

class MemoryDocumentSink implements DocumentSink {
  write(_path: string, bytes: Uint8Array): Promise<number> {
    return Promise.resolve(bytes.byteLength);
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
    const latest = new Map<string, CheckpointRecord>();
    for (const record of this.records) latest.set(record.unitKey, record);
    return Promise.resolve(latest);
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

class FakeClock implements Clock {
  now(): Date {
    return new Date('2026-01-01T00:00:00.000Z');
  }
  sleep(): Promise<void> {
    return Promise.resolve();
  }
}

const retryPolicy: RetryPolicyConfig = {
  backoff: () => 0,
  transientCap: 5,
  hostDefectCap: 2,
  sessionExpiredCap: 1,
};

describe('engine portability against a non-date-partitioning fake adapter', () => {
  it('runs the full saturation/split path: seed, discover, saturate, split, children enqueued, parent subdivided', async () => {
    const site = new FakeNonDateSite(3); // small cap — a 10-wide region range saturates
    const traversal = new FakeNonDateTraversal();
    const coverageSink = new MemoryCoverageSink();
    const itemSink = new MemoryItemSink();
    const checkpointStore = new MemoryCheckpointStore();

    const scraper = new Scraper({
      site,
      traversal,
      pool: new Pool(1),
      rateLimiter: new RateLimiter(0), // politeness spacing off: this suite drives a stub transport on real timers
      retryPolicy,
      clock: new FakeClock(),
      itemSink,
      documentSink: new MemoryDocumentSink(),
      coverageSink,
      checkpointStore,
      failureLedger: new MemoryFailureLedger(),
      logger: new NoopLogger(),
      budget: unboundedBudget(),
      maxSplitDepth: 5,
      runId: 'run-1',
      schemaVersion: 1,
    });

    // Regions 1..10 — a 10-wide range against a cap of 3 saturates on the
    // very first seeded unit, forcing split() before anything else runs.
    const bounds: RunBounds = { dateFrom: '1', dateTo: '10', maxFacetValues: 1 };
    await scraper.run(bounds);

    const rootRecord = coverageSink.records.find((r) => r.unitKey === '1..10');
    expect(rootRecord).toMatchObject({ state: 'subdivided', resultCount: 3 });

    // Every cell in the resulting bisection tree is either an internal node
    // (`subdivided`, still saturated after its own split) or a leaf
    // (`complete`, narrow enough to finally fit under the cap) — never
    // `truncated` or `failed`, and every leaf's children were actually
    // enqueued and processed, not merely requested.
    const states = coverageSink.records.map((r) => r.state);
    expect(states.every((state) => state === 'subdivided' || state === 'complete')).toBe(true);
    expect(states.filter((state) => state === 'complete').length).toBeGreaterThan(0);

    // Every discovered item across all leaves adds up to the full region
    // width — nothing was silently dropped by subdivision.
    expect(itemSink.records).toHaveLength(10);
  });

  it('never saturates or calls split() when the site declares no result-page cap (null)', async () => {
    const site = new FakeNonDateSite(null);
    const traversal = new FakeNonDateTraversal();
    let splitCalls = 0;
    const originalSplit = traversal.split.bind(traversal);
    traversal.split = (...args) => {
      splitCalls += 1;
      return originalSplit(...args);
    };
    const coverageSink = new MemoryCoverageSink();

    const scraper = new Scraper({
      site,
      traversal,
      pool: new Pool(1),
      rateLimiter: new RateLimiter(0), // politeness spacing off: this suite drives a stub transport on real timers
      retryPolicy,
      clock: new FakeClock(),
      itemSink: new MemoryItemSink(),
      documentSink: new MemoryDocumentSink(),
      coverageSink,
      checkpointStore: new MemoryCheckpointStore(),
      failureLedger: new MemoryFailureLedger(),
      logger: new NoopLogger(),
      budget: unboundedBudget(),
      maxSplitDepth: 5,
      runId: 'run-1',
      schemaVersion: 1,
    });

    const bounds: RunBounds = { dateFrom: '1', dateTo: '10', maxFacetValues: 1 };
    await scraper.run(bounds);

    expect(splitCalls).toBe(0);
    const rootRecord = coverageSink.records.find((r) => r.unitKey === '1..10');
    expect(rootRecord).toMatchObject({ state: 'complete', saturated: false, declaredCap: null });
  });
});

describe('module-graph seam check (non-date fake)', () => {
  it('never imports adapters/trf5, axios, or cheerio from the non-date fixture files', () => {
    const engineDir = fileURLToPath(new URL('../', import.meta.url));
    const files = ['fake-non-date-site.ts', 'fake-non-date-traversal.ts'].map((name) =>
      join(engineDir, '__fixtures__', name),
    );

    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf-8');
      expect(source).not.toMatch(/adapters\/trf5/);
      expect(source).not.toMatch(/from ['"]axios['"]/);
      expect(source).not.toMatch(/from ['"]cheerio['"]/);
    }

    // Sanity: the files actually exist and were read, not silently skipped.
    expect(readdirSync(join(engineDir, '__fixtures__'))).toEqual(
      expect.arrayContaining(['fake-non-date-site.ts', 'fake-non-date-traversal.ts']),
    );
  });
});
