import { describe, expect, it } from 'vitest';
import type { HttpResponse } from '../../engine/ports.js';
import { loadFixtureBytes, StubTransport } from './__fixtures__/stub-transport.js';
import { buildDocumentPath, fetchDocument } from './documents.js';
import type { DocumentRow } from './parsing/detail-page.js';

const PROCESS_NUMBER = '0123456-78.2026.4.05.8100';

function documentRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
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

  it('maps a 404 on the document link to a permanent notFound outcome, never throwing', async () => {
    const transport = new StubTransport([{ status: 404, headers: {}, body: new Uint8Array() }]);

    const outcome = await fetchDocument(transport, PROCESS_NUMBER, documentRow());

    expect(outcome).toEqual({ kind: 'permanentError', reason: 'notFound' });
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
