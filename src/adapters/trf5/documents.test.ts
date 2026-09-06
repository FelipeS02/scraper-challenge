import { describe, expect, it } from 'vitest';
import type { HttpResponse } from '../../engine/ports.js';
import { loadFixtureBytes, StubTransport } from './__fixtures__/stub-transport.js';
import { buildDocumentPath, fetchDocument } from './documents.js';
import type { DocumentRow } from './parsing/detail-page.js';

const PROCESS_NUMBER = '0123456-78.2026.4.05.8100';

function documentRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    documentKind: 'legacy',
    documentId: '12452668',
    binId: '12196568',
    documentHash: 'sha1hash0002',
    label: 'Decisão',
    downloadUrl:
      '/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam' +
      '?idBin=12196568&numeroDocumento=sha1hash0002&nomeArqProcDocBin=Decis%E3o' +
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

describe('buildDocumentPath — Stable Document Filename Derivation (trf5-adapter spec, amended)', () => {
  it('derives a human-navigable path from processNumber + idProcessoDocumento, with a decorative slug', () => {
    const path = buildDocumentPath(PROCESS_NUMBER, '12452668', 'Decisão');
    expect(path).toBe(`${PROCESS_NUMBER}/12452668-decisao.pdf`);
  });

  it('gives three same-labeled documents three distinct paths, keyed only on idProcessoDocumento', () => {
    const paths = ['12452664', '12452668', '12452669'].map((documentId) =>
      buildDocumentPath(PROCESS_NUMBER, documentId, 'Decisão'),
    );
    expect(new Set(paths).size).toBe(3);
  });

  it('discards a hostile label and degrades to <processNumber>/<idProcessoDocumento>.pdf', () => {
    const path = buildDocumentPath(PROCESS_NUMBER, '12452668', '../../etc/passwd');
    expect(path).toBe(`${PROCESS_NUMBER}/12452668.pdf`);
  });

  it('discards an empty label and degrades the same way', () => {
    const path = buildDocumentPath(PROCESS_NUMBER, '12452668', '');
    expect(path).toBe(`${PROCESS_NUMBER}/12452668.pdf`);
  });

  it('discards an unrepresentable (non-ASCII-after-folding) label the same way', () => {
    const path = buildDocumentPath(PROCESS_NUMBER, '12452668', '判決書');
    expect(path).toBe(`${PROCESS_NUMBER}/12452668.pdf`);
  });

  it('derives the identical path across repeated calls — there is no session token input at all', () => {
    // The strongest form of "stable across a later session with a different ca"
    // is that ca is not a parameter of this function in the first place.
    const first = buildDocumentPath(PROCESS_NUMBER, '12452668', 'Decisão');
    const second = buildDocumentPath(PROCESS_NUMBER, '12452668', 'Decisão');
    expect(first).toBe(second);
  });

  it('rejects processNumber or documentId components outside [A-Za-z0-9._-]', () => {
    expect(() => buildDocumentPath('../escape', '12452668', 'Decisão')).toThrow();
    expect(() => buildDocumentPath(PROCESS_NUMBER, '../../etc/passwd', 'Decisão')).toThrow();
  });

  it('folds every accented character the site actually emits to its ASCII base, never dropping the base letter', () => {
    // Covers the full documented accent set (lower- and uppercase) rather than
    // relying on 'Decisão' alone, which only exercises ã/ç indirectly.
    const path = buildDocumentPath(PROCESS_NUMBER, '12452668', 'áéíóúâêîôûãõñçÁÉÍÓÚÂÊÎÔÛÃÕÑÇ');
    expect(path).toBe(`${PROCESS_NUMBER}/12452668-aeiouaeiouaoncaeiouaeiouaonc.pdf`);
  });

  it('folds Petição to peticao, matching the site’s own accented labels', () => {
    const path = buildDocumentPath(PROCESS_NUMBER, '12452668', 'Petição');
    expect(path).toBe(`${PROCESS_NUMBER}/12452668-peticao.pdf`);
  });

  it('keeps a descriptive slug for a label containing a slash, instead of collapsing to a bare id (task 5i.5/5i.6)', () => {
    // A real observed judging-body label shape ("2ª VARA/CE") — an ordinary
    // label, not a hostile one, per the trf5-adapter spec's own distinction.
    const path = buildDocumentPath(PROCESS_NUMBER, '12452668', '2ª VARA/CE');
    expect(path).toBe(`${PROCESS_NUMBER}/12452668-2-vara-ce.pdf`);
  });

  it('produces a date-ordered, type-bearing slug from a real document-list label shape, truncated to MAX_SLUG_LENGTH', () => {
    const label =
      '13/05/2025 07:29:53 - Despacho Inspeção - 2068 - INSPEÇÃO ORDINÁRIA 2025 - 2ª VARA/CE';
    const path = buildDocumentPath(PROCESS_NUMBER, '12452668', label);
    // The date, time, and document type ("despacho") all survive within the
    // first 60 characters — the tail (the judging-body detail) is truncated,
    // never the identifying id, which is prepended separately.
    expect(path).toBe(
      `${PROCESS_NUMBER}/12452668-13-05-2025-07-29-53-despacho-inspecao-2068-inspecao-ordinari.pdf`,
    );
  });

  it('still discards a hostile label containing ".." even after per-character sanitization (task 5i.5 regression guard)', () => {
    // The existing "../../etc/passwd" test above already proves this via
    // buildDocumentPath; this one proves the same for a label whose hostile
    // segment is not at the very start, so a naive edge-trim could not mask it.
    const path = buildDocumentPath(PROCESS_NUMBER, '12452668', 'foo/../../bar');
    expect(path).toBe(`${PROCESS_NUMBER}/12452668.pdf`);
  });
});

function bornDigitalRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return documentRow({
    documentKind: 'bornDigital',
    binId: null,
    documentHash: null,
    label: 'Despacho',
    downloadUrl:
      'https://pjett.trf5.jus.br/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/' +
      'documentoSemLoginHTML.seam?ca=stubca0001&idProcessoDoc=6884889',
    ...overrides,
  });
}

function viewerResponse(): HttpResponse {
  return {
    status: 200,
    headers: { 'content-type': 'text/html;charset=ISO-8859-1' },
    body: loadFixtureBytes('document-viewer-born-digital.html'),
  };
}

/** A real captured `errorUnexpected.seam` page, returned with status 200 -- exactly
 * the "200 for most failures" shape task 5j.5 exists to catch. Captured when a
 * diagnostic script dropped `idProcessoDoc` from the viewer GET, so the Seam
 * conversation was incomplete; the shape is genuine and is what this branch must
 * reject, whatever provoked it. The success path is proven live: see
 * apply-progress.md's "S5j" section. */
function hostDefectResponse(): HttpResponse {
  return {
    status: 200,
    headers: { 'content-type': 'text/html;charset=ISO-8859-1' },
    body: loadFixtureBytes('document-viewer-gerar-pdf-host-defect.html'),
  };
}

describe('fetchDocument — born-digital rows have no legacy download path when the viewer URL itself is missing (design.md D14, defensive guard)', () => {
  it('returns a permanentError:invalidReference without ever calling the transport', async () => {
    const transport = new StubTransport([]);
    const doc = documentRow({
      documentKind: 'bornDigital',
      binId: null,
      downloadUrl: null,
    });

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, doc);

    expect(outcome.kind).toBe('permanentError');
    expect(transport.requests).toHaveLength(0);
  });
});

describe('fetchDocument — born-digital two-step viewer-then-PDF flow (design.md D14, task 5j.4)', () => {
  it('GETs the viewer, harvests the Gerar PDF contract, POSTs it, and returns the same StoredDocument shape the legacy path returns', async () => {
    const transport = new StubTransport([
      viewerResponse(),
      redirectResponse('stub://pjeconsulta/documentos/bornDigital/6799939'),
      pdfResponse(),
    ]);
    const doc = bornDigitalRow();

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, doc);

    expect(transport.requests).toHaveLength(3);
    expect(transport.requests[0]?.method).toBe('GET');
    expect(transport.requests[0]?.url).toBe(doc.downloadUrl);
    expect(transport.requests[1]?.method).toBe('POST');
    expect(transport.requests[1]?.url).toBe(
      'https://pjett.trf5.jus.br/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/documentoSemLoginHTML.seam',
    );
    const postedBody = String(transport.requests[1]?.body ?? '');
    expect(postedBody).toContain('j_id42%3AdownloadPDF=j_id42%3AdownloadPDF');
    expect(postedBody).toContain('ca=');
    expect(postedBody).toContain('idProcDocBin=6799939');
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.value.documentId).toBe(doc.documentId);
      expect(outcome.value.fileName).toBe(`${PROCESS_NUMBER}/${doc.documentId}-despacho.pdf`);
      expect(outcome.value.byteLength).toBeGreaterThan(0);
    }
  });

  it('POSTs directly to a 200 PDF response with no redirect at all, never assuming a 302 is mandatory', async () => {
    const transport = new StubTransport([viewerResponse(), pdfResponse()]);

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, bornDigitalRow());

    expect(transport.requests).toHaveLength(2);
    expect(outcome.kind).toBe('ok');
  });

  it('classifies a real observed host response (a viewer/error page instead of a PDF) as a failure, never as ok -- verified by content, never by status alone (task 5j.5, docs/RESEARCH.md §5)', async () => {
    const transport = new StubTransport([viewerResponse(), hostDefectResponse()]);

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, bornDigitalRow());

    expect(outcome.kind).not.toBe('ok');
    expect(transport.requests).toHaveLength(2);
  });

  it('ledgers a born-digital fetch failure as a FetchOutcome instead of throwing, so the already-extracted item is not discarded (S4b precedent)', async () => {
    const transport = new StubTransport([viewerResponse(), hostDefectResponse()]);

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, bornDigitalRow());

    expect(['hostDefect', 'permanentError', 'transient']).toContain(outcome.kind);
  });

  it('classifies a 429 on the viewer GET as transient, before ever attempting the PDF harvest (S5g precedence)', async () => {
    const transport = new StubTransport([
      { status: 429, headers: { 'retry-after': '3' }, body: new Uint8Array() },
    ]);

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, bornDigitalRow());

    expect(outcome).toEqual({ kind: 'transient', status: 429, retryAfterMs: 3000 });
    expect(transport.requests).toHaveLength(1);
  });

  it('classifies an unrecognized viewer response (missing the Gerar PDF contract entirely) as a hostDefect, never throwing', async () => {
    const transport = new StubTransport([
      { status: 200, headers: { 'content-type': 'text/html' }, body: new Uint8Array() },
    ]);

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, bornDigitalRow());

    expect(outcome.kind).toBe('hostDefect');
  });
});

describe('fetchDocument — 429 precedence over the 404/302 status checks (S5g, core-resilience-policy)', () => {
  it('classifies a stubbed 429 on the document link as transient, never as a hostDefect', async () => {
    const transport = new StubTransport([
      { status: 429, headers: { 'retry-after': '7' }, body: new Uint8Array() },
    ]);

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, documentRow());

    // Without the transport-boundary check, a status that is neither 404 nor
    // 302 falls into the existing catch-all `hostDefect` branch — a bounded
    // per-worker retry, never the global cooldown a real rate limit needs.
    expect(outcome).toEqual({ kind: 'transient', status: 429, retryAfterMs: 7000 });
  });
});

describe('fetchDocument — 302-follow (trf5-adapter spec, Document Byte-Level ISO-8859-1 Decoding)', () => {
  it('follows the 302 redirect and returns the fetched document under a stable, id-derived path', async () => {
    const transport = new StubTransport([
      redirectResponse('stub://pjeconsulta/documentos/bin/12196568'),
      pdfResponse(),
    ]);

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, documentRow());

    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[0]?.url).toContain('idProcessoDocumento=12452668');
    expect(transport.requests[1]?.url).toBe('stub://pjeconsulta/documentos/bin/12196568');
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.value.documentId).toBe('12452668');
      expect(outcome.value.fileName).toBe(`${PROCESS_NUMBER}/12452668-decisao.pdf`);
      expect(outcome.value.contentType).toBe('application/pdf');
      expect(outcome.value.byteLength).toBeGreaterThan(0);
      expect(outcome.value.bytes.byteLength).toBe(outcome.value.byteLength);
    }
  });

  it('stores three same-labeled Decisão documents with three distinct paths end to end', async () => {
    const docs = ['12452668', '12452669', '12452680'].map((documentId) =>
      documentRow({ documentId, binId: `bin-${documentId}`, label: 'Decisão' }),
    );
    const transport = new StubTransport(
      docs.flatMap((doc) => [
        redirectResponse(`stub://pjeconsulta/documentos/${doc.binId}`),
        pdfResponse(),
      ]),
    );

    const fileNames: string[] = [];
    for (const doc of docs) {
      const outcome = await fetchDocument(transport, PROCESS_NUMBER, doc);
      expect(outcome.kind).toBe('ok');
      if (outcome.kind === 'ok') fileNames.push(outcome.value.fileName!);
    }

    expect(new Set(fileNames).size).toBe(3);
  });

  it('maps a 404 on the document link to a permanent notFound outcome, never throwing, with detail null (design.md D12)', async () => {
    const transport = new StubTransport([{ status: 404, headers: {}, body: new Uint8Array() }]);

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, documentRow());

    expect(outcome).toEqual({ kind: 'permanentError', reason: 'notFound', detail: null });
  });

  it('maps an unsafe processNumber component to permanentError:schemaMismatch with detail null (design.md D12)', async () => {
    const transport = new StubTransport([
      redirectResponse('stub://pjeconsulta/documentos/bin/12196568'),
      pdfResponse(),
    ]);

    const outcome = await fetchDocument(transport, '../../etc/passwd', documentRow());

    expect(outcome).toEqual({ kind: 'permanentError', reason: 'schemaMismatch', detail: null });
  });

  it('ledgers an unexpected status as a hostDefect FetchOutcome instead of throwing, so the already-extracted item is not discarded', async () => {
    const transport = new StubTransport([{ status: 500, headers: {}, body: new Uint8Array() }]);

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, documentRow());

    expect(outcome.kind).toBe('hostDefect');
    if (outcome.kind === 'hostDefect') {
      // The byte-level decoded label appears in the reason, proving nomeArqProcDocBin was
      // read as ISO-8859-1 (never mojibake) — even though it never determines the path.
      expect(outcome.reason).toContain('Decisão');
    }
  });
});
