import * as cheerio from 'cheerio';
import type { HttpTransport } from '../../engine/ports.js';
import { decodeLatin1 } from './decode.js';
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
  return parseClassCatalogue(response.body);
}

function parseClassCatalogue(body: Uint8Array): readonly TrfClass[] {
  const $ = cheerio.load(decodeLatin1(body), { xmlMode: true });
  return $('li')
    .toArray()
    .map((el) => {
      const text = $(el).text().trim();
      const match = /^(.*?)\s*\((\d+)\)$/.exec(text);
      return match
        ? { label: match[1]!.trim(), cnjCode: match[2]! }
        : { label: text, cnjCode: null };
    });
}
