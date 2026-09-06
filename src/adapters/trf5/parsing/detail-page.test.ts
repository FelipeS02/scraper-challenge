import { describe, expect, it } from 'vitest';
import { loadFixtureBytes } from '../__fixtures__/stub-transport.js';
import {
  extractDocumentGridPager,
  parseDetailPage,
  parseDocumentGridPage,
  parseOccurredAt,
  summarizeDocumentsGrid,
} from './detail-page.js';

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

describe('parseDetailPage — movements (rawCells preserved verbatim, cnjCode null, occurredAt parsed)', () => {
  it('splits the real single-cell "date - description" text, preserves both cells verbatim into rawCells, and parses occurredAt from rawDate (task 5i.3/5i.4 — these two assertions previously encoded the hardcoded-null defect)', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    expect(detail.movements).toHaveLength(7);
    expect(detail.movements[0]).toEqual({
      sequence: 1,
      // 14:20:07 America/Recife (UTC-03:00, design.md's amended paragraph) -> 17:20:07Z.
      occurredAt: '2026-05-14T17:20:07.000Z',
      rawDate: '14/05/2026 14:20:07',
      description: 'Juntada de Petição de petição (outras)',
      cnjCode: null,
      rawCells: ['14/05/2026 14:20:07 - Juntada de Petição de petição (outras)', ''],
    });
    expect(detail.movements[6]).toEqual({
      sequence: 7,
      // 19:13:13 America/Recife (UTC-03:00) -> 22:13:13Z.
      occurredAt: '2026-03-10T22:13:13.000Z',
      rawDate: '10/03/2026 19:13:13',
      description: 'Distribuído por sorteio',
      cnjCode: null,
      rawCells: ['10/03/2026 19:13:13 - Distribuído por sorteio', ''],
    });
  });
});

describe('parseOccurredAt — timezone handling is explicit, never the runner local zone (design.md, task 5i.4)', () => {
  it('parses dd/MM/yyyy HH:mm:ss as America/Recife (fixed UTC-03:00, no DST) into a UTC ISO instant', () => {
    expect(parseOccurredAt('14/05/2026 14:20:07')).toBe('2026-05-14T17:20:07.000Z');
  });

  it('stays null when rawDate itself is absent', () => {
    expect(parseOccurredAt(null)).toBeNull();
  });

  it('stays null when rawDate does not match the exact dd/MM/yyyy HH:mm:ss shape, rather than guessing', () => {
    expect(parseOccurredAt('not a date')).toBeNull();
    expect(parseOccurredAt('14/05/2026')).toBeNull();
  });
});

describe('parseDetailPage — documents (legacy idBin-redirect rows, plus born-digital rows S5h stops dropping)', () => {
  it('enumerates the legacy idBin-redirect document rows with label and ids', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    // 12 rows on the real page: 4 documentoSemLoginHTML (born-digital, now
    // extracted too, S5h) + 8 legacy.
    const legacy = detail.documents.filter((doc) => doc.documentKind === 'legacy');
    expect(legacy).toHaveLength(8);
    expect(legacy[0]).toEqual({
      documentKind: 'legacy',
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

  it('extracts born-digital rows (documentoSemLoginHTML.seam, no idBin= anchor) with their identifier and a distinct outcome, never dropping them (D14, task 5h.4)', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    const bornDigital = detail.documents.filter((doc) => doc.documentKind === 'bornDigital');
    expect(bornDigital).toHaveLength(4);
    for (const doc of bornDigital) {
      expect(doc.documentId.length).toBeGreaterThan(0);
      expect(doc.binId).toBeNull();
      // 'skipped' is honest here at parse time: the real fetch outcome is
      // written back only from engine/scraper.ts, deferred to S5i -- but the
      // row is never invisible, which is the whole point (a shortfall
      // against the declared total is now attributable).
      expect(doc.fetchStatus).toBe('skipped');
    }
    expect(detail.documents).toHaveLength(12);
  });

  it("extracts the viewer URL into downloadUrl for a born-digital row, the entry point S5j's two-step fetch needs (design.md D14)", () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    const bornDigital = detail.documents.filter((doc) => doc.documentKind === 'bornDigital');
    for (const doc of bornDigital) {
      expect(doc.downloadUrl).toContain('documentoSemLoginHTML.seam');
      expect(doc.downloadUrl).toContain(`idProcessoDoc=${doc.documentId}`);
    }
  });

  it('strips the anchor’s screen-reader-only "Visualizar documentos" prefix from a born-digital label, structurally (task 5i.14) — leaving the real descriptive date/type text a slug can use', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));

    const bornDigital = detail.documents.filter((doc) => doc.documentKind === 'bornDigital');
    for (const doc of bornDigital) {
      expect(doc.label).not.toContain('Visualizar documentos');
      // Every real captured born-digital label in this fixture has the same
      // "dd/mm/yyyy hh:mm:ss - Despacho (Despacho)" shape once the sr-only
      // prefix is gone.
      expect(doc.label).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} - Despacho \(Despacho\)$/);
    }
  });
});

describe('parseDetailPage — documents grid declared total (task 5h.2/5h.3, design.md D13)', () => {
  it('reads the declared total from the grid’s own footer, matched by id suffix never a hardcoded prefix', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));
    expect(detail.documentsGrid.declaredTotal).toBe(12);
  });

  it('reads 24 for the real paginated capture, from page 1 alone (reconciliation across pages is detail.ts’s job, not parsing’s)', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-paginated-documents.html'));
    expect(detail.documentsGrid.declaredTotal).toBe(24);
    // Page 1 alone: 14 legacy + 1 born-digital = 15 rows read, short of the
    // declared 24 by the 9 rows that live on page 2 -- this is the exact gap
    // S5h's pager-following in detail.ts closes; parsing one page can never
    // see it. extractedCount/skippedCount now split by fetchStatus (task
    // 5i.13), and nothing has been fetched yet at parse time, so every row
    // reads 'skipped' here -- reportedGap (the real pagination-completeness
    // signal) is unaffected: it is a plain declaredTotal-minus-rows-read
    // subtraction, never derived from the extracted/skipped split.
    expect(detail.documentsGrid.extractedCount).toBe(0);
    expect(detail.documentsGrid.skippedCount).toBe(15);
    expect(detail.documentsGrid.reportedGap).toBe(9);
  });

  it('reports zero declared and zero extracted when the grid renders no rows at all', () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid-no-documents.html'));
    expect(detail.documentsGrid).toEqual({
      declaredTotal: 0,
      extractedCount: 0,
      skippedCount: 0,
      reportedGap: 0,
    });
  });
});

describe('summarizeDocumentsGrid — reconciliation arithmetic (task 5h.7, corrected by fetchStatus in task 5i.13)', () => {
  it('reports zero gap when extracted + skipped equals the declared total, split by fetchStatus rather than documentKind', () => {
    // Two fetched (regardless of kind) + one not-yet-fetched: the fix this
    // slice exists for is that a fetched bornDigital document must count as
    // extracted, not skipped, exactly like a fetched legacy one.
    const documents = [
      { fetchStatus: 'fetched' } as never,
      { fetchStatus: 'fetched' } as never,
      { fetchStatus: 'skipped' } as never,
    ];
    expect(summarizeDocumentsGrid(documents, 3)).toEqual({
      declaredTotal: 3,
      extractedCount: 2,
      skippedCount: 1,
      reportedGap: 0,
    });
  });

  it('reports a positive gap as a shortfall, never inferred away, when fewer rows were read than declared', () => {
    const documents = [{ fetchStatus: 'skipped' } as never];
    expect(summarizeDocumentsGrid(documents, 5)).toEqual({
      declaredTotal: 5,
      extractedCount: 0,
      skippedCount: 1,
      reportedGap: 4,
    });
  });

  it('counts a failed fetch as not-extracted, the same as a never-attempted one', () => {
    const documents = [{ fetchStatus: 'fetched' } as never, { fetchStatus: 'failed' } as never];
    expect(summarizeDocumentsGrid(documents, 2)).toEqual({
      declaredTotal: 2,
      extractedCount: 1,
      skippedCount: 1,
      reportedGap: 0,
    });
  });
});

describe('extractDocumentGridPager — harvests the pagination widget’s own submit contract (task 5h.5, design.md D13)', () => {
  it('returns null for a single-page grid with no scroller at all (task 5h.8’s guard fixture)', () => {
    const pager = extractDocumentGridPager(loadFixtureBytes('detail-page-valid.html'));
    expect(pager).toBeNull();
  });

  it('harvests the real documents-grid pager — a rich:inputNumberSlider, never a guessed parameter name', () => {
    const pager = extractDocumentGridPager(
      loadFixtureBytes('detail-page-paginated-documents.html'),
    );

    expect(pager).not.toBeNull();
    if (!pager) return;
    expect(pager.formId).toBe('j_id146:j_id653');
    expect(pager.pageFieldName).toBe('j_id146:j_id653:j_id654');
    expect(pager.triggerParam).toBe('j_id146:j_id653:j_id655');
    expect(pager.totalPages).toBe(2);
    // Every hidden field the harvested form itself declares -- never
    // hand-picked -- round-trips, including the slider's own current value
    // and the ViewState the site's own markup carries.
    expect(pager.hiddenFields.get('j_id146:j_id653')).toBe('j_id146:j_id653');
    expect(pager.hiddenFields.get('autoScroll')).toBe('');
    expect(pager.hiddenFields.get('javax.faces.ViewState')).toBe('j_id2');
  });
});

describe('parseDocumentGridPage — parses a further pager page’s own AJAX response (task 5h.6)', () => {
  it('extracts the 9 legacy rows from the real captured page-2 response, decoded per its own declared UTF-8 charset', () => {
    const rows = parseDocumentGridPage(
      loadFixtureBytes('detail-page-paginated-documents-page2.xml'),
      'text/xml;charset=UTF-8',
    );
    expect(rows).toHaveLength(9);
    expect(rows.every((row) => row.documentKind === 'legacy')).toBe(true);
    // A UTF-8 mis-decode (e.g. as latin1) would mangle this accented label
    // into mojibake instead of a clean match.
    expect(rows.some((row) => row.label.includes('Decisão'))).toBe(true);
  });
});
