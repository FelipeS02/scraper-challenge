import type { HttpResponse } from '../../../engine/ports.js';
import { decodeLatin1 } from '../decode.js';

/**
 * A normalized view over an `HttpResponse`, decoded once, that the zod validity chain
 * parses (design.md D7) — no schema touches raw HTML/bytes directly.
 */
export interface ResponseView {
  readonly status: number;
  readonly contentType: string | null;
  readonly bodyText: string;
  /** `text/xml` + `<meta name="Ajax-Response" content="redirect">` pointing at login.seam (case 3). */
  readonly isAjaxRedirectToLogin: boolean;
  /** Body landed on `errorUnexpected.seam` (cases 2 and 5 share this landing page). */
  readonly isErrorUnexpectedPage: boolean;
  readonly hasPersistenceException: boolean;
  /** `text/html`, as every detail page is — excludes the `text/xml` search-fragment responses. */
  readonly isHtmlPage: boolean;
  /** Presence of the detail header container (`processoTrfViewView`) — never document count or byte size (D8). */
  readonly hasDetailHeaderBlock: boolean;
  /** Presence of any of the three party-list containers (active/passive/others). */
  readonly hasPartiesBlock: boolean;
}

/**
 * Matches an id ending in `:<name>` (the real, server-generated-prefix shape,
 * e.g. `id="j_id146:processoTrfViewView"`) or a bare `id="<name>"`, never a
 * hardcoded prefix — measured live 2026-09-05 (docs/RESEARCH.md §1, §2 Step 5;
 * see `__fixtures__/detail-page-valid.html`'s header comment). Built as a
 * regex over the decoded body TEXT rather than a cheerio element lookup: the
 * real container is a `<form>` nested inside an already-open RichFaces tab
 * `<form>`, and the HTML parsing algorithm silently drops a nested `<form>`
 * start tag, so no DOM element ever carries this id after parsing — only the
 * raw markup does.
 */
function idBlockPresent(bodyText: string, name: string): boolean {
  return new RegExp(`id="(?:[^"]*:)?${name}"`).test(bodyText);
}

export function buildResponseView(response: HttpResponse): ResponseView {
  const bodyText = decodeLatin1(response.body);
  const contentType = response.headers['content-type'] ?? null;
  const isXml = contentType?.includes('text/xml') ?? false;
  const isAjaxRedirect = /Ajax-Response["'\s]+content=["']redirect["']/i.test(bodyText);

  return {
    status: response.status,
    contentType,
    bodyText,
    isAjaxRedirectToLogin: isXml && isAjaxRedirect && bodyText.includes('login.seam'),
    isErrorUnexpectedPage: bodyText.includes('errorUnexpected.seam'),
    hasPersistenceException: bodyText.includes('PersistenceException'),
    isHtmlPage: contentType?.includes('text/html') ?? false,
    hasDetailHeaderBlock: idBlockPresent(bodyText, 'processoTrfViewView'),
    hasPartiesBlock:
      idBlockPresent(bodyText, 'processoPartesPoloAtivoResumidoList') ||
      idBlockPresent(bodyText, 'processoPartesPoloPassivoResumidoList') ||
      idBlockPresent(bodyText, 'processoParteOutrosInteressadosResumidoList'),
  };
}
