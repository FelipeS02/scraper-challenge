import type { FetchOutcome, WorkUnit } from '../types.js';
import type { DiscoverResult, DocumentFetchOutcome, SitePort, StoredDocument } from '../ports.js';
import type { RegionCursor } from './fake-non-date-traversal.js';

/**
 * A second ~20-line fake adapter, deliberately NOT date-shaped — proving the
 * engine's saturation/split path is generic over the partitioning dimension
 * (core-scraping-engine, "Saturation-Driven Subdivision") and that a site
 * declaring no result-page cap never saturates (core-coverage-accounting,
 * "Cell State Ledger"). Pairs with `FakeNonDateTraversal`, which partitions
 * by a numeric "region" range instead of a date range. Not TRF5, and not
 * `FakeSite`/`FakeTraversal` (S1), which partition by date. See the
 * portability-audit note in apply-progress.md for what this fake had to
 * repurpose from `RunBounds`.
 */
export interface FakeRegionItem {
  readonly id: string;
  readonly region: number;
}

export interface FakeRegionDoc {
  readonly id: string;
}

export class FakeNonDateSite implements SitePort<FakeRegionItem, FakeRegionDoc> {
  readonly identityKeyName = 'id';

  /** `null` = declares no result-page cap at all (design.md D11). */
  constructor(readonly resultPageCap: number | null) {}

  itemId(item: FakeRegionItem): string {
    return item.id;
  }

  documentId(doc: FakeRegionDoc): string {
    return doc.id;
  }

  sourceUrl(item: FakeRegionItem): string {
    return `fake-region://item/${item.id}`;
  }

  discover(
    unit: WorkUnit<unknown>,
  ): Promise<FetchOutcome<DiscoverResult<FakeRegionItem, FakeRegionDoc>>> {
    const { regionFrom, regionTo } = unit.cursor as RegionCursor;
    const width = regionTo - regionFrom + 1;
    const count = this.resultPageCap === null ? width : Math.min(width, this.resultPageCap);
    // Item identity is keyed by the region number itself, never by the unit
    // that happened to discover it — the same real-world region surfaced by
    // an over-broad parent cell and by a narrower child cell after
    // subdivision is the SAME item, so it must dedup by adapter-declared
    // identity key exactly as a real capped search result page would
    // (core-coverage-accounting, "Deduplication by Adapter-Declared Identity
    // Key").
    const items: FakeRegionItem[] = Array.from({ length: count }, (_, i) => ({
      id: `region-${regionFrom + i}`,
      region: regionFrom + i,
    }));
    return Promise.resolve({
      kind: 'ok',
      value: { items, documentsByItemId: new Map(), count: items.length },
    });
  }

  fetchDocument(_item: FakeRegionItem, doc: FakeRegionDoc): Promise<FetchOutcome<StoredDocument>> {
    return Promise.resolve({
      kind: 'ok',
      value: {
        documentId: doc.id,
        byteLength: 0,
        contentType: null,
        fileName: null,
        bytes: new Uint8Array(),
      },
    });
  }

  reprimeSession(): Promise<void> {
    return Promise.resolve();
  }

  /** FakeRegionItem carries no per-document fields to update — a no-op, same as FakeSite's. */
  withDocumentOutcome(
    item: FakeRegionItem,
    _doc: FakeRegionDoc,
    _outcome: DocumentFetchOutcome,
  ): FakeRegionItem {
    return item;
  }
}
