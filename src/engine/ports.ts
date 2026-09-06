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
  // Adapter-returned bytes. The adapter never touches the filesystem (same
  // separation as ItemSink); only the engine, through DocumentSink, persists them.
  readonly bytes: Uint8Array;
}

export interface DocumentSink {
  /**
   * Persists document bytes at an adapter-derived relative path and returns the
   * number of bytes actually written. The engine trusts this return value, not
   * any byteLength the adapter merely claims (core-run-control-and-output,
   * "Document Persistence to Disk").
   */
  write(relativePath: string, bytes: Uint8Array): Promise<number>;
}

/**
 * The real, engine-observed outcome of one document fetch attempt — payload-
 * generic (design.md D1), never a site-specific shape (S5i tasks 5i.1/5i.2).
 * `byteLength` is the DocumentSink's own persisted-size return value when a
 * file was written, never the adapter's merely-claimed size (same discipline
 * `engine/scraper.ts`'s `document.persisted` event already applies).
 */
export interface DocumentFetchOutcome {
  readonly fetchStatus: 'fetched' | 'failed';
  readonly byteLength: number | null;
  readonly fileName: string | null;
  /**
   * What the host DECLARED it was sending, as captured on the adapter's
   * `StoredDocument`. It is a record of the claim, never the evidence: the
   * adapter already decided the fetch succeeded by inspecting the bytes
   * themselves, because this host answers 200 with the wrong body for most
   * failures (docs/RESEARCH.md §5). Carried through so the payload states
   * what actually happened rather than dropping the value at this boundary.
   */
  readonly contentType: string | null;
}

export interface SitePort<TItem, TDoc> {
  readonly resultPageCap: number | null; // TRF5 declares 30; null = no cap declared (D11)
  readonly identityKeyName: string; // TRF5 declares 'processNumber'
  itemId(item: TItem): string;
  documentId(doc: TDoc): string;
  sourceUrl(item: TItem): string;
  discover(unit: WorkUnit<unknown>): Promise<FetchOutcome<DiscoverResult<TItem, TDoc>>>;
  fetchDocument(item: TItem, doc: TDoc): Promise<FetchOutcome<StoredDocument>>;
  reprimeSession(): Promise<void>;
  /**
   * Returns a new `TItem` with `doc`'s matching entry updated to reflect
   * `outcome` — the engine never mutates or inspects the opaque item shape
   * itself (design.md D1/D2). Called before the item reaches `ItemSink`, so
   * a persisted item's own document list tells the truth about what was
   * actually fetched (core-run-control-and-output, "the payload tells the
   * truth about what was extracted and fetched", S5i). A document never
   * attempted is left exactly as the adapter's own `discover()` produced it
   * — the engine only calls this for a document it actually tried.
   */
  withDocumentOutcome(item: TItem, doc: TDoc, outcome: DocumentFetchOutcome): TItem;
}

export interface RunBounds {
  readonly dateFrom: string; // adapter-interpreted; opaque to the engine
  readonly dateTo: string;
  readonly maxFacetValues: number;
}

export interface SaturationInfo {
  readonly resultCount: number;
  readonly cap: number | null;
}

export interface TraversalPort<TCursor> {
  readonly facetName: string; // TRF5 declares 'classeJudicial'
  seed(bounds: RunBounds): Promise<readonly WorkUnit<TCursor>[]>;
  /** children -> the engine enqueues them and records the parent `subdivided` (D10);
   *  null = cannot subdivide further -> the engine records a `truncated` gap */
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
  // `facetValue`/`label` round-trip the rest of the opaque WorkUnit alongside
  // `cursor`, so a `subdivided` parent can be reconstructed and re-split on
  // resume without re-issuing its search (design.md D10, "Re-split inputs").
  readonly facetValue: string | null;
  readonly label: string;
  readonly cursor: unknown; // adapter-opaque, round-tripped byte-identical
  // The observed result count at the moment this cell was last classified —
  // read back verbatim, never re-derived from `declaredCap`. This is what
  // lets a `subdivided` parent's SaturationInfo be reconstructed from the
  // persisted checkpoint on resume, instead of fabricating it from the
  // declared cap (design.md D10, "Re-split inputs").
  readonly resultCount: number;
  readonly state: 'complete' | 'truncated' | 'failed' | 'subdivided';
  readonly observedAt: string;
}

export interface CheckpointStore {
  load(): Promise<ReadonlyMap<string, CheckpointRecord>>;
  put(record: CheckpointRecord): Promise<void>;
}

export interface LedgerEntry {
  readonly itemId: string; // for a discovery-stage failure, the unit's `unitKey` (no item was ever produced)
  readonly documentId: string | null; // null for a discovery-stage failure
  readonly reason: string;
  readonly observedAt: string;
  readonly resolved?: boolean;
  // Opaque TItem/TDoc payloads (S2 correction, same opacity pattern as `cursor`/`payload`):
  // without these, `retry-failed` would have no way to call `SitePort.fetchDocument(item, doc)`
  // again without re-running discovery, which contradicts "document retry does not re-discover".
  readonly item?: unknown;
  readonly doc?: unknown;
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
  readonly state: 'complete' | 'truncated' | 'failed' | 'subdivided';
  readonly resultCount: number;
  readonly declaredCap: number | null;
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

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  readonly level: LogLevel;
  readonly event: string; // stable machine-readable key, e.g. 'unit.started'
  readonly fields: Readonly<Record<string, unknown>>;
}

/**
 * Fire-and-forget observability port (core-run-control-and-output, "Structured
 * Run Observability"). Emitting an event MUST NOT be able to fail, delay, or
 * alter a run's outcome — the caller absorbs a throwing implementation itself.
 */
export interface Logger {
  log(event: LogEvent): void;
}
