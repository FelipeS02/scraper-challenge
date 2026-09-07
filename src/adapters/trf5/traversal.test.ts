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
    // Mirrors windowUnit's own dimensions so the equality assertions below
    // keep comparing whole units, never a unit against a stale shape.
    dimensions: {
      date: dateFrom === dateTo ? dateFrom : windowKey,
      ...(facetValue === null ? {} : { class: facetValue }),
    },
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
      fixtureResponse(200, 'text/xml;charset=UTF-8', 'classes-catalogue.xml'),
    ]);
    const traversal = new TRF5Traversal({ transport, session });

    await traversal.seed({ dateFrom: '2026-09-01', dateTo: '2026-09-01', maxFacetValues: 10 });
    const children = await traversal.split(unit('2026-09-01', '2026-09-01', null), saturated);

    expect(transport.requests).toHaveLength(1); // fetched over the wire, not a static array
    // maxFacetValues, not the catalogue's own size: the real captured fixture
    // carries all 132 classes the endpoint returns, so this asserts the bound
    // is applied to a real fetch rather than asserting a fixture's length.
    expect(children).toHaveLength(10);
    expect((children ?? []).slice(0, 3).map((child) => child.facetValue)).toEqual([
      'AÇÃO CIVIL COLETIVA',
      'AÇÃO CIVIL DE IMPROBIDADE ADMINISTRATIVA',
      'AÇÃO CIVIL PÚBLICA CÍVEL',
    ]);
  });

  it('caps facet expansion at the run-declared maxFacetValues', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/xml;charset=UTF-8', 'classes-catalogue.xml'),
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

describe('TRF5Traversal — every unit declares its partition dimensions, starting at the date layer', () => {
  it('declares the date range on a seed window, so a top-level record is analyzable like every other', async () => {
    const transport = new StubTransport([]);
    const traversal = new TRF5Traversal({ transport, session });

    const [seedUnit] = await traversal.seed({
      dateFrom: '2026-08-24',
      dateTo: '2026-09-02',
      maxFacetValues: 10,
    });

    expect(seedUnit?.dimensions).toEqual({ date: '2026-08-24..2026-09-02' });
  });

  it('declares a bare day, not a collapsed range, once bisection reaches a single day', async () => {
    const transport = new StubTransport([]);
    const traversal = new TRF5Traversal({ transport, session });
    await traversal.seed({ dateFrom: '2026-09-01', dateTo: '2026-09-02', maxFacetValues: 10 });

    const children = await traversal.split(unit('2026-09-01', '2026-09-02', null), saturated);

    // The same shape nameProbeUnit uses, so `date` means one thing across
    // every level rather than "2026-09-01" at one depth and
    // "2026-09-01..2026-09-01" at another.
    expect((children ?? []).map((child) => child.dimensions)).toEqual([
      { date: '2026-09-01' },
      { date: '2026-09-02' },
    ]);
  });

  it('adds the class to the dimensions once a day expands into per-class units', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/xml;charset=UTF-8', 'classes-catalogue.xml'),
    ]);
    const traversal = new TRF5Traversal({ transport, session });
    await traversal.seed({ dateFrom: '2026-09-01', dateTo: '2026-09-01', maxFacetValues: 2 });

    const children = await traversal.split(unit('2026-09-01', '2026-09-01', null), saturated);

    expect(children?.[0]?.dimensions).toEqual({
      date: '2026-09-01',
      class: 'AÇÃO CIVIL COLETIVA',
    });
  });
});

describe('TRF5Traversal — frontier seed-cursor propagation (core-frontier-crawl, "Saturated seed search bisects")', () => {
  it('carries seedCpf through date bisection unchanged, reusing the same split()', async () => {
    const transport = new StubTransport([]);
    const traversal = new TRF5Traversal({ transport, session });
    await traversal.seed({ dateFrom: '2026-01-01', dateTo: '2026-01-04', maxFacetValues: 10 });

    const seedUnit: WorkUnit<TraversalCursor> = {
      unitKey: 'frontier|partyCpf|000.000.000-00|2026-01-01..2026-01-04',
      windowKey: '2026-01-01..2026-01-04',
      facetValue: null,
      label: 'partyCpf:000.000.000-00',
      cursor: { dateFrom: '2026-01-01', dateTo: '2026-01-04', seedCpf: '000.000.000-00' },
    };

    const children = await traversal.split(seedUnit, saturated);

    expect(children).toHaveLength(2);
    for (const child of children ?? []) {
      expect(child.cursor.seedCpf).toBe('000.000.000-00');
    }
  });

  it('returns null for a saturated single-day seed search rather than expanding into judicial classes', async () => {
    const transport = new StubTransport([]); // no request issued — proves facet expansion never runs
    const traversal = new TRF5Traversal({ transport, session });
    await traversal.seed({ dateFrom: '2026-01-01', dateTo: '2026-01-01', maxFacetValues: 10 });

    const seedUnit: WorkUnit<TraversalCursor> = {
      unitKey: 'frontier|partyCpf|000.000.000-00|2026-01-01..2026-01-01',
      windowKey: '2026-01-01..2026-01-01',
      facetValue: null,
      label: 'partyCpf:000.000.000-00',
      cursor: { dateFrom: '2026-01-01', dateTo: '2026-01-01', seedCpf: '000.000.000-00' },
    };

    const result = await traversal.split(seedUnit, saturated);

    expect(result).toBeNull();
    expect(transport.requests).toHaveLength(0);
  });
});

describe('TRF5Traversal — name-substring partition level (trf5-adapter spec, "Name-Substring Partition Level")', () => {
  it('expands a saturated single-day class cell into bounded name-probe children with unique unitKeys', async () => {
    const transport = new StubTransport([]);
    const traversal = new TRF5Traversal({ transport, session, maxNameProbes: 3 });

    const children = await traversal.split(
      unit('2026-09-03', '2026-09-03', 'APELACAO CIVEL'),
      saturated,
    );

    expect(children).not.toBeNull();
    expect(children).toHaveLength(3);
    const unitKeys = new Set((children ?? []).map((child) => child.unitKey));
    expect(unitKeys.size).toBe(3); // no duplicate siblings
    for (const child of children ?? []) {
      expect(child.facetValue).toBe('APELACAO CIVEL'); // class stays the declared facet (D5)
      expect(child.cursor.dateFrom).toBe('2026-09-03');
      expect(child.cursor.dateTo).toBe('2026-09-03');
      expect(typeof child.cursor.nameProbe).toBe('string');
    }
    // The static dictionary floor requires no request at all (harvester is empty).
    expect(transport.requests).toHaveLength(0);
  });

  it('returns null for a cell that already carries a name probe and is still saturated (irreducible residue)', async () => {
    const transport = new StubTransport([]);
    const traversal = new TRF5Traversal({ transport, session, maxNameProbes: 3 });
    const probedUnit: WorkUnit<TraversalCursor> = {
      unitKey: '2026-09-03..2026-09-03|APELACAO CIVEL|DA SILVA',
      windowKey: '2026-09-03..2026-09-03',
      facetValue: 'APELACAO CIVEL',
      label: '2026-09-03..2026-09-03|APELACAO CIVEL|DA SILVA',
      cursor: { dateFrom: '2026-09-03', dateTo: '2026-09-03', nameProbe: 'DA SILVA' },
    };

    const result = await traversal.split(probedUnit, saturated);

    expect(result).toBeNull();
  });

  it('disables the name-substring level entirely when maxNameProbes is 0, matching pre-change behavior', async () => {
    const transport = new StubTransport([]);
    const traversal = new TRF5Traversal({ transport, session, maxNameProbes: 0 });

    const result = await traversal.split(
      unit('2026-09-03', '2026-09-03', 'APELACAO CIVEL'),
      saturated,
    );

    expect(result).toBeNull();
    expect(transport.requests).toHaveLength(0);
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
