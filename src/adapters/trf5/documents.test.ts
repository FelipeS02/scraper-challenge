import { describe, expect, it } from 'vitest';
import type { HttpResponse } from '../../engine/ports.js';
import { loadFixtureBytes, StubTransport } from './__fixtures__/stub-transport.js';
import { buildDocumentFilename, fetchDocument } from './documents.js';
import type { DocumentRow } from './parsing/detail-page.js';

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

describe('buildDocumentFilename — Stable Document Filename Derivation (trf5-adapter spec)', () => {
  it('derives distinct filenames from ca + idProcessoDocumento only, never the label', () => {
    const ca = 'stub-ca-token-0001';
    const filenames = ['12452664', '12452668', '12452669'].map((documentId) =>
      buildDocumentFilename(ca, documentId),
    );

    expect(new Set(filenames).size).toBe(3);
    for (const fileName of filenames) {
      expect(fileName).toMatch(/^stub-ca-token-0001-\d+\.pdf$/);
    }
  });

  it('rejects filename components outside [A-Za-z0-9._-]', () => {
    expect(() => buildDocumentFilename('../escape', '12452668')).toThrow();
    expect(() => buildDocumentFilename('stub-ca-token-0001', '../../etc/passwd')).toThrow();
  });
});

describe('fetchDocument — 302-follow (trf5-adapter spec, Document Byte-Level ISO-8859-1 Decoding)', () => {
  it('follows the 302 redirect and returns the fetched document under an id-derived filename', async () => {
    const transport = new StubTransport([
      redirectResponse('stub://pjeconsulta/documentos/bin/12196568'),
      pdfResponse(),
    ]);

    const outcome = await fetchDocument(transport, 'stub-ca-token-0001', documentRow());

    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[0]?.url).toContain('idProcessoDocumento=12452668');
    expect(transport.requests[1]?.url).toBe('stub://pjeconsulta/documentos/bin/12196568');
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.value.documentId).toBe('12452668');
      expect(outcome.value.fileName).toBe('stub-ca-token-0001-12452668.pdf');
      expect(outcome.value.contentType).toBe('application/pdf');
      expect(outcome.value.byteLength).toBeGreaterThan(0);
    }
  });

  it('stores three same-labeled Decisão documents with three distinct filenames end to end', async () => {
    const ca = 'stub-ca-token-0001';
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
      const outcome = await fetchDocument(transport, ca, doc);
      expect(outcome.kind).toBe('ok');
      if (outcome.kind === 'ok') fileNames.push(outcome.value.fileName!);
    }

    expect(new Set(fileNames).size).toBe(3);
  });

  it('maps a 404 on the document link to a permanent notFound outcome, never throwing', async () => {
    const transport = new StubTransport([{ status: 404, headers: {}, body: new Uint8Array() }]);

    const outcome = await fetchDocument(transport, 'stub-ca-token-0001', documentRow());

    expect(outcome).toEqual({ kind: 'permanentError', reason: 'notFound' });
  });

  it('ledgers an unexpected status as a hostDefect FetchOutcome instead of throwing, so the already-extracted item is not discarded', async () => {
    const transport = new StubTransport([{ status: 500, headers: {}, body: new Uint8Array() }]);

    const outcome = await fetchDocument(transport, 'stub-ca-token-0001', documentRow());

    expect(outcome.kind).toBe('hostDefect');
    if (outcome.kind === 'hostDefect') {
      // The byte-level decoded label appears in the reason, proving nomeArqProcDocBin was
      // read as ISO-8859-1 (never mojibake) — even though it is never used for the filename.
      expect(outcome.reason).toContain('Decisão');
    }
  });
});
