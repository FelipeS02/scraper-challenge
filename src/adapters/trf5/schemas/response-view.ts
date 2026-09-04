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
  };
}
