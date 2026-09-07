/**
 * Composable backoff strategies (design.md D-decisions, core-resilience-policy).
 * A base strategy (`fixed`/`linear`/`exponential`) is decorated by `withJitter`
 * and/or `withCap`. Every strategy used in production MUST be capped.
 */
export type BackoffStrategy = (attempt: number) => number;

export function fixed(delayMs: number): BackoffStrategy {
  return () => delayMs;
}

export function linear(baseMs: number, incrementMs: number): BackoffStrategy {
  return (attempt: number) => baseMs + incrementMs * (attempt - 1);
}

export function exponential(baseMs: number, factor: number): BackoffStrategy {
  return (attempt: number) => baseMs * factor ** (attempt - 1);
}

export function withJitter(ratio: number): (strategy: BackoffStrategy) => BackoffStrategy {
  return (strategy: BackoffStrategy): BackoffStrategy =>
    (attempt: number) => {
      const base = strategy(attempt);
      const spread = base * ratio;
      return base + (Math.random() * 2 - 1) * spread;
    };
}

export function withCap(maxMs: number): (strategy: BackoffStrategy) => BackoffStrategy {
  return (strategy: BackoffStrategy): BackoffStrategy =>
    (attempt: number) =>
      Math.min(strategy(attempt), maxMs);
}
