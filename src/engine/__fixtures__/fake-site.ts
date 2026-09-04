import type { FetchOutcome, WorkUnit } from '../types.js';
import type { DiscoverResult, SitePort, StoredDocument } from '../ports.js';

/**
 * ~20-line fake adapter proving the engine is generic over payload type
 * (core-scraping-engine "Payload-Generic Port Contracts"). Not TRF5.
 */
export interface FakeItem {
  readonly id: string;
  readonly label: string;
}

export interface FakeDoc {
  readonly id: string;
}

export class FakeSite implements SitePort<FakeItem, FakeDoc> {
  readonly resultPageCap = 5;
  readonly identityKeyName = 'id';

  itemId(item: FakeItem): string {
    return item.id;
  }

  documentId(doc: FakeDoc): string {
    return doc.id;
  }

  sourceUrl(item: FakeItem): string {
    return `fake://item/${item.id}`;
  }

  discover(unit: WorkUnit<unknown>): Promise<FetchOutcome<DiscoverResult<FakeItem, FakeDoc>>> {
    const item: FakeItem = { id: unit.unitKey, label: unit.label };
    const doc: FakeDoc = { id: `${item.id}-doc` };
    return Promise.resolve({
      kind: 'ok',
      value: { items: [item], documentsByItemId: new Map([[item.id, [doc]]]), count: 1 },
    });
  }

  fetchDocument(_item: FakeItem, doc: FakeDoc): Promise<FetchOutcome<StoredDocument>> {
    return Promise.resolve({
      kind: 'ok',
      value: { documentId: doc.id, byteLength: 10, contentType: 'text/plain', fileName: null },
    });
  }

  reprimeSession(): Promise<void> {
    return Promise.resolve();
  }
}
