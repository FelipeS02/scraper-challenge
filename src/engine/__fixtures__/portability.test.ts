import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exponential, withCap } from '../backoff.js';
import { Pool } from '../pool.js';
import { decide } from '../retry-policy.js';
import { FakeSite, type FakeItem } from './fake-site.js';
import { FakeTraversal } from './fake-traversal.js';

describe('engine portability against a fake, non-TRF5 adapter', () => {
  it('runs pool + site + traversal end to end against the fake adapter', async () => {
    const site = new FakeSite();
    const traversal = new FakeTraversal();
    const units = await traversal.seed({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-01',
      maxFacetValues: 1,
    });

    const pool = new Pool(2);
    const discovered: FakeItem[] = [];

    await pool.run(units, async (unit) => {
      const outcome = await site.discover(unit);
      if (outcome.kind === 'ok') {
        discovered.push(...outcome.value.items);
      }
    });

    expect(discovered.map((item) => item.id).sort()).toEqual(
      [...units.map((unit) => unit.unitKey)].sort(),
    );
  });

  it('resolves a retry decision for a failing fake outcome without any TRF5 involvement', () => {
    const backoff = withCap(60000)(exponential(1000, 2));
    const decision = decide({ kind: 'transient', status: 503, retryAfterMs: null }, 1, {
      backoff,
      transientCap: 5,
      hostDefectCap: 2,
      sessionExpiredCap: 1,
    });

    expect(decision).toEqual({ action: 'retryAfter', delayMs: 1000 });
  });
});

describe('module-graph seam check', () => {
  it('never imports adapters/trf5, axios, or cheerio from any file under src/engine', () => {
    const engineDir = fileURLToPath(new URL('../', import.meta.url));
    const files = (readdirSync(engineDir, { recursive: true }) as string[]).filter(
      (entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'),
    );

    expect(files.length).toBeGreaterThan(0);
    for (const relativePath of files) {
      const source = readFileSync(join(engineDir, relativePath), 'utf-8');
      expect(source).not.toMatch(/adapters\/trf5/);
      expect(source).not.toMatch(/from ['"]axios['"]/);
      expect(source).not.toMatch(/from ['"]cheerio['"]/);
    }
  });
});
