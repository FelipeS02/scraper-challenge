import type { HttpTransport, StoredDocument } from '../../engine/ports.js';
import type { FetchOutcome } from '../../engine/types.js';
import { decodePercentEncodedLatin1 } from './encoding.js';
import type { DocumentRow } from './parsing/detail-page.js';

/**
 * Filesystem-safe path components only (trf5-adapter spec, "Stable Document
 * Filename Derivation" — amended in this slice). The path is derived only from
 * the adapter's declared identity key `processNumber` and the server-declared
 * `idProcessoDocumento` — never from the session-scoped `ca` token, whose
 * stability across sessions is unverified (docs/RESEARCH.md open questions),
 * and never from the label alone, because multiple documents in one process
 * legitimately share the same label (docs/RESEARCH.md §2 Step 4, trap #2:
 * three `Decisão` documents, one process). See "Persisted Identifier
 * Stability" in core-run-control-and-output.
 */
const PATH_COMPONENT_SAFE = /^[A-Za-z0-9._-]+$/;
const MAX_SLUG_LENGTH = 60;
// Every NFD combining mark falls outside printable ASCII, so stripping
// anything outside the printable-ASCII range after decomposition folds an
// accented letter to its bare base letter (e.g. "a" + combining tilde -> "a")
// with no hardcoded accent table. Literal space/tilde bounds (not \x escapes)
// keep this outside no-control-regex's control-character concern.
const NON_PRINTABLE_ASCII = /[^ -~]/g;

function foldAccents(text: string): string {
  return text.normalize('NFD').replace(NON_PRINTABLE_ASCII, '');
}

/**
 * The slug is decorative only — it never participates in uniqueness. A
 * hostile, empty, or unrepresentable label degrades to `null` (no slug),
 * never a collision and never a path-escaping component.
 */
function deriveSlug(label: string): string | null {
  const candidate = foldAccents(label).toLowerCase().replace(/\s+/g, '-');
  if (candidate.length === 0 || !PATH_COMPONENT_SAFE.test(candidate)) return null;
  return candidate.slice(0, MAX_SLUG_LENGTH);
}

export function buildDocumentPath(
  processNumber: string,
  documentId: string,
  label: string,
): string {
  if (!PATH_COMPONENT_SAFE.test(processNumber) || !PATH_COMPONENT_SAFE.test(documentId)) {
    throw new Error(
      `document path components must match ${String(PATH_COMPONENT_SAFE)}: ` +
        `processNumber=${JSON.stringify(processNumber)} documentId=${JSON.stringify(documentId)}`,
    );
  }
  const slug = deriveSlug(label);
  const fileName = slug ? `${documentId}-${slug}.pdf` : `${documentId}.pdf`;
  return `${processNumber}/${fileName}`;
}

/**
 * Extracts and decodes `nomeArqProcDocBin` from the document link — feeds both
 * human-readable failure reasons and the decorative slug (trf5-adapter spec,
 * "Document Byte-Level ISO-8859-1 Decoding"). Never the sole uniqueness key,
 * which `buildDocumentPath` derives from `processNumber` + `documentId` alone.
 */
function decodedLabel(doc: DocumentRow): string {
  const match = /[?&]nomeArqProcDocBin=([^&]*)/.exec(doc.downloadUrl);
  return match ? decodePercentEncodedLatin1(match[1]!) : doc.label;
}

/**
 * Fetches one document by following its 302 redirect (docs/RESEARCH.md §2 Step 4).
 * Never throws on a fetch failure: returning a `FetchOutcome` failure kind is what
 * lets `engine/scraper.ts` record the failure in the ledger while still writing the
 * item S4a's `parseDetailPage`/`assembleTrfPayload` already extracted. Returns the
 * fetched bytes for the engine to persist through `DocumentSink` — this adapter
 * never touches the filesystem itself (trf5-adapter spec, "Document Persistence
 * to Disk").
 */
export async function fetchDocument(
  transport: HttpTransport,
  processNumber: string,
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
    fileName = buildDocumentPath(processNumber, doc.documentId, label);
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
      bytes: fileResponse.body,
    },
  };
}
