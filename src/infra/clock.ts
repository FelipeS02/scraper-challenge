import type { Clock } from '../engine/ports.js';

/**
 * The real `Clock` implementation (design.md module layout, S5e task 9.2).
 * A genuine `implements Clock` class rather than an inline object literal in
 * `main.ts`, so the ports-implementation audit's `implements`-clause scan
 * (`engine/ports-implementation-audit.test.ts`) can find it — an inline
 * literal satisfies the interface structurally but leaves no `implements`
 * clause anywhere in `src/` for the scan to see.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
