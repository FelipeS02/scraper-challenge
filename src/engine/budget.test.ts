import { describe, expect, it } from 'vitest';
import {
  Budget,
  clampDateRange,
  DEFAULT_MAX_DOCUMENTS,
  DEFAULT_MAX_REQUESTS,
  unboundedBudget,
} from './budget.js';

describe('Budget', () => {
  it('stops further document fetches once --max-documents is reached (default 10)', () => {
    const budget = new Budget({
      maxItems: null,
      maxDocuments: 2,
      documentsPerItem: null,
      maxRequests: null,
    });
    expect(budget.canFetchDocument('item-A')).toBe(true);
    budget.recordDocument('item-A');
    expect(budget.canFetchDocument('item-A')).toBe(true);
    budget.recordDocument('item-A');
    // The document ceiling is global, not per-item — a different item is bounded too.
    expect(budget.canFetchDocument('item-A')).toBe(false);
    expect(budget.canFetchDocument('item-B')).toBe(false);
  });

  it('stops further item collection once --max-items is reached', () => {
    const budget = new Budget({
      maxItems: 1,
      maxDocuments: DEFAULT_MAX_DOCUMENTS,
      documentsPerItem: null,
      maxRequests: null,
    });
    expect(budget.canRecordItem()).toBe(true);
    budget.recordItem();
    expect(budget.canRecordItem()).toBe(false);
  });

  it('bounds --documents-per-item independently of the global document ceiling', () => {
    const budget = new Budget({
      maxItems: null,
      maxDocuments: 100,
      documentsPerItem: 1,
      maxRequests: null,
    });
    budget.recordDocument('item-A');
    expect(budget.canFetchDocument('item-A')).toBe(false);
    expect(budget.canFetchDocument('item-B')).toBe(true);
  });

  it('an omitted --max-requests still stops at the default ceiling', () => {
    const budget = new Budget({
      maxItems: null,
      maxDocuments: DEFAULT_MAX_DOCUMENTS,
      documentsPerItem: null,
      maxRequests: DEFAULT_MAX_REQUESTS,
    });
    for (let i = 0; i < DEFAULT_MAX_REQUESTS; i += 1) budget.recordRequest();
    expect(budget.canSpendRequest()).toBe(false);
  });

  it('an explicit null maxRequests is the only way to go unbounded', () => {
    const budget = new Budget({
      maxItems: null,
      maxDocuments: DEFAULT_MAX_DOCUMENTS,
      documentsPerItem: null,
      maxRequests: null,
    });
    for (let i = 0; i < 10_000; i += 1) budget.recordRequest();
    expect(budget.canSpendRequest()).toBe(true);
  });

  it('unboundedBudget never stops any axis', () => {
    const budget = unboundedBudget();
    for (let i = 0; i < 1000; i += 1) {
      budget.recordItem();
      budget.recordDocument('x');
      budget.recordRequest();
    }
    expect(budget.canRecordItem()).toBe(true);
    expect(budget.canFetchDocument('x')).toBe(true);
    expect(budget.canSpendRequest()).toBe(true);
  });
});

describe('clampDateRange', () => {
  it('leaves a range within --max-days unchanged', () => {
    expect(clampDateRange('2026-01-01', '2026-01-03', 5)).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-03',
    });
  });

  it('clamps dateTo when the requested range exceeds --max-days', () => {
    expect(clampDateRange('2026-01-01', '2026-01-31', 5)).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-05',
    });
  });
});
