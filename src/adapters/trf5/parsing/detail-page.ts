import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
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

function textOrNull(el: cheerio.Cheerio<Element>): string | null {
  const text = el.text().trim();
  return text.length > 0 ? text : null;
}

function parseLabeledCode(text: string): LabeledCode {
  const match = /^(.*?)\s*\((\d+)\)$/.exec(text);
  return match ? { label: match[1]!.trim(), cnjCode: match[2]! } : { label: text, cnjCode: null };
}

function ownText($: cheerio.CheerioAPI, li: Element): string {
  const clone = $(li).clone();
  clone.find('ul').remove();
  return clone.text().trim();
}

function extractSubjects($: cheerio.CheerioAPI): readonly LabeledCode[] {
  const subjects: LabeledCode[] = [];
  function walk(list: cheerio.Cheerio<Element>): void {
    list.children('li').each((_, li) => {
      subjects.push(parseLabeledCode(ownText($, li)));
      const nested = $(li).children('ul');
      if (nested.length > 0) walk(nested);
    });
  }
  walk($('#assuntoList'));
  return subjects;
}

const PARTY_LINE = /^(.+?)\s*-\s*CPF:\s*([\d.-]+)\s*\(([^)]+)\)$/;
const LAWYER_LINE = /^(.+?)\s*-\s*OAB\s+([A-Z]{2})([\w-]+)\s*-\s*CPF:\s*([\d.-]+)\s*\(ADVOGADO\)$/;

function parseLawyerLine(line: string): Lawyer {
  const match = LAWYER_LINE.exec(line);
  if (!match) return { name: line, oabNumber: null, oabState: null, cpf: null };
  return { name: match[1]!.trim(), oabState: match[2]!, oabNumber: match[3]!, cpf: match[4]! };
}

function parseParty($: cheerio.CheerioAPI, li: Element): Party {
  const $li = $(li);
  const line = $li.children('span.parte-linha').first().text().trim();
  const status = textOrNull($li.children('span.situacao').first());
  const match = PARTY_LINE.exec(line);
  const name = match ? match[1]!.trim() : line;
  const cpf = match ? match[2]! : null;
  const role = match ? match[3]! : 'UNKNOWN';
  const lawyers = $li
    .find('> ul.advogados > li > span.advogado-linha')
    .toArray()
    .map((el) => parseLawyerLine($(el).text().trim()));
  return { name, cpf, role, status, lawyers };
}

function extractParties($: cheerio.CheerioAPI, selector: string): readonly Party[] {
  return $(selector)
    .children('li')
    .toArray()
    .map((li) => parseParty($, li));
}

function extractMovements($: cheerio.CheerioAPI): readonly Movement[] {
  return $('#processoEventoPanel tr.evento')
    .toArray()
    .map((row, index) => {
      const cells = $(row)
        .find('td')
        .toArray()
        .map((td) => $(td).text().trim());
      return {
        sequence: index + 1,
        occurredAt: null,
        rawDate: cells[0] ?? null,
        description: cells.slice(1).join(' ').trim(),
        cnjCode: null,
        rawCells: cells,
      };
    });
}

function extractDocuments($: cheerio.CheerioAPI): readonly DocumentRow[] {
  return $('#processoDocumentoGridTab a.documento-linha')
    .toArray()
    .map((a) => {
      const $a = $(a);
      const href = $a.attr('href') ?? '';
      const url = new URL(href, 'stub://pjeconsulta');
      return {
        documentId: url.searchParams.get('idProcessoDocumento') ?? '',
        binId: url.searchParams.get('idBin') ?? '',
        documentHash: url.searchParams.get('numeroDocumento'),
        label: $a.text().trim(),
        downloadUrl: href,
        fileName: null,
        contentType: null,
        byteLength: null,
        fetchStatus: 'skipped' as const,
      };
    });
}

export function parseDetailPage(body: Uint8Array): DetailPage {
  const $ = cheerio.load(decodeLatin1(body));
  const header = $('#processoTrfViewView');

  return {
    processNumber: header.find('#numeroProcesso').text().trim(),
    filingDate: textOrNull(header.find('#dataDistribuicao')),
    caseClass: parseLabeledCode(header.find('#classeJudicial').text().trim()),
    subjects: extractSubjects($),
    jurisdiction: textOrNull(header.find('#jurisdicao')),
    judgingBody: {
      name: textOrNull(header.find('#orgaoJulgador')),
      collegiateBody: textOrNull(header.find('#orgaoJulgadorColegiado')),
      address: textOrNull(header.find('#endereco')),
    },
    referenceProcessNumber: textOrNull(header.find('#processoReferencia')),
    parties: {
      active: extractParties($, '#processoPartesPoloAtivoResumidoList'),
      passive: extractParties($, '#processoPartesPoloPassivoResumidoList'),
      others: extractParties($, '#processoParteOutrosInteressadosResumidoList'),
    },
    movements: extractMovements($),
    documents: extractDocuments($),
  };
}
