import { describe, expect, it } from 'vitest';
import { loadFixtureBytes } from '../__fixtures__/stub-transport.js';
import { parseDetailPage } from './detail-page.js';

describe('parseDetailPage — header (trf5-adapter spec, Full Field Inventory Extraction)', () => {
  it('extracts numero, data distribuicao, classe+CNJ code, assunto hierarchy, jurisdicao, orgaos, endereco, processo referencia', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    expect(detail.processNumber).toBe('0712345-90.2024.4.05.8300');
    expect(detail.filingDate).toBe('01/09/2024');
    expect(detail.caseClass).toEqual({ label: 'APELACAO CIVEL', cnjCode: '198' });
    expect(detail.subjects).toEqual([
      { label: 'DIREITO CIVIL', cnjCode: '899' },
      { label: 'OBRIGACOES', cnjCode: '900' },
      { label: 'ESPECIES DE CONTRATOS', cnjCode: '901' },
    ]);
    expect(detail.jurisdiction).toBe('Recife');
    expect(detail.judgingBody).toEqual({
      name: '3a Vara Federal',
      collegiateBody: 'Terceira Turma',
      address: 'Rua Exemplo 123',
    });
    expect(detail.referenceProcessNumber).toBe('0800000-00.0000.4.05.8000');
  });
});

describe('parseDetailPage — parties (trf5-adapter spec, party + nested ADVOGADO lawyer)', () => {
  it('extracts active/passive/others parties with name/CPF/role/status and nested lawyers', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    expect(detail.parties.active).toEqual([
      {
        name: 'FULANO DA SILVA',
        cpf: '000.000.000-00',
        role: 'APELANTE',
        status: 'Ativo',
        lawyers: [
          {
            name: 'BELTRANO ADVOGADO',
            oabNumber: '00000-X',
            oabState: 'PE',
            cpf: '111.111.111-11',
          },
        ],
      },
    ]);
    expect(detail.parties.passive).toEqual([
      {
        name: 'CICLANO EMPRESA LTDA',
        cpf: '000.000.000-01',
        role: 'APELADO',
        status: 'Citado',
        lawyers: [],
      },
    ]);
    expect(detail.parties.others).toEqual([]);
  });
});

describe('parseDetailPage — movements (rawCells preserved verbatim, cnjCode null)', () => {
  it('preserves each processoEvento row verbatim into rawCells, sequenced, with cnjCode null', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    expect(detail.movements).toEqual([
      {
        sequence: 1,
        occurredAt: null,
        rawDate: '01/09/2024',
        description: 'Distribuicao Processo distribuido por sorteio',
        cnjCode: null,
        rawCells: ['01/09/2024', 'Distribuicao', 'Processo distribuido por sorteio'],
      },
      {
        sequence: 2,
        occurredAt: null,
        rawDate: '05/09/2024',
        description: 'Juntada Peticao juntada aos autos',
        cnjCode: null,
        rawCells: ['05/09/2024', 'Juntada', 'Peticao juntada aos autos'],
      },
    ]);
  });
});

describe('parseDetailPage — documents (enumeration only; fetch lands in S4b)', () => {
  it('enumerates document rows with label and ids', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    expect(detail.documents).toEqual([
      {
        documentId: '12452664',
        binId: '12196564',
        documentHash: 'sha1hash0001',
        label: 'Despacho',
        downloadUrl: expect.stringContaining('idProcessoDocumento=12452664') as string,
        fileName: null,
        contentType: null,
        byteLength: null,
        fetchStatus: 'skipped',
      },
      {
        documentId: '12452668',
        binId: '12196568',
        documentHash: 'sha1hash0002',
        label: 'Decisao',
        downloadUrl: expect.stringContaining('idProcessoDocumento=12452668') as string,
        fileName: null,
        contentType: null,
        byteLength: null,
        fetchStatus: 'skipped',
      },
    ]);
  });
});
