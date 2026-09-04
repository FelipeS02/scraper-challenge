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

## Interfaces / Contracts

```ts
// engine/types.ts — four failure kinds, exactly as core-resilience-policy requires
export type FetchOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'transient'; readonly status: number | null; readonly retryAfterMs: number | null }
  | { readonly kind: 'sessionExpired' }
  | { readonly kind: 'hostDefect'; readonly reason: string }
  | { readonly kind: 'permanentError'; readonly reason: 'notFound' | 'invalidTokenShell' | 'schemaMismatch' };

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
  readonly resultPageCap: number;          // TRF5 declares 30
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
  /** null = cannot subdivide further -> the engine records a `truncated` gap */
  split(unit: WorkUnit<TCursor>, saturated: SaturationInfo): Promise<readonly WorkUnit<TCursor>[] | null>;
}

export interface FrontierCapable<TItem, TCursor> {          // phase 2 only (D3)
  readonly seedKindRanking: readonly string[];              // TRF5: ['oab', 'exactName']
  harvestSeeds(item: TItem): readonly Seed[];
  unitFromSeed(seed: Seed, bounds: RunBounds): WorkUnit<TCursor>;
}

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
then. Document `fileName` is built **only** from `[A-Za-z0-9._-]`-validated adapter ids
(`<processNumber>-<documentId>.pdf`); the remote label never reaches a filesystem path.

## Data Flow

```
main.ts ─wires─→ TRF5Site/TRF5Traversal ──┐
                                          ├→ Scraper ─→ Pool(N=2..3) ─→ RateLimiter(gate)
CLI bounds ──→ Budget ────────────────────┘        │                        │
                                                   │                   AxiosTransport
    ┌──── discover(unit) ───────────────────────────┘                        │
    │  ok        → dedup(itemId) → ItemSink(items.jsonl) → CoverageSink   ───┘
    │             → fetch stage per document → documents/ + ledger on failure
    │  saturated  → TraversalPort.split() → children requeued | null → `truncated` gap
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
| 4 | `invalidTokenShell` | 200 + no detail header/parties block (D8) | `permanentError:invalidTokenShell` (case 1) |
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
| Resume | Skip any `unitKey` whose latest checkpoint state is `complete` or `truncated`. `failed` units are retried. |
| Ledger key | adapter `itemId` + `documentId` (`null` for a discovery failure). |
| Document retry | `retry-failed` replays only `fetchDocument`; it never re-issues the cell's search POST. |
| Resolution | Appends a `resolved: true` line — never edits or deletes the original. |
| Crash tolerance | Torn final line dropped at load with a warning; a malformed non-final line is fatal (silent data loss is worse than a hard stop). |

Files: `output/items.jsonl`, `output/coverage.jsonl`, `output/state/{checkpoints,failures,seeds}.jsonl`,
`output/documents/`. All git-ignored.

## Partitioning

```
process(unit):
  r = discover(unit)
  if r.count < cap            -> cell `complete`
  else:
     children = split(unit)   -> date bisect: mid = from + ⌊(to-from)/2⌋; [from,mid],[mid+1,to]
     if children != null      -> requeue children (parent records no cell)
     else if facetValue==null -> expand into ≤ --max-facet-values units for that day (D4)
     else                     -> cell `truncated`  ← the reported gap
```
Saturation is `count >= sitePort.resultPageCap` (`>=`, defensively). Boundary contract test
covers the `mid`/`mid+1` off-by-one; dedup by `itemId` is the safety net.

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
| Unit (pure) | backoff composition/jitter/cap, retry mapping table, date bisection boundaries, yield decay, coverage arithmetic, set hash, partition invariant, envelope assembly, CLI bounds | vitest, no I/O, no fakes needed |
| Port-level | full engine loop: 429 global cooldown, `Retry-After` precedence, re-prime + replay, discover-failure skips fetch, document failure keeps the item, checkpoint resume, torn-line tolerance | vitest + `StubTransport` + `FakeClock` (`vi.useFakeTimers()`) + in-memory stores |
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
