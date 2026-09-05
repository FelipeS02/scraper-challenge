# Design: TRF5 PJe Scraper Core

## Technical Approach

One port boundary, four top-level folders. `src/engine/` is payload-generic and imports
nothing but its own types. `src/adapters/trf5/` is the only site adapter. `src/infra/`
holds driven adapters (axios transport, JSONL stores, clock, logger). `src/cli/` +
`src/main.ts` are the composition root — the only file that knows both sides exist.

Portability is proven by two mechanisms and nothing else: an ESLint rule that fails the
build on a seam violation, and a ~20-line fake adapter the whole engine suite runs
against. No registry, no plugin loader, no DI container. Every abstraction that only pays
off for a portal that does not exist is listed under Declined Abstractions.

## Module Layout

```
src/
  engine/      types.ts ports.ts scraper.ts pool.ts rate-limiter.ts
               retry-policy.ts backoff.ts coverage.ts frontier.ts budget.ts
  adapters/trf5/  site.ts traversal.ts session.ts search.ts classes.ts
               detail.ts documents.ts seeds.ts encoding.ts
               schemas/ (response-view.ts validity-chain.ts payload.ts)
               parsing/ (detail-page.ts result-fragment.ts)
  infra/       http/axios-transport.ts storage/jsonl-*.ts logging/logger.ts clock.ts
  cli/         args.ts dry-run.ts summary.ts
  main.ts
```

**Deviation from the pre-existing empty dirs** (`pje/ partition/ domain/ http/ storage/
logging/`): those names hide the seam. `pje/` and `partition/` are adapter concerns;
`domain/` implies a shared domain, which contradicts "the engine is generic over the
payload, not over a domain". Driven adapters group under `infra/` so the top level reads
**engine | adapters | infra | cli**. `openspec/config.yaml` is updated in this change
(already a resolved decision in the proposal).

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| D1 | **Two adapter-facing ports only**: `SitePort<TItem,TDoc>` + `TraversalPort<TCursor>` | (a) one fat `SitePort`; (b) four ports Session/Search/Detail/Documents | The engine needs exactly two capabilities: expand the work space, and turn a unit into items+documents. Session lifecycle is invisible to the engine except as one `FetchOutcome` kind, so it is **not** a port — it is adapter-internal. (b) would export TRF5's page structure through the seam. |
| D2 | **Transport returns bytes, never decoded text** | transport decodes with charset sniffing | RESEARCH §2.5: letting the HTTP layer guess corrupts ISO-8859-1 data. Decoding is an adapter decision, so it belongs behind the seam. |
| D3 | **Frontier support is a separate interface** `FrontierCapable<TItem,TCursor>`, required by the frontier runner, absent from the phase-1 loop | optional members on `TraversalPort` | Optional port members force `if (port.harvestSeeds)` branches into core. A separate interface keeps phase 2 an independently shippable slice. |
| D4 | **Lazy facet expansion**, not a date×facet cross product | seed all `days × 132 classes` up front | 132 requests per day before knowing whether a day even saturates. Facet expansion is triggered *only* by a saturated single-day window, bounded by `--max-facet-values`. |
| D5 | **Coverage/checkpoint/failure state = append-only JSONL logs**, replayed into memory on load | (a) SQLite; (b) single mutable JSON state file; (c) WAL + fsync | (a) adds a native dependency and a schema migration story for ~4 record types. (b) violates "records are never mutated" and corrupts on a kill mid-write. (c) protects against power loss, which is not the failure mode here (SIGINT is). A torn final line is dropped at load; a torn non-final line is fatal. |
| D6 | **Rate limiter is a global gate, not a per-task delay** | per-worker sleep; token bucket per host+path | RESEARCH §5 assumes per-IP limiting. Every request awaits `limiter.acquire()`; a 429 calls `tripCooldown(ms)` which closes that one gate, so all workers stall with zero cross-worker signalling. Pool bounds parallelism; limiter bounds rate; they never talk to each other. |
| D7 | **zod parses a normalized `ResponseView`, not raw HTML** | zod over a cheerio-extracted DOM; regex predicates | Each validity schema becomes a small predicate over discriminating features, mapping ~1:1 onto the RESEARCH §5 error table, and the chain is unit-testable without HTML. |
| D8 | **Invalid-token shell is detected by absence of the detail header/parties block**, not by absence of documents or by byte size | RESEARCH §5 case 1 ("detect by absence of the document table"); 28KB size threshold | *Justified deviation*: a legitimate process may have zero documents, so the documented heuristic produces false negatives. Size thresholds break the first time the site changes a stylesheet. |
| D9 | **`null` means "known absent" in emitted payloads; `?` optional only on internal types** | optional everywhere | JSON has no `undefined`, and `exactOptionalPropertyTypes` makes `{ x: undefined }` un-assignable to `{ x?: T }`. Optional *inputs* are declared `?: T \| undefined`; optional *outputs* are declared `?: T`. |
| D10 | **A fourth cell state `subdivided`**: a saturated cell whose `split()` returned children is recorded as `subdivided` carrying the result count observed at saturation, and is excluded from the summary's `complete`/`truncated`/`failed` tallies | (a) the parent records no cell at all (this design's own earlier rule); (b) reuse `truncated` with a `superseded: boolean` flag | (a) makes `Partition Invariant Verification` unsatisfiable: `verifyPartitionInvariant` sources a day's unfiltered count from that day's own `facetValue === null` record, so omitting the parent deletes the very number the invariant compares against — and the check does not fail loudly, it `continue`s, silently skipping the day it was written to protect. (b) overloads a state whose spec meaning is "a reported gap": the summary counts every `truncated` cell as a gap, so each *successfully closed* parent would be reported as a gap unless every reader remembered to consult the flag. A state that means two opposite things is the defect; the flag only hides it. Excluding `subdivided` from the three tallies is what stops a parent being double-counted alongside its own children. |
| D11 | **Absence of a result-page cap is `null`, never a sentinel number**: `SitePort.resultPageCap: number \| null`, mirrored by `CoverageRecord.declaredCap: number \| null` | (a) `Number.POSITIVE_INFINITY`; (b) a `0`/`-1` sentinel; (c) a separate `hasResultPageCap: boolean` | (a) is silently lossy, and this was verified rather than assumed: every record is written through `appendJsonlLine` (`src/infra/storage/jsonl.ts:13`), and `JSON.stringify` has no non-finite representation — `Infinity` serializes to `null`, so the ledger would persist a corrupted cap behind the adapter's back, which is exactly what the spec forbids. (b) makes a magic number indistinguishable from a genuine cap, and `count >= -1` marks *every* cell saturated. (c) permits two fields to contradict each other. `null` = "known absent" is already this design's rule (D9); reusing it beats inventing a second one. Consequence: `classifyCellState(resultCount, declaredCap: number \| null)` in `src/engine/coverage.ts` returns `complete` whenever `declaredCap === null`, `isSaturated` is `false` there, and such a unit is never passed to `split()`. |
| D12 | **`permanentError.reason` stays site-agnostic; adapter-specific detail rides beside it as opaque data**: `reason: 'notFound' \| 'invalidReference' \| 'schemaMismatch'` plus `detail: string \| null` | (a) keep the `invalidTokenShell` literal; (b) collapse the shell into `notFound`; (c) widen `reason` to a free-form `string` | (a) is the standing contradiction: `src/engine/types.ts:18` names a TRF5 observation (RESEARCH §5 case 1) inside a file whose own header claims it references no concrete site, and every future portal would have to widen an engine union to describe its own pages. (b) erases the distinction between an honest 404 (case 4) and a `200` that lies (case 1) — the distinction the coverage-honesty story rests on. (c) surrenders the exhaustive `switch` the engine relies on to classify outcomes. D8 is unchanged: the adapter still detects the shell by the absent detail-header/parties block and now reports `{ reason: 'invalidReference', detail: 'invalidTokenShell' }`, so only the site-agnostic condition crosses the seam while the ledger still records *why*. |
| D13 | **The detail page's grids paginate, and the documents grid is read whole by following its own a4j scroller, reconciled against the total it declares** | (a) keep single-page extraction (status quo); (b) fetch further pages but trust the extracted row count alone; (c) raise the grid's page size through a request parameter | RESEARCH §3's "there is no pagination" is scoped to the **search response** and is correct there — the recon searched that response for `datascroller`/`scroller`/`rows=` and found zero matches. The **detail page** is a different response and does contain `Richfaces.Datascroller` components: two are present in the captured `detail-page-valid.html` (both parties lists, `display: none` because each fits one page), and a live process with 24 documents renders one on its documents grid. Generalizing a search-response finding to the detail page is what made (a) look correct; it silently drops every document past page 1. (b) repeats this change's recurring defect — trusting an extracted count with nothing to check it against. Each grid already renders its own total as `N resultados encontrados`, so the parser records that declared total beside what it extracted and a shortfall is **reported**, never inferred away; that also keeps born-digital rows (skipped by design, D14) distinguishable from rows never seen. (c) invents a request parameter no observed response documents — the exact "invent HOW the site works" failure S5f was created to fix. Pagination follows the scroller's own `A4J.AJAX.Submit(<formId>, {parameters: {<scrollerId>: <page>, ajaxSingle: <scrollerId>}})` contract, harvested from the page rather than assumed, and every extra page is a request charged to the run budget. |
| D14 | **A born-digital document is recorded as seen-and-skipped, never omitted** | (a) drop the row entirely (status quo); (b) fetch the HTML viewer and store it as a document | The documents grid mixes two delivery shapes: legacy rows carrying `idBin=` (302 to a real PDF) and newer rows rendered through `documentoSemLoginHTML.seam?ca=…&idProcessoDoc=…`, a `text/html` editor view with no PDF at all. (a) makes the shortfall D13 measures unattributable — a missing row looks identical whether it was skipped by design or never fetched. (b) stores a viewer page as if it were the document, which is the "200 that lies" failure this design refuses everywhere else. The row is therefore extracted with its identifiers and a distinct outcome, so the declared-total reconciliation stays exact and a future slice can fetch the shape without re-scraping. |

## Interfaces / Contracts

```ts
// engine/types.ts — four failure kinds, exactly as core-resilience-policy requires
export type FetchOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'transient'; readonly status: number | null; readonly retryAfterMs: number | null }
  | { readonly kind: 'sessionExpired' }
  | { readonly kind: 'hostDefect'; readonly reason: string }
  | { readonly kind: 'permanentError';
      readonly reason: 'notFound' | 'invalidReference' | 'schemaMismatch';  // site-agnostic (D12)
      readonly detail: string | null };                    // adapter-owned, opaque to the engine

export type RetryDecision =
  | { readonly action: 'retryAfter'; readonly delayMs: number }
  | { readonly action: 'reprimeAndRetryNow' }
  | { readonly action: 'requeue' }        // 429: the global cooldown owns the wait
  | { readonly action: 'recordAndStop' }; // -> failure ledger

export interface WorkUnit<TCursor> {
  readonly unitKey: string;    // opaque to the engine; adapter-generated, stable
  readonly windowKey: string;  // opaque; engine only groups/compares by equality
  readonly facetValue: string | null;
  readonly label: string;      // human-readable, for logs and coverage records
  readonly cursor: TCursor;    // opaque JSON, round-tripped byte-identical
}
```

```ts
// engine/ports.ts
export interface HttpTransport {
  send(req: HttpRequest): Promise<HttpResponse>; // HttpResponse carries bytes, not text (D2)
}

export interface SitePort<TItem, TDoc> {
  readonly resultPageCap: number | null;   // TRF5 declares 30; null = no cap declared (D11)
  readonly identityKeyName: string;        // TRF5 declares 'processNumber'
  itemId(item: TItem): string;
  documentId(doc: TDoc): string;
  sourceUrl(item: TItem): string;
  discover(unit: WorkUnit<unknown>): Promise<FetchOutcome<DiscoverResult<TItem, TDoc>>>;
  fetchDocument(item: TItem, doc: TDoc): Promise<FetchOutcome<StoredDocument>>;
  reprimeSession(): Promise<void>;
}

export interface TraversalPort<TCursor> {
  readonly facetName: string;              // TRF5 declares 'classeJudicial'
  seed(bounds: RunBounds): Promise<readonly WorkUnit<TCursor>[]>;
  /** children -> the engine enqueues them and records the parent `subdivided` (D10);
   *  null = cannot subdivide further -> the engine records a `truncated` gap */
  split(unit: WorkUnit<TCursor>, saturated: SaturationInfo): Promise<readonly WorkUnit<TCursor>[] | null>;
}

export interface FrontierCapable<TItem, TCursor> {          // phase 2 only (D3)
  readonly seedKindRanking: readonly string[];              // TRF5: ['oab', 'exactName']
  harvestSeeds(item: TItem): readonly Seed[];
  unitFromSeed(seed: Seed, bounds: RunBounds): WorkUnit<TCursor>;
}

// CheckpointRecord persists the whole opaque WorkUnit — cursor + facetValue + label — plus the
// observed resultCount, so a `subdivided` parent is re-split on resume, with real SaturationInfo,
// without re-issuing its search (D10, "Re-split inputs").
export interface CheckpointStore { load(): Promise<ReadonlyMap<string, CheckpointRecord>>; put(r: CheckpointRecord): Promise<void>; }
export interface FailureLedger   { load(): Promise<readonly LedgerEntry[]>; record(e: LedgerEntry): Promise<void>; resolve(itemId: string, documentId: string | null): Promise<void>; }
export interface ItemSink<TItem> { write(r: OutputRecord<TItem>): Promise<void>; }
export interface CoverageSink    { write(c: CoverageRecord): Promise<void>; }
export interface AdapterStateStore { read(key: string): Promise<readonly unknown[]>; append(key: string, value: unknown): Promise<void>; }
export interface Clock { now(): Date; sleep(ms: number): Promise<void>; }
```

Dependency direction: `engine → (nothing)`. `adapters/trf5 → engine` (implements ports).
`infra → engine` (implements ports). `main.ts → all three`.

### `coverage.jsonl` record

```json
{ "schemaVersion": 1, "runId": "…", "phase": "sweep",
  "unitKey": "…", "windowKey": "2026-09-01..2026-09-01", "facetValue": "APELAÇÃO CÍVEL",
  "state": "complete", "resultCount": 12, "declaredCap": 30, "saturated": false,
  "itemSetHash": "sha1:…", "observedAt": "2026-09-03T20:00:00.000Z",
  "failureReason": null,
  "dimensions": { "dateFrom": "2026-09-01", "dateTo": "2026-09-01", "facetName": "classeJudicial" } }
```

`state` is one of `complete | truncated | failed | subdivided` (D10) and `declaredCap` is
`null` for a site that declares no cap (D11) — both are read back verbatim, never coerced.
`windowKey` and `facetValue` are opaque strings the core only compares for equality
(grouping for the partition invariant, counting for `--max-facet-values`) — the core never
parses a date. `dimensions` is adapter-owned and passed through, reusing the same opaque
pattern as `payload` in `items.jsonl` rather than inventing a second rule.

### `payload.movements[]` and `payload.documents[]`

```ts
type Movement = { sequence: number; occurredAt: string | null; rawDate: string | null;
                  description: string; cnjCode: string | null; rawCells: readonly string[] };
type Document = { documentId: string; binId: string; documentHash: string;
                  label: string;            // ISO-8859-1 decoded: "Decisão"
                  downloadUrl: string; fileName: string | null; contentType: string | null;
                  byteLength: number | null; fetchStatus: 'fetched' | 'skipped' | 'failed' };
```

`movements[].rawCells` exists because RESEARCH §8 states the `processoEvento` row
structure is **not yet mapped**. Preserving the cells verbatim means the deferred
value-standardization follow-up (TPU `cnjCode` hypothesis) can be resolved later without
re-scraping. It is removed once the row structure is confirmed. `cnjCode` is `null` until
then.

`occurredAt` carries no such deferral. The `cnjCode` exemption above is scoped to
`cnjCode` alone: `rawDate` is extracted from the row and `occurredAt` is the parsed form
of that same value, so a permanently-null `occurredAt` is an unimplemented field, not a
declared deferral. Corrected here because the implementation hardcoded it to `null` and a
test asserted that hardcoded value against a real captured fixture.

**Amended — this paragraph previously read "Document `fileName` is built only from
`[A-Za-z0-9._-]`-validated adapter ids (`<processNumber>-<documentId>.pdf`); the remote
label never reaches a filesystem path." That contradicted the `trf5-adapter` requirement
"Stable Document Filename Derivation", which mandates `<processNumber>/<idProcessoDocumento>-<slug>.pdf`
with the slug derived from the ISO-8859-1-decoded label. The spec is the requirement
source and the design serves it, so the spec governs; the implementation already followed
the spec.** Document paths derive their uniqueness **only** from `[A-Za-z0-9._-]`-validated
adapter ids (`processNumber` + `idProcessoDocumento`). The decoded remote label
contributes a decorative slug that never participates in uniqueness and can never escape
the output directory: every joined path component matches `[A-Za-z0-9._-]+`. The spec
requires degradation for a hostile, empty or unrepresentable label — not for an ordinary
label carrying one unsafe character — so the label is sanitized per character rather than
rejected whole, and only an empty result degrades to `<idProcessoDocumento>.pdf`.

## Data Flow

```
main.ts ─wires─→ TRF5Site/TRF5Traversal ──┐
                                          ├→ Scraper ─→ Pool(N=2..3) ─→ RateLimiter(gate)
CLI bounds ──→ Budget ────────────────────┘        │                        │
                                                   │                   AxiosTransport
    ┌──── discover(unit) ───────────────────────────┘                        │
    │  ok        → dedup(itemId) → ItemSink(items.jsonl) → CoverageSink   ───┘
    │             → fetch stage per document → documents/ + ledger on failure
    │  saturated  → split() → children enqueued + parent cell `subdivided`
    │                       | null (or max depth) → cell `truncated` ← the reported gap
    │  failure    → RetryPolicy → retryAfter | reprimeAndRetryNow | requeue | recordAndStop
    └──── after items are flushed → CheckpointStore.put(unitKey, cursor)
```

### Session / search / detail / document sequence

```
Adapter                          Site
  │ GET listView.seam ─────────────→│      harvest jsessionid (form fPP action),
  │ ←──────────────── 200 html ─────│      ViewState, field names, trigger id
  │ POST …;jsessionid=… (full field set + fPP:j_id244) ──→│
  │ ←── 200 text/xml result fragment ──────────────────────│
  │        ├─ Ajax-Response redirect → login.seam ⇒ sessionExpired ⇒ reprime + replay once
  │        └─ ok ⇒ N rows, each with an opaque `ca`
  │ GET Detalhe…listView.seam?ca=… ────→│  (requires primed session)
  │ ←── 200 detail html (ISO-8859-1) ───│  ⇒ ResponseView ⇒ zod chain ⇒ payload
  │ GET …?idBin&idProcessoDocumento&nomeArqProcDocBin ──→│
  │ ←── 302 → application/pdf ───────────────────────────│  ⇒ bytes ⇒ documents/<id>.pdf
```

### Validity chain (ordered, first match wins)

| Order | Schema | Discriminator (over `ResponseView`) | Outcome |
|---|---|---|---|
| 1 | `sessionExpired` | `text/xml` + `Ajax-Response: redirect` + `login.seam` | `sessionExpired` (case 3) |
| 2 | `unprimedSession` | `errorUnexpected.seam?cid=` **without** `PersistenceException` | `sessionExpired` (case 2) |
| 3 | `hostDefect` | `errorUnexpected.seam` **with** `PersistenceException` | `hostDefect` (case 5) |
| 4 | `invalidTokenShell` | 200 + no detail header/parties block (D8) | `permanentError:invalidReference` + `detail: 'invalidTokenShell'` (case 1, D12) |
| 5 | `validDetail` | full payload schema parses | `ok` |

404 (case 4) and 429/5xx/timeout (case 6) are classified at the transport boundary before
the chain runs. Five schemas collapse into the four `FetchOutcome` kinds the spec names.

### Retry mapping

| Outcome | Attempt < cap | Cap reached | Cap |
|---|---|---|---|
| `transient` 429 | `requeue` + `tripCooldown(Retry-After ?? backoff)` | `recordAndStop` | 5 |
| `transient` 5xx/timeout | `retryAfter(cappedJitteredExponential)` | `recordAndStop` | 5 |
| `sessionExpired` | `reprimeAndRetryNow` (delay 0) | `recordAndStop` | 1 replay |
| `hostDefect` | `retryAfter` | `recordAndStop` | 2 |
| `permanentError` | — | `recordAndStop` | 0 |

Defaults: base 1s, factor 2, jitter 0.3, cap 60s, politeness spacing ~500ms.
`Retry-After` always wins; `withCap` is mandatory (an uncapped strategy is not exported
from the production composition).

## Resumability and Idempotency

| Concern | Semantics |
|---|---|
| Write order | items → coverage → **then** checkpoint. A crash between them re-runs the unit. |
| Guarantee | **At-least-once** item/coverage lines; **exactly-once cell accounting** at read time (dedup by adapter `itemId`; latest-by-`observedAt` per `unitKey`). |
| Resume | Skip any `unitKey` whose latest checkpoint state is `complete` or `truncated`. `failed` units are retried. A `subdivided` parent is **re-split, never re-searched**: its persisted work unit goes straight to `split()`, the returned children are enqueued, and those already checkpointed `complete` are skipped individually. Re-issuing the parent's `discover` would return the same capped set it already recorded — a wasted request that teaches the engine nothing. Skipping the parent outright would instead strand every child the kill interrupted, since children exist only in the in-memory queue. |
| Re-split inputs | Reconstructed from persisted state, never from a request. `CheckpointRecord` carries the whole opaque `WorkUnit` — the byte-identical `cursor` it already round-trips, plus the adapter-owned `facetValue` and `label` — and `split()` reads `facetValue`, so the engine must not fabricate an adapter-owned field it failed to save. `SaturationInfo` (`resultCount`, `cap`) is reconstructed the same way: `resultCount` is the third field `CheckpointRecord` persists, read back verbatim off the parent's own checkpoint, never off `CoverageSink` — that port is write-only (no `load()`), so a coverage record can never be read back at resume time, and no corrected design should imply it is. `cap` is not persisted at all; it is read live from `SitePort.resultPageCap` on every resume, since a declared cap is a static site property, not run history. An earlier version of this implementation substituted `cap ?? 0` for the observed `resultCount` at this exact reconstruction point — a fabrication caught by a follow-up verification, not by apply, and corrected alongside this row (see `apply-progress.md`). TRF5's `split()` ignores `SaturationInfo` today (`traversal.ts:65`, `_saturated`), but the port keeps passing it: another adapter may legitimately need the observed count to choose how to subdivide, and the checkpoint can supply it without a request. |
| Ledger key | adapter `itemId` + `documentId` (`null` for a discovery failure). |
| Document retry | `retry-failed` replays only `fetchDocument`; it never re-issues the cell's search POST. |
| Resolution | Appends a `resolved: true` line — never edits or deletes the original. |
| Crash tolerance | Torn final line dropped at load with a warning; a malformed non-final line is fatal (silent data loss is worse than a hard stop). |

Files: `output/items.jsonl`, `output/coverage.jsonl`, `output/state/{checkpoints,failures,seeds}.jsonl`,
`output/documents/`. All git-ignored.

## Partitioning

```
process(unit):                              // engine side — names no partitioning dimension
  r = discover(unit)
  if cap == null or r.count < cap  -> cell `complete`   (a site with no cap never saturates, D11)
  else if depth(unit) >= maxSplitDepth
                                   -> cell `truncated`  ← the depth bound is treated
                                                          exactly as a null split
  else:
     children = split(unit, { resultCount: r.count, cap })
     if children != null           -> cell `subdivided`, resultCount = r.count (D10)
                                      + enqueue children at depth(unit)+1
     else                          -> cell `truncated`  ← the reported gap
```

```
TRF5Traversal.split(unit):                  // adapter side — owns every dimension (D4)
  if dateFrom != dateTo  -> date bisect: mid = from + ⌊(to-from)/2⌋; [from,mid],[mid+1,to]
  if facetValue != null  -> null                    // already one day and one class
  else                   -> ≤ --max-facet-values per-class units for that day (null if empty)
```

Saturation is `count >= sitePort.resultPageCap` (`>=`, defensively) and is never evaluated
when the adapter declares no cap. Facet expansion is a *branch inside `split()`*, not an
engine branch — the engine sees only "children or `null`" and records `subdivided` whichever
dimension the adapter used. Date bisection is a pure function of the work unit and issues no
request; the facet branch fetches the class catalogue, so `split()` is not request-free. That
cost is identical on a first run and on a resume, and it is never the search POST. `depth` is engine-owned state keyed by `unitKey`; it is never a
field on the adapter-generated `WorkUnit`, because the engine must not make an adapter
maintain the engine's own loop-safety bookkeeping. Boundary contract test covers the
`mid`/`mid+1` off-by-one; dedup by `itemId` is the safety net.

## Seam Enforcement

`eslint.config.js` gains one block appended before the `prettier` entry:

```js
{
  files: ['src/engine/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', { patterns: [
      { group: ['**/adapters/**', '**/infra/**', '**/cli/**'], message: 'engine/ must not import an adapter — this is the ports/adapters seam.' },
      { group: ['axios', 'axios-*', 'cheerio', 'tough-cookie'], message: 'engine/ must not touch a transport or an HTML parser; go through HttpTransport.' },
    ]}],
  },
}
```
`no-restricted-imports` (core rule) rather than the TS-ESLint variant: it is not type-aware
and therefore cannot be silenced by a type-only import under `verbatimModuleSyntax`.
`infra/` and `cli/` are added beyond the spec's mandated three — a superset, still
satisfying the requirement. `pnpm lint` runs in `pnpm check`; a violation fails the build.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (pure) | backoff composition/jitter/cap, retry mapping table, date bisection boundaries, yield decay, coverage arithmetic, `subdivided` excluded from all three tallies, `null`-cap classification never saturating, partition invariant read off the persisted `subdivided` parent, set hash, envelope assembly, CLI bounds | vitest, no I/O, no fakes needed |
| Port-level | full engine loop: 429 global cooldown, `Retry-After` precedence, re-prime + replay, discover-failure skips fetch, document failure keeps the item, saturated unit records `subdivided` **and** enqueues children, max split depth degrades to `truncated` without calling `split()` again, resume re-splits a subdivided parent without re-issuing `discover`, torn-line tolerance | vitest + `StubTransport` + `FakeClock` (`vi.useFakeTimers()`) + in-memory stores |
| Portability proof | whole `engine/` suite green against a ~20-line `FakeSite`/`FakeTraversal` | assert `adapters/trf5` is never imported; ESLint seam rule is the second half of the proof |
| Adapter parsing | all six RESEARCH §5 cases, ISO-8859-1 label decode, colliding `Decisão` filenames, full field inventory, 132-class catalogue | vitest against **redacted** fixture HTML — synthetic CPFs and names only |
| E2E | — | **N/A by design** — browser automation is forbidden by the brief, not merely unavailable |
| Live site | — | Forbidden for 429, backoff, and session recovery. Manual smoke runs only. |

Strict TDD: RED first for every unit above. Task 1 is `pnpm add -D vitest @vitest/coverage-v8`
— without it there is no RED step.

## Threat Matrix

N/A — no routing, shell command, subprocess, VCS/PR automation, executable-file
classification, or process-integration boundary. One adjacent risk is handled explicitly in
the design: remote-controlled filenames (see `payload.documents[]` — paths are built only
from validated adapter ids, never from `nomeArqProcDocBin`).

## Delivery Forecast (400-line review budget, auto-chain)

| Slice | Scope | Est. changed lines |
|---|---|---|
| S1 | vitest + coverage install, ESLint seam rule, `engine/types.ts` + `ports.ts`, backoff, retry policy, rate limiter, pool, fake adapter + tests | ~380 |
| S2 | `scraper.ts` two-stage loop, JSONL sinks/checkpoint/ledger/state stores, coverage ledger + invariants + set hash | ~390 |
| S3 | TRF5 session priming, search POST, class catalogue, `ResponseView` + zod validity chain, fixtures | ~390 |
| S4 | TRF5 detail parsing (full field inventory), payload assembly, document fetch + ISO-8859-1 + filenames | ~390 |
| S5 | CLI args/bounds, dry-run forecast, `main.ts`, run summary, README, `openspec/config.yaml` update | ~350 |
| S6 | Frontier crawl: seed harvest/persist, ranking, yield decay, budget (additive, off by default) | ~300 |

Total ≈ 2200 changed lines. Chained PRs required; S1+S2 must land before S3.
S1–S5 satisfy every stated evaluation criterion; S6 is additive.

## Migration / Rollout

No migration — greenfield. State files carry `schemaVersion`; a rollback either deletes
`output/` and re-runs, or keeps it and resumes, since every line is independently valid.

## Declined Abstractions (deliberate)

Adapter registry / plugin loader; DI container (`main.ts` uses `new`); config-file or
env-driven indirection (CLI flags only); a shared `src/domain/` model between core and
adapter; a generic multi-axis partitioner in core (bisection is TRF5's shape); an event bus;
a pluggable retry-strategy interface (three named functions, composed); SQLite/WAL/fsync;
`p-limit`/`p-queue` (the pool is ~30 lines); a second adapter. Each pays off only for a
portal that does not exist. Constraint 2 (no over-engineering) won every one of these;
constraint 1 (graded portability) won D1, D2, D3, and the `dimensions`/`payload` opacity.

## Open Questions

- [ ] `movements[]` row structure is unmapped (RESEARCH §8) — `rawCells` is the honest
      placeholder; the TPU `cnjCode` hypothesis is untested.
- [ ] Whether `ca` tokens survive across sessions (affects whether a resumed run can reuse
      persisted `ca` values or must re-discover). Assumed **not** durable until measured.
- [ ] Whether a process can carry more than one judicial class (would make the facet
      partition overlapping rather than disjoint — harmless given dedup, but unverified).
