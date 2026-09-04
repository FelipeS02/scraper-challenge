import type { HttpTransport, HttpResponse } from '../../engine/ports.js';
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

export function buildSearchRequestBody(session: SessionState, criteria: SearchCriteria): string {
  validateSearchCriteria(criteria);
  const params = new URLSearchParams();
  params.set('AJAXREQUEST', '_viewRoot');
  for (const token of SEARCH_FIELD_TOKENS) {
    params.set(resolveFieldName(session, token), criteria[token] ?? '');
  }
  params.set('fPP', 'fPP');
  params.set('javax.faces.ViewState', session.viewState);
  params.set(session.triggerId, session.triggerId);
  params.set('AJAX:EVENTS_COUNT', '1');
  return params.toString();
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
