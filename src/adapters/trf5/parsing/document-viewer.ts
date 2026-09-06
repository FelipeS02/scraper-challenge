import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { decodeLatin1 } from '../decode.js';

/**
 * The `documentoSemLoginHTML.seam` viewer page's own `Gerar PDF` submit
 * contract (design.md D14), harvested from the page rather than assumed.
 * `idProcDocBin` is NOT `idProcessoDoc` (the id the viewer URL itself
 * carries) -- neither id derives from the other, and `idProcDocBin` appears
 * nowhere on the detail page (verified against the captured fixture).
 */
export interface DocumentViewerPdfContract {
  readonly actionUrl: string;
  readonly hiddenFields: ReadonlyMap<string, string>;
  readonly downloadParam: string;
  readonly ca: string;
  readonly idProcDocBin: string;
}

/**
 * The `Gerar PDF` anchor's onclick calls JSF's `jsfcljs` client-side form-
 * submit helper: `jsfcljs(document.getElementById('<formId>'), {'<formId>:
 * downloadPDF':'<formId>:downloadPDF', 'ca':'<token>',
 * 'idProcDocBin':'<id>'}, '')`. This is a plain (non-AJAX) JSF postback --
 * unlike the documents-grid pager's escaped `A4J.AJAX.Submit` call
 * (`detail-page.ts`), these quotes arrive unescaped in the raw markup.
 */
const JSFCLJS_CALL = /jsfcljs\(\s*document\.getElementById\('([^']+)'\)\s*,\s*\{([^}]*)\}/;
const KEY_VALUE_PAIR = /'([^']+)'\s*:\s*'([^']*)'/g;

/**
 * Selects an element whose id ends in `:<name>` or is the bare `<name>` --
 * never a hardcoded server-generated prefix like `j_id42` (S5f/S5h rule).
 */
function bySuffixId($: cheerio.CheerioAPI, name: string): cheerio.Cheerio<Element> {
  return $(`[id$=":${name}"], [id="${name}"]`);
}

/**
 * Harvests the `Gerar PDF` submit contract from an already-parsed DOM (task
 * 5j.2/5j.3). Returns `null` when the page has no such command link at all.
 */
function extractDocumentViewerPdfContractFromDom(
  $: cheerio.CheerioAPI,
): DocumentViewerPdfContract | null {
  const anchor = bySuffixId($, 'downloadPDF').first();
  if (anchor.length === 0) return null;

  const match = JSFCLJS_CALL.exec(anchor.attr('onclick') ?? '');
  if (!match) return null;
  const formId = match[1]!;
  const paramsBlock = match[2]!;

  const params = new Map<string, string>();
  for (const [, key, value] of paramsBlock.matchAll(KEY_VALUE_PAIR)) {
    if (key !== undefined && value !== undefined) params.set(key, value);
  }

  const ca = params.get('ca');
  const idProcDocBin = params.get('idProcDocBin');
  let downloadParam: string | null = null;
  for (const [key, value] of params) {
    if (key === value) downloadParam = key;
  }
  if (!ca || !idProcDocBin || !downloadParam) return null;

  const form = $(`form[id="${formId}"]`).first();
  if (form.length === 0) return null;
  const actionUrl = form.attr('action');
  if (!actionUrl) return null;

  const hiddenFields = new Map<string, string>();
  form.find('input[name]').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name');
    if (name) hiddenFields.set(name, $el.attr('value') ?? '');
  });

  return { actionUrl, hiddenFields, downloadParam, ca, idProcDocBin };
}

/** Same as {@link extractDocumentViewerPdfContractFromDom}, from raw page bytes. */
export function extractDocumentViewerPdfContract(
  body: Uint8Array,
): DocumentViewerPdfContract | null {
  return extractDocumentViewerPdfContractFromDom(cheerio.load(decodeLatin1(body)));
}
