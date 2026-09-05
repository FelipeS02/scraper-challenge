import { describe, expect, it } from 'vitest';
import { loadFixtureBytes } from '../__fixtures__/stub-transport.js';
import { parseDetailPage } from './detail-page.js';

/**
 * Every expectation below is read from a real captured, redacted response
 * (`__fixtures__/detail-page-valid.html`'s own header comment records what
 * was captured and what was redacted) — never invented markup.
 */
describe('parseDetailPage — header (trf5-adapter spec, Full Field Inventory Extraction)', () => {
  it('extracts numero, data distribuicao, classe+CNJ code, assunto hierarchy, jurisdicao, orgaos, endereco, processo referencia from real .propertyView label/value pairs', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    expect(detail.processNumber).toBe('0123456-78.2026.4.05.8100');
    expect(detail.filingDate).toBe('10/03/2026');
    expect(detail.caseClass).toEqual({
      label: 'APELAÇÃO / REMESSA NECESSÁRIA',
      cnjCode: '1728',
    });
    expect(detail.subjects).toEqual([
      { label: 'DIREITO ADMINISTRATIVO E OUTRAS MATÉRIAS DE DIREITO PÚBLICO', cnjCode: '9985' },
      { label: 'Intervenção do Estado na Propriedade', cnjCode: '10120' },
      // The site itself truncates this last segment with no closing ")" —
      // captured as observed (see the fixture's header comment).
      { label: 'Desapropriação por Interesse Social para Reforma Agrária', cnjCode: '10124' },
    ]);
    expect(detail.jurisdiction).toBe('TRF5');
    expect(detail.judgingBody).toEqual({
      name: 'Gab VICE-PRESIDÊNCIA',
      collegiateBody: 'Pleno',
      address:
        'Tribunal Regional Federal - 5ª Região, Cais do Apolo, s/n, Recife, RECIFE - PE - CEP: 50030-908',
    });
    expect(detail.referenceProcessNumber).toBe('0123456-78.2026.4.05.8100');
  });
});

describe('parseDetailPage — parties (trf5-adapter spec, party + nested ADVOGADO lawyer)', () => {
  it('extracts active/passive/others parties from the real flat sibling-row structure with name/CPF/role/status and a following lawyer row', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    // The active party is CNPJ-identified (a federal agency), a real data
    // shape PARTY_LINE does not match (disclosed follow-up, apply-progress.md):
    // it falls through with the whole line as name, cpf null, role UNKNOWN.
    expect(detail.parties.active).toEqual([
      {
        name: 'PESSOA JURIDICA SINTETICA UM - CNPJ: 00.000.000/0001-00 (REQUERENTE)',
        cpf: null,
        role: 'UNKNOWN',
        status: 'Ativo',
        lawyers: [],
      },
    ]);
    expect(detail.parties.passive).toEqual([
      {
        name: 'PARTE SINTETICA DOIS',
        cpf: '000.000.000-00',
        role: 'EXECUTADO',
        status: 'Ativo',
        lawyers: [
          {
            name: 'ADVOGADO SINTETICO UM',
            oabNumber: '0000B',
            oabState: 'AL',
            cpf: '000.000.000-01',
          },
        ],
      },
    ]);
    // No `...List` table is rendered at all when the group is empty (real
    // structure — `<div id="...processoParteOutrosInteressadosResumidoDiv">
    // </div>`, no nested table), so selecting it must yield [] rather than throw.
    expect(detail.parties.others).toEqual([]);
  });
});

describe('parseDetailPage — movements (rawCells preserved verbatim, cnjCode null)', () => {
  it('splits the real single-cell "date - description" text and preserves both cells verbatim into rawCells', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    expect(detail.movements).toHaveLength(7);
    expect(detail.movements[0]).toEqual({
      sequence: 1,
      occurredAt: null,
      rawDate: '14/05/2026 14:20:07',
      description: 'Juntada de Petição de petição (outras)',
      cnjCode: null,
      rawCells: ['14/05/2026 14:20:07 - Juntada de Petição de petição (outras)', ''],
    });
    expect(detail.movements[6]).toEqual({
      sequence: 7,
      occurredAt: null,
      rawDate: '10/03/2026 19:13:13',
      description: 'Distribuído por sorteio',
      cnjCode: null,
      rawCells: ['10/03/2026 19:13:13 - Distribuído por sorteio', ''],
    });
  });
});

describe('parseDetailPage — documents (enumeration only; only the legacy idBin-redirect shape)', () => {
  it('enumerates the legacy idBin-redirect document rows with label and ids, skipping the newer documentoSemLoginHTML rows this slice does not fetch', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    // 12 rows on the real page: 4 documentoSemLoginHTML (skipped) + 8 legacy.
    expect(detail.documents).toHaveLength(8);
    expect(detail.documents[0]).toEqual({
      documentId: '6884863',
      binId: '6799913',
      documentHash: 'ca6635b5e2ee62df470430feb7a20bc574c3db40',
      label: expect.stringContaining('Despacho') as string,
      downloadUrl: expect.stringContaining('idProcessoDocumento=6884863') as string,
      fileName: null,
      contentType: null,
      byteLength: null,
      fetchStatus: 'skipped',
    });
    expect(detail.documents.every((doc) => doc.documentId.length > 0)).toBe(true);
  });
});
