import type { HttpTransport } from '../../engine/ports.js';
import type { FetchOutcome } from '../../engine/types.js';
import { parseDetailPage } from './parsing/detail-page.js';
import { assembleTrfPayload, type TrfPayload } from './schemas/payload.js';
import { buildResponseView } from './schemas/response-view.js';
import { classifyValidity } from './schemas/validity-chain.js';
import { primeSession, type SessionState } from './session.js';

/**
 * Fetches one process detail page by its opaque `ca` token, priming a session first
 * when none is provided (trf5-adapter spec, "Detail Fetch Session Requirement"). The
 * page is decoded, classified through the ordered validity chain, and — only on the
 * `validData` branch — parsed and validated into the final `TrfPayload`.
 */
export async function fetchDetail(
  transport: HttpTransport,
  primingUrl: string,
  session: SessionState | null,
  ca: string,
): Promise<FetchOutcome<TrfPayload>> {
  const primed = session ?? (await primeSession(transport, primingUrl));
  const detailUrl = buildDetailUrl(primed, ca);
  const response = await transport.send({ method: 'GET', url: detailUrl });
  const outcome = classifyValidity(buildResponseView(response));

  switch (outcome.kind) {
    case 'sessionExpired':
    case 'unprimedSession':
      return { kind: 'sessionExpired' };
    case 'hostDefect':
      return { kind: 'hostDefect', reason: 'errorUnexpected.seam with PersistenceException' };
    case 'invalidTokenShell':
      return { kind: 'permanentError', reason: 'invalidTokenShell' };
    case 'unclassified':
      return { kind: 'hostDefect', reason: 'unrecognized detail response' };
    case 'validData': {
      const detail = parseDetailPage(response.body);
      const payload = assembleTrfPayload(detail, detailUrl);
      if (!payload) return { kind: 'permanentError', reason: 'schemaMismatch' };
      return { kind: 'ok', value: payload };
    }
  }
}

function buildDetailUrl(session: SessionState, ca: string): string {
  const base = session.actionUrl.replace(
    '/listView.seam',
    '/DetalheProcessoConsultaPublica/listView.seam',
  );
  return `${base}?ca=${encodeURIComponent(ca)}`;
}
