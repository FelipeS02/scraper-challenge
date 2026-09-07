import * as cheerio from 'cheerio';
import type { HttpTransport } from '../../engine/ports.js';
import { decodeByContentType } from './decode.js';
import type { SessionState } from './session.js';

/** One entry of the judicial-class suggestion catalogue (docs/RESEARCH.md §3, "the second axis"). */
export interface TrfClass {
  readonly label: string;
  readonly cnjCode: string | null;
}

function lastSegment(fieldName: string): string {
  return fieldName.slice(fieldName.lastIndexOf(':') + 1);
}

/**
 * Fetches the complete class catalogue from the suggestion endpoint, fresh every run
 * (docs/RESEARCH.md §7.4: "fetched once per run ... never hardcoded"). The suggestion
 * component id is derived from this run's harvested `classeJudicial` field name, not a
 * hardcoded `j_id189`.
 */
export async function fetchClassCatalogue(
  transport: HttpTransport,
  session: SessionState,
): Promise<readonly TrfClass[]> {
  const classeField = session.fieldNames.find((name) => lastSegment(name) === 'classeJudicial');
  if (!classeField) throw new Error('priming response did not expose the classeJudicial field');
  const suggestionField = classeField.replace(/classeJudicial$/, 'sgbClasseJudicial');

  const params = new URLSearchParams();
  params.set('AJAXREQUEST', suggestionField);
  params.set(classeField, '');
  params.set(suggestionField, suggestionField);
  params.set('fPP', 'fPP');
  params.set('javax.faces.ViewState', session.viewState);
  params.set('AJAX:EVENTS_COUNT', '1');

  const response = await transport.send({
    method: 'POST',
    url: session.actionUrl,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  return parseClassCatalogue(response.body, response.headers['content-type'] ?? null);
}

/**
 * Reads the catalogue out of the `rich:suggestionbox`'s own rendered table
 * (RichFaces 3.3.3): one `tr.richfaces_suggestionEntry` per class, the CNJ
 * code and the label each in their own cell.
 *
 * Scoped to `tr.richfaces_suggestionEntry` rather than scanning the whole
 * document, because the response is the entire page shell, not a bare
 * fragment — an unscoped scan cannot tell the catalogue apart from unrelated
 * markup elsewhere on the page (docs/RESEARCH.md §9.9 raised exactly this
 * about the previous `$('li')` scan). Correcting §9.9's open question: this
 * parser returned `0` while a text scan of the same bytes counted a handful of
 * `<li>`, because those `<li>` sit inside CDATA `<script>` blocks — one
 * response, two ways of counting, never two host behaviors.
 *
 * A response carrying no suggestion rows yields `[]`, and `split()` treats an
 * empty catalogue as "cannot subdivide on this axis" — a recorded coverage
 * gap, never a crash and never a guess.
 */
export function parseClassCatalogue(
  body: Uint8Array,
  contentType: string | null,
): readonly TrfClass[] {
  const $ = cheerio.load(decodeByContentType(body, contentType), { xmlMode: true });
  return $('tr.richfaces_suggestionEntry')
    .toArray()
    .map((row) => {
      const cells = $(row)
        .find('td')
        .toArray()
        .map((cell) => $(cell).text().trim());
      // Two of the four cells are the suggestion widget's own empty spacers;
      // the code and the label are identified by shape (the all-digits cell is
      // the CNJ code) rather than by a fixed column index, so a spacer added
      // or dropped cannot silently swap the two fields.
      const filled = cells.filter((text) => text.length > 0);
      const cnjCode = filled.find((text) => /^\d+$/.test(text)) ?? null;
      const label = filled.find((text) => text !== cnjCode) ?? '';
      return { label, cnjCode };
    })
    .filter((cls) => cls.label.length > 0);
}
