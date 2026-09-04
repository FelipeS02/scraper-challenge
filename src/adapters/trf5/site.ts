import type { DocumentRow } from './parsing/detail-page.js';
import type { TrfPayload } from './schemas/payload.js';

/**
 * Constants declared by the TRF5 adapter and consumed by core coverage-accounting
 * (trf5-adapter spec, "Declared Result-Page Cap and Item Identity Key"). The full
 * `SitePort<TItem, TDoc>` implementation (discover/fetchDocument/reprimeSession) lands
 * once search-result-row parsing and document fetch exist (S4b/S5); `itemId`,
 * `documentId`, and `sourceUrl` are declared here now that `TrfPayload`/`DocumentRow`
 * exist to be `TItem`/`TDoc`.
 */
export const resultPageCap = 30;
export const identityKeyName = 'processNumber';

export function itemId(item: TrfPayload): string {
  return item.processNumber;
}

export function documentId(doc: DocumentRow): string {
  return doc.documentId;
}

export function sourceUrl(item: TrfPayload): string {
  return item.sourceUrl;
}
