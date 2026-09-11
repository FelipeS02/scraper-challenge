import type { HttpTransport, HttpResponse } from '../../engine/ports.js';
import { encodeFormBodyLatin1 } from './encoding.js';
import { buildResponseView } from './schemas/response-view.js';
import { classifyValidity } from './schemas/validity-chain.js';
import { primeSession, type SessionState } from './session.js';

/**
 * The complete documented search form field set (docs/RESEARCH.md §2 Step 2). Every
 * field MUST be present on every POST, empty ones as empty strings (trf5-adapter spec,
 * "Complete Search Form Field Set").
 */
export interface SearchCriteria {
  readonly numProcesso?: string;
  readonly nomeParte?: string;
  readonly nomeAdv?: string;
  readonly classeJudicial?: string;
  readonly documentoParte?: string;
  readonly estadoComboOAB?: string;
  readonly dataAutuacaoInicio: string;
  readonly dataAutuacaoFim: string;
}

const SEARCH_FIELD_TOKENS = [
  'numProcesso',
  'nomeParte',
  'nomeAdv',
  'classeJudicial',
  'documentoParte',
  'estadoComboOAB',
  'dataAutuacaoInicio',
  'dataAutuacaoFim',
] as const;

/** Rejects a request built without the mandatory date-range fields (trf5-adapter spec). */
export function validateSearchCriteria(criteria: SearchCriteria): void {
  if (!criteria.dataAutuacaoInicio || !criteria.dataAutuacaoFim) {
    throw new Error('search request requires dataAutuacaoInicio and dataAutuacaoFim');
  }
}

function lastSegment(fieldName: string): string {
  return fieldName.slice(fieldName.lastIndexOf(':') + 1);
}

/** Resolves a semantic search field to this run's harvested, never-hardcoded field name. */
function resolveFieldName(
  session: SessionState,
  token: (typeof SEARCH_FIELD_TOKENS)[number],
): string {
  const match = session.fieldNames.find((name) => lastSegment(name).includes(token));
  if (!match) throw new Error(`priming response did not expose a field for ${token}`);
  return match;
}

/**
 * Encoded ISO-8859-1, never UTF-8 (`encodeFormBodyLatin1`): `nomeParte`,
 * `nomeAdv` and `classeJudicial` all carry accented Portuguese, and a UTF-8
 * body makes the host match nothing while still answering 200 with an empty
 * result set.
 */
export function buildSearchRequestBody(session: SessionState, criteria: SearchCriteria): string {
  validateSearchCriteria(criteria);
  const pairs: [string, string][] = [['AJAXREQUEST', '_viewRoot']];
  for (const token of SEARCH_FIELD_TOKENS) {
    pairs.push([resolveFieldName(session, token), criteria[token] ?? '']);
  }
  pairs.push(['fPP', 'fPP']);
  pairs.push(['javax.faces.ViewState', session.viewState]);
  pairs.push([session.triggerId, session.triggerId]);
  pairs.push(['AJAX:EVENTS_COUNT', '1']);
  return encodeFormBodyLatin1(pairs);
}

/** `text/xml` + `Ajax-Response: redirect` to `login.seam` — the site's real 401 (case 3). */
function isSessionExpired(response: HttpResponse): boolean {
  return classifyValidity(buildResponseView(response)).kind === 'sessionExpired';
}

export interface SearchResult {
  readonly session: SessionState;
  readonly response: HttpResponse;
}

async function postSearch(
  transport: HttpTransport,
  session: SessionState,
  criteria: SearchCriteria,
): Promise<HttpResponse> {
  return transport.send({
    method: 'POST',
    url: session.actionUrl,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: buildSearchRequestBody(session, criteria),
  });
}

/** Submits the AJAX search; on an expired ViewState, re-primes and replays exactly once. */
export async function search(
  transport: HttpTransport,
  primingUrl: string,
  session: SessionState,
  criteria: SearchCriteria,
): Promise<SearchResult> {
  const response = await postSearch(transport, session, criteria);
  if (!isSessionExpired(response)) return { session, response };

  const reprimed = await primeSession(transport, primingUrl);
  const replayResponse = await postSearch(transport, reprimed, criteria);
  return { session: reprimed, response: replayResponse };
}
