import { describe, expect, it } from 'vitest';
import type { HttpResponse } from '../../engine/ports.js';
import type { WorkUnit } from '../../engine/types.js';
import { fixtureResponse, loadFixtureBytes, StubTransport } from './__fixtures__/stub-transport.js';
import { parseDetailPage, type DocumentRow } from './parsing/detail-page.js';
import { assembleTrfPayload, type TrfPayload } from './schemas/payload.js';
import { NameHarvester } from './name-probes.js';
import { identityKeyName, resultPageCap, TRF5Site } from './site.js';
import type { TraversalCursor } from './traversal.js';

const PRIMING_URL = 'stub://pjeconsulta/ConsultaPublica/listView.seam';

function unit(overrides: Partial<WorkUnit<TraversalCursor>> = {}): WorkUnit<TraversalCursor> {
  return {
    unitKey: '2026-09-01..2026-09-01',
    windowKey: '2026-09-01..2026-09-01',
    facetValue: null,
    label: '2026-09-01..2026-09-01',
    cursor: { dateFrom: '2026-09-01', dateTo: '2026-09-01' },
    ...overrides,
  };
}

function documentRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    documentKind: 'legacy',
    documentId: '12452668',
    binId: '12196568',
    documentHash: 'sha1hash0002',
    label: 'Decisao',
    downloadUrl:
      '/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam' +
      '?idBin=12196568&numeroDocumento=sha1hash0002&nomeArqProcDocBin=Decisao' +
      '&idProcessoDocumento=12452668&actionMethod=x',
    fileName: null,
    contentType: null,
    byteLength: null,
    fetchStatus: 'skipped',
    ...overrides,
  };
}

function redirectResponse(location: string): HttpResponse {
  return { status: 302, headers: { location }, body: new Uint8Array() };
}

function pdfResponse(): HttpResponse {
  return {
    status: 200,
    headers: { 'content-type': 'application/pdf', 'content-disposition': 'filename="Decisao"' },
    body: loadFixtureBytes('document-sample.pdf'),
  };
}

/**
 * Builds a search-response fragment with `rows` distinct process rows, in the
 * shape a captured response actually has (see `__fixtures__/search-ok.xml`):
 * `tr.rich-table-row`, the same `ca` repeated across two `openPopUp(...)`
 * handlers, and the process number inside `<b class="btn-block">` between a class
 * abbreviation and the subject. The earlier version of this helper generated
 * `a.processo-linha` inside a bare table — markup that exists nowhere on the real
 * portal — so these tests passed against a parser that harvested nothing live.
 */
function searchFragment(rows: number): HttpResponse {
  const anchors = Array.from({ length: rows }, (_, i) => {
    const seq = String(i + 1).padStart(7, '0');
    const ca = `stubca${String(i + 1).padStart(4, '0')}`;
    const popup =
      `openPopUp('Consulta publica', ` +
      `'/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam?ca=${ca}')`;
    return (
      `<tr class="rich-table-row">` +
      `<td class="rich-table-cell"><a title="Ver Detalhes" onclick="${popup}"></a></td>` +
      `<td class="rich-table-cell">APELACAO <a onclick="${popup}">` +
      `<b class="btn-block">Ap ${seq}-00.2026.4.05.8300 - Assunto Sintetico</b></a>` +
      ` PARTE UM X PARTE DOIS</td>` +
      `<td class="rich-table-cell">Juntada de Peticao (14/05/2026 14:20:07)</td>` +
      `</tr>`
    );
  }).join('\n');
  const xml =
    '<?xml version="1.0" encoding="ISO-8859-1"?>\n' +
    `<html><body><div id="fPP:processosGridPanel"><table class="rich-table">` +
    `<tbody id="fPP:processosTable:tb">${anchors}</tbody></table></div></body></html>`;
  return {
    status: 200,
    headers: { 'content-type': 'text/xml' },
    body: new TextEncoder().encode(xml),
  };
}

describe('TRF5 declared SitePort constants (trf5-adapter spec)', () => {
  it('declares a result-page cap of 30', () => {
    expect(resultPageCap).toBe(30);
  });

  it('declares processNumber as the item identity key', () => {
    expect(identityKeyName).toBe('processNumber');
  });
});

describe('TRF5Site.discover — composes session priming, search, row parsing and detail fetch', () => {
  it('returns one item per parsed row, with resultCount set from the observed row count', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'), // ensureSession primes
      fixtureResponse(200, 'text/xml', 'search-ok.xml'), // search: 3 rows
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'), // row 1 detail
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'), // row 2 detail
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'), // row 3 detail
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    const outcome = await site.discover(unit());

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.value.count).toBe(3);
    expect(outcome.value.items).toHaveLength(3);
    const item = outcome.value.items[0]!;
    expect(item.processNumber).toBe('0123456-78.2026.4.05.8100');
    // Every document -- legacy and born-digital alike -- now reaches the
    // engine's fetch loop (S5j): `documents.ts`'s `fetchDocument` dispatches
    // on `documentKind` and handles both, so the S5h filter that kept
    // born-digital rows out (when they had no fetch path at all) is dropped.
    expect(outcome.value.documentsByItemId.get(item.processNumber)).toEqual(item.documents);
    expect(
      item.documents.filter((doc) => doc.documentKind === 'bornDigital').length,
    ).toBeGreaterThan(0);
    // Detail fetches reuse the already-primed session -- no extra priming GET per row.
    expect(transport.requests.filter((r) => r.url === PRIMING_URL)).toHaveLength(1);
  });

  it('reports a saturated fragment (rows === resultPageCap) truthfully, never silently truncated', async () => {
    const detailResponses = Array.from({ length: resultPageCap }, () =>
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'),
    );
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      searchFragment(resultPageCap),
      ...detailResponses,
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    const outcome = await site.discover(unit());

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.value.count).toBe(resultPageCap);
    expect(outcome.value.items).toHaveLength(resultPageCap);
  });
});

describe('TRF5Site.discover — D12 site-agnostic failure vocabulary (trf5-adapter spec, Content-Based Validity Chain)', () => {
  it('maps a persistently expired session to sessionExpired, never a bare status code', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      fixtureResponse(200, 'text/xml', 'session-expired.xml'), // search #1: expired
      fixtureResponse(200, 'text/html', 'priming-page-2.html'), // search.ts's internal reprime
      fixtureResponse(200, 'text/xml', 'session-expired.xml'), // replay #2: still expired
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    const outcome = await site.discover(unit());

    expect(outcome).toEqual({ kind: 'sessionExpired' });
  });

  it('maps a host-defect search response to hostDefect, never inventing a permanentError', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      fixtureResponse(200, 'text/html', 'host-defect.html'),
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    const outcome = await site.discover(unit());

    expect(outcome.kind).toBe('hostDefect');
  });

  it('propagates a per-row detail-fetch failure as the already-classified outcome, never re-inventing one', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      searchFragment(1),
      fixtureResponse(200, 'text/html', 'detail-page-invalid-token.html'),
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    const outcome = await site.discover(unit());

    expect(outcome).toEqual({
      kind: 'permanentError',
      reason: 'invalidReference',
      detail: 'invalidTokenShell',
    });
  });
});

describe('TRF5Site.discover — 429 precedence over content classification (S5g, core-resilience-policy)', () => {
  it('classifies a stubbed 429 search response as transient before the validity chain runs, never as an empty result set', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      { status: 429, headers: { 'retry-after': '5' }, body: new Uint8Array() },
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    const outcome = await site.discover(unit());

    // Without the transport-boundary check, this 429's empty body parses as a
    // genuine zero-row result (`parseResultFragment` never throws on an empty
    // fragment) — a silent false "ok" is exactly the defect this task closes.
    expect(outcome).toEqual({ kind: 'transient', status: 429, retryAfterMs: 5000 });
  });
});

describe('TRF5Site.discover — frontier seed search (core-frontier-crawl, "Seed Harvesting and Prioritization")', () => {
  it('sends the seed CPF as documentoParte when the cursor carries one, alongside the mandatory date range', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      searchFragment(0),
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    await site.discover(
      unit({ cursor: { dateFrom: '2026-09-01', dateTo: '2026-09-01', seedCpf: '000.000.000-00' } }),
    );

    const searchRequest = transport.requests[1];
    expect(searchRequest?.body).toContain(encodeURIComponent('000.000.000-00'));
  });

  it('omits documentoParte entirely for an ordinary phase-1 unit (no seedCpf on the cursor)', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      searchFragment(0),
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    await site.discover(unit());

    const searchRequest = transport.requests[1];
    // documentoParte is still present, as every documented field must be on
    // every POST (S3, "Complete Search Form Field Set") — just empty.
    expect(searchRequest?.body).not.toContain(encodeURIComponent('000.000.000-00'));
  });
});

describe('TRF5Site.discover — name-substring partition level (trf5-adapter spec, "Discover applies the cursor\'s name probe to nomeParte")', () => {
  it("sends the cursor's name probe as nomeParte, alongside the mandatory date range and class", async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      searchFragment(0),
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    await site.discover(
      unit({
        facetValue: 'APELACAO CIVEL',
        cursor: { dateFrom: '2026-09-03', dateTo: '2026-09-03', nameProbe: 'DA SILVA' },
      }),
    );

    const searchRequest = transport.requests[1];
    // URLSearchParams.toString() encodes spaces as "+", not "%20".
    expect(searchRequest?.body).toContain('nomeParte=DA+SILVA');
    expect(searchRequest?.body).toContain('classeJudicial=APELACAO+CIVEL');
  });

  it('omits nomeParte entirely for a unit whose cursor carries no name probe', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      searchFragment(0),
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    await site.discover(unit());

    const searchRequest = transport.requests[1];
    expect(searchRequest?.body).toContain('nomeParte=&');
  });
});

describe('TRF5Site.discover — adaptive name-probe harvesting (trf5-adapter spec, "Adaptive Name-Probe Extension")', () => {
  it('harvests party names from parsed rows into the shared harvester, issuing no extra request', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'),
      searchFragment(1),
      fixtureResponse(200, 'text/html', 'detail-page-valid.html'),
    ]);
    const harvester = new NameHarvester();
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL, harvester });

    await site.discover(unit());

    // searchFragment(1)'s own row text ends with " PARTE UM X PARTE DOIS".
    expect(harvester.ranked()).toEqual(expect.arrayContaining(['PARTE UM', 'PARTE DOIS']));
    expect(transport.requests).toHaveLength(3); // priming + search + 1 detail — no extra request
  });
});

describe('TRF5Site.fetchDocument — composes the existing documents.ts fetch/decode path', () => {
  it('follows the 302 redirect and returns the fetched bytes', async () => {
    const transport = new StubTransport([
      redirectResponse(
        '/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam?idBin=1',
      ),
      pdfResponse(),
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    const outcome = await site.fetchDocument(
      { processNumber: '0712345-90.2024.4.05.8300' } as unknown as TrfPayload,
      documentRow(),
    );

    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.value.fileName).toBe('0712345-90.2024.4.05.8300/12452668-decisao.pdf');
    expect(outcome.value.bytes.byteLength).toBeGreaterThan(0);
  });
});

describe('TRF5Site.withDocumentOutcome — writes the real fetch outcome back onto the payload (task 5i.1/5i.2/5i.13)', () => {
  it("updates only the matching document's fetchStatus/byteLength/fileName, and recomputes documentsGrid by fetch outcome, never by documentKind", () => {
    const detail = parseDetailPage(loadFixtureBytes('detail-page-valid.html'));
    const payload = assembleTrfPayload(detail, 'stub://source');
    if (!payload) throw new Error('fixture failed schema validation');
    const site = new TRF5Site({ transport: new StubTransport([]), primingUrl: PRIMING_URL });
    const target = payload.documents[0]!;

    const updated = site.withDocumentOutcome(payload, target, {
      fetchStatus: 'fetched',
      byteLength: 4321,
      fileName: `${payload.processNumber}/${target.documentId}.pdf`,
      contentType: 'application/pdf',
    });

    const updatedDoc = updated.documents.find((d) => d.documentId === target.documentId);
    expect(updatedDoc).toMatchObject({
      fetchStatus: 'fetched',
      byteLength: 4321,
      fileName: `${payload.processNumber}/${target.documentId}.pdf`,
      // The server's own declared Content-Type, captured by `documents.ts` and
      // carried through to the payload — never a substitute for the magic-byte
      // check that decided the fetch succeeded, only a record of what the host
      // claimed it was sending.
      contentType: 'application/pdf',
    });
    // Every other document is untouched.
    const others = updated.documents.filter((d) => d.documentId !== target.documentId);
    expect(others).toEqual(payload.documents.filter((d) => d.documentId !== target.documentId));
    // documentsGrid recomputed by fetchStatus (task 5i.13): exactly one
    // document now reads 'fetched', regardless of its documentKind.
    expect(updated.documentsGrid).toEqual({
      declaredTotal: payload.documentsGrid.declaredTotal,
      extractedCount: 1,
      skippedCount: payload.documents.length - 1,
      reportedGap: payload.documentsGrid.reportedGap,
    });
  });
});

describe("TRF5Site.reprimeSession — re-primes without replaying the caller's request", () => {
  it('issues exactly one priming GET and leaves discover to make its own next request', async () => {
    const transport = new StubTransport([
      fixtureResponse(200, 'text/html', 'priming-page-1.html'), // reprimeSession's own GET
      searchFragment(0), // discover()'s own search, reusing the reprimed session
    ]);
    const site = new TRF5Site({ transport, primingUrl: PRIMING_URL });

    await site.reprimeSession();
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.url).toBe(PRIMING_URL);

    const outcome = await site.discover(unit());
    expect(outcome.kind).toBe('ok');
    // No second priming GET: discover() reused the session reprimeSession() already set.
    expect(transport.requests.filter((r) => r.url === PRIMING_URL)).toHaveLength(1);
  });
});
