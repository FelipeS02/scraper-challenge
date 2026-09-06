import { classifyHttpStatus } from '../../engine/http-status.js';
import type { HttpTransport } from '../../engine/ports.js';
import type { FetchOutcome } from '../../engine/types.js';
import {
  extractDocumentGridPager,
  parseDetailPage,
  parseDocumentGridPage,
  summarizeDocumentsGrid,
  type DocumentGridPager,
  type DocumentRow,
} from './parsing/detail-page.js';
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

  // Transport-boundary precedence (design.md "Validity chain", case 6): a
  // 429/5xx status is protocol truth, checked before any site-content
  // classification — never a replacement for it (S5g).
  const statusOutcome = classifyHttpStatus(response.status, response.headers);
  if (statusOutcome) return statusOutcome;

  const outcome = classifyValidity(buildResponseView(response));

  switch (outcome.kind) {
    case 'sessionExpired':
    case 'unprimedSession':
      return { kind: 'sessionExpired' };
    case 'hostDefect':
      return { kind: 'hostDefect', reason: 'errorUnexpected.seam with PersistenceException' };
    case 'invalidTokenShell':
      // Site-agnostic reason; the concrete TRF5 observation rides beside it
      // as opaque adapter detail, never as its own engine-level literal
      // (design.md D12).
      return { kind: 'permanentError', reason: 'invalidReference', detail: 'invalidTokenShell' };
    case 'unclassified':
      return { kind: 'hostDefect', reason: 'unrecognized detail response' };
    case 'validData': {
      const detail = parseDetailPage(response.body);
      const pager = extractDocumentGridPager(response.body);

      // A single-page grid (no pager, or a pager reporting only one page)
      // issues zero extra requests (task 5h.8) -- every extra page fetched
      // beyond this point is one request charged to the run budget, exactly
      // like the detail GET above (task 5h.6).
      let finalDetail = detail;
      if (pager && pager.totalPages > 1) {
        const pagerUrl = detailUrl.split('?')[0]!;
        const morePages = await fetchDocumentGridPages(transport, pagerUrl, pager);
        if (morePages.kind !== 'ok') return morePages;

        const documents = [...detail.documents, ...morePages.value];
        finalDetail = {
          ...detail,
          documents,
          documentsGrid: summarizeDocumentsGrid(documents, detail.documentsGrid.declaredTotal),
        };
      }

      const payload = assembleTrfPayload(finalDetail, detailUrl);
      if (!payload) return { kind: 'permanentError', reason: 'schemaMismatch', detail: null };
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

/**
 * Fetches every further documents-grid page through its own harvested pager
 * contract (task 5h.6) and returns their merged rows. `parsing/` stays pure
 * — it parses a response, it never fetches one; the transport already lives
 * here, exactly like the detail GET above.
 */
async function fetchDocumentGridPages(
  transport: HttpTransport,
  pagerUrl: string,
  pager: DocumentGridPager,
): Promise<FetchOutcome<readonly DocumentRow[]>> {
  const rows: DocumentRow[] = [];
  for (let page = 2; page <= pager.totalPages; page++) {
    const params = new URLSearchParams();
    for (const [name, value] of pager.hiddenFields) params.set(name, value);
    params.set(pager.pageFieldName, String(page));
    params.set(pager.triggerParam, pager.triggerParam);
    params.set('AJAXREQUEST', pager.formId);
    params.set('AJAX:EVENTS_COUNT', '1');

    const response = await transport.send({
      method: 'POST',
      url: pagerUrl,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    // Transport-boundary precedence (S5g): every real request path is
    // classified for a 429/5xx before anything else, including this one.
    const statusOutcome = classifyHttpStatus(response.status, response.headers);
    if (statusOutcome) return statusOutcome;

    rows.push(...parseDocumentGridPage(response.body, response.headers['content-type'] ?? null));
  }
  return { kind: 'ok', value: rows };
}
