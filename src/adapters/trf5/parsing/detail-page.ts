import * as cheerio from 'cheerio';
import { isTag, type Element } from 'domhandler';
import { decodeLatin1 } from '../decode.js';

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

export interface DocumentRow {
  readonly documentId: string;
  readonly binId: string;
  readonly documentHash: string | null;
  readonly label: string;
  readonly downloadUrl: string;
  // Populated by S4b's fetch stage; enumeration-only here.
  readonly fileName: string | null;
  readonly contentType: string | null;
  readonly byteLength: number | null;
  readonly fetchStatus: 'fetched' | 'skipped' | 'failed';
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

/**
 * The documents grid mixes TWO unrelated delivery shapes in the same table
 * (observed live 2026-09-05): legacy documents with a real `href` carrying
 * `idBin=`/`numeroDocumento=`/`nomeArqProcDocBin=`/`idProcessoDocumento=`
 * (RESEARCH.md's originally documented shape, 302-redirect to a PDF — still
 * handled by `documents.ts`), and newer "born-digital" documents rendered
 * through `documentoSemLoginHTML.seam?ca=...&idProcessoDoc=...`, a 200
 * text/html editor view with no PDF at all. This slice extracts only the
 * first shape (`a[href*="idBin="]`); a row with no such anchor is a
 * born-digital document and is skipped — disclosed, out-of-scope follow-up
 * (apply-progress.md, docs/RESEARCH.md), never a crash.
 */
function extractDocuments($: cheerio.CheerioAPI): readonly DocumentRow[] {
  const documents: DocumentRow[] = [];
  bySuffixId($, 'processoDocumentoGridTab')
    .find('tbody[id$=":tb"] > tr.rich-table-row')
    .each((_, row) => {
      const anchor = $(row).find('a[href*="idBin="]').first();
      if (anchor.length === 0) return;
      const href = anchor.attr('href') ?? '';
      const url = new URL(href, 'stub://pjeconsulta');
      documents.push({
        documentId: url.searchParams.get('idProcessoDocumento') ?? '',
        binId: url.searchParams.get('idBin') ?? '',
        documentHash: url.searchParams.get('numeroDocumento'),
        label: anchor.text().trim(),
        downloadUrl: href,
        fileName: null,
        contentType: null,
        byteLength: null,
        fetchStatus: 'skipped' as const,
      });
    });
  return documents;
}

export function parseDetailPage(body: Uint8Array): DetailPage {
  const $ = cheerio.load(decodeLatin1(body));
  const fields = extractPropertyFields($);
  const boldFields = extractBoldLabeledFields($);

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
    documents: extractDocuments($),
  };
}
