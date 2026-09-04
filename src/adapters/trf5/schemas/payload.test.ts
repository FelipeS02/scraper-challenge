import { describe, expect, it } from 'vitest';
import { loadFixtureBytes } from '../__fixtures__/stub-transport.js';
import { parseDetailPage } from '../parsing/detail-page.js';
import { itemId } from '../site.js';
import { assembleTrfPayload } from './payload.js';

const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));
const SOURCE_URL =
  'stub://pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam?ca=stub-ca-0001';

describe('assembleTrfPayload — Judicial Record Payload Contract (trf5-adapter spec)', () => {
  it('carries cnjCode and label on caseClass and every subjects[] entry', () => {
    const payload = assembleTrfPayload(detail, SOURCE_URL);
    expect(payload).not.toBeNull();
    expect(payload?.caseClass).toEqual({ label: 'APELACAO CIVEL', cnjCode: '198' });
    expect(payload?.subjects.length).toBeGreaterThan(0);
    for (const subject of payload?.subjects ?? []) {
      expect(subject).toHaveProperty('cnjCode');
      expect(subject).toHaveProperty('label');
    }
  });

  it('nests parties.active/passive/others, each with a lawyers[] array', () => {
    const payload = assembleTrfPayload(detail, SOURCE_URL);
    expect(payload?.parties.active[0]?.lawyers[0]).toEqual({
      name: 'BELTRANO ADVOGADO',
      oabNumber: '00000-X',
      oabState: 'PE',
      cpf: '111.111.111-11',
    });
    expect(payload?.parties.passive[0]?.lawyers).toEqual([]);
  });

  it('never emits a source page Portuguese form/query-parameter name as a payload property name', () => {
    const payload = assembleTrfPayload(detail, SOURCE_URL);
    const json = JSON.stringify(payload);
    for (const sourceField of [
      'numProcesso',
      'dataAutuacaoInicio',
      'classeJudicial',
      'nomeArqProcDocBin',
      'idProcessoDocumento',
      'numeroProcesso',
    ]) {
      expect(json).not.toContain(`"${sourceField}"`);
    }
    // ... while the preserved domain acronyms remain present, camelCased.
    expect(json).toContain('"cpf"');
    expect(json).toContain('"oabNumber"');
    expect(json).toContain('"oabState"');
  });

  it('produces an item whose declared itemId equals the payload processNumber', () => {
    const payload = assembleTrfPayload(detail, SOURCE_URL);
    expect(payload).not.toBeNull();
    if (!payload) throw new Error('unreachable — asserted above');
    expect(itemId(payload)).toBe(payload.processNumber);
    expect(itemId(payload)).toBe('0712345-90.2024.4.05.8300');
  });
});
