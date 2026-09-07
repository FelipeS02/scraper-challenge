/**
 * TRF5 pages and AJAX fragments are ISO-8859-1 — decoded at the byte level, never as
 * UTF-8 (docs/RESEARCH.md §2 Step 5, design.md D2). This is the general-purpose page
 * decoder; the percent-encoded `nomeArqProcDocBin` document-label decoder is a distinct
 * concern that lands in `encoding.ts` (S4).
 */
export function decodeLatin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

/**
 * Full-page GETs declare ISO-8859-1, but the documents-grid pager's own AJAX
 * partial-response POST (S5h) declares `charset=UTF-8` instead -- verified
 * live 2026-09-06 against the real pager response. Deciding the charset from
 * the response's own declared header, rather than assuming ISO-8859-1
 * everywhere, is what "harvest, don't guess" means for encoding too; a
 * response with no declared UTF-8 charset falls back to the site's default.
 */
export function decodeByContentType(bytes: Uint8Array, contentType: string | null): string {
  const charset = contentType?.toLowerCase().includes('charset=utf-8') ? 'utf-8' : 'latin1';
  return Buffer.from(bytes).toString(charset);
}
