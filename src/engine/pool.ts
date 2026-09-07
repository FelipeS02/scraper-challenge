/**
 * A bounded in-process worker pool. No external queue or broker — the engine
 * MUST NOT depend on Redis, BullMQ, or any other queue client (core-scraping-engine).
 */
export class Pool {
  constructor(readonly concurrency: number) {}

  async run<T>(units: readonly T[], worker: (unit: T) => Promise<void>): Promise<void> {
    const queue = [...units];
    const workerCount = Math.min(this.concurrency, queue.length);
    await Promise.all(Array.from({ length: workerCount }, () => this.drain(queue, worker)));
  }

  private async drain<T>(queue: T[], worker: (unit: T) => Promise<void>): Promise<void> {
    for (;;) {
      const unit = queue.shift();
      if (unit === undefined) return;
      await worker(unit);
    }
  }
}
