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

/** CNJ national process numbering (Res. CNJ 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO. */
const PROCESS_NUMBER = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

/**
 * Parses the AJAX search-response fragment into rows, mirroring
 * `parsing/detail-page.ts`'s shape: one cheerio pass, one exported parse
 * function. A response with no matching rows yields an empty list rather than
 * throwing — the site's real zero-result fragment renders the whole table with
 * an empty `<tbody>`, so "no rows" is a normal answer, not a malformed one.
 *
 * Row shape, from a captured response rather than assumption (see
 * `__fixtures__/search-ok.xml` and `docs/RESEARCH.md` §2 Step 3):
 * `tr.rich-table-row` inside the results table, carrying the same `ca` token in
 * TWO `openPopUp(...)` onclick handlers — the detail icon and the process link —
 * and the process number inside `<b class="btn-block">`, prefixed by a class
 * abbreviation and followed by " - <subject>".
 *
 * Both anchors are matched by CSS class rather than by element id: the ids here
 * (`j_id255`, `j_id257`, the per-row `10001`) are server-generated and unstable
 * (`docs/RESEARCH.md` §1), while `rich-table-row` is a RichFaces class. The
 * process number is read by its CNJ pattern for the same reason — no reliance on
 * the surrounding `<b>` or on the abbreviation that precedes it.
 */
export function parseResultFragment(body: Uint8Array): SearchResultFragment {
  const $ = cheerio.load(decodeLatin1(body));
  const rows: SearchResultRow[] = [];

  $('tr.rich-table-row').each((_, el) => {
    const row = $(el);

    let ca: string | null = null;
    row.find('[onclick]').each((__, anchor) => {
      if (ca !== null) return; // both handlers repeat the same token
      const match = CA_TOKEN.exec($(anchor).attr('onclick') ?? '');
      if (match?.[1]) ca = match[1];
    });

    const processNumber = PROCESS_NUMBER.exec(row.text())?.[0];
    if (ca !== null && processNumber !== undefined) rows.push({ processNumber, ca });
  });

  return { rows, count: rows.length };
}
