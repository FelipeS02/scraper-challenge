import type { FetchOutcome, WorkUnit } from './types.js';

/**
 * Every port an adapter (driving: SitePort/TraversalPort/FrontierCapable) or a driven
 * implementation (infra: transport/storage/clock) must satisfy. The engine imports
 * nothing else across the seam (design.md D1).
 */

export interface HttpRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly body?: Uint8Array | string | undefined;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array; // transport returns bytes, never decoded text (D2)
}

export interface HttpTransport {
  send(req: HttpRequest): Promise<HttpResponse>;
}

export interface DiscoverResult<TItem, TDoc> {
  readonly items: readonly TItem[];
  readonly documentsByItemId: ReadonlyMap<string, readonly TDoc[]>;
  readonly count: number;
}

export interface StoredDocument {
  readonly documentId: string;
  readonly byteLength: number;
  readonly contentType: string | null;
  readonly fileName: string | null;
}

export interface SitePort<TItem, TDoc> {
  readonly resultPageCap: number; // TRF5 declares 30
  readonly identityKeyName: string; // TRF5 declares 'processNumber'
  itemId(item: TItem): string;
  documentId(doc: TDoc): string;
  sourceUrl(item: TItem): string;
  discover(unit: WorkUnit<unknown>): Promise<FetchOutcome<DiscoverResult<TItem, TDoc>>>;
  fetchDocument(item: TItem, doc: TDoc): Promise<FetchOutcome<StoredDocument>>;
  reprimeSession(): Promise<void>;
}

export interface RunBounds {
  readonly dateFrom: string; // adapter-interpreted; opaque to the engine
  readonly dateTo: string;
  readonly maxFacetValues: number;
}

export interface SaturationInfo {
  readonly resultCount: number;
  readonly cap: number;
}

export interface TraversalPort<TCursor> {
  readonly facetName: string; // TRF5 declares 'classeJudicial'
  seed(bounds: RunBounds): Promise<readonly WorkUnit<TCursor>[]>;
  /** null = cannot subdivide further -> the engine records a `truncated` gap */
  split(
    unit: WorkUnit<TCursor>,
    saturated: SaturationInfo,
  ): Promise<readonly WorkUnit<TCursor>[] | null>;
}

export interface Seed {
  readonly kind: string;
  readonly value: string;
}

/** Phase-2 only (design.md D3) — absent from the phase-1 discover/fetch loop. */
export interface FrontierCapable<TItem, TCursor> {
  readonly seedKindRanking: readonly string[]; // TRF5: ['oab', 'exactName']
  harvestSeeds(item: TItem): readonly Seed[];
  unitFromSeed(seed: Seed, bounds: RunBounds): WorkUnit<TCursor>;
}

export interface CheckpointRecord {
  readonly unitKey: string;
  readonly windowKey: string;
  readonly cursor: unknown; // adapter-opaque, round-tripped byte-identical
  readonly state: 'complete' | 'truncated' | 'failed';
  readonly observedAt: string;
}

export interface CheckpointStore {
  load(): Promise<ReadonlyMap<string, CheckpointRecord>>;
  put(record: CheckpointRecord): Promise<void>;
}

export interface LedgerEntry {
  readonly itemId: string;
  readonly documentId: string | null; // null for a discovery-stage failure
  readonly reason: string;
  readonly observedAt: string;
  readonly resolved?: boolean;
}

export interface FailureLedger {
  load(): Promise<readonly LedgerEntry[]>;
  record(entry: LedgerEntry): Promise<void>;
  resolve(itemId: string, documentId: string | null): Promise<void>;
}

export interface OutputRecord<TItem> {
  readonly schemaVersion: number;
  readonly itemId: string;
  readonly scrapedAt: string;
  readonly sourceUrl: string;
  readonly runId: string;
  readonly payload: TItem;
}

export interface ItemSink<TItem> {
  write(record: OutputRecord<TItem>): Promise<void>;
}

export interface CoverageRecord {
  readonly schemaVersion: number;
  readonly runId: string;
  readonly phase: 'sweep' | 'frontier';
  readonly unitKey: string;
  readonly windowKey: string;
  readonly facetValue: string | null;
  readonly state: 'complete' | 'truncated' | 'failed';
  readonly resultCount: number;
  readonly declaredCap: number;
  readonly saturated: boolean;
  readonly itemSetHash: string;
  readonly observedAt: string;
  readonly failureReason: string | null;
  readonly dimensions: Readonly<Record<string, unknown>>;
}

export interface CoverageSink {
  write(record: CoverageRecord): Promise<void>;
}

export interface AdapterStateStore {
  read(key: string): Promise<readonly unknown[]>;
  append(key: string, value: unknown): Promise<void>;
}

export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}
