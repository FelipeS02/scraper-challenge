import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Pool } from './pool.js';

describe('Pool concurrency', () => {
  it('never runs more units in flight than the configured concurrency limit', async () => {
    const pool = new Pool(2);
    let active = 0;
    let maxActive = 0;
    const units = [1, 2, 3, 4, 5];

    await pool.run(units, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(maxActive).toBeGreaterThan(0);
  });

  it('processes every unit exactly once', async () => {
    const pool = new Pool(3);
    const processed: number[] = [];
    const units = [10, 20, 30, 40];

    await pool.run(units, (unit) => {
      processed.push(unit);
      return Promise.resolve();
    });

    expect([...processed].sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
  });
});

describe('Pool dependency graph', () => {
  it('does not depend on Redis, BullMQ, or any other external queue client', () => {
    const pkgUrl = new URL('../../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const forbidden = ['redis', 'ioredis', 'bullmq', 'amqplib', 'kafkajs'];

    for (const name of allDeps) {
      expect(forbidden).not.toContain(name.toLowerCase());
    }
    expect(allDeps.length).toBeGreaterThan(0);
  });
});
