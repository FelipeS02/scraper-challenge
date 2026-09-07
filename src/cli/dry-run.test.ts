import { describe, expect, it } from 'vitest';
import { forecastRun, printDryRunForecast } from './dry-run.js';

const config = {
  maxDays: Number.POSITIVE_INFINITY,
  maxItems: null,
  maxDocuments: 10,
  maxRequests: null,
  resultPageCap: 30,
  politenessSpacingMs: 500,
};

describe('forecastRun', () => {
  it('forecasts one search request per day in the optimistic non-saturated case', () => {
    const forecast = forecastRun('2026-01-01', '2026-01-05', {
      ...config,
      resultPageCap: null, // unknown cap -> no detail/document requests forecast
      maxDocuments: 0,
    });
    expect(forecast.estimatedRequests).toBe(5);
  });

  it('adds forecasted detail and document requests bounded by the declared result-page cap', () => {
    const forecast = forecastRun('2026-01-01', '2026-01-01', {
      ...config,
      resultPageCap: 30,
      maxDocuments: 10,
    });
    // 1 search + 30 detail fetches (one day * cap) + min(maxDocuments, 30) document fetches
    expect(forecast.estimatedRequests).toBe(1 + 30 + 10);
  });

  it('never exceeds an explicit --max-requests ceiling', () => {
    const forecast = forecastRun('2026-01-01', '2026-01-31', { ...config, maxRequests: 50 });
    expect(forecast.estimatedRequests).toBe(50);
  });

  it('clamps the forecasted day count to --max-days', () => {
    const unclamped = forecastRun('2026-01-01', '2026-01-31', {
      ...config,
      maxDays: Number.POSITIVE_INFINITY,
      resultPageCap: null,
      maxDocuments: 0,
    });
    const clamped = forecastRun('2026-01-01', '2026-01-31', {
      ...config,
      maxDays: 5,
      resultPageCap: null,
      maxDocuments: 0,
    });
    expect(unclamped.estimatedRequests).toBe(31);
    expect(clamped.estimatedRequests).toBe(5);
  });

  it('estimates duration from the forecasted request count and politeness spacing', () => {
    const forecast = forecastRun('2026-01-01', '2026-01-01', {
      ...config,
      resultPageCap: null,
      maxDocuments: 0,
      politenessSpacingMs: 500,
    });
    expect(forecast.estimatedDurationMs).toBe(1 * 500);
  });
});

describe('printDryRunForecast', () => {
  it('writes exactly one human-readable line carrying both the request count and duration', () => {
    const lines: string[] = [];
    printDryRunForecast({ estimatedRequests: 42, estimatedDurationMs: 21_000 }, (line) =>
      lines.push(line),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('42');
    expect(lines[0]).toMatch(/21\s?s/); // 21000ms rendered as seconds
  });
});
