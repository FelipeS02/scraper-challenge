import * as cheerio from 'cheerio';
import { decodeLatin1 } from '../decode.js';

/**
 * One search-result row: the visible process number and the opaque `ca`
 * token the site embeds in the row's popup `onclick` handler
 * (docs/RESEARCH.md §2 Step 3). This is the only place `ca` is ever
 * harvested from a search response — the detail page itself never repeats
 * it.
 */
export interface SearchResultRow {
  readonly processNumber: string;
  readonly ca: string;
}

/**
 * A parsed AJAX search-response fragment. `count` is the observed row
 * count reported to the engine so it can be compared against
 * `SitePort.resultPageCap` to detect saturation (trf5-adapter spec,
 * "Declared Result-Page Cap and Item Identity Key").
 */
export interface SearchResultFragment {
  readonly rows: readonly SearchResultRow[];
  readonly count: number;
}

const CA_TOKEN = /[?&]ca=([^&'"]+)/;

/**
 * Parses the AJAX search-response fragment into rows, mirroring
 * `parsing/detail-page.ts`'s shape: one cheerio pass, one exported parse
 * function. A response with no matching rows (including the site's own
 * empty-result fragment) yields an empty list rather than throwing.
 */
export function parseResultFragment(body: Uint8Array): SearchResultFragment {
  const $ = cheerio.load(decodeLatin1(body));
  const rows: SearchResultRow[] = [];

  $('a.processo-linha').each((_, el) => {
    const onclick = $(el).attr('onclick') ?? '';
    const match = CA_TOKEN.exec(onclick);
    const processNumber = $(el).text().trim();
    if (match && processNumber.length > 0) {
      rows.push({ processNumber, ca: match[1]! });
    }
  });

  return { rows, count: rows.length };
}
