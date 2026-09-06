import * as cheerio from 'cheerio';
import { isTag, type Element } from 'domhandler';
import { decodeByContentType, decodeLatin1 } from '../decode.js';

/**
 * Full detail-page field inventory (trf5-adapter spec, "Full Field Inventory
 * Extraction"; docs/RESEARCH.md §2 Step 5's component-id table). The fixture this
 * parses against is a synthetic reconstruction shaped by that table — RESEARCH.md
 * deliberately does not reproduce real markup because a live page carries personal
 * data (docs/RESEARCH.md §6).
 */
export interface LabeledCode {
  readonly cnjCode: string | null;
  readonly label: string;
}

export interface JudgingBody {
  readonly name: string | null;
  readonly collegiateBody: string | null;
  readonly address: string | null;
}

export interface Lawyer {
  readonly name: string;
  readonly oabNumber: string | null;
  readonly oabState: string | null;
  readonly cpf: string | null;
}

export interface Party {
  readonly name: string;
  readonly cpf: string | null;
  readonly role: string;
  readonly status: string | null;
  readonly lawyers: readonly Lawyer[];
}

export interface PartyGroups {
  readonly active: readonly Party[];
  readonly passive: readonly Party[];
  readonly others: readonly Party[];
}

export interface Movement {
  readonly sequence: number;
  readonly occurredAt: string | null;
  readonly rawDate: string | null;
  readonly description: string;
  /** Row structure unmapped (docs/RESEARCH.md §8) — stays `null` until confirmed. */
  readonly cnjCode: string | null;
  readonly rawCells: readonly string[];
}

/**
 * The documents grid mixes two delivery shapes (design.md D14): `legacy`
 * rows carry a real `idBin=` href (302-redirects to a PDF, fetched by
 * `documents.ts`); `bornDigital` rows render through
 * `documentoSemLoginHTML.seam?ca=...&idProcessoDoc=...`, a viewer page with
 * no `idBin` at all. A `bornDigital` row is extracted with its own
 * identifier and `fetchStatus: 'skipped'` rather than dropped (S5h task
 * 5h.4) -- until S5j exists to fetch it, `binId`/`downloadUrl` are `null`
 * (D9: `null` means known absent), never a guessed or borrowed value.
 */
export interface DocumentRow {
  readonly documentKind: 'legacy' | 'bornDigital';
  readonly documentId: string;
  readonly binId: string | null;
  readonly documentHash: string | null;
  readonly label: string;
  readonly downloadUrl: string | null;
  // Populated by S4b's fetch stage; enumeration-only here.
  readonly fileName: string | null;
  readonly contentType: string | null;
  readonly byteLength: number | null;
  readonly fetchStatus: 'fetched' | 'skipped' | 'failed';
}

/**
 * Reconciliation of the documents grid's own declared total against what
 * was actually read across every page (design.md D13, task 5h.7). A
 * shortfall is reported, never inferred away or silently tolerated -- the
 * same "measured, never certified" discipline core-coverage-accounting
 * already applies to cell counts.
 */
export interface DocumentsGridSummary {
  readonly declaredTotal: number;
  readonly extractedCount: number;
  readonly skippedCount: number;
  readonly reportedGap: number;
}

/**
 * The documents grid's own pagination-widget submit contract, harvested
 * from the page rather than assumed (task 5h.5). A live capture of an
 * actually-paginated documents grid (2026-09-06) showed the real widget is
 * a `rich:inputNumberSlider` (`Richfaces.Slider`) -- design.md D13's own
 * prose assumed the parties-list scrollers' `Richfaces.Datascroller` shape,
 * an inference never re-verified against a paginated documents grid until
 * this capture. `hiddenFields` carries every named `<input>` the pager's
 * own `<form>` declares, harvested verbatim rather than hand-picked.
 */
export interface DocumentGridPager {
  readonly formId: string;
  readonly triggerParam: string;
  readonly pageFieldName: string;
  readonly hiddenFields: ReadonlyMap<string, string>;
  readonly totalPages: number;
}

export interface DetailPage {
  readonly processNumber: string;
  readonly filingDate: string | null;
  readonly caseClass: LabeledCode;
  readonly subjects: readonly LabeledCode[];
  readonly jurisdiction: string | null;
  readonly judgingBody: JudgingBody;
  readonly referenceProcessNumber: string | null;
  readonly parties: PartyGroups;
  readonly movements: readonly Movement[];
  readonly documents: readonly DocumentRow[];
  readonly documentsGrid: DocumentsGridSummary;
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * `(\d+)\)?` tolerates a missing closing paren: the real page truncates its
 * last "Assunto" segment without one on at least one observed process (see
 * `__fixtures__/detail-page-valid.html`'s header comment) — a genuine site
 * quirk, not a parsing bug to paper over.
 */
function parseLabeledCode(text: string): LabeledCode {
  const match = /^(.*?)\s*\((\d+)\)?$/.exec(text.trim());
  return match
    ? { label: match[1]!.trim(), cnjCode: match[2]! }
    : { label: text.trim(), cnjCode: null };
}

/**
 * Selects an element whose id ends in `:<name>` (the real, server-generated-
 * prefix shape) or is the bare `<name>` — never a hardcoded prefix (D-2026-
 * 09-05, see `response-view.ts`'s `idBlockPresent`). Unlike that text-only
 * helper, DOM traversal here is safe: none of `.propertyView`,
 * `processoPartesPoloAtivoResumidoList`, `processoEvento`, or
 * `processoDocumentoGridTab` is itself a nested `<form>` (only the detail
 * page's outer header container is, and it is never selected by id at all —
 * see below).
 */
function bySuffixId($: cheerio.CheerioAPI, name: string): cheerio.Cheerio<Element> {
  return $(`[id$=":${name}"], [id="${name}"]`);
}

/**
 * Real detail-page fields are label -> value pairs inside a `.propertyView`
 * block (`.name label` text, `.value` text) — never an id like
 * `#numeroProcesso`. The header's own `<form id="...:processoTrfViewView">`
 * container is dropped entirely by HTML parsing (a `<form>` nested inside an
 * already-open RichFaces tab `<form>` is invalid HTML, and the parsing
 * algorithm silently omits the inner start tag), so extraction cannot scope
 * to "inside that container" and instead walks every `.propertyView` in the
 * document, keyed by its own visible Portuguese label.
 */
function extractPropertyFields($: cheerio.CheerioAPI): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  $('.propertyView').each((_, el) => {
    const $el = $(el);
    const label = $el.find('.name label').first().text().trim();
    if (label.length === 0) return; // handled separately (extractBoldLabeledFields)
    fields.set(label, $el.find('.value').first().text());
  });
  return fields;
}

/**
 * "Órgão Julgador Colegiado"/"Endereço" and "Órgão Julgador" each render
 * inside a BLANK-labeled `.propertyView`, with the real sub-label carried by
 * a `<b>` tag inside the value instead of `.name label`. Walks each such
 * value's child nodes, treating every `<b>` as a label and the text up to
 * the next `<b>` (or end) as that label's value.
 */
function extractBoldLabeledFields($: cheerio.CheerioAPI): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  $('.propertyView').each((_, el) => {
    const $el = $(el);
    if ($el.find('.name label').first().text().trim().length > 0) return;
    // Walked via the raw domhandler sibling pointer (`.next`), not cheerio's
    // `.nextUntil()`: the value text after each `<b>` (e.g. "Pleno") is a
    // bare text node, and `.nextUntil()` only ever returns element siblings,
    // silently dropping it. `.next`/`.prev` cover every sibling node type.
    $el.find('.value b').each((__, bold) => {
      const label = $(bold).text().trim();
      if (label.length === 0) return;
      let value = '';
      for (let node = bold.next; node && !(isTag(node) && node.name === 'b'); node = node.next) {
        value += $(node).text();
      }
      fields.set(label, value.trim());
    });
  });
  return fields;
}

/** "Assunto" is one flat string, subject levels joined by " - ", never a nested `<ul>`. */
function parseSubjects(text: string): readonly LabeledCode[] {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+-\s+/).map(parseLabeledCode);
}

const PARTY_LINE = /^(.+?)\s*-\s*CPF:\s*([\d.-]+)\s*\(([^)]+)\)$/;
const LAWYER_LINE = /^(.+?)\s*-\s*OAB\s+([A-Z]{2})([\w-]+)\s*-\s*CPF:\s*([\d.-]+)\s*\(ADVOGADO\)$/;

function parseLawyerLine(line: string): Lawyer {
  const match = LAWYER_LINE.exec(line);
  if (!match) return { name: line, oabNumber: null, oabState: null, cpf: null };
  return { name: match[1]!.trim(), oabState: match[2]!, oabNumber: match[3]!, cpf: match[4]! };
}

/**
 * A party (bold-face line) that does not match `CPF:` — a CNPJ-identified
 * legal entity, e.g. a federal agency (observed live 2026-09-05) — falls
 * through with the whole line as name, `cpf: null`, `role: 'UNKNOWN'`.
 * Disclosed follow-up (apply-progress.md); not fixed in this slice — no task
 * asked for a CNPJ-carrying schema, and the party is still recorded, never
 * dropped.
 */
function parsePartyLine(line: string): Omit<Party, 'status' | 'lawyers'> {
  const match = PARTY_LINE.exec(line);
  if (!match) return { name: line, cpf: null, role: 'UNKNOWN' };
  return { name: match[1]!.trim(), cpf: match[2]!, role: match[3]! };
}

/**
 * Parties render as a flat `tbody` of sibling `<tr>` rows, never a row with
 * a nested `<ul class="advogados">`: a lawyer is a following sibling row
 * whose line `<span>` carries no `text-bold` class (a party row's does).
 * `others` legitimately has no `...List` table at all when empty — the real
 * page renders only an empty wrapper `<div>` — so a selector miss yields
 * `[]` rather than throwing.
 */
function extractParties($: cheerio.CheerioAPI, name: string): readonly Party[] {
  const table = bySuffixId($, name);
  if (table.length === 0) return [];

  const parties: Party[] = [];
  table
    .find('tbody[id$=":tb"] > tr')
    .toArray()
    .forEach((tr) => {
      const $tr = $(tr);
      const status = textOrNull($tr.find('> td').eq(1).text());
      // A party row's line is wrapped in `span.text-bold`; a lawyer row's
      // equivalent line carries an explicit-but-empty `class=""` instead.
      // Both sit inside an outer, unclassed wrapper `<span>` that also
      // contains the row's other markup (a nested `<ul>`, a `<style>` block),
      // so selecting "the first span" would concatenate all of that in.
      const boldSpan = $tr.find('span.text-bold').first();
      if (boldSpan.length > 0) {
        parties.push({ ...parsePartyLine(boldSpan.text().trim()), status, lawyers: [] });
        return;
      }
      const lastParty = parties[parties.length - 1];
      const plainSpan = $tr.find('span[class=""]').first();
      if (lastParty && plainSpan.length > 0) {
        const line = plainSpan.text().trim();
        if (LAWYER_LINE.test(line)) (lastParty.lawyers as Lawyer[]).push(parseLawyerLine(line));
      }
    });
  return parties;
}

const MOVEMENT_CELL = /^(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s*-\s*(.*)$/;

/**
 * Movements are `tr.rich-table-row` (no `.evento` class) inside a table
 * whose id ends in `:processoEvento`, one cell holding
 * "dd/mm/yyyy hh:mm:ss - description" as a single string — never two
 * separate date/description cells.
 */
function extractMovements($: cheerio.CheerioAPI): readonly Movement[] {
  return bySuffixId($, 'processoEvento')
    .find('tbody[id$=":tb"] > tr.rich-table-row')
    .toArray()
    .map((row, index) => {
      const cells = $(row)
        .find('> td')
        .toArray()
        .map((td) => $(td).text().trim());
      const first = cells[0] ?? '';
      const match = MOVEMENT_CELL.exec(first);
      return {
        sequence: index + 1,
        occurredAt: null,
        rawDate: match ? match[1]! : null,
        description: match ? match[2]!.trim() : first,
        cnjCode: null,
        rawCells: cells,
      };
    });
}

const BORN_DIGITAL_ONCLICK = /documentoSemLoginHTML\.seam\?[^']*idProcessoDoc=(\d+)/;

/**
 * The documents grid mixes TWO unrelated delivery shapes in the same table
 * (observed live 2026-09-05, corrected S5h task 5h.4/design.md D14): legacy
 * documents with a real `href` carrying
 * `idBin=`/`numeroDocumento=`/`nomeArqProcDocBin=`/`idProcessoDocumento=`
 * (RESEARCH.md's originally documented shape, 302-redirect to a PDF — still
 * handled by `documents.ts`), and newer "born-digital" documents rendered
 * through `documentoSemLoginHTML.seam?ca=...&idProcessoDoc=...`, a viewer
 * page reached through `href="#"` plus an `onclick` popup, never a real
 * `href`. A born-digital row is now extracted with its own identifier and a
 * distinct `documentKind` rather than dropped — until S5j exists to fetch
 * its PDF, `binId`/`downloadUrl` stay `null` and `fetchStatus` stays
 * `'skipped'`, but the row is never invisible (design.md D13's declared-total
 * reconciliation depends on exactly this).
 */
function extractDocuments($: cheerio.CheerioAPI): readonly DocumentRow[] {
  const documents: DocumentRow[] = [];
  bySuffixId($, 'processoDocumentoGridTab')
    .find('tbody[id$=":tb"] > tr.rich-table-row')
    .each((_, row) => {
      const $row = $(row);
      const legacyAnchor = $row.find('a[href*="idBin="]').first();
      if (legacyAnchor.length > 0) {
        const href = legacyAnchor.attr('href') ?? '';
        const url = new URL(href, 'stub://pjeconsulta');
        documents.push({
          documentKind: 'legacy',
          documentId: url.searchParams.get('idProcessoDocumento') ?? '',
          binId: url.searchParams.get('idBin'),
          documentHash: url.searchParams.get('numeroDocumento'),
          label: legacyAnchor.text().trim(),
          downloadUrl: href,
          fileName: null,
          contentType: null,
          byteLength: null,
          fetchStatus: 'skipped' as const,
        });
        return;
      }

      let bornDigital: { documentId: string; label: string } | null = null;
      $row.find('a[onclick]').each((__, anchor) => {
        const $anchor = $(anchor);
        const match = BORN_DIGITAL_ONCLICK.exec($anchor.attr('onclick') ?? '');
        if (match) bornDigital = { documentId: match[1]!, label: $anchor.text().trim() };
      });
      // Neither shape matched: an unrecognized third row shape — disclosed
      // follow-up (apply-progress.md), never a crash, matching the standing
      // precedent this file already sets for every other unmapped shape.
      if (!bornDigital) return;
      const found: { documentId: string; label: string } = bornDigital;
      documents.push({
        documentKind: 'bornDigital',
        documentId: found.documentId,
        binId: null,
        documentHash: null,
        label: found.label,
        downloadUrl: null,
        fileName: null,
        contentType: null,
        byteLength: null,
        fetchStatus: 'skipped' as const,
      });
    });
  return documents;
}

/**
 * The grid's own declared total, read from the `<span class="pull-right
 * text-muted">N resultados encontrados</span>` sibling that immediately
 * follows the table — matched structurally (next sibling), never by a
 * hardcoded prefix (S5f's id-suffix discipline extended to this footer).
 * `0` when the grid renders no rows at all (no table, no footer at all).
 */
function extractDeclaredDocumentTotal($: cheerio.CheerioAPI): number {
  const table = bySuffixId($, 'processoDocumentoGridTab');
  if (table.length === 0) return 0;
  const footerText = table.next('span.pull-right.text-muted').text();
  const match = /(\d+)\s*resultados encontrados/.exec(footerText);
  return match ? Number(match[1]) : 0;
}

/**
 * Reconciles a set of extracted document rows against the grid's own
 * declared total (design.md D13, task 5h.7). Pure and reusable: `detail.ts`
 * calls this again after merging every further page's rows, since a
 * single-page parse can only ever report the gap left by pages it has not
 * read yet.
 */
export function summarizeDocumentsGrid(
  documents: readonly Pick<DocumentRow, 'documentKind'>[],
  declaredTotal: number,
): DocumentsGridSummary {
  const extractedCount = documents.filter((doc) => doc.documentKind === 'legacy').length;
  const skippedCount = documents.filter((doc) => doc.documentKind === 'bornDigital').length;
  return {
    declaredTotal,
    extractedCount,
    skippedCount,
    reportedGap: declaredTotal - (extractedCount + skippedCount),
  };
}

const SLIDER_ID = /new Richfaces\.Slider\("([^"]+)"/;
const SLIDER_MAX_VALUE = /'maxValue'\s*:\s*'(\d+)'/;
// The onchange handler is a JS string literal nested inside the slider
// constructor's own single-quoted config, so its own quotes arrive
// backslash-escaped in the raw markup — unlike a plain <script>-body a4j
// submit, whose quotes are unescaped (see session.ts's trigger harvest).
const ESCAPED_SUBMIT_FORM_ID = /A4J\.AJAX\.Submit\(\\'([^\\]+)\\'/;
const ESCAPED_PARAMETERS_BLOCK = /\\'parameters\\'\s*:\s*\{([^}]*)\}/;
const ESCAPED_SELF_REF_PAIR = /\\'([^\\]+)\\'\s*:\s*\\'([^\\']*)\\'/g;

function findDocumentGridPagerScript($: cheerio.CheerioAPI): string | null {
  const table = bySuffixId($, 'processoDocumentoGridTab');
  if (table.length === 0) return null;
  const panel = table.closest('.rich-panel');
  const scope = panel.length > 0 ? panel : table;

  let scriptText: string | null = null;
  scope.find('script').each((_, el) => {
    if (scriptText) return;
    const text = $(el).text();
    if (text.includes('new Richfaces.Slider(')) scriptText = text;
  });
  return scriptText;
}

/**
 * Harvests the documents grid's own pager contract from an already-parsed
 * DOM (task 5h.5). Returns `null` when the grid has no pager at all — a
 * single-page grid must issue zero extra requests (task 5h.8).
 */
function extractDocumentGridPagerFromDom($: cheerio.CheerioAPI): DocumentGridPager | null {
  const scriptText = findDocumentGridPagerScript($);
  if (!scriptText) return null;

  const sliderId = SLIDER_ID.exec(scriptText)?.[1];
  const maxValue = SLIDER_MAX_VALUE.exec(scriptText)?.[1];
  const formId = ESCAPED_SUBMIT_FORM_ID.exec(scriptText)?.[1];
  const parametersBlock = ESCAPED_PARAMETERS_BLOCK.exec(scriptText)?.[1];
  if (!sliderId || !maxValue || !formId || !parametersBlock) return null;

  let triggerParam: string | null = null;
  for (const [, key, value] of parametersBlock.matchAll(ESCAPED_SELF_REF_PAIR)) {
    if (key !== undefined && key === value) triggerParam = key;
  }
  if (!triggerParam) return null;

  const form = $(`form[id="${formId}"]`).first();
  if (form.length === 0) return null;
  const hiddenFields = new Map<string, string>();
  form.find('input[name]').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name');
    if (name) hiddenFields.set(name, $el.attr('value') ?? '');
  });

  return {
    formId,
    triggerParam,
    pageFieldName: sliderId,
    hiddenFields,
    totalPages: Number(maxValue),
  };
}

/** Same as {@link extractDocumentGridPagerFromDom}, from raw page bytes (task 5h.5). */
export function extractDocumentGridPager(body: Uint8Array): DocumentGridPager | null {
  return extractDocumentGridPagerFromDom(cheerio.load(decodeLatin1(body)));
}

/**
 * Parses a further documents-grid page's own AJAX response into its rows
 * only (task 5h.6) — `detail.ts` fetches the bytes and merges the result
 * into the page-1 `DetailPage.documents`; this stays a pure parse, exactly
 * like `parseDetailPage` itself.
 */
export function parseDocumentGridPage(
  body: Uint8Array,
  contentType: string | null,
): readonly DocumentRow[] {
  const $ = cheerio.load(decodeByContentType(body, contentType));
  return extractDocuments($);
}

export function parseDetailPage(body: Uint8Array): DetailPage {
  const $ = cheerio.load(decodeLatin1(body));
  const fields = extractPropertyFields($);
  const boldFields = extractBoldLabeledFields($);
  const documents = extractDocuments($);

  return {
    processNumber: fields.get('Número Processo')?.trim() ?? '',
    filingDate: textOrNull(fields.get('Data da Distribuição') ?? ''),
    caseClass: parseLabeledCode(fields.get('Classe Judicial') ?? ''),
    subjects: parseSubjects(fields.get('Assunto') ?? ''),
    jurisdiction: textOrNull(fields.get('Jurisdição') ?? ''),
    judgingBody: {
      name: textOrNull(boldFields.get('Órgão Julgador') ?? ''),
      collegiateBody: textOrNull(boldFields.get('Órgão Julgador Colegiado') ?? ''),
      address: textOrNull(boldFields.get('Endereço') ?? ''),
    },
    referenceProcessNumber: textOrNull(fields.get('Processo referência') ?? ''),
    parties: {
      active: extractParties($, 'processoPartesPoloAtivoResumidoList'),
      passive: extractParties($, 'processoPartesPoloPassivoResumidoList'),
      others: extractParties($, 'processoParteOutrosInteressadosResumidoList'),
    },
    movements: extractMovements($),
    documents,
    documentsGrid: summarizeDocumentsGrid(documents, extractDeclaredDocumentTotal($)),
  };
}
