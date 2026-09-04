import type { HttpTransport, StoredDocument } from '../../engine/ports.js';
import type { FetchOutcome } from '../../engine/types.js';
import { decodePercentEncodedLatin1 } from './encoding.js';
import type { DocumentRow } from './parsing/detail-page.js';

/**
 * Filesystem-safe filename components only (trf5-adapter spec, "Stable Document
 * Filename Derivation"; design.md's remote-controlled-filenames threat note). The
 * filename is derived only from the adapter's own opaque `ca` token and the
 * server-declared `idProcessoDocumento` — never from `nomeArqProcDocBin`, because
 * multiple documents in one process legitimately share the same label
 * (docs/RESEARCH.md §2 Step 4, trap #2: three `Decisão` documents, one process).
 */
const FILENAME_SAFE = /^[A-Za-z0-9._-]+$/;

export function buildDocumentFilename(ca: string, documentId: string): string {
  if (!FILENAME_SAFE.test(ca) || !FILENAME_SAFE.test(documentId)) {
    throw new Error(
      `document filename components must match ${String(FILENAME_SAFE)}: ` +
        `ca=${JSON.stringify(ca)} documentId=${JSON.stringify(documentId)}`,
    );
  }
  return `${ca}-${documentId}.pdf`;
}

/**
 * Extracts and decodes `nomeArqProcDocBin` from the document link for human-readable
 * failure reasons only (trf5-adapter spec, "Document Byte-Level ISO-8859-1 Decoding")
 * — never for the stored filename, which `buildDocumentFilename` derives independently.
 */
function decodedLabel(doc: DocumentRow): string {
  const match = /[?&]nomeArqProcDocBin=([^&]*)/.exec(doc.downloadUrl);
  return match ? decodePercentEncodedLatin1(match[1]!) : doc.label;
}

/**
 * Fetches one document by following its 302 redirect (docs/RESEARCH.md §2 Step 4).
 * Never throws on a fetch failure: returning a `FetchOutcome` failure kind is what
 * lets `engine/scraper.ts` record the failure in the ledger while still writing the
 * item S4a's `parseDetailPage`/`assembleTrfPayload` already extracted.
 */
export async function fetchDocument(
  transport: HttpTransport,
  ca: string,
  doc: DocumentRow,
): Promise<FetchOutcome<StoredDocument>> {
  const label = decodedLabel(doc);
  const initial = await transport.send({ method: 'GET', url: doc.downloadUrl });

  if (initial.status === 404) {
    // The one honest status code (docs/RESEARCH.md §5 case 4): a nonexistent
    // idProcessoDocumento, never retried.
    return { kind: 'permanentError', reason: 'notFound' };
  }
  if (initial.status !== 302) {
    return {
      kind: 'hostDefect',
      reason: `expected a 302 redirect for document '${label}' (idProcessoDocumento=${doc.documentId}), got status ${initial.status}`,
    };
  }

  const location = initial.headers.location;
  if (!location) {
    return {
      kind: 'hostDefect',
      reason: `302 response missing Location header for document '${label}' (idProcessoDocumento=${doc.documentId})`,
    };
  }

  const fileResponse = await transport.send({ method: 'GET', url: location });
  if (fileResponse.status !== 200) {
    return {
      kind: 'hostDefect',
      reason: `unexpected status ${fileResponse.status} fetching document '${label}' (idProcessoDocumento=${doc.documentId})`,
    };
  }

  let fileName: string;
  try {
    fileName = buildDocumentFilename(ca, doc.documentId);
  } catch {
    return { kind: 'permanentError', reason: 'schemaMismatch' };
  }

  return {
    kind: 'ok',
    value: {
      documentId: doc.documentId,
      byteLength: fileResponse.body.byteLength,
      contentType: fileResponse.headers['content-type'] ?? null,
      fileName,
    },
  };
}
