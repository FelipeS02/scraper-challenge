/**
 * Forecasts the request count and duration for the configured bounds, without ever
 * touching a transport or discovery port (core-run-control-and-output, "Dry-Run
 * Forecast"). Pure computation only — "zero discovery requests" holds by
 * construction, since nothing here accepts an `HttpTransport`/`SitePort`.
 */

export interface DryRunConfig {
  readonly maxDays: number;
  readonly maxItems: number | null;
  readonly maxDocuments: number;
  readonly maxRequests: number | null;
  readonly resultPageCap: number | null; // adapter-declared (SitePort.resultPageCap)
  readonly politenessSpacingMs: number;
}

export interface DryRunForecast {
  readonly estimatedRequests: number;
  readonly estimatedDurationMs: number;
}

function daysInclusive(dateFrom: string, dateTo: string): number {
  const fromMs = Date.parse(`${dateFrom}T00:00:00Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000) + 1;
}

/**
 * A disclosed heuristic, not a certified prediction — matching the project's own
 * "coverage is measured, never certified" stance. It assumes the optimistic,
 * non-saturated case (one search request per day); a saturated day subdivides
 * into more requests than this forecast predicts.
 */
export function forecastRun(
  dateFrom: string,
  dateTo: string,
  config: DryRunConfig,
): DryRunForecast {
  const days = Math.max(1, Math.min(daysInclusive(dateFrom, dateTo), config.maxDays));
  const searchRequests = days;

  const estimatedItems =
    config.resultPageCap === null
      ? 0
      : Math.min(config.maxItems ?? Infinity, days * config.resultPageCap);
  const detailRequests = estimatedItems;
  const documentRequests = Math.min(config.maxDocuments, detailRequests);

  const rawTotal = searchRequests + detailRequests + documentRequests;
  const estimatedRequests =
    config.maxRequests === null ? rawTotal : Math.min(rawTotal, config.maxRequests);

  return {
    estimatedRequests,
    estimatedDurationMs: estimatedRequests * config.politenessSpacingMs,
  };
}

/** Human-facing output stays on stdout, never interleaved with log events (spec). */
export function printDryRunForecast(
  forecast: DryRunForecast,
  write: (line: string) => void = (line) => console.log(line),
): void {
  const seconds = Math.round(forecast.estimatedDurationMs / 1000);
  write(
    `Dry run: an estimated ${forecast.estimatedRequests} requests, ~${seconds}s ` +
      '(heuristic — not a certified prediction; a saturated day issues more requests than forecast).',
  );
}
