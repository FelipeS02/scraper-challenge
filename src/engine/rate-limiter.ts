/**
 * A global cooldown gate, not a per-task delay (design.md D6). Every request
 * awaits `acquire()`; a 429 calls `tripCooldown(ms)`, which closes the one gate
 * every worker awaits — there is no cross-worker signalling beyond this.
 */
export class RateLimiter {
  private cooldown: Promise<void> | null = null;

  async acquire(): Promise<void> {
    while (this.cooldown) {
      await this.cooldown;
    }
  }

  tripCooldown(ms: number): void {
    if (this.cooldown) return; // already cooling down; do not stack timers
    this.cooldown = new Promise((resolve) => {
      setTimeout(() => {
        this.cooldown = null;
        resolve();
      }, ms);
    });
  }
}
