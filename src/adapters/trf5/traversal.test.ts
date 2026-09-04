import { describe, expect, it } from 'vitest';
import type { SaturationInfo } from '../../engine/ports.js';
import type { WorkUnit } from '../../engine/types.js';
import { fixtureResponse, loadFixtureBytes, StubTransport } from './__fixtures__/stub-transport.js';
import { parsePrimingPage } from './session.js';
import { TRF5Traversal, type TraversalCursor } from './traversal.js';

const session = parsePrimingPage(loadFixtureBytes('priming-page-1.html'));
const saturated: SaturationInfo = { resultCount: 30, cap: 30 };

function unit(
  dateFrom: string,
  dateTo: string,
  facetValue: string | null,
): WorkUnit<TraversalCursor> {
  const windowKey = `${dateFrom}..${dateTo}`;
  return {
    unitKey: facetValue ? `${windowKey}|${facetValue}` : windowKey,
    windowKey,
    facetValue,
    label: windowKey,
    cursor: { dateFrom, dateTo },
  };
}

describe('TRF5Traversal — declared facet', () => {
  it('declares classeJudicial as its partition facet', () => {
    const transport = new StubTransport([]);
    const traversal = new TRF5Traversal({ transport, session });
    expect(traversal.facetName).toBe('classeJudicial');
  });
});

describe('TRF5Traversal — the class catalogue is fetched per run, never hardcoded', () => {
  it('expands a saturated single day into one unit per fetched class, bounded by maxFacetValues', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/xml', 'classes-catalogue.xml'),
    ]);
    const traversal = new TRF5Traversal({ transport, session });

    await traversal.seed({ dateFrom: '2026-09-01', dateTo: '2026-09-01', maxFacetValues: 10 });
    const children = await traversal.split(unit('2026-09-01', '2026-09-01', null), saturated);

    expect(transport.requests).toHaveLength(1); // fetched over the wire, not a static array
    expect(children).toHaveLength(6); // the fixture's own count — asserting a fetch, not the literal 132
    expect((children ?? []).map((child) => child.facetValue)).toEqual([
      'ACAO CIVIL COLETIVA',
      'APELACAO CIVEL', // CNJ code (198) is parsed out of the label, not left inline
      'HABEAS CORPUS CRIMINAL',
      'MANDADO DE SEGURANCA CIVEL',
      'EMBARGOS DE DECLARACAO',
      'TUTELA CAUTELAR ANTECEDENTE',
    ]);
  });

  it('caps facet expansion at the run-declared maxFacetValues', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/xml', 'classes-catalogue.xml'),
    ]);
    const traversal = new TRF5Traversal({ transport, session });

    await traversal.seed({ dateFrom: '2026-09-01', dateTo: '2026-09-01', maxFacetValues: 2 });
    const children = await traversal.split(unit('2026-09-01', '2026-09-01', null), saturated);

    expect(children).toHaveLength(2);
  });

  it('returns null once a single day is saturated even after facet expansion', async () => {
    const transport = new StubTransport([]);
    const traversal = new TRF5Traversal({ transport, session });
    await traversal.seed({ dateFrom: '2026-09-01', dateTo: '2026-09-01', maxFacetValues: 10 });

    const result = await traversal.split(
      unit('2026-09-01', '2026-09-01', 'APELACAO CIVEL'),
      saturated,
    );

    expect(result).toBeNull();
    expect(transport.requests).toHaveLength(0); // no further fetch once already faceted
  });
});

describe('TRF5Traversal — date bisection boundary contract', () => {
  it('splits an even-length window at mid/mid+1 with no gap or overlap', async () => {
    const transport = new StubTransport([]);
    const traversal = new TRF5Traversal({ transport, session });
    await traversal.seed({ dateFrom: '2026-01-01', dateTo: '2026-01-04', maxFacetValues: 10 });

    const children = await traversal.split(unit('2026-01-01', '2026-01-04', null), saturated);

    expect(children).toEqual([
      unit('2026-01-01', '2026-01-02', null),
      unit('2026-01-03', '2026-01-04', null),
    ]);
  });

  it('splits an odd-length window with the extra day on the left half', async () => {
    const transport = new StubTransport([]);
    const traversal = new TRF5Traversal({ transport, session });
    await traversal.seed({ dateFrom: '2026-01-01', dateTo: '2026-01-03', maxFacetValues: 10 });

    const children = await traversal.split(unit('2026-01-01', '2026-01-03', null), saturated);

    expect(children).toEqual([
      unit('2026-01-01', '2026-01-02', null),
      unit('2026-01-03', '2026-01-03', null),
    ]);
  });
});
