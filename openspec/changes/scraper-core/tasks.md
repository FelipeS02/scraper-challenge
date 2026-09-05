# Tasks: TRF5 PJe Scraper Core

## Review Workload Forecast

**Revised after S1 landed.** The original forecast assumed ~400 changed lines per slice and
did not account for the test mass that strict TDD makes mandatory. S1 measured 749 authored
lines against a 380 estimate; 351 of the 656 lines under `src/` are tests and fixtures — more
than half the source. The per-slice budget is therefore raised to **800**, and S2..S6 are
re-estimated below. S1 is recorded as an accepted `size:exception`.

| Field | Value |
|---|---|
| Per-slice review budget | 800 changed lines (raised from 400) |
| Estimated changed lines | ~7500 authored (S1 749 actual, S2a 808 actual, S2b 663 actual, S3 835 actual, S4a 729 actual, S4b 266 actual, S4c 409 actual, S4d 83 actual, S5a 575 actual, S5c 1084 actual, S5b 775 actual for tasks 5.1–5.8 only — apply stopped mid-slice on a discovered gap, see the S5b section, S6 ~450) — corrected running total; S5c landed above even its own ~950–1300 high-end forecast |
| 800-line budget risk | Medium overall since the S4a/S4b split broke a four-slice overrun streak — **S5c landed at 1084, an accepted `size:exception`**, see "S5c forecast (decide before launch)" below |
| Chained PRs recommended | Yes |
| Suggested split | S1 -> S2a -> S2b -> S3 -> S4a -> S4b -> S4c -> S4d -> S5a -> S5c -> S5b -> S6 (S1+S2a+S2b hard-gate S3; S5a hard-gates S5c; S5c hard-gates S5b; sequential, no parallel writers) |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain — PR #1 targets `feat/scraper-core`; each child PR targets the previous PR branch; only the tracker merges to `main` |

Decision needed before apply: **Resolved 2026-09-04 — the owner granted an explicit
`size:exception` for S5c and directed that it ship whole rather than split.** S5c's forecast
(~950–1300 authored lines) exceeds the 800-line budget on its own low end; a split into a
coverage-mechanism half and a contract-hygiene half was offered and declined. S5c therefore
joins S1 and S3 as an accepted `size:exception`. S4 was split into S4a/S4b before launch (see
the third revision below).
Chained PRs recommended: Yes
800-line budget risk: High

### How the estimates were re-derived (second revision, after S2a)

The first revision applied a 1.33x factor to the original per-slice guesses. That was the
wrong method and it failed immediately: S2 was re-estimated at ~550 and its storage half
alone measured 808. Multiplying an unmeasured estimate by a factor produces another
unmeasured estimate, only more confident.

What two measured slices actually show:

- A slice that declares types and stores costs ~100 lines per persisted record type once
  tests are counted. S2a's five JSONL stores plus `coverage.ts` came to 808 for six units.
- Tests and fixtures run slightly over half of authored source under strict TDD. S1: 351 of
  656. S2a: 511 of 808. Budget for roughly 1 line of test per line of production code.

S3..S6 above are re-derived from those two ratios rather than from a multiplier, using each
slice's count of distinct units (parsers, schemas, stores, commands). They remain estimates.
The rule going forward is to **split by coherent deliverable rather than raise the budget**:
S2 blew its budget because it was two deliverables (persistence, and the loop over it) filed
as one, not because 800 was too small a number.

Excluded from every count: `pnpm-lock.yaml` and any other generated file. The native
`gentle-ai sdd-attempt` runtime counts the lockfile in its own accounting, and it counts
insertions plus deletions rather than authored net, so its `changed_lines` figure reads
substantially higher than the authored numbers here. S3: 987 counted, 835 authored.

### Third revision, after S3

The second revision's method — derive from measured ratios instead of a multiplier — did not
work either. S3 was estimated at ~550/600 by that method and measured 835. That is four
measured slices and four overruns:

| Slice | Estimate | Authored actual | Over by |
|---|---|---|---|
| S1 | 380 | 749 | 97% |
| S2a + S2b | 550 (as one S2) | 1471 | 168% |
| S3 | 600 | 835 | 39% |

The overruns are shrinking as the estimates get more grounded, but the sign has never flipped.
Treat every remaining estimate as a floor, not a midpoint: assume S4 lands near 900 and S5/S6
near 700 unless their boundaries are cut first.

The standing rule is unchanged and now has more evidence behind it: **split by coherent
deliverable rather than raise the budget.** 800 was not raised for S3; S3 was accepted as a
`size:exception` because splitting a green 14-task slice for a 4.4% overage buys no review
clarity. That reasoning does not extend to S4, whose estimate is 650 against the same 800 cap
with a worse track record behind it. Decide S4's boundary before launching it — for example
detail-page parsing and payload assembly (4.1–4.14) separately from document fetch, decode,
and filename derivation (4.15–4.18) — rather than discovering the overage at settle time.

### S5c forecast (decide before launch)

S5c is estimated bottom-up at ~800 authored lines by summing its ~29 tasks group by group —
already at the cap by itself, before any correction. Every measured single-deliverable slice
in this project has landed over its own pre-launch estimate: S3 at 1.39x, S4 (combined) at
1.53x, S5a at 1.74x. S5c's shape — wiring new behavior into the existing `scraper.ts` loop,
plus a new engine-owned depth tracker, plus two genuinely novel test fixtures (a non-date fake
adapter, a symbol-to-requirement audit) — is closer in kind to S5a (wiring into existing code)
than to a green-field adapter slice, so the honest range is **~950–1300 authored `src/`
lines**, applying S5a's and S3's measured multipliers to the ~800 bottom-up figure. This
already exceeds the 800-line budget on the low end of the range.

Per `delivery_strategy: single-pr`, an over-budget forecast means **apply must not start**
until the owner grants an explicit `size:exception` for S5c, exactly as for S1 and S3 — or
decides to split it further before launch, the way S4 and S5 were each split pre-launch on
weaker evidence than this. That decision belongs to the owner, not to this task breakdown: the
estimate above is not shaved to fit, and S5c is not silently pre-split here.

**Owner decision (2026-09-04): `size:exception` granted; S5c ships whole.** A split along the
two failure modes was proposed — a coverage-mechanism half (split wiring, `subdivided`,
coverage arithmetic, checkpoint/resume, the sweep-flow document) and a contract-hygiene half
(`resultPageCap: number | null`, D12's `invalidReference` + `detail`, the reverse-coverage
audit) — and declined in favour of a single slice. Reviewers should expect a PR well above
800 lines and treat the two groups as separable review passes even though they land together.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| S1 | Portable engine primitives + enforced seam, proven against a fake adapter | PR 1 | `vitest run src/engine` | N/A — no CLI yet; proof is the fake-adapter suite | Delete `src/engine/{types,ports,backoff,retry-policy,rate-limiter,pool}.ts`, fixtures, eslint seam block, vitest devDeps |
| S2a | Durable append-only JSONL state + coverage arithmetic, crash-safe on read-back | PR 2 | `vitest run src/engine/coverage.test.ts src/infra/storage` | N/A — pure functions and file I/O, no loop yet | Delete `src/engine/coverage.ts`, `src/infra/storage/*`; S1 untouched |
| S2b | Two-stage discover->fetch loop over the S2a stores, resumable after a crash | PR 3 | `vitest run src/engine` | N/A — proven by driving `engine/scraper.ts` directly in tests | Delete `src/engine/scraper.ts` and its test; S1 and S2a untouched |
| S3 | TRF5 session priming + search + content-based validity classification against redacted fixtures | PR 4 | `vitest run src/adapters/trf5/session.test.ts src/adapters/trf5/search.test.ts src/adapters/trf5/traversal.test.ts src/adapters/trf5/schemas` | N/A — no detail/document stage or CLI wired yet | Delete `src/adapters/trf5/{session,search,classes,traversal,encoding}.ts`, `schemas/{response-view,validity-chain}.ts`, fixtures |
| S4a | Full detail-page field inventory + spec-conformant payload assembly | PR 5 | `vitest run src/adapters/trf5/detail.test.ts src/adapters/trf5/parsing src/adapters/trf5/payload.test.ts src/adapters/trf5/schemas` | N/A — CLI not wired until S5 | Delete `src/adapters/trf5/detail.ts`, `parsing/*`, `schemas/payload.ts`; S3 untouched |
| S4b | Document fetch through 302, byte-level decode, stable filename derivation | PR 6 | `vitest run src/adapters/trf5/documents.test.ts src/adapters/trf5/encoding.test.ts` | N/A — CLI not wired until S5 | Delete `src/adapters/trf5/{documents,encoding}.ts`; S4a untouched |
| S4c | Document bytes actually persisted, under session-independent human-navigable paths | PR 7 | `vitest run src/adapters/trf5/documents.test.ts src/infra/storage/fs-document-sink.test.ts src/engine/scraper.test.ts` | N/A — CLI not wired until S5 | Delete `src/infra/storage/fs-document-sink.ts` and the `DocumentSink` port; revert the path builder to S4b's `ca`-derived filename |
| S4d | Every document-persistence test proven to detect a defect; the two behaviors S4c left uncovered done under real strict TDD | PR 8 | `vitest run src/adapters/trf5/documents.test.ts src/infra/storage/fs-document-sink.test.ts src/engine/scraper.test.ts` | N/A — CLI not wired until S5 | Revert `documents.ts` slug folding and drop the tests added here; S4c behavior is unchanged |
| S5a | Every engine lifecycle transition observable through a port, redacted, unable to fail the run | PR 9 | `vitest run src/infra/logging src/engine/scraper.test.ts` | N/A — no CLI yet; proof is `RecordingLogger` assertions over the existing loop | Delete `src/infra/logging/*`, the `Logger` port, and the `logger` field on `ScraperConfig`; restore the `console.warn` in `infra/storage/jsonl.ts` |
| S5c | Saturation-driven subdivision wired end to end — `split()` enqueues children, `subdivided` cells are ledgered not lost, coverage arithmetic and the partition invariant read the amended ledger correctly, resume re-splits without re-searching, the failure vocabulary and result-cap type stay site-agnostic | PR 10 | `vitest run src/engine/coverage.test.ts src/engine/scraper.test.ts src/engine/__fixtures__ src/infra/storage/jsonl-checkpoint-store.test.ts src/adapters/trf5/detail.test.ts src/adapters/trf5/documents.test.ts` | N/A — CLI not wired until S5b; proof is the engine/adapter suite plus the two fake-adapter fixtures | Delete the `subdivided` state, split-depth tracking, and checkpoint `facetValue`/`label` fields from `engine/{ports,coverage,scraper}.ts`; revert `SitePort.resultPageCap`/`CoverageRecord.declaredCap` to non-null `number`; revert `permanentError.reason`/`detail` in `engine/types.ts` and the two TRF5 construction sites; delete the non-date fake and the ports-coverage-audit test; S5a and S4d remain unaffected |
| S5b | Bounded, forecastable, resumable CLI run end to end | PR 11 | `vitest run src/cli src/engine/budget.test.ts` | `pnpm scrape --dry-run --from 2026-01-01 --to 2026-01-01` (stubbed in tests; live-host smoke is manual only, never automated) | Delete `src/cli/*`, `src/main.ts`, `src/engine/budget.ts`; engine/adapter/logging remain independently testable |
| S6 | Optional, off-by-default second-pass frontier crawl over persisted seeds | PR 12 | `vitest run src/engine/frontier.test.ts src/adapters/trf5/seeds.test.ts` | `pnpm scrape --frontier --dry-run` (manual smoke only; additive, off by default) | Delete `src/engine/frontier.ts`, `src/adapters/trf5/seeds.ts`; phase-1 scrape unaffected |

**Hard ordering**: S1, S2a and S2b must all land before S3 starts (chain is sequential, not parallelizable across writers). S2b depends on S2a's stores. S3 before S4a (detail parsing needs the validity-chain skeleton). S4b depends on S4a: the document list it fetches from is extracted by S4a's parser, and a ledgered document failure must not discard S4a's already-extracted item. S4c depends on S4b: it replaces that slice's filename builder and persists the bytes S4b's fetch already retrieves. S4d follows S4c and hard-gates S5a: the document-persistence suite must be proven defect-detecting before the CLI wires a real filesystem to it. S5a needs S1–S4d (it emits events from the full loop, including the document sink) and hard-gates S5c: `engine/scraper.ts`'s event emission must already exist before S5c adds new lifecycle branches (split, resume-resplit) to the same loop. S5c needs S1–S5a (it modifies `engine/{coverage,scraper,ports}.ts`, which S5a's logging already instruments and emits events through) and hard-gates S5b: `cli/summary.ts` (5.7) prints `summarizeRunCoverage`'s exact counts, so the `subdivided`-aware arithmetic and partition-invariant fixes must land before the CLI can report them honestly. S5b needs S5a and S5c. S6 is additive and may land last independently of S5b's exact merge state, but still needs S1–S3 (`AdapterStateStore`, `traversal.ts` split, `budget.ts`).

## Requirement Coverage Map

Every requirement across the six specs maps to exactly one slice below. No requirement is left uncovered.

`S2` in this map now resolves to the S2a/S2b pair: persistence and coverage arithmetic land in
S2a, and anything requiring the loop — two-stage execution, opaque checkpoint persistence from
the engine, envelope assembly, dedup by identity key — lands in S2b. Task numbers are unchanged
by the split, so each row still resolves to the same numbered task.

`S4` resolves the same way to the S4a/S4b pair: detail fetch, field extraction, and payload
assembly land in S4a; document byte-level decoding and stable filename derivation land in S4b.
Task numbers are again unchanged.

`S5` resolves to the S5a/S5b pair: the logging port, its implementations, and the engine's
event emission land in S5a (tasks 5.12–5.18); the CLI, its bounds, the dry-run forecast, the
summary, and the composition root land in S5b (tasks 5.1–5.11). Task numbers are unchanged by
this split too — 5.12–5.18 are numbered after 5.11 but execute before it.

| Spec | Requirement | Slice |
|---|---|---|
| core-scraping-engine | Two-Stage Discover-Then-Fetch Execution | S2 |
| core-scraping-engine | Payload-Generic Port Contracts | S1 |
| core-scraping-engine | Opaque Checkpoint Persistence | S2 |
| core-scraping-engine | Enforced Adapter Seam | S1 |
| core-scraping-engine | Bounded In-Process Worker Pool | S1 |
| core-scraping-engine | Saturation-Driven Subdivision | S5c |
| core-scraping-engine | Site-Agnostic Failure Vocabulary | S5c |
| core-resilience-policy | FetchOutcome to RetryDecision Mapping | S1 |
| core-resilience-policy | Composable Backoff Strategies | S1 |
| core-resilience-policy | Retry-After Precedence | S1 |
| core-resilience-policy | Mandatory Backoff Cap | S1 |
| core-resilience-policy | Global 429 Cooldown | S1 |
| core-resilience-policy | Stubbed-Transport Test Isolation | S1 (cross-cutting: also honored in S3) |
| core-coverage-accounting | Cell State Ledger | S2 (state ledger) / S5c (amended: uncapped-site handling + faithful cap recording) |
| core-coverage-accounting | Run Summary Arithmetic | S2 (arithmetic) / S5c (amended: `subdivided` excluded from all three tallies) / S5b (CLI display) |
| core-coverage-accounting | Idempotence Verification by Set Hash | S2 |
| core-coverage-accounting | Deduplication by Adapter-Declared Identity Key | S2 |
| core-coverage-accounting | Partition Invariant Verification | S2 / S5c (amended: sourced from the persisted `subdivided`/`truncated` parent) |
| core-coverage-accounting | Separate Checkpoint and Failure Ledger Concerns | S2 |
| core-coverage-accounting | Observation-Timestamped Completeness | S2 |
| core-run-control-and-output | CLI Bound Enforcement | S5b (S2 budget hook) |
| core-run-control-and-output | Default Request Ceiling Requiring Override | S5b (S2 budget hook) |
| core-run-control-and-output | Dry-Run Forecast | S5b |
| core-run-control-and-output | JSONL Append-Only Output | S2 |
| core-run-control-and-output | Mandatory Envelope Fields | S2 |
| core-run-control-and-output | English camelCase Property Naming | S2 (envelope) / S4 (payload) |
| core-run-control-and-output | Separate Coverage Ledger File | S2 |
| core-run-control-and-output | Structured Run Observability | S5a |
| core-run-control-and-output | Personal Data Handling Rules | S1 (`.gitignore` + convention) / S3+S4 (fixtures) / S5a (log redaction) |
| core-frontier-crawl | Deferred Phase-2 Invocation | S6 |
| core-frontier-crawl | Seed Harvesting and Prioritization | S6 |
| core-frontier-crawl | Yield-Decay Stop Condition | S6 |
| core-frontier-crawl | Request Budget Ceiling | S6 |
| core-frontier-crawl | Mandatory Date Range on Seed Searches | S6 |
| core-frontier-crawl | Documented Unmeasurable Bias | S6 |
| trf5-adapter | Session Priming and Field Harvesting | S3 |
| trf5-adapter | Session Expiry Detection and Re-Priming | S3 |
| trf5-adapter | Complete Search Form Field Set | S3 |
| trf5-adapter | Detail Fetch Session Requirement | S4 |
| trf5-adapter | Document Byte-Level ISO-8859-1 Decoding | S4 |
| trf5-adapter | Stable Document Filename Derivation | S4b (`ca`-derived) / S4c (amended: `processNumber` + slug) |
| trf5-adapter | Document Persistence to Disk | S4c |
| core-run-control-and-output | Persisted Identifier Stability | S4c |
| trf5-adapter | Full Field Inventory Extraction | S4 |
| trf5-adapter | Content-Based Validity Chain | S3 (cases 2/3/5) + S4 (case 1 + valid-data) |
| trf5-adapter | Declared Result-Page Cap and Item Identity Key | S3 (cap) / S4 (`itemId`/`sourceUrl`) |
| trf5-adapter | Declared Partition Facet | S3 |
| trf5-adapter | Judicial Record Payload Contract | S4 |
| trf5-adapter | Declared Seed Kinds and Ranking | S6 |

## S1: Engine primitives + enforced seam (749 lines actual — accepted size:exception)

Demonstrates: a portable engine core (backoff, retry, rate limiter, pool) whose seam to any adapter is enforced by tooling, not documentation.

- [x] 1.0 Create feature branch off `main` for this change (branch name per chosen chain strategy).
- [x] 1.1 `pnpm add -D vitest @vitest/coverage-v8`; add `test`/`test:watch`/`test:coverage` scripts (`vitest run` / `vitest` / `vitest run --coverage`) to `package.json`.
- [x] 1.2 Add ESLint `no-restricted-imports` (core rule, not TS-ESLint) block to `eslint.config.js` scoped to `src/engine/**`, forbidding `**/adapters/**`, `**/infra/**`, `**/cli/**`, `axios`, `axios-*`, `cheerio`, `tough-cookie`.
- [x] 1.3 Update `openspec/config.yaml`: `src/` layout to `engine | adapters | infra | cli`, `testing.runner.installed: true`.
- [x] 1.4 Add `.gitignore` entries `output/ data/ pdfs/ logs/`; add README §Testing note: no real CPF/party name/OAB in any fixture — the repo is public.
- [x] 1.5 Create `engine/types.ts` (`FetchOutcome`, `RetryDecision`, `WorkUnit`) and `engine/ports.ts` (all nine ports) — type-only, no RED test (no runtime behavior).
- [x] 1.6 RED `engine/backoff.test.ts`: exponential attempts 1–3 = 1000/2000/4000ms; `withJitter(0.3)` stays within ±30%; `withCap(60000)` never exceeded at attempt 12.
- [x] 1.7 GREEN implement `engine/backoff.ts` (`fixed`/`linear`/`exponential` + `withJitter` + `withCap`).
- [x] 1.8 RED `engine/retry-policy.test.ts`: transient->`retryAfter`; sessionExpired->`reprimeAndRetryNow` (0 delay); hostDefect retries to cap 1–2 then `recordAndStop`; permanentError->`recordAndStop`; `Retry-After` overrides computed delay.
- [x] 1.9 GREEN implement `engine/retry-policy.ts`.
- [x] 1.10 RED `engine/rate-limiter.test.ts`: worker A's 429 pauses B and C; failed unit requeues (not permanently failed); uses `vi.useFakeTimers()`.
- [x] 1.11 GREEN implement `engine/rate-limiter.ts` (global cooldown gate).
- [x] 1.12 RED `engine/pool.test.ts`: concurrency never exceeds configured N; no Redis/BullMQ/external-queue dependency.
- [x] 1.13 GREEN implement `engine/pool.ts`.
- [x] 1.14 RED `engine/__fixtures__/portability.test.ts`: full `engine/` suite green against a ~20-line `FakeSite`/`FakeTraversal`; assert `adapters/trf5` is never imported (module-graph check).
- [x] 1.15 GREEN implement `engine/__fixtures__/fake-site.ts` + `fake-traversal.ts`.
- [x] 1.16 Confirm `pnpm lint` fails on a scratch import of `adapters/trf5` from `engine/**`; remove the scratch file after confirming.

## S2a: Durable JSONL state + coverage arithmetic (808 lines actual — complete)

**Split from the original S2.** S2 was planned as one slice but is two deliverables: the
persistence layer, and the loop that orchestrates it. They are reviewed differently and fail
differently. The storage half alone consumed 808 authored lines, so the loop moved to S2b
rather than the budget being raised a second time. Task numbering is unchanged so the
Requirement Coverage Map above still resolves.

Demonstrates: append-only JSONL persistence with crash-safe read-back, and measured (not
certified) coverage arithmetic. 47 tests green.

- [x] 2.3 RED `infra/storage/jsonl-item-sink.test.ts` + `jsonl-coverage-sink.test.ts`: append-only; killed-run leaves N valid lines; torn final line dropped with a warning at load; malformed non-final line is fatal.
- [x] 2.4 GREEN implement `infra/storage/jsonl-item-sink.ts`, `jsonl-coverage-sink.ts`.
- [x] 2.5 RED `infra/storage/jsonl-checkpoint-store.test.ts`: cursor round-trips byte-identical JSON; engine performs no transform on cursor fields.
- [x] 2.6 RED `infra/storage/jsonl-failure-ledger.test.ts` + `jsonl-adapter-state-store.test.ts`: ledger keyed by itemId+documentId(`null` for discovery failure); resolution appends `resolved:true`, never edits/deletes.
- [x] 2.7 GREEN implement `infra/storage/jsonl-checkpoint-store.ts`, `jsonl-failure-ledger.ts`, `jsonl-adapter-state-store.ts`.
- [x] 2.8 RED `engine/coverage.test.ts`: cell state (complete/truncated/failed) judged against adapter-declared cap, not a hardcoded value; run-summary counts match ledger exactly; SHA-1 set-hash confirms idempotence and reports a mismatch as observed, not an error; partition invariant passes/flags per the day-count comparison; a T2 re-check does not invalidate a T1 `complete` record.
- [x] 2.9 GREEN implement `engine/coverage.ts` (cell ledger, run-summary arithmetic, set hash, partition invariant).
- [x] 2.14 Confirm `coverage.jsonl` and `items.jsonl` are separate files, never interleaved (assert in `jsonl-*.test.ts`).

## S2b: Two-stage discover->fetch loop (663 lines actual — complete)

Demonstrates: the full two-stage loop driving the S2a stores, deduplicating by the
adapter-declared identity key, and resuming from a checkpoint after a crash — all against the
S1 fake adapter, with no TRF5 code involved. This slice is where portability is proven a
second time: if the loop needed to know anything about the target site to close, the seam
would be fiction.

- [x] 2.1 RED `engine/scraper.test.ts`: doc-fetch failure after successful discover still writes the item and records the doc failure; discover failure skips fetch entirely.
- [x] 2.2 GREEN implement `engine/scraper.ts` (two-stage loop wired to Pool + RetryPolicy + RateLimiter). This is where the 429 wait-duration composition lands: `RetryDecision.requeue` carries no `delayMs`, so `scraper.ts` calls `tripCooldown` and requeues the unit, freeing the worker slot while the global cooldown owns the wait.
- [x] 2.10 RED (extend `scraper.test.ts`): same item across two overlapping cells is written once, keyed by the adapter-declared identity key; envelope is exactly `{schemaVersion, itemId, scrapedAt, sourceUrl, runId, payload}`.
- [x] 2.11 GREEN implement dedup-by-identity-key and envelope assembly in `engine/scraper.ts`.
- [x] 2.12 RED (extend `scraper.test.ts`): write order is items -> coverage -> checkpoint; a crash between them leaves no checkpoint, so the unit re-runs; retrying a failed document re-issues only `fetchDocument`, never the cell's discovery.
- [x] 2.13 GREEN implement checkpoint-write ordering and the document-only retry path (`retry-failed`).

## S3: TRF5 session, search, and content-based validity (835 lines actual — accepted size:exception)

Demonstrates: the TRF5 adapter primes a session and classifies every response by content, against redacted fixtures, over a stubbed transport only. 73 tests green (18 new to this slice).

- [x] 3.1 Add `adapters/trf5/__fixtures__/*.html` — synthetic CPF/names only; add a checklist note in the fixture directory README confirming no real personal data.
- [x] 3.2 RED `adapters/trf5/session.test.ts`: priming a GET to `listView.seam` harvests `jsessionid`, ViewState, field-name set, trigger id from actual response content; two priming responses with different `j_id*` values each use their own harvested values.
- [x] 3.3 GREEN implement `adapters/trf5/session.ts`.
- [x] 3.4 RED (extend `session.test.ts`/`search.test.ts`): `text/xml` + `Ajax-Response: redirect` -> `login.seam` triggers re-prime and replay; the redirect itself is never treated as data.
- [x] 3.5 GREEN implement re-prime + single replay in `session.ts`/`search.ts`.
- [x] 3.6 RED `adapters/trf5/search.test.ts`: all documented fields present on every POST (empty ones as `""`); a request missing `dataAutuacaoInicio`/`dataAutuacaoFim` is rejected before send.
- [x] 3.7 GREEN implement `adapters/trf5/search.ts` (POST body builder + pre-send validation).
- [x] 3.8 RED `adapters/trf5/traversal.test.ts`: `facetName === 'classeJudicial'`; the 132-class catalogue is fetched per run, never hardcoded.
- [x] 3.9 GREEN implement `adapters/trf5/classes.ts` + `traversal.ts` seed/split (date bisection, mid/mid+1 boundary contract test).
- [x] 3.10 RED `adapters/trf5/site.test.ts`: `resultPageCap === 30`; `identityKeyName === 'processNumber'`.
- [x] 3.11 GREEN implement the declared constants in `adapters/trf5/site.ts`.
- [x] 3.12 RED `adapters/trf5/schemas/validity-chain.test.ts`: ordering sessionExpired > unprimedSession(no PersistenceException) > hostDefect(with PersistenceException) — first match wins, all against `StubTransport` fixtures.
- [x] 3.13 GREEN implement `adapters/trf5/schemas/response-view.ts` + first three branches of `validity-chain.ts` (`invalidTokenShell`/`validDetail` branches stubbed pending S4).
- [x] 3.14 Confirm every session/search/validity test in this slice runs against `StubTransport`/`FakeClock`, never a live-host base URL. Confirmed by grep: no `trf5.jus.br`/`pjett.`/`http(s)://` literal anywhere under `src/adapters/trf5`. `FakeClock` is not exercised in this slice — no adapter code here calls `Clock.sleep`; that composition is `engine/scraper.ts`'s concern (S2b), already proven against `FakeClock` there.

## S4a: TRF5 detail parsing and payload assembly (729 lines actual — within budget, complete)

**Split from the original S4**, before launch rather than at settle time, on the evidence of four
consecutive overruns. S4 was one slice of eighteen tasks covering two deliverables that fail
differently: extracting a correct payload from a detail page, and fetching the binary documents
that page references. A parsing bug yields a wrong field; a document bug yields a lost or
misfiled file. They are reviewed differently, so they ship separately. Task numbering is
unchanged, so the Requirement Coverage Map above still resolves.

Demonstrates: a full, spec-conformant payload — every field correctly extracted and named —
assembled from a redacted fixture only.

- [x] 4.1 RED `adapters/trf5/detail.test.ts`: a `ca` token with no primed session primes first, then fetches detail.
- [x] 4.2 GREEN implement `adapters/trf5/detail.ts`.
- [x] 4.3 RED `adapters/trf5/parsing/detail-page.test.ts` (header): número, data distribuição, classe+CNJ code, assunto hierarchy retaining CNJ codes at every level, jurisdição, órgãos, endereço, processo referência.
- [x] 4.4 GREEN implement header extraction in `parsing/detail-page.ts`.
- [x] 4.5 RED (extend, parties): ativo/passivo/outros parties with name/CPF/role/status; nested `ADVOGADO` lawyer carries name/OAB number/OAB state/CPF.
- [x] 4.6 GREEN implement parties extraction.
- [x] 4.7 RED (extend, movements): `processoEvento` rows preserved verbatim into `rawCells`; `cnjCode` stays `null` (row structure unmapped per RESEARCH §8).
- [x] 4.8 GREEN implement movements extraction.
- [x] 4.9 RED (extend, documents list): document rows enumerated with label and ids.
- [x] 4.10 GREEN implement document-list extraction.
- [x] 4.11 RED (extend `validity-chain.test.ts`): 200 + no header/parties block -> `invalidTokenShell` (D8: never by document-absence, never by byte size); 200 + header + parties + zero documents -> `validData`, item written.
- [x] 4.12 GREEN implement `adapters/trf5/schemas/payload.ts` (full schema) and wire it as the `validData` branch.
- [x] 4.13 RED `adapters/trf5/payload.test.ts`: `caseClass`/each `subjects[]` entry carries `cnjCode`+`label`; `parties.active/passive/others` nest `lawyers`; no Portuguese source field names appear as output property names; `cpf`/`oabNumber`/`oabState` preserved; envelope `itemId` equals payload `processNumber`.
- [x] 4.14 GREEN implement payload assembler + `SitePort.itemId`/`documentId`/`sourceUrl`.
## S4b: TRF5 document fetch, decoding, and filing (~280 lines)

Demonstrates: a document is fetched through its 302, decoded at the byte level, and filed under
a name derived only from stable ids — and a failed fetch is ledgered without discarding the item
S4a already extracted.

- [x] 4.15 RED `adapters/trf5/encoding.test.ts`: `nomeArqProcDocBin=Decis%E3o` decodes to `Decisão` at the byte level, never UTF-8.
- [x] 4.16 GREEN implement `adapters/trf5/encoding.ts`.
- [ ] 4.17 RED `adapters/trf5/documents.test.ts`: three same-labeled `Decisão` documents in one process get three distinct filenames, derived only from `ca` + `idProcessoDocumento` (`[A-Za-z0-9._-]`-validated), never from the remote label; a failed document fetch is ledgered without discarding the already-extracted item.
- [ ] 4.18 GREEN implement `adapters/trf5/documents.ts` (302-follow, filename builder, `FetchOutcome` wiring for `fetchDocument`).

## S4c: Document persistence to disk + stable paths (409 lines actual — within budget, complete)

**Added after S4b landed**, when a review found that nothing in S1–S4b ever writes document
bytes to disk: `fetchDocument` measured `byteLength` and discarded the body, and no port
persisted documents. The gap survived a 100% Requirement Coverage Map because it was never a
requirement — the spec named how a stored file should be *named* without ever requiring that
a file be *stored*. Two spec requirements were added (`Document Persistence to Disk`,
`Persisted Identifier Stability`) and one amended (`Stable Document Filename Derivation`).

Demonstrates: a fetched document actually reaches the filesystem, under a human-navigable
path that survives the session that produced it.

- [x] 4c.1 RED (extend `adapters/trf5/documents.test.ts`): path is `<processNumber>/<idProcessoDocumento>-<slug>.pdf`; three same-labeled `Decisão` documents get three distinct paths; a hostile label (`../../etc/passwd`) and an empty label both degrade to `<processNumber>/<idProcessoDocumento>.pdf`; the same document derived twice with different `ca` values yields the identical path.
- [x] 4c.2 GREEN replace `buildDocumentFilename(ca, documentId)` with a path builder keyed on `processNumber` + `idProcessoDocumento`, plus decorative slug derivation (ISO-8859-1 decode via `encoding.ts`, accent-fold, lowercase, collapse to `[a-z0-9._-]`, truncate); every path component validated before joining. Update `fetchDocument` to take `processNumber` instead of `ca`.
- [x] 4c.3 RED `infra/storage/fs-document-sink.test.ts`: writing creates the per-process directory; bytes on disk match the fetched body exactly; a write interrupted before completion leaves no file that reads as complete (temp-file-then-rename, same crash-safety standard as the S2a JSONL sinks).
- [x] 4c.4 GREEN declare a `DocumentSink` port in `engine/ports.ts` and implement `infra/storage/fs-document-sink.ts`. Persistence stays an engine concern driven through a port — the adapter returns bytes and never touches the filesystem, exactly as it never touches `items.jsonl`.
- [x] 4c.5 RED (extend `engine/scraper.test.ts`): a successful document fetch writes through the `DocumentSink`; a failed fetch writes no file, still writes the item, and still records the ledger entry; `StoredDocument.byteLength` equals the bytes actually written, never the bytes merely received.
- [x] 4c.6 GREEN wire `DocumentSink` into the fetch stage of `engine/scraper.ts`.
- [x] 4c.7 Confirm no persisted identifier is session-scoped (`Persisted Identifier Stability`): assert that a derived document path, a `TraversalCursor`, and a `CheckpointRecord` contain no `ca`, `jsessionid`, or ViewState value. Record in `apply-progress.md` that the output envelope's `sourceUrl` remains a point-in-time locator by design, recoverable through the `processNumber` identity key.

## S4d: Strict-TDD remediation for document persistence (83 authored `src/` lines actual — complete)

**Added after S4c landed.** S4c's actor disclosed that RED-before-GREEN was not sequenced for
tasks 4c.1–4c.6: test and implementation were authored together and the RED evidence was
reconstructed afterwards with `git stash`. The observed failures were real, but a RED
reconstructed against an implementation that already exists proves only that the file was
missing — not that the test can detect a wrong implementation. Strict TDD is enabled for this
project and document persistence is the path where a silent defect loses files rather than
raising an error.

This slice does not re-stage fake RED cycles over existing code. It delivers the guarantee the
RED phase was supposed to provide, by proving each S4c test actually detects a defect, and it
applies genuine strict TDD to the two behaviors S4c left uncovered.

- [x] 4d.1 Defect-detection audit of the S4c suite. For each behavior below, introduce ONE targeted mutation in the implementation, run only its covering test, confirm it fails for the right reason, then revert the mutation: path keyed on `documentId` rather than the label; hostile label discards the slug; empty/unrepresentable label degrades to `<documentId>.pdf`; a different `ca` yields an identical path; the sink creates the per-process directory; written bytes equal fetched bytes; an interrupted write leaves no file that reads as complete; `write()` reports the persisted size rather than the received size; a successful fetch writes through the sink; a failed fetch writes no file yet still writes the item and the ledger entry. Record a mutation -> test -> observed-failure table in `apply-progress.md`. **Any mutation no test catches is a missing test: write that test RED-first, watch it fail against the mutation, then revert the mutation and confirm it passes.** Result: 9/10 mutations caught by the existing S4c suite; 1 gap found (`write()`'s persisted-size guarantee) and closed with a new RED-first test — see `apply-progress.md`.
- [x] 4d.2 RED (extend `engine/scraper.test.ts`): `retryFailedDocuments` writes the recovered document through `DocumentSink`. Assert on the sink's recorded writes, not only on ledger resolution. S4c wired this call but no test inspects it — this is genuinely new coverage, so observe a real failure first. Result: the new test passed immediately against the unmodified implementation (no genuine RED was available — the call was already wired correctly); non-vacuousness confirmed instead by mutating the call site and observing the new test fail. See `apply-progress.md`.
- [x] 4d.3 GREEN whatever 4d.2 exposes. No implementation change was needed — `retryFailedDocuments` already called `DocumentSink.write()` correctly (S4c task 4c.6).
- [x] 4d.4 RED (extend `adapters/trf5/documents.test.ts`): accent folding maps every character the site actually emits — `á é í ó ú â ê î ô û ã õ ñ ç` and their uppercase forms — to its ASCII base, rather than dropping it. S4c substituted a strip-non-printable-ASCII-after-NFD approach for combining-mark folding, so a label like `Petição` must fold to `peticao`, never to `peticao`-with-holes or `petico`. Result: verified the full character set folds correctly already (NFD decomposes every one of these letters to base+combining-mark, and every combining mark falls outside the printable-ASCII range the existing strip targets) — no genuine RED was available. Non-vacuousness confirmed by mutating `foldAccents` (dropping `.normalize('NFD')`) and observing the new tests fail. See `apply-progress.md`.
- [x] 4d.5 GREEN implement correct combining-mark folding. No implementation change was needed — S4c's strip-after-NFD approach already folds this exact character set correctly.
- [x] 4d.6 Record strict-TDD compliance for this slice in `apply-progress.md`: every cycle in 4d.2–4d.5 observed a genuine RED before its GREEN, with the failure output quoted. No reconstructed RED is acceptable in this slice — if a cycle cannot produce a real RED, say so and explain why rather than staging one. Done — see `apply-progress.md` §"Strict-TDD compliance for S4d".

## S5a: Structured logging port and implementations (~330 lines)

**Split from S5 before launch**, on the same rule S2 and S4 were split under: a slice is cut by
coherent deliverable, not by raising the budget. Adding logging took S5's estimate from ~490 to
~850, past the 800 cap, and the two halves fail differently — a logging defect costs a missing
event, a CLI defect costs an unbounded run against a live judicial portal. They are reviewed
differently, so they ship separately. Task numbering is unchanged so the Requirement Coverage
Map still resolves.

**Logging was a planning gap.** `design.md` line 25 declared `infra/logging/logger.ts` and
`proposal.md` promised structured logs, but no task ever built either, and no spec required
them — the same shape of gap S4c found for document persistence, caught here before apply
rather than after. A requirement (`Structured Run Observability`) was added to
`core-run-control-and-output`, and `Personal Data Handling Rules` was extended to cover log
redaction, since `logs/` is exactly where a well-meaning `console.log(item)` leaks a CPF.

Demonstrates: every lifecycle transition the engine makes is observable after the fact, through
a port, without leaking personal data and without the ability to fail the run.

This slice hard-gates S5c and, transitively, S5b: `src/main.ts` (5.9) wires the logger, so the
port and its implementations must exist first. The loggers take level and destination as
constructor arguments here; S5b's `cli/args.ts` is what later chooses them from the command
line.

- [x] 5.12 RED `infra/logging/redacting-logger.test.ts`: a `LogEvent` whose `fields` carry `cpf`, a party name, `jsessionid`, `viewState`, or `ca` reaches the wrapped `Logger` with those values replaced; every other field passes through byte-identical; redaction is keyed on field name, never on sniffing values. Result: genuine RED — `Cannot find module './redacting-logger.js'` — before `withRedaction` existed. See `apply-progress.md`.
- [x] 5.13 GREEN declare `LogLevel`/`LogEvent`/`Logger` in `engine/ports.ts` and implement `infra/logging/redacting-logger.ts` as a decorator over any `Logger` — same composition shape as `withJitter`/`withCap` in `engine/backoff.ts`. Result: `withRedaction(inner: Logger): Logger`, keyed on a fixed field-name set (`cpf`, `partyName`, `jsessionid`, `viewState`, `ca`); 2/2 tests passing, including a value-sniffing negative case.
- [x] 5.14 RED `infra/logging/jsonl-logger.test.ts` + `console-logger.test.ts`: the JSONL logger appends one valid JSON object per line to `logs/run-<runId>.jsonl`, reusing `infra/storage/jsonl.ts`'s `appendJsonlLine`, and writes UTF-8 explicitly so a non-ASCII field survives on Windows; the console logger writes to stderr only, leaving stdout free for S5b's `cli/summary.ts` and `cli/dry-run.ts`; a level below the configured threshold emits nothing. The log file is diagnostic, never replayed into program state, so it carries no torn-line contract — that standard belongs to the S2a sinks whose records drive coverage arithmetic. Result: genuine RED — `Cannot find module` for both — before either implementation existed. See `apply-progress.md`.
- [x] 5.15 GREEN implement `infra/logging/jsonl-logger.ts` and `console-logger.ts`; add `engine/__fixtures__/recording-logger.ts` (in-memory `Logger` for assertions) and a `NullLogger` default. Result: 4/4 new tests passing (2 jsonl-logger + 2 console-logger); `NullLogger` (`infra/logging/null-logger.ts`) and `RecordingLogger` (`engine/__fixtures__/recording-logger.ts`) added as structural, non-branching fixtures, per the "purely structural" triangulation-skip allowance.
- [x] 5.16 RED (extend `engine/scraper.test.ts`): the loop emits a stable event key at each lifecycle transition — unit start/complete, saturation split, retry with attempt and delay, session re-prime, 429 cooldown, document persisted, document failed — asserted through `RecordingLogger`, never by spying on `console`. A `Logger` that throws does not fail the run or change its outcome. Result: genuine RED — 7/15 tests failed for the right reason (`expected undefined to match object ...` / `expected -1 to be greater than or equal to 0`) — before `scraper.ts` emitted anything. `saturation split` is asserted as `unit.saturated` (the cell reaching `truncated` state), since `TraversalPort.split()`'s children-requeue path is still unwired in `scraper.ts` in every slice through S5a (a pre-existing, explicitly out-of-scope gap — see `apply-progress.md`). See `apply-progress.md` for the full RED transcript and the one cycle (throwing-logger safety) that could not produce a RED.
- [x] 5.17 GREEN add `logger` to `ScraperConfig` and emit those events from `engine/scraper.ts`; replace the direct `console.warn` in `infra/storage/jsonl.ts` with a `Logger` call, so no module under `src/` writes to the console outside `infra/logging/`. Result: 15/15 `scraper.test.ts` green. `readJsonlFile` gained an optional `logger: Logger = new NullLogger()` parameter (RED-first: a new `jsonl-item-sink.test.ts` case observed `expected [] to have a length of 1 but got +0` before the parameter was wired), replacing its `console.warn` call with `logger.log({ event: 'jsonl.tornLineDropped', ... })`.
- [x] 5.18 Confirm the seam holds: `pnpm lint` still passes with `engine/**` importing nothing from `infra/logging/**` (the engine depends on the `Logger` port only), and no `console.` call remains under `src/` outside `infra/logging/`. Result: confirmed — `grep -rn "infra/logging" src/engine` empty; `grep -rln "console\." src` outside `infra/logging/` returns only a test file that spies on `console.warn` to assert it is *not* called (no production `console.` call remains); `eslint.config.js`'s existing engine-seam rule plus a new `no-console: 'error'` global rule (carved out for `src/infra/logging/**`) make both checks build-enforced, not just grep-confirmed. `pnpm check` (typecheck + lint + format) clean.

## S5c: Saturation-driven subdivision wired end to end (1084 authored `src/` lines actual — accepted `size:exception`, see forecast above)

**Added between S5a and S5b**, when `design.md`'s D10–D12 decisions and the amended
`core-scraping-engine`/`core-coverage-accounting` specs landed after the original S1–S6 plan
was written. This is the same shape of gap S4c and S5a each found — a component or behavior
named in `design.md` and declared on a port, required by no task, invisible to a 100%
Requirement Coverage Map that only checks requirement -> slice — caught here for saturation
handling specifically: `TraversalPort.split()` has existed on the port since S1, `scraper.ts`
has never called it through S5a, and every coverage-arithmetic function still assumes a
numeric-only cap and a three-state ledger. A saturated cell today is always recorded
`truncated` and its children are never enqueued — the engine silently under-reports coverage
on exactly the sites that need subdivision the most.

Demonstrates: a saturated work unit is actually subdivided — children are enqueued, the parent
is ledgered `subdivided` rather than discarded or mis-tallied as a failure, the partition
invariant reads the correct persisted parent, resume re-splits without re-searching, a
misbehaving `split()` cannot loop forever, and the engine's own failure vocabulary and
result-cap type stay honest about a site that declares neither.

- [x] 7.1 Update `engine/types.ts` (`FetchOutcome.permanentError`: drop `invalidTokenShell`,
      add `reason: 'notFound' | 'invalidReference' | 'schemaMismatch'` + `detail: string | null`,
      D12) and `engine/ports.ts` (`SitePort.resultPageCap: number | null`,
      `CoverageRecord.declaredCap: number | null`, `CoverageRecord.state`/`CheckpointRecord.state`
      gain `'subdivided'`, `CheckpointRecord` gains `facetValue: string | null` + `label: string`,
      D10/D11) — type-only, no RED test (no runtime behavior), same precedent as 1.5.
      Result: done — both files carry exactly this shape; `FetchOutcome.permanentError.reason`
      is `'notFound' | 'invalidReference' | 'schemaMismatch'` with no site-specific literal.
- [x] 7.2 RED extend `engine/coverage.test.ts`: `classifyCellState(count, null)` always returns
      `'complete'` regardless of count; `isSaturated(count, null)` is always `false`; both still
      classify correctly against a numeric cap exactly as today.
      Result: covered — `coverage.test.ts` asserts both null-cap invariants directly. No isolated
      RED-before-GREEN transcript was captured for this exact pair during this run (see the S5c
      lost-RED disclosure in `apply-progress.md`); non-vacuousness is instead proven in this
      slice's mutation audit (audit #10), which flips the null-cap guard and observes the
      covering test fail for the right reason.
- [x] 7.3 GREEN implement the `null`-cap branch in `classifyCellState`/`isSaturated`
      (`engine/coverage.ts:11-20`).
      Result: done — `declaredCap === null` short-circuits both functions to
      `'complete'`/`false` before the numeric comparison ever runs.
- [x] 7.4 RED extend `engine/coverage.test.ts`: `summarizeRunCoverage` excludes every
      `subdivided` record from the `complete`/`truncated`/`failed` tallies entirely; a ledger
      with one `subdivided` parent plus two children (one `complete`, one `truncated`) reports
      exactly `{ complete: 1, truncated: 1, failed: 0 }`, proving the parent is never
      double-counted alongside its own children.
      Result: covered — see `apply-progress.md` mutation audit #6 (reverting the explicit branch
      to a catch-all `else failed += 1` is caught by exactly this test, for exactly this reason).
- [x] 7.5 GREEN fix `summarizeRunCoverage` (`engine/coverage.ts:52-56`): branch explicitly on
      `'complete' | 'truncated' | 'subdivided'` instead of the current catch-all
      `else failed += 1`, which silently miscounts a `subdivided` record as a failure today.
      Result: done — three explicit `if`/`else if` branches; `subdivided` matches none of them
      and is silently excluded from all three tallies, exactly as designed (D10).
- [x] 7.6 RED extend `engine/coverage.test.ts`: `verifyPartitionInvariant` sources a day's
      unfiltered count from the LATEST-observed `facetValue === null` record for that
      `windowKey`, never the first array match, so a stale earlier observation (e.g. an
      interrupted first attempt later re-observed as `subdivided`) can never shadow the
      current persisted parent; the invariant compares the facet-value sum against that
      `subdivided` parent's exact `resultCount`.
      Result: covered — see `apply-progress.md` mutation audit #7 (regressing to
      `Array.find`'s first match is caught by exactly this test, for exactly this reason).
- [x] 7.7 GREEN fix `verifyPartitionInvariant` (`engine/coverage.ts:79-82`) to select the
      latest `facetValue === null` record by `observedAt` — the same "latest wins" rule
      `summarizeRunCoverage` already applies — instead of `Array.find`'s first match.
      Result: done — `reduce` over the filtered `facetValue === null` records keeps the one with
      the greatest `observedAt`.
- [x] 7.8 RED extend `engine/scraper.test.ts`: a saturated unit (`resultCount === declaredCap`)
      calls `TraversalPort.split()`; when it returns children, every child `WorkUnit` is
      enqueued and processed exactly like a seeded unit, and the parent's coverage record is
      written as `subdivided` carrying the saturation result count — never `truncated`, never
      omitted; when `split()` returns `null`, the parent is still recorded `truncated` and
      nothing is enqueued (regression: wiring `split()` must not change the already-covered
      null-split path).
      Result: covered by two `scraper.test.ts` tests. See the S5c mutation audit in
      `apply-progress.md` (audits #1, #2, #3) for the genuine-failure evidence standing in for
      the lost RED transcript.
- [x] 7.9 GREEN wire `split()` into `processUnit` (`engine/scraper.ts`): on saturation, call
      `this.config.traversal.split(unit, { resultCount, cap })`; on non-null children, enqueue
      them and record `subdivided`; on `null`, keep recording `truncated` as today. Extend
      `buildCoverageRecord` (`scraper.ts:287-310`) to accept `'subdivided'`.
      Result: done — `processUnit` calls `split()` exactly once per saturated unit under the
      depth bound; `buildCoverageRecord`'s `state` parameter is `'complete' | 'truncated' |
      'subdivided'`.
- [x] 7.10 RED extend `engine/scraper.test.ts`: a work-unit lineage already subdivided the
      configured maximum number of times is recorded `truncated` without a further `split()`
      call, even though it is still saturated; depth is engine-owned state keyed by `unitKey`
      and is never read from or written onto the adapter-generated `WorkUnit` (assert the fake
      `TraversalPort.split()` never receives a depth argument and the enqueued child `WorkUnit`
      carries no depth field).
      Result: covered by `scraper.test.ts`'s "bounds a lineage to the configured max split
      depth..." test. See mutation audits #4 and #5 in `apply-progress.md`.
- [x] 7.11 GREEN implement engine-owned split-depth tracking in `engine/scraper.ts`: a
      `Map<string, number>` populated with each child's depth when children are enqueued
      (default 0 for seeded units), read on `processUnit` entry, and a new
      `ScraperConfig.maxSplitDepth: number` field; exceeding it behaves exactly like a `null`
      split result, without calling `split()`.
      Result: done — `Scraper.splitDepth: Map<string, number>`, keyed by `unitKey`, never
      touches `WorkUnit` itself.
- [x] 7.12 RED extend `engine/scraper.test.ts` + `infra/storage/jsonl-checkpoint-store.test.ts`:
      a persisted `CheckpointRecord` carries `facetValue` and `label` alongside `cursor`,
      round-tripping byte-identical exactly as `cursor` already does — a checkpoint now
      describes a complete `WorkUnit`, not just its cursor.
      Result: covered — `jsonl-checkpoint-store.test.ts`'s dedicated round-trip test. See
      mutation audit #8 in `apply-progress.md`.
- [x] 7.13 GREEN update the `checkpointStore.put(...)` call site in `engine/scraper.ts` to
      include `facetValue`/`label`; `JsonlCheckpointStore` needs no code change beyond the
      type, since it already round-trips the whole record verbatim.
      Result: done — confirmed no change was needed in `JsonlCheckpointStore` itself, only in
      the call site and the type.
- [x] 7.14 RED extend `engine/scraper.test.ts`: on `run()`, a checkpoint whose latest state is
      `subdivided` is reconstructed into a full `WorkUnit` from its persisted
      `cursor`/`facetValue`/`label` and passed straight to `TraversalPort.split()` — never to
      `discover()` again; the returned children are enqueued, and any child already
      checkpointed `complete` is skipped individually while the rest are processed like seeded
      units.
      Result: covered by `scraper.test.ts`'s "resumes a subdivided checkpoint by re-splitting it
      directly..." test. See mutation audit #9 in `apply-progress.md`.
- [x] 7.15 GREEN implement subdivided-checkpoint resume in `run()`: alongside the existing
      seeded-unit filter, reconstruct every `subdivided` checkpoint into a `WorkUnit`, call
      `split()` immediately, and merge the returned children against the loaded checkpoint map
      before enqueuing.
      Result: done — the resume loop in `Scraper.run()` iterates every `subdivided` checkpoint,
      reconstructs its `WorkUnit`, calls `split()`, and enqueues only children still pending.
- [x] 7.16 RED extend `engine/scraper.test.ts`: a unit whose `SitePort.resultPageCap === null`
      is never treated as saturated — `buildCoverageRecord`'s `saturated` field is always
      `false` and `declaredCap` reads back as `null`, never a coerced number, regardless of
      result count.
      Result: covered by `scraper.test.ts`'s "never treats a null-cap site as saturated..."
      test. See mutation audit #10 in `apply-progress.md`, which also surfaced a defense-in-depth
      finding: `scraper.ts`'s own `cap !== null` guard independently blocks `split()` from ever
      being called even if `coverage.ts`'s null-cap guard were removed.
- [x] 7.17 GREEN guard `buildCoverageRecord` (`scraper.ts:287-310`):
      `saturated: cap !== null && result.count >= cap`, `declaredCap` passed through unchanged.
      Result: done — exact guard present, with a comment explaining why a bare `>=` would
      silently coerce `null` into "every count saturates".
- [x] 7.18 RED extend `engine/scraper.test.ts` (failure-ledger `reason` assertions):
      `describeOutcome` for a `permanentError` outcome reports `${reason}` when `detail` is
      `null`, and `${reason}:${detail}` when present — the same convention `transient:${status}`
      already uses — so an operator reading `failures.jsonl` still sees the concrete adapter
      detail even though the type itself stays site-agnostic (D12).
      Result: covered by two dedicated `scraper.test.ts` tests (detail `null` vs. detail
      present).
- [x] 7.19 GREEN update the `permanentError` case in `describeOutcome` (`engine/scraper.ts:48-61`).
      Result: done — `outcome.detail === null ? outcome.reason : \`${outcome.reason}:${outcome.detail}\``.
- [x] 7.20 RED extend `adapters/trf5/detail.test.ts`: the `invalidTokenShell` validity-chain
      branch now produces `{ kind: 'permanentError', reason: 'invalidReference', detail:
      'invalidTokenShell' }` (D12), never a site-specific `reason` literal; the
      `schemaMismatch` construction site carries `detail: null`.
      Result: covered by two `detail.test.ts` tests. See mutation audits #11a (detail dropped,
      caught at runtime) and #11b (site literal moved into `reason`, caught by `tsc` itself)
      in `apply-progress.md`.
- [x] 7.21 GREEN update the two `FetchOutcome` construction sites in `adapters/trf5/detail.ts`
      (currently lines 32-33, 39) per D12.
      Result: done — `invalidTokenShell` -> `{ reason: 'invalidReference', detail:
      'invalidTokenShell' }`; schema-mismatch -> `{ reason: 'schemaMismatch', detail: null }`.
- [x] 7.22 RED extend `adapters/trf5/documents.test.ts`: the `notFound`/`schemaMismatch`
      `FetchOutcome` construction sites (currently `documents.ts:88,117`) carry an explicit
      `detail: null`, matching the new `permanentError` shape.
      Result: covered by two dedicated `documents.test.ts` tests naming D12 explicitly.
- [x] 7.23 GREEN update those two construction sites in `adapters/trf5/documents.ts` per D12.
      Result: done — the 404 branch and the unsafe-path-component branch both carry
      `detail: null`.
- [x] 7.24 RED `engine/__fixtures__/portability-non-date.test.ts`: the full saturation/split
      path (seed -> discover -> saturate -> split -> children enqueued/`subdivided`) runs green
      against a fake adapter that (a) partitions along a dimension other than dates, and (b)
      declares `resultPageCap: null`; assert `adapters/trf5` is never imported (module-graph
      check, same as 1.14).
      Result: done — two scenarios (saturating region-bisection tree; null-cap never-saturates)
      plus the module-graph check, all green.
- [x] 7.25 GREEN implement `engine/__fixtures__/fake-non-date-site.ts` +
      `fake-non-date-traversal.ts`.
      Result: done — `FakeNonDateSite`/`FakeNonDateTraversal` partition a numeric "region" range
      by bisection, structurally identical to `TRF5Traversal`'s date bisection but along a
      wholly different dimension.
- [x] 7.26 Record the portability audit in `apply-progress.md`: which `RunBounds` fields
      (`dateFrom`/`dateTo`/`maxFacetValues`) the non-date fake had to abuse, repurpose, or
      leave meaningless; whether `TraversalPort.facetName`'s singular contract blocked or
      merely inconvenienced a non-date or multi-dimension split. Report what actually broke —
      or that nothing did — rather than a conclusion decided in advance.
      Result: done — see "Partition-contract fake: findings" in `apply-progress.md`.
      `dateFrom`/`dateTo` are repurposed as opaque numeric-string bounds (works, but is a type
      lie); `maxFacetValues` is entirely unused/meaningless for this fake; `facetName`'s
      singular contract did not block a single non-date dimension, but was never tested against
      a genuinely multi-dimensional split.
- [x] 7.27 Write `docs/sweep-flow.md`: a plain-language explanation of the saturation/
      subdivision mechanism for a reader who has never seen the project, with two Mermaid
      diagrams — a work-unit flow (search -> saturated? -> split or record -> queue) and a
      bisection tree showing a real date range subdividing until each leaf returns under the
      cap — with prose alongside both diagrams, not instead of them. This file does not count
      against the authored `src/` line budget; it is documentation, tracked separately.
      Result: done — 185 lines, two Mermaid diagrams plus surrounding prose, excluded from the
      `src/` budget.
- [x] 7.28 RED `engine/__fixtures__/ports-coverage-audit.test.ts`: build a hand-maintained map
      of every symbol exported from `engine/ports.ts` to the requirement(s) (from
      `openspec/changes/scraper-core/specs/`) that name or require it; assert every exported
      symbol has at least one mapped requirement. Prove the check is non-vacuous by first
      deliberately removing one real symbol's mapping and observing a named failure (mutation-
      testing style, same discipline S4d used for defect detection), then restoring it.
      Result: genuine RED observed — removing `Logger`'s mapping (temporarily, then reverted)
      made the audit assertion fail naming exactly `['Logger']`; see the transcript in
      `apply-progress.md`.
- [x] 7.29 GREEN implement the audit so it passes for the current `engine/ports.ts`. If it
      surfaces a genuinely untraced symbol, record it in `apply-progress.md` as a new finding —
      do not silently invent a requirement to close it; that decision belongs to a future spec
      revision, not to this test.
      Result: done — all 25 symbols exported from `engine/ports.ts` trace to at least one named
      requirement; no untraced symbol was found. See "Reverse-coverage audit: findings" in
      `apply-progress.md`.
- [x] 7.30 **Follow-up, found by `sdd-verify`, not by this slice's own apply session**: `run()`'s
      resume loop (`engine/scraper.ts`) fabricated `SaturationInfo.resultCount` by passing the
      site's declared cap (`cap ?? 0`) instead of the parent's actually observed result count;
      `design.md`'s "Re-split inputs" row also described an impossible mechanism (reading
      `SaturationInfo` off the coverage ledger, which `CoverageSink` cannot do — it has no
      `load()`). RED-first: extended `scraper.test.ts`'s "persists facetValue and label
      alongside cursor" test with a `resultCount` assertion, and its "resumes a subdivided
      checkpoint..." test with a checkpoint `resultCount: 7` deliberately greater than the
      site's cap (5) plus an assertion on the exact `SaturationInfo` passed to `split()`; both
      failed genuinely against the unmodified implementation. GREEN: added `resultCount: number`
      to `CheckpointRecord` (`engine/ports.ts`), populated it at the `checkpointStore.put(...)`
      call site in `processUnit` from `discoverResult.value.count`, and changed the resume loop
      to read `checkpoint.resultCount`. Corrected `design.md`'s row and `CheckpointRecord`
      comment to describe checkpoint-based reconstruction, not a `CoverageSink.load()` that was
      never built.
      Result: done — 149/149 tests green (2 existing tests extended, no new `it()` blocks),
      `pnpm typecheck`/`lint`/`format:check` clean. Full RED transcript, TDD Cycle Evidence, and
      Work Unit Evidence in `apply-progress.md` under "S5c follow-up: `resultCount` fabrication
      (task 7.30)".

## S5b: CLI, bounds, and run control (~520 lines estimate; 775 authored `src/` lines for 5.1–5.8 alone — see the mid-slice stop below)

Demonstrates: a bounded, forecastable, resumable run invocable end to end from the command line.

**Mid-slice stop (2026-09-05): tasks 5.1–5.8 complete, 775/800 authored `src/` lines
consumed; 5.9–5.11 deliberately not started.** Task 5.9 requires building
`TRF5Site.discover()` — the full `SitePort<TrfPayload, DocumentRow>` implementation —
which in turn requires a search-result-row parser (extracting `ca` tokens + result
count from the AJAX search fragment) that **no prior slice ever built**: S3's
`search-ok.xml` fixture is a literal zero-row stub with the comment "row extraction
lands in S4", and every S4a/S4b/S4c apply-progress entry explicitly deferred "the full
`SitePort` implementation" to "S5's composition-root job" without any slice ever
returning to close this gap. This is the same shape of planning gap S4c (document
persistence) and S5a (structured logging) each disclosed before landing — caught here,
before apply pushed through it silently. See `apply-progress.md` for the full
discovery, the rejected alternatives, and the recommended split (a new task range for
`parsing/result-fragment.ts` + `TRF5Site` + `infra/http/axios-transport.ts` +
`main.ts`, sized and reviewed independently of 5.1–5.8's CLI/bounds work, which is
already a complete, independently testable, in-budget deliverable on its own).

- [x] 5.1 RED `engine/budget.test.ts`: `--max-documents` stops further fetches once reached; `--max-items` stops discovery once reached; an omitted `--max-requests` still stops at a default ceiling; unbounded requires an explicit override flag. Result: genuine RED — `Cannot find module './budget.js'` — before `budget.ts` existed. See `apply-progress.md`.
- [x] 5.2 GREEN implement `engine/budget.ts`; wire into `engine/scraper.ts`. Result: `Budget` (request/item/document ceilings) + `clampDateRange`; wired into the worker loop, the items loop, and the documents loop. 2 new RED-first `scraper.test.ts` tests confirm the wiring (not just the standalone unit). 8/8 `budget.test.ts` + 76/76 `engine/` passing.
- [x] 5.3 RED `cli/args.test.ts`: parses `--from --to --max-days --max-facet-values --max-items --max-documents(default 10) --documents-per-item --max-requests --log-level(default info) --log-format(console|jsonl, default console)`. Result: genuine RED — `Cannot find module './args.js'` — before `args.ts` existed.
- [x] 5.4 GREEN implement `cli/args.ts`. Result: zero-dependency hand-rolled `--flag value`/`--flag=value` parser; discriminated `ScrapeArgs | RetryFailedArgs`; `--max-requests unbounded` is the only override for the ceiling. 8/8 passing.
- [x] 5.5 RED `cli/dry-run.test.ts`: prints forecasted request count and duration; zero discovery requests reach the stub transport. Result: genuine RED — `Cannot find module './dry-run.js'`. "Zero discovery requests" is proven by construction (`forecastRun`'s signature accepts no `HttpTransport`/`SitePort` at all), disclosed in `apply-progress.md` rather than asserted against a stub transport that could never have been called anyway.
- [x] 5.6 GREEN implement `cli/dry-run.ts`. Result: `forecastRun` — a disclosed heuristic (one search request per day, optimistic non-saturated case), never a certified prediction. 6/6 passing.
- [x] 5.7 RED `cli/summary.test.ts`: printed summary equals the S2 ledger-derived counts exactly, no independent completeness claim. Result: genuine RED — `Cannot find module './summary.js'`.
- [x] 5.8 GREEN implement `cli/summary.ts` (consumes `engine/coverage.ts` arithmetic). Result: `formatRunSummary` calls `summarizeRunCoverage` directly and prints its three counts verbatim; a `subdivided` record is asserted absent from the printed output (S5c's D10 exclusion, consumed not re-derived). 3/3 passing.
- [ ] 5.9 GREEN implement `src/main.ts` composition root: wires `TRF5Site`/`TRF5Traversal` + `AxiosTransport` + JSONL stores + the redaction-wrapped `Logger` into `scrape` / `scrape --frontier` / `retry-failed`. **Blocked on the undiscovered `parsing/result-fragment.ts` gap above — not started this slice.**
- [ ] 5.10 GREEN write README: pnpm/tsx deviation, every CLI bound, personal-data rules (including that `logs/` is git-ignored and log fields are redacted by name), the emitted event keys and how to filter them, "coverage is measured, never certified," manual-smoke-only note for 429/session-recovery against the live host. **Not started — depends on 5.9's composition root existing to document.**
- [ ] 5.11 Confirm `openspec/config.yaml` reflects the final S1–S5b layout — including `src/infra/logging/` — and testing state (no stale `pje/`, `partition/`, `domain/` references). **Not started.**

## S6: Frontier crawl — additive, off by default (~420 lines)

Demonstrates: an optional second pass that targets known gaps and self-limits, without touching phase-1 behavior.

- [ ] 6.1 RED `engine/frontier.test.ts`: plain `scrape` issues zero frontier searches and persists seeds to `AdapterStateStore`; `scrape --frontier` in a new process reads a prior run's store without that process still running.
- [ ] 6.2 GREEN implement `engine/frontier.ts` runner; wire `--frontier` in `cli/args.ts`.
- [ ] 6.3 RED `adapters/trf5/seeds.test.ts`: OAB seed kind ranks above name; seeds are exact-match identifiers harvested from detail pages.
- [ ] 6.4 GREEN implement `adapters/trf5/seeds.ts` (`FrontierCapable`: `seedKindRanking`, `harvestSeeds`, `unitFromSeed`).
- [ ] 6.5 RED (extend `frontier.test.ts`): truncated-cell seeds are scheduled before complete-cell seeds regardless of kind ranking.
- [ ] 6.6 GREEN implement queue ordering in `engine/frontier.ts`.
- [ ] 6.7 RED (extend `frontier.test.ts`): a rolling window of zero-new-item seed searches stops further searches (yield decay).
- [ ] 6.8 GREEN implement yield-decay tracking.
- [ ] 6.9 RED (extend `frontier.test.ts`): the Nth request stops the run even while yield has not decayed.
- [ ] 6.10 GREEN wire `engine/budget.ts` (S5b) into the frontier loop as a hard ceiling.
- [ ] 6.11 RED (extend `frontier.test.ts` + `search.test.ts`): a seed search without a date range is rejected before send; a saturated seed search bisects via the same `traversal.ts` split used in phase 1.
- [ ] 6.12 GREEN wire date-range validation and split reuse into the frontier seed-search path.
- [ ] 6.13 GREEN state, in `cli/summary.ts` output and README §Frontier, that frontier-crawl coverage gains are unmeasured and self-reinforcing.

## Rules Honored

Declined abstractions from `design.md` (adapter registry, plugin loader, DI container, config-driven indirection, shared `domain/` model, generic multi-axis partitioner, event bus, pluggable retry-strategy interface, SQLite/WAL, `p-limit`, a second adapter) have no corresponding task above — none is reintroduced.
