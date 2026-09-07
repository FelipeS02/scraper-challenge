/**
 * The one gate every request passes through, enforcing two independent limits
 * (design.md D6, "Rate limiter is a global gate, not a per-task delay"):
 *
 * - **Politeness spacing**, always on: consecutive grants are separated by at
 *   least `minSpacingMs`, so a run never fires as fast as the event loop allows
 *   at a public judicial portal. This is proactive — it costs nothing when the
 *   requests themselves are already slower than the interval, and it does not
 *   wait for a 429 to start being considerate.
 * - **Cooldown**, reactive: a 429 calls `tripCooldown(ms)`, closing the gate
 *   every worker awaits. There is no cross-worker signalling beyond this.
 *
 * The cooldown always outranks the spacing: a 429 landing while a request is
 * merely spacing still gates that request for the full cooldown.
 *
 * Grants are serialized through one promise chain, so spacing holds across
 * parallel workers rather than only within one. The pool bounds parallelism,
 * the limiter bounds rate, and they never talk to each other.
 */

/** design.md's resilience defaults: "politeness spacing ~500ms". */
export const DEFAULT_REQUEST_SPACING_MS = 500;

export class RateLimiter {
  private cooldown: Promise<void> | null = null;
  /** Tail of the grant chain — makes concurrent `acquire()` calls queue rather than race. */
  private tail: Promise<unknown> = Promise.resolve();
  private lastGrantedAt: number | null = null;

  constructor(private readonly minSpacingMs: number = DEFAULT_REQUEST_SPACING_MS) {}

  async acquire(): Promise<void> {
    const grant = this.tail.then(() => this.grant());
    // Swallow on the chain only: a rejected grant must not poison later acquires,
    // while the caller still sees the original rejection through `grant`.
    this.tail = grant.catch(() => undefined);
    return grant;
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

  private async grant(): Promise<void> {
    await this.waitOutCooldown();

    const spacingWait =
      this.lastGrantedAt === null ? 0 : this.lastGrantedAt + this.minSpacingMs - Date.now();
    if (spacingWait > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, spacingWait));
      // A 429 may have landed while this request was only spacing; the cooldown
      // outranks the spacing, so re-check rather than granting on a stale pass.
      await this.waitOutCooldown();
    }

    this.lastGrantedAt = Date.now();
  }

  private async waitOutCooldown(): Promise<void> {
    while (this.cooldown) {
      await this.cooldown;
    }
  }
}
