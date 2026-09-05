import { describe, expect, it } from 'vitest';
import { loadFixtureBytes } from '../__fixtures__/stub-transport.js';
import { parseResultFragment } from './result-fragment.js';

describe('parseResultFragment — Declared Result-Page Cap and Item Identity Key (trf5-adapter spec)', () => {
  it('extracts one row per result with its process number and opaque ca token, in document order', () => {
    const fragment = parseResultFragment(loadFixtureBytes('search-ok.xml'));

    expect(fragment.rows).toEqual([
      {
        processNumber: '0000001-11.2024.4.05.8000',
        ca: 'stubca0000000000000000000000000000000001',
      },
      {
        processNumber: '0000002-22.2024.4.05.8000',
        ca: 'stubca0000000000000000000000000000000002',
      },
      {
        processNumber: '0000003-33.2024.4.05.8000',
        ca: 'stubca0000000000000000000000000000000003',
      },
    ]);
  });

  it('reports the observed row count so the engine can compare it against resultPageCap', () => {
    const fragment = parseResultFragment(loadFixtureBytes('search-ok.xml'));

    expect(fragment.count).toBe(3);
    expect(fragment.count).toBe(fragment.rows.length);
  });

  it('yields an empty list rather than throwing for a zero-row fragment', () => {
    const fragment = parseResultFragment(loadFixtureBytes('search-ok-empty.xml'));

    expect(fragment.rows).toEqual([]);
    expect(fragment.count).toBe(0);
  });
});
