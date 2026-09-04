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
| Estimated changed lines | ~3300 authored (S1 749 actual, S2 ~550, S3 ~550, S4 ~550, S5 ~490, S6 ~420) |
| 800-line budget risk | Low — the widest remaining slice sits ~250 lines under budget |
| Chained PRs recommended | Yes |
| Suggested split | S1 -> S2 -> S3 -> S4 -> S5 -> S6 (S1+S2 hard-gate S3; sequential, no parallel writers) |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain — PR #1 targets `feat/scraper-core`; each child PR targets the previous PR branch; only the tracker merges to `main` |

Decision needed before apply: No — budget raised to 800 and S1's exception recorded.
Chained PRs recommended: Yes
800-line budget risk: Low

### How the S2..S6 estimates were re-derived

S1's raw overrun factor was ~1.97x, but applying that to every later slice would overstate
them. Roughly 245 of S1's lines are **one-time** costs that do not recur: the vitest install,
the ESLint seam block, `README.md`, the `openspec/config.yaml` update, and `ports.ts` (152
lines, declared once for the whole engine). Excluding those, S1's recurring implementation
work was ~504 lines against a 380 estimate — a **~1.33x** factor. That factor is what the
S2..S6 numbers above apply, and it is the one to re-check after S2 lands.

Excluded from every count: `pnpm-lock.yaml` and any other generated file. The native
`gentle-ai sdd-attempt` runtime counts the lockfile in its own accounting, so its
`changed_lines` figure will read substantially higher than the authored numbers here.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| S1 | Portable engine primitives + enforced seam, proven against a fake adapter | PR 1 | `vitest run src/engine` | N/A — no CLI yet; proof is the fake-adapter suite | Delete `src/engine/{types,ports,backoff,retry-policy,rate-limiter,pool}.ts`, fixtures, eslint seam block, vitest devDeps |
| S2 | Full discover->fetch loop + durable JSONL state + coverage arithmetic, against the fake adapter | PR 2 | `vitest run src/engine src/infra/storage` | N/A — proven by driving `engine/scraper.ts` directly in tests | Delete `src/engine/{scraper,coverage}.ts`, `src/infra/storage/*`; S1 untouched |
| S3 | TRF5 session priming + search + content-based validity classification against redacted fixtures | PR 3 | `vitest run src/adapters/trf5/session.test.ts src/adapters/trf5/search.test.ts src/adapters/trf5/traversal.test.ts src/adapters/trf5/schemas` | N/A — no detail/document stage or CLI wired yet | Delete `src/adapters/trf5/{session,search,classes,traversal,encoding}.ts`, `schemas/{response-view,validity-chain}.ts`, fixtures |
| S4 | Full detail-page field inventory + document fetch/decode/filename, spec-conformant payload | PR 4 | `vitest run src/adapters/trf5/detail.test.ts src/adapters/trf5/documents.test.ts src/adapters/trf5/parsing src/adapters/trf5/encoding.test.ts` | N/A — CLI not wired until S5 | Delete `src/adapters/trf5/{detail,documents}.ts`, `parsing/*`, `schemas/payload.ts`; S3 untouched |
| S5 | Bounded, forecastable, resumable CLI run end to end | PR 5 | `vitest run src/cli src/engine/budget.test.ts` | `pnpm scrape --dry-run --from 2026-01-01 --to 2026-01-01` (stubbed in tests; live-host smoke is manual only, never automated) | Delete `src/cli/*`, `src/main.ts`, `src/engine/budget.ts`; engine/adapter remain independently testable |
| S6 | Optional, off-by-default second-pass frontier crawl over persisted seeds | PR 6 | `vitest run src/engine/frontier.test.ts src/adapters/trf5/seeds.test.ts` | `pnpm scrape --frontier --dry-run` (manual smoke only; additive, off by default) | Delete `src/engine/frontier.ts`, `src/adapters/trf5/seeds.ts`; phase-1 scrape unaffected |

**Hard ordering**: S1 and S2 must both land before S3 starts (chain is sequential, not parallelizable across writers). S3 before S4 (detail parsing needs the validity-chain skeleton). S5 needs S1–S4 (wires CLI to the full loop). S6 is additive and may land last independently of S5's exact merge state, but still needs S1–S3 (`AdapterStateStore`, `traversal.ts` split, `budget.ts`).

## Requirement Coverage Map

Every requirement across the six specs maps to exactly one slice below. No requirement is left uncovered.

| Spec | Requirement | Slice |
|---|---|---|
| core-scraping-engine | Two-Stage Discover-Then-Fetch Execution | S2 |
| core-scraping-engine | Payload-Generic Port Contracts | S1 |
| core-scraping-engine | Opaque Checkpoint Persistence | S2 |
| core-scraping-engine | Enforced Adapter Seam | S1 |
| core-scraping-engine | Bounded In-Process Worker Pool | S1 |
| core-resilience-policy | FetchOutcome to RetryDecision Mapping | S1 |
| core-resilience-policy | Composable Backoff Strategies | S1 |
| core-resilience-policy | Retry-After Precedence | S1 |
| core-resilience-policy | Mandatory Backoff Cap | S1 |
| core-resilience-policy | Global 429 Cooldown | S1 |
| core-resilience-policy | Stubbed-Transport Test Isolation | S1 (cross-cutting: also honored in S3) |
| core-coverage-accounting | Cell State Ledger | S2 |
| core-coverage-accounting | Run Summary Arithmetic | S2 (arithmetic) / S5 (CLI display) |
| core-coverage-accounting | Idempotence Verification by Set Hash | S2 |
| core-coverage-accounting | Deduplication by Adapter-Declared Identity Key | S2 |
| core-coverage-accounting | Partition Invariant Verification | S2 |
| core-coverage-accounting | Separate Checkpoint and Failure Ledger Concerns | S2 |
| core-coverage-accounting | Observation-Timestamped Completeness | S2 |
| core-run-control-and-output | CLI Bound Enforcement | S5 (S2 budget hook) |
| core-run-control-and-output | Default Request Ceiling Requiring Override | S5 (S2 budget hook) |
| core-run-control-and-output | Dry-Run Forecast | S5 |
| core-run-control-and-output | JSONL Append-Only Output | S2 |
| core-run-control-and-output | Mandatory Envelope Fields | S2 |
| core-run-control-and-output | English camelCase Property Naming | S2 (envelope) / S4 (payload) |
| core-run-control-and-output | Separate Coverage Ledger File | S2 |
| core-run-control-and-output | Personal Data Handling Rules | S1 (`.gitignore` + convention) / S3+S4 (fixtures) |
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
| trf5-adapter | Stable Document Filename Derivation | S4 |
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

## S2: Discover->fetch loop + durable state + coverage (~550 lines)

Demonstrates: the full two-stage loop, resumable JSONL state, and measured (not certified) coverage — all against the S1 fake adapter, no TRF5 code involved.

- [ ] 2.1 RED `engine/scraper.test.ts`: doc-fetch failure after successful discover still writes the item and records the doc failure; discover failure skips fetch entirely.
- [ ] 2.2 GREEN implement `engine/scraper.ts` (two-stage loop wired to Pool + RetryPolicy + RateLimiter).
- [ ] 2.3 RED `infra/storage/jsonl-item-sink.test.ts` + `jsonl-coverage-sink.test.ts`: append-only; killed-run leaves N valid lines; torn final line dropped with a warning at load; malformed non-final line is fatal.
- [ ] 2.4 GREEN implement `infra/storage/jsonl-item-sink.ts`, `jsonl-coverage-sink.ts`.
- [ ] 2.5 RED `infra/storage/jsonl-checkpoint-store.test.ts`: cursor round-trips byte-identical JSON; engine performs no transform on cursor fields.
- [ ] 2.6 RED `infra/storage/jsonl-failure-ledger.test.ts` + `jsonl-adapter-state-store.test.ts`: ledger keyed by itemId+documentId(`null` for discovery failure); resolution appends `resolved:true`, never edits/deletes.
- [ ] 2.7 GREEN implement `infra/storage/jsonl-checkpoint-store.ts`, `jsonl-failure-ledger.ts`, `jsonl-adapter-state-store.ts`.
- [ ] 2.8 RED `engine/coverage.test.ts`: cell state (complete/truncated/failed) judged against adapter-declared cap, not a hardcoded value; run-summary counts match ledger exactly; SHA-1 set-hash confirms idempotence and reports a mismatch as observed, not an error; partition invariant passes/flags per the day-count comparison; a T2 re-check does not invalidate a T1 `complete` record.
- [ ] 2.9 GREEN implement `engine/coverage.ts` (cell ledger, run-summary arithmetic, set hash, partition invariant).
- [ ] 2.10 RED (extend `scraper.test.ts`): same item across two overlapping cells is written once, keyed by the adapter-declared identity key; envelope is exactly `{schemaVersion, itemId, scrapedAt, sourceUrl, runId, payload}`.
- [ ] 2.11 GREEN implement dedup-by-identity-key and envelope assembly in `engine/scraper.ts`.
- [ ] 2.12 RED (extend `scraper.test.ts`): write order is items -> coverage -> checkpoint; a crash between them leaves no checkpoint, so the unit re-runs; retrying a failed document re-issues only `fetchDocument`, never the cell's discovery.
- [ ] 2.13 GREEN implement checkpoint-write ordering and the document-only retry path (`retry-failed`).
- [ ] 2.14 Confirm `coverage.jsonl` and `items.jsonl` are separate files, never interleaved (assert in `jsonl-*.test.ts`).

## S3: TRF5 session, search, and content-based validity (~550 lines)

Demonstrates: the TRF5 adapter primes a session and classifies every response by content, against redacted fixtures, over a stubbed transport only.

- [ ] 3.1 Add `adapters/trf5/__fixtures__/*.html` — synthetic CPF/names only; add a checklist note in the fixture directory README confirming no real personal data.
- [ ] 3.2 RED `adapters/trf5/session.test.ts`: priming a GET to `listView.seam` harvests `jsessionid`, ViewState, field-name set, trigger id from actual response content; two priming responses with different `j_id*` values each use their own harvested values.
- [ ] 3.3 GREEN implement `adapters/trf5/session.ts`.
- [ ] 3.4 RED (extend `session.test.ts`/`search.test.ts`): `text/xml` + `Ajax-Response: redirect` -> `login.seam` triggers re-prime and replay; the redirect itself is never treated as data.
- [ ] 3.5 GREEN implement re-prime + single replay in `session.ts`/`search.ts`.
- [ ] 3.6 RED `adapters/trf5/search.test.ts`: all documented fields present on every POST (empty ones as `""`); a request missing `dataAutuacaoInicio`/`dataAutuacaoFim` is rejected before send.
- [ ] 3.7 GREEN implement `adapters/trf5/search.ts` (POST body builder + pre-send validation).
- [ ] 3.8 RED `adapters/trf5/traversal.test.ts`: `facetName === 'classeJudicial'`; the 132-class catalogue is fetched per run, never hardcoded.
- [ ] 3.9 GREEN implement `adapters/trf5/classes.ts` + `traversal.ts` seed/split (date bisection, mid/mid+1 boundary contract test).
- [ ] 3.10 RED `adapters/trf5/site.test.ts`: `resultPageCap === 30`; `identityKeyName === 'processNumber'`.
- [ ] 3.11 GREEN implement the declared constants in `adapters/trf5/site.ts`.
- [ ] 3.12 RED `adapters/trf5/schemas/validity-chain.test.ts`: ordering sessionExpired > unprimedSession(no PersistenceException) > hostDefect(with PersistenceException) — first match wins, all against `StubTransport` fixtures.
- [ ] 3.13 GREEN implement `adapters/trf5/schemas/response-view.ts` + first three branches of `validity-chain.ts` (`invalidTokenShell`/`validDetail` branches stubbed pending S4).
- [ ] 3.14 Confirm every session/search/validity test in this slice runs against `StubTransport`/`FakeClock`, never a live-host base URL.

## S4: TRF5 detail parsing, payload assembly, and documents (~550 lines)

Demonstrates: a full, spec-conformant payload — every field, correctly decoded, safely filed — assembled from a redacted fixture only.

- [ ] 4.1 RED `adapters/trf5/detail.test.ts`: a `ca` token with no primed session primes first, then fetches detail.
- [ ] 4.2 GREEN implement `adapters/trf5/detail.ts`.
- [ ] 4.3 RED `adapters/trf5/parsing/detail-page.test.ts` (header): número, data distribuição, classe+CNJ code, assunto hierarchy retaining CNJ codes at every level, jurisdição, órgãos, endereço, processo referência.
- [ ] 4.4 GREEN implement header extraction in `parsing/detail-page.ts`.
- [ ] 4.5 RED (extend, parties): ativo/passivo/outros parties with name/CPF/role/status; nested `ADVOGADO` lawyer carries name/OAB number/OAB state/CPF.
- [ ] 4.6 GREEN implement parties extraction.
- [ ] 4.7 RED (extend, movements): `processoEvento` rows preserved verbatim into `rawCells`; `cnjCode` stays `null` (row structure unmapped per RESEARCH §8).
- [ ] 4.8 GREEN implement movements extraction.
- [ ] 4.9 RED (extend, documents list): document rows enumerated with label and ids.
- [ ] 4.10 GREEN implement document-list extraction.
- [ ] 4.11 RED (extend `validity-chain.test.ts`): 200 + no header/parties block -> `invalidTokenShell` (D8: never by document-absence, never by byte size); 200 + header + parties + zero documents -> `validData`, item written.
- [ ] 4.12 GREEN implement `adapters/trf5/schemas/payload.ts` (full schema) and wire it as the `validData` branch.
- [ ] 4.13 RED `adapters/trf5/payload.test.ts`: `caseClass`/each `subjects[]` entry carries `cnjCode`+`label`; `parties.active/passive/others` nest `lawyers`; no Portuguese source field names appear as output property names; `cpf`/`oabNumber`/`oabState` preserved; envelope `itemId` equals payload `processNumber`.
- [ ] 4.14 GREEN implement payload assembler + `SitePort.itemId`/`documentId`/`sourceUrl`.
- [ ] 4.15 RED `adapters/trf5/encoding.test.ts`: `nomeArqProcDocBin=Decis%E3o` decodes to `Decisão` at the byte level, never UTF-8.
- [ ] 4.16 GREEN implement `adapters/trf5/encoding.ts`.
- [ ] 4.17 RED `adapters/trf5/documents.test.ts`: three same-labeled `Decisão` documents in one process get three distinct filenames, derived only from `ca` + `idProcessoDocumento` (`[A-Za-z0-9._-]`-validated), never from the remote label; a failed document fetch is ledgered without discarding the already-extracted item.
- [ ] 4.18 GREEN implement `adapters/trf5/documents.ts` (302-follow, filename builder, `FetchOutcome` wiring for `fetchDocument`).

## S5: CLI, bounds, and run control (~490 lines)

Demonstrates: a bounded, forecastable, resumable run invocable end to end from the command line.

- [ ] 5.1 RED `engine/budget.test.ts`: `--max-documents` stops further fetches once reached; `--max-items` stops discovery once reached; an omitted `--max-requests` still stops at a default ceiling; unbounded requires an explicit override flag.
- [ ] 5.2 GREEN implement `engine/budget.ts`; wire into `engine/scraper.ts`.
- [ ] 5.3 RED `cli/args.test.ts`: parses `--from --to --max-days --max-facet-values --max-items --max-documents(default 10) --documents-per-item --max-requests`.
- [ ] 5.4 GREEN implement `cli/args.ts`.
- [ ] 5.5 RED `cli/dry-run.test.ts`: prints forecasted request count and duration; zero discovery requests reach the stub transport.
- [ ] 5.6 GREEN implement `cli/dry-run.ts`.
- [ ] 5.7 RED `cli/summary.test.ts`: printed summary equals the S2 ledger-derived counts exactly, no independent completeness claim.
- [ ] 5.8 GREEN implement `cli/summary.ts` (consumes `engine/coverage.ts` arithmetic).
- [ ] 5.9 GREEN implement `src/main.ts` composition root: wires `TRF5Site`/`TRF5Traversal` + `AxiosTransport` + JSONL stores into `scrape` / `scrape --frontier` / `retry-failed`.
- [ ] 5.10 GREEN write README: pnpm/tsx deviation, every CLI bound, personal-data rules, "coverage is measured, never certified," manual-smoke-only note for 429/session-recovery against the live host.
- [ ] 5.11 Confirm `openspec/config.yaml` reflects the final S1–S5 layout and testing state (no stale `pje/`, `partition/`, `domain/` references).

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
- [ ] 6.10 GREEN wire `engine/budget.ts` (S5) into the frontier loop as a hard ceiling.
- [ ] 6.11 RED (extend `frontier.test.ts` + `search.test.ts`): a seed search without a date range is rejected before send; a saturated seed search bisects via the same `traversal.ts` split used in phase 1.
- [ ] 6.12 GREEN wire date-range validation and split reuse into the frontier seed-search path.
- [ ] 6.13 GREEN state, in `cli/summary.ts` output and README §Frontier, that frontier-crawl coverage gains are unmeasured and self-reinforcing.

## Rules Honored

Declined abstractions from `design.md` (adapter registry, plugin loader, DI container, config-driven indirection, shared `domain/` model, generic multi-axis partitioner, event bus, pluggable retry-strategy interface, SQLite/WAL, `p-limit`, a second adapter) have no corresponding task above — none is reintroduced.
