import { describe, expect, it } from 'vitest';
import type { RunBounds } from '../../engine/ports.js';
import { loadFixtureBytes } from './__fixtures__/stub-transport.js';
import { parseDetailPage } from './parsing/detail-page.js';
import { assembleTrfPayload, type TrfPayload } from './schemas/payload.js';
import { seedKindRanking, TRF5Seeds } from './seeds.js';

const SOURCE_URL =
  'stub://pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam?ca=stub-ca-0001';

/** Reuses the real captured fixture (S4a) rather than inventing a synthetic payload shape. */
function loadFixturePayload(): TrfPayload {
  const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));
  const payload = assembleTrfPayload(detail, SOURCE_URL);
  if (!payload) throw new Error('fixture failed schema validation');
  return payload;
}

describe('TRF5Seeds.seedKindRanking (trf5-adapter spec, "Declared Seed Kinds and Ranking")', () => {
  it('ranks lawyerCpf above partyCpf', () => {
    expect(seedKindRanking).toEqual(['lawyerCpf', 'partyCpf']);
    const seeds = new TRF5Seeds();
    expect(seeds.seedKindRanking).toEqual(['lawyerCpf', 'partyCpf']);
  });
});

describe('TRF5Seeds.harvestSeeds (core-frontier-crawl, "Seed Harvesting and Prioritization")', () => {
  it('harvests exact-match CPFs from the fixture — one lawyerCpf seed, one partyCpf seed', () => {
    const seeds = new TRF5Seeds();
    const payload = loadFixturePayload();

    const harvested = seeds.harvestSeeds(payload);

    expect(harvested).toContainEqual({ kind: 'lawyerCpf', value: '000.000.000-01' });
    expect(harvested).toContainEqual({ kind: 'partyCpf', value: '000.000.000-00' });
  });

  it('never harvests a null or empty CPF', () => {
    const seeds = new TRF5Seeds();
    const payload: TrfPayload = {
      ...loadFixturePayload(),
      parties: {
        active: [{ name: 'A', cpf: null, role: 'AUTOR', status: null, lawyers: [] }],
        passive: [],
        others: [],
      },
    };

    expect(seeds.harvestSeeds(payload)).toEqual([]);
  });

  it('de-duplicates the same CPF appearing on more than one party or lawyer row', () => {
    const seeds = new TRF5Seeds();
    const payload: TrfPayload = {
      ...loadFixturePayload(),
      parties: {
        active: [
          { name: 'A', cpf: '111.111.111-11', role: 'AUTOR', status: null, lawyers: [] },
          { name: 'B', cpf: '111.111.111-11', role: 'AUTOR', status: null, lawyers: [] },
        ],
        passive: [],
        others: [],
      },
    };

    expect(seeds.harvestSeeds(payload)).toEqual([{ kind: 'partyCpf', value: '111.111.111-11' }]);
  });
});

describe('TRF5Seeds.unitFromSeed (core-frontier-crawl, "Mandatory Date Range on Seed Searches")', () => {
  const bounds: RunBounds = { dateFrom: '2026-01-01', dateTo: '2026-01-31', maxFacetValues: 1 };

  it('always carries the run-bounds date range on the resulting cursor', () => {
    const seeds = new TRF5Seeds();
    const unit = seeds.unitFromSeed({ kind: 'partyCpf', value: '000.000.000-00' }, bounds);

    const cursor = unit.cursor;
    expect(cursor.dateFrom).toBe('2026-01-01');
    expect(cursor.dateTo).toBe('2026-01-31');
    expect(cursor.seedCpf).toBe('000.000.000-00');
    expect(unit.facetValue).toBeNull();
  });

  it('produces a distinct unitKey per seed value, so two seeds never collide in a checkpoint/queue', () => {
    const seeds = new TRF5Seeds();
    const unitA = seeds.unitFromSeed({ kind: 'partyCpf', value: 'A' }, bounds);
    const unitB = seeds.unitFromSeed({ kind: 'partyCpf', value: 'B' }, bounds);

    expect(unitA.unitKey).not.toBe(unitB.unitKey);
  });
});
