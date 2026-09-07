/**
 * Enforces the CLI-level bounds on every crawl axis (core-run-control-and-output,
 * "CLI Bound Enforcement" + "Default Request Ceiling Requiring Override"). Pure
 * counters, no I/O and no adapter knowledge — this composes with any SitePort
 * exactly like the rest of engine/ (design.md D1).
 */

/** A run with no `--max-requests` flag stops here; unbounded requires an explicit override. */
export const DEFAULT_MAX_REQUESTS = 500;

/** A run with no `--max-documents` flag stops here (core-run-control-and-output). */
export const DEFAULT_MAX_DOCUMENTS = 10;

export interface BudgetConfig {
  readonly maxItems: number | null; // null = no cap
  readonly maxDocuments: number; // always a concrete ceiling (never "no cap" by omission)
  readonly documentsPerItem: number | null; // null = no per-item cap
  readonly maxRequests: number | null; // null = unbounded — only reachable by explicit override
}

/**
 * Tracks consumption against each configured ceiling. One instance per run, shared
 * across every unit a Scraper processes: the document ceiling is global, not per-cell,
 * and stopping one axis never errors the rest of the run.
 */
export class Budget {
  private requestCount = 0;
  private itemCount = 0;
  private documentCount = 0;
  private readonly documentsByItem = new Map<string, number>();

  constructor(private readonly config: BudgetConfig) {}

  /** False once `--max-requests` attempts have been spent — stops the whole run. */
  canSpendRequest(): boolean {
    return this.config.maxRequests === null || this.requestCount < this.config.maxRequests;
  }

  recordRequest(): void {
    this.requestCount += 1;
  }

  /** False once `--max-items` items have been collected — discovery of further items stops. */
  canRecordItem(): boolean {
    return this.config.maxItems === null || this.itemCount < this.config.maxItems;
  }

  recordItem(): void {
    this.itemCount += 1;
  }

  /** False once `--max-documents` (default 10) or `--documents-per-item` is reached. */
  canFetchDocument(itemId: string): boolean {
    if (this.documentCount >= this.config.maxDocuments) return false;
    if (this.config.documentsPerItem === null) return true;
    return (this.documentsByItem.get(itemId) ?? 0) < this.config.documentsPerItem;
  }

  recordDocument(itemId: string): void {
    this.documentCount += 1;
    this.documentsByItem.set(itemId, (this.documentsByItem.get(itemId) ?? 0) + 1);
  }
}

/** No axis ever stops — for tests and any caller that does not need bounds. */
export function unboundedBudget(): Budget {
  return new Budget({
    maxItems: null,
    maxDocuments: Number.POSITIVE_INFINITY,
    documentsPerItem: null,
    maxRequests: null,
  });
}

/**
 * `--max-days` truncates `dateTo` to `dateFrom + maxDays - 1` when the requested
 * range is larger — the axis is truncated, never rejected (core-run-control-and-output,
 * "CLI Bound Enforcement": each bound stops further work on its axis "without erroring
 * the whole run").
 */
export function clampDateRange(
  dateFrom: string,
  dateTo: string,
  maxDays: number,
): { readonly dateFrom: string; readonly dateTo: string } {
  const fromMs = Date.parse(`${dateFrom}T00:00:00Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00Z`);
  const spanDays = Math.round((toMs - fromMs) / 86_400_000) + 1;
  if (spanDays <= maxDays) return { dateFrom, dateTo };
  const clampedToMs = fromMs + (maxDays - 1) * 86_400_000;
  return { dateFrom, dateTo: new Date(clampedToMs).toISOString().slice(0, 10) };
}
