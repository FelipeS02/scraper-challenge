import { classifyHttpStatus } from '../../engine/http-status.js';
import type { HttpTransport, StoredDocument } from '../../engine/ports.js';
import type { FetchOutcome } from '../../engine/types.js';
import { decodePercentEncodedLatin1 } from './encoding.js';
import type { DocumentRow } from './parsing/detail-page.js';
import { extractDocumentViewerPdfContract } from './parsing/document-viewer.js';

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

// Any RUN of one-or-more characters outside the path-safe set collapses to a
// single dash — this is what lets a label like "2ª VARA/CE" keep a
// descriptive slug ("2-vara-ce") instead of the whole candidate being
// discarded for one unsafe character (task 5i.5/5i.6, trf5-adapter spec:
// degradation is for a hostile, empty, or unrepresentable label, not for an
// ordinary one that happens to contain a slash).
const UNSAFE_RUN = /[^a-z0-9._-]+/g;
const REPEATED_SEPARATOR = /-{2,}/g;
const EDGE_DASHES = /^-+|-+$/g;
/**
 * A slug that still contains ".." after per-character sanitization is
 * treated as hostile and discarded entirely, even though a bare "." is an
 * allowed path character on its own. The slug is only ever embedded as a
 * filename SUFFIX (`${documentId}-${slug}.pdf}`), never a standalone path
 * segment, so it cannot itself escape the output directory — this check
 * exists to honor the spec's own named example (`../../etc/passwd`) rather
 * than because the current embedding would otherwise be unsafe.
 */
const PARENT_DIR_REFERENCE = '..';

/**
 * The slug is decorative only — it never participates in uniqueness. A
 * hostile (parent-directory-referencing), empty, or unrepresentable label
 * degrades to `null` (no slug), never a collision and never a path-escaping
 * component. Sanitizes per character rather than rejecting the whole
 * candidate for one unsafe character (task 5i.6).
 */
/**
 * The grid renders every label as "<date> - <title> (<type>)", and the type is
 * now carried by `DocumentRow.documentType` in its own right. Leaving it in
 * the slug too produced filenames that said it twice
 * ("...-despacho-despacho.pdf"), so the trailing parenthesis is dropped before
 * sluggifying. A label consisting of NOTHING but the type keeps it — a file
 * named after its type beats a file named after nothing.
 */
const TRAILING_TYPE = /\s*\([^()]*\)\s*$/;

function withoutTrailingType(label: string): string {
  const stripped = label.replace(TRAILING_TYPE, '').trim();
  return stripped.length > 0 ? stripped : label;
}

function deriveSlug(label: string): string | null {
  const folded = foldAccents(withoutTrailingType(label)).toLowerCase();
  const sanitized = folded
    .replace(UNSAFE_RUN, '-')
    .replace(REPEATED_SEPARATOR, '-')
    .replace(EDGE_DASHES, '');
  if (sanitized.length === 0 || sanitized.includes(PARENT_DIR_REFERENCE)) return null;
  return sanitized.slice(0, MAX_SLUG_LENGTH);
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
function decodedLabel(downloadUrl: string, label: string): string {
  const match = /[?&]nomeArqProcDocBin=([^&]*)/.exec(downloadUrl);
  return match ? decodePercentEncodedLatin1(match[1]!) : label;
}

/** Real PDF content starts with this literal 5-byte header — never trusted from
 * status/Content-Type alone (task 5j.5, docs/RESEARCH.md §5: "this host answers
 * 200 for most failures"). */
const PDF_MAGIC_BYTES = new TextEncoder().encode('%PDF-');

function isPdfContent(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC_BYTES.byteLength) return false;
  return PDF_MAGIC_BYTES.every((byte, index) => bytes[index] === byte);
}

/**
 * Fetches one document, dispatching on `documentKind` (design.md D14): a
 * `legacy` row follows its 302 redirect directly; a `bornDigital` row goes
 * through the two-step viewer-then-PDF flow S5j implements, since its PDF is
 * keyed on `idProcDocBin`, an id the detail page never carries at all.
 * Neither path ever throws on a fetch failure: returning a `FetchOutcome`
 * failure kind is what lets `engine/scraper.ts` record the failure in the
 * ledger while still writing the item S4a's `parseDetailPage`/
 * `assembleTrfPayload` already extracted. Returns the fetched bytes for the
 * engine to persist through `DocumentSink` — this adapter never touches the
 * filesystem itself (trf5-adapter spec, "Document Persistence to Disk").
 */
export async function fetchDocument(
  transport: HttpTransport,
  processNumber: string,
  doc: DocumentRow,
): Promise<FetchOutcome<StoredDocument>> {
  if (doc.documentKind === 'bornDigital') {
    return fetchBornDigitalDocument(transport, processNumber, doc);
  }
  return fetchLegacyDocument(transport, processNumber, doc);
}

/**
 * The two-step flow design.md D14 exists to respect: GET the viewer page,
 * harvest its own `Gerar PDF` submit contract (`parsing/document-viewer.ts`),
 * POST it, then verify the result is actually a PDF BY CONTENT before ever
 * treating it as one — never by status or `Content-Type` alone, since this
 * host answers 200 for most failures (docs/RESEARCH.md §5).
 */
async function fetchBornDigitalDocument(
  transport: HttpTransport,
  processNumber: string,
  doc: DocumentRow,
): Promise<FetchOutcome<StoredDocument>> {
  // Defensive: a malformed row with no viewer URL at all must never reach
  // `transport.send` — never expected in production (every born-digital row
  // `parsing/detail-page.ts` extracts carries one), guarded here the same
  // way the legacy path is guarded against an unsafe path component below.
  if (doc.downloadUrl === null) {
    return {
      kind: 'permanentError',
      reason: 'invalidReference',
      detail: `bornDigital document ${doc.documentId} has no viewer URL`,
    };
  }

  const viewerResponse = await transport.send({ method: 'GET', url: doc.downloadUrl });
  const viewerStatusOutcome = classifyHttpStatus(viewerResponse.status, viewerResponse.headers);
  if (viewerStatusOutcome) return viewerStatusOutcome;
  if (viewerResponse.status !== 200) {
    return {
      kind: 'hostDefect',
      reason:
        `expected 200 fetching the born-digital viewer for document '${doc.label}' ` +
        `(idProcessoDoc=${doc.documentId}), got status ${viewerResponse.status}`,
    };
  }

  const contract = extractDocumentViewerPdfContract(viewerResponse.body);
  if (!contract) {
    return {
      kind: 'hostDefect',
      reason: `born-digital viewer response missing the Gerar PDF submit contract (idProcessoDoc=${doc.documentId})`,
    };
  }

  const actionUrl = new URL(contract.actionUrl, doc.downloadUrl).toString();
  const body = new URLSearchParams();
  for (const [name, value] of contract.hiddenFields) body.set(name, value);
  body.set(contract.downloadParam, contract.downloadParam);
  body.set('ca', contract.ca);
  body.set('idProcDocBin', contract.idProcDocBin);

  const submitResponse = await transport.send({
    method: 'POST',
    url: actionUrl,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const submitStatusOutcome = classifyHttpStatus(submitResponse.status, submitResponse.headers);
  if (submitStatusOutcome) return submitStatusOutcome;

  let finalResponse = submitResponse;
  if (submitResponse.status === 302) {
    const location = submitResponse.headers.location;
    if (!location) {
      return {
        kind: 'hostDefect',
        reason: `302 response missing Location header fetching born-digital PDF (idProcDocBin=${contract.idProcDocBin})`,
      };
    }
    finalResponse = await transport.send({ method: 'GET', url: location });
    const finalStatusOutcome = classifyHttpStatus(finalResponse.status, finalResponse.headers);
    if (finalStatusOutcome) return finalStatusOutcome;
  }

  if (finalResponse.status !== 200 || !isPdfContent(finalResponse.body)) {
    // This host answers 200 for most failures (docs/RESEARCH.md §5), so the
    // response is trusted only after its bytes prove to be a PDF — a viewer
    // or error page returned in place of one must never persist as a
    // document (task 5j.5). Both branches are proven against captured
    // fixtures, and the success branch against a live run: 2026-09-06,
    // process 0005643-82.2001.4.05.8000, four born-digital documents
    // fetched through this path (3444/3435/7181/5908 bytes, all %PDF-1.4).
    return {
      kind: 'hostDefect',
      reason:
        `born-digital PDF response for document '${doc.label}' ` +
        `(idProcDocBin=${contract.idProcDocBin}) is not a PDF by content`,
    };
  }

  let fileName: string;
  try {
    fileName = buildDocumentPath(processNumber, doc.documentId, doc.label);
  } catch {
    return { kind: 'permanentError', reason: 'schemaMismatch', detail: null };
  }

  return {
    kind: 'ok',
    value: {
      documentId: doc.documentId,
      byteLength: finalResponse.body.byteLength,
      contentType: finalResponse.headers['content-type'] ?? null,
      fileName,
      bytes: finalResponse.body,
    },
  };
}

async function fetchLegacyDocument(
  transport: HttpTransport,
  processNumber: string,
  doc: DocumentRow,
): Promise<FetchOutcome<StoredDocument>> {
  if (doc.downloadUrl === null) {
    return {
      kind: 'permanentError',
      reason: 'invalidReference',
      detail: `legacy document ${doc.documentId} has no download URL`,
    };
  }
  const label = decodedLabel(doc.downloadUrl, doc.label);
  const initial = await transport.send({ method: 'GET', url: doc.downloadUrl });

  // Transport-boundary precedence (design.md "Validity chain", case 6): a
  // 429/5xx status is protocol truth, checked before the 404/302 status
  // checks below — never a replacement for them (S5g).
  const statusOutcome = classifyHttpStatus(initial.status, initial.headers);
  if (statusOutcome) return statusOutcome;

  if (initial.status === 404) {
    // The one honest status code (docs/RESEARCH.md §5 case 4): a nonexistent
    // idProcessoDocumento, never retried. No adapter-owned detail beyond the
    // site-agnostic reason itself (design.md D12).
    return { kind: 'permanentError', reason: 'notFound', detail: null };
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
    return { kind: 'permanentError', reason: 'schemaMismatch', detail: null };
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
