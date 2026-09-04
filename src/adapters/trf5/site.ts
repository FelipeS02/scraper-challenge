/**
 * Constants declared by the TRF5 adapter and consumed by core coverage-accounting
 * (trf5-adapter spec, "Declared Result-Page Cap and Item Identity Key"). The full
 * `SitePort<TItem, TDoc>` implementation (discover/fetchDocument/itemId/...) lands in
 * S4, once detail parsing and payload assembly exist to build TItem/TDoc.
 */
export const resultPageCap = 30;
export const identityKeyName = 'processNumber';
