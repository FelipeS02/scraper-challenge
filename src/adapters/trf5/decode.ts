/**
 * TRF5 pages and AJAX fragments are ISO-8859-1 — decoded at the byte level, never as
 * UTF-8 (docs/RESEARCH.md §2 Step 5, design.md D2). This is the general-purpose page
 * decoder; the percent-encoded `nomeArqProcDocBin` document-label decoder is a distinct
 * concern that lands in `encoding.ts` (S4).
 */
export function decodeLatin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}
