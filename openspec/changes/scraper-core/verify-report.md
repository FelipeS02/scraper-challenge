```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:ee6bc1732366c64b1631437b8f97c3c780a3ed3e6ba4730f8e192bdfec35860c
verdict: fail
blockers: 1
critical_findings: 8
requirements: 42/49
scenarios: 85/95
test_command: pnpm vitest run
test_exit_code: 0
test_output_hash: sha256:1e681d4af5eefc8b897872f92b4cf732b1099897138120bd99d8eeb762618ff8
build_command: pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:38ac890c60e7f38d59ddfb410325cdfb5fca83c9411765c5481754e01c021630
```

## Verification Report — Full Change

**Change**: scraper-core
**Scope**: Full-change verification against all six specs (49 requirements, 95 scenarios), replacing the stale `verify-report.md` that covered only 5 requirements (S5c-only).
**Version**: N/A (no spec version field)
**Mode**: Strict TDD
**Reviewed range**: `main..4eccb80` (S1 through S5f, 4 additional commits since the historical S5c report: `bef438d`, `3276f8a`, `eb98d83`, `4eccb80` — S5f)
**Working tree**: clean (`git status` reports no changes on `feat/scraper-core-s5e-transport-composition-root`, confirmed at session start)

### Ground Truth Established By This Session

- `pnpm vitest run`: **219/219 tests passing, 40 files** — independently reproduced (up from 149/149 at the last recorded verify report, S5c; the growth is S5d/S5e/S5f).
- `pnpm typecheck`: clean, independently reproduced.
- `src/engine/frontier.ts` and `src/adapters/trf5/seeds.ts` **do not exist** — confirmed by direct file listing. S6 (tasks 6.1–6.13, 13 tasks) is unchecked in `tasks.md` and genuinely unimplemented, not merely under-tested.
- No production code anywhere in `src/` constructs `FetchOutcome.kind === 'transient'` — confirmed by exhaustive grep. Every adapter construction site (`documents.ts`, `detail.ts`, `site.ts`) maps an unrecognized/unexpected HTTP status to `hostDefect`, never `transient`. This is independently confirmed, not merely taken from the apply actor's own disclosure.
- `toBrDate` (`src/adapters/trf5/site.ts:39`) has no test anywhere that asserts on its output value — confirmed by grep across `site.test.ts` for `dataAutuacaoInicio`/`dataAutuacaoFim` (zero matches). The only two `site.test.ts` `discover()` tests use a stub transport and never inspect the outgoing request body, so this ISO→BR date conversion is completely unverified — a silent day-shift here would go undetected by the entire test suite.
- `documentoSemLoginHTML` document rows are confirmed skipped by `parsing/detail-page.ts` (comment at line 267, test at `detail-page.test.ts:102`); the test proves the *skip* is deliberate, not that the shape is ever fetched.
- CNPJ-identified parties confirmed to fall through to `{ name: line, cpf: null, role: 'UNKNOWN' }` (`detail-page.ts:186-189`) rather than being structurally parsed — disclosed and by design, but a genuine partial-inventory gap against "Full Field Inventory Extraction"'s literal "MUST extract the complete detail-page field inventory."

### Completeness (all slices, S1–S6)

| Metric | Value |
|--------|-------|
| Slices complete | S1, S2a, S2b, S3, S4a, S4b, S4c, S4d, S5a, S5c, S5b (5.1–5.8), S5d, S5e, S5f — 13 of 14 planned slices |
| Slices not started | S6 (frontier crawl) |
| Tasks total (S1–S6, counted directly from `tasks.md`) | 158 |
| Tasks complete | 143 |
| Tasks incomplete | 15 (S6: 6.1-6.13, 13 tasks, all unchecked; S4b: 4.17-4.18, 2 tasks, unchecked despite the underlying documents.ts/documents.test.ts code being written, tested, and later superseded by S4c -- a tasks.md bookkeeping gap, not missing work) |

Every task S1 through S5f except 4.17/4.18 is checked `[x]` in `tasks.md`. Tasks 4.17/4.18 (S4b: the original ca-keyed buildDocumentFilename plus its test) are unchecked despite the described work existing, being tested, and having since been superseded by S4c's buildDocumentPath -- confirmed by direct inspection of tasks.md and documents.ts/documents.test.ts this session. This checkbox gap does not indicate missing functionality (Stable Document Filename Derivation is COMPLIANT below, backed by real, currently-passing tests), but it is a real tasks.md sync defect the orchestrator should correct. S6 is correctly unchecked and no S6 file exists.

### Build & Tests Execution (independently reproduced this session)

**Build (typecheck)**: PASSED
```text
$ pnpm typecheck
> tsc -p tsconfig.json --noEmit
(no output, exit 0)
```

**Tests**: 219 passed / 0 failed / 0 skipped
```text
$ pnpm vitest run
 Test Files  40 passed (40)
      Tests  219 passed (219)
```

Growth since the last recorded verify report (S5c, 149/149): +70 tests across S5d (parsing/site/ports-audit), S5e (axios-transport, main.ts composition), and S5f (response-view/detail-page rebuilt against captured live markup).

### Spec Compliance Matrix (49 requirements / 95 scenarios)

#### core-coverage-accounting (7 requirements / 16 scenarios) -- all COMPLIANT

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Cell State Ledger | Cell under the adapter cap is complete | coverage.test.ts: classifies a cell under the adapter-declared cap as complete | COMPLIANT |
| Cell State Ledger | Saturated single-day cell is truncated | coverage.test.ts: classifies a cell at or above the adapter-declared cap as truncated | COMPLIANT |
| Cell State Ledger | Cell that exhausted retries is failed | scraper.test.ts failure-ledger tests (permanentError/hostDefect cap paths) | COMPLIANT |
| Cell State Ledger | Successfully subdivided cell is recorded, not discarded | scraper.test.ts: calls split() on a saturated unit, enqueues its children, and records the parent as subdivided | COMPLIANT (mutation-audited, S5c report audits #1/#3) |
| Cell State Ledger | Site with no declared cap never saturates | coverage.test.ts + scraper.test.ts null-cap tests | COMPLIANT (mutation-audited, audit #10) |
| Cell State Ledger | Declared cap absence is recorded faithfully | ports.ts declaredCap: number or null; buildCoverageRecord passes it through unchanged | COMPLIANT |
| Run Summary Arithmetic | Summary matches ledger counts | coverage.test.ts: reports exact counts derived from the ledger, not an estimate | COMPLIANT |
| Run Summary Arithmetic | Subdivided parent is not double-counted | coverage.test.ts: excludes a subdivided parent from all three tallies | COMPLIANT (mutation-audited, audit #6) |
| Idempotence Verification by Set Hash | Repeated search on an unchanged cell yields matching hash | coverage.test.ts: produces matching hashes for the same set of ids observed twice | COMPLIANT |
| Idempotence Verification by Set Hash | Live data change is detected as a hash mismatch | coverage.test.ts: reports a differing hash when the underlying set changed | COMPLIANT |
| Deduplication by Adapter-Declared Identity Key | Same item appears in two overlapping cells | scraper.test.ts: writes the same item once across two overlapping cells | COMPLIANT |
| Partition Invariant Verification | Per-facet-value sum satisfies the invariant | coverage.test.ts: passes when the per-facet-value sum exceeds the unfiltered day count | COMPLIANT |
| Partition Invariant Verification | Invariant violation is flagged | coverage.test.ts: flags a violation rather than silently accepting the discrepancy | COMPLIANT |
| Partition Invariant Verification | Invariant is checked against the persisted parent record | coverage.test.ts: sources the unfiltered count from the LATEST facetValue-null record | COMPLIANT (mutation-audited, audit #7) |
| Separate Checkpoint and Failure Ledger Concerns | Document retry does not re-discover | scraper.test.ts: retrying a failed document re-issues only fetchDocument, never the cell discovery | COMPLIANT |
| Observation-Timestamped Completeness | Complete cell later contradicted by a re-check | coverage.test.ts: does not treat an earlier complete observation as invalidated by a later re-check | COMPLIANT |

Note: the S5c report WARNING 1 (resume-path SaturationInfo.resultCount fabricated from the declared cap) is RESOLVED. Task 7.30 added CheckpointRecord.resultCount, wired it at the checkpoint-write call site, and fixed the resume loop to read it. Confirmed this session: the extended scraper.test.ts resume test explicitly asserts the persisted observed result count, not the declared cap, is what reaches SaturationInfo.

#### core-frontier-crawl (6 requirements / 9 scenarios) -- all NOT IMPLEMENTED

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Deferred Phase-2 Invocation | Plain scrape does not run frontier crawl | none | UNTESTED -- no code |
| Deferred Phase-2 Invocation | Frontier run consumes seeds from a prior process | none | UNTESTED -- no code |
| Seed Harvesting and Prioritization | Higher-ranked seed kind is selected first | none | UNTESTED -- no code |
| Seed Harvesting and Prioritization | Complete-cell seeds are deprioritised | none | UNTESTED -- no code |
| Yield-Decay Stop Condition | Consecutive seeds yield no new items | none | UNTESTED -- no code |
| Request Budget Ceiling | Budget exhausted before yield decays | none | UNTESTED -- no code |
| Mandatory Date Range on Seed Searches | Seed search without a date range is rejected | none | UNTESTED -- no code |
| Mandatory Date Range on Seed Searches | Saturated seed search bisects | none | UNTESTED -- no code |
| Documented Unmeasurable Bias | Run summary states the limitation | none | UNTESTED -- no code |

src/engine/frontier.ts and src/adapters/trf5/seeds.ts do not exist (confirmed by direct listing this session). tasks.md 6.1-6.13 are all unchecked. This is scoped, planned, off-by-default future work per tasks.md's own sequencing -- not a regression in any completed slice -- but it is real, incomplete scope against these six requirements and is not counted as delivered.

#### core-resilience-policy (6 requirements / 10 scenarios) -- 4 COMPLIANT, 2 WARNING

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| FetchOutcome to RetryDecision Mapping | Transient outcome schedules backoff | retry-policy.test.ts: schedules backoff via retryAfter when the attempt count is within the cap | COMPLIANT (literal) -- see WARNING 1 |
| FetchOutcome to RetryDecision Mapping | Session-expired outcome retries immediately | retry-policy.test.ts: re-primes and retries immediately with zero delay | COMPLIANT |
| FetchOutcome to RetryDecision Mapping | Host-defect outcome retries a bounded number of times | retry-policy.test.ts: retries within the 1-2 attempt cap / records and stops once the cap is reached | COMPLIANT |
| FetchOutcome to RetryDecision Mapping | Permanent error never retries | retry-policy.test.ts: never retries | COMPLIANT |
| Composable Backoff Strategies | Exponential backoff grows per attempt | backoff.test.ts: grows per attempt with base 1000ms and factor 2 | COMPLIANT |
| Composable Backoff Strategies | Jitter varies delay within the configured ratio | backoff.test.ts: keeps every computed delay within +/-30% of the base delay | COMPLIANT |
| Retry-After Precedence | Server supplies Retry-After | retry-policy.test.ts: lets a server Retry-After override the computed backoff delay | COMPLIANT |
| Mandatory Backoff Cap | Delay never exceeds the cap | backoff.test.ts: never exceeds the cap at attempt 12 | COMPLIANT |
| Global 429 Cooldown | One workers 429 pauses all workers | rate-limiter.test.ts: pauses every worker once one trips the cooldown, and resumes only after it elapses | COMPLIANT (literal, at the RateLimiter unit level) -- see WARNING 2 |
| Stubbed-Transport Test Isolation | Backoff test uses fake time | backoff.test.ts / retry-policy.test.ts / rate-limiter.test.ts all use vi.useFakeTimers(); no live-host string found under src/ | COMPLIANT |

WARNING 1 / WARNING 2 (detailed in Issues Found below): the transient FetchOutcome kind -- the entire 429/5xx/backoff/cooldown machinery this domain exists to test -- is never constructed by any production adapter code. Every mapping/backoff/cooldown scenario above is proven correct in isolation against a hand-built FetchOutcome literal, which is exactly what the spec Purpose statement asks for. The gap is one layer up: nothing wires a real 429/503/timeout response into a transient outcome, so this whole domain is currently unreachable from real traffic.
#### core-run-control-and-output (10 requirements / 20 scenarios) -- 9 COMPLIANT, 1 with a carried-forward SUGGESTION

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| CLI Bound Enforcement | Max-documents bound stops document fetching | budget.test.ts + scraper.test.ts: stops fetching further documents once --max-documents is reached, across the whole run | COMPLIANT |
| CLI Bound Enforcement | Max-items bound stops item collection | budget.test.ts + scraper.test.ts: stops collecting further items once --max-items is reached | COMPLIANT |
| Default Request Ceiling Requiring Override | Run without explicit override respects the default ceiling | budget.test.ts: an omitted --max-requests still stops at the default ceiling | COMPLIANT |
| Default Request Ceiling Requiring Override | Unbounded run requires explicit opt-in | args.test.ts: only the literal unbounded disables --max-requests -- never reachable by omission | COMPLIANT |
| Dry-Run Forecast | Dry-run issues zero discovery requests | dry-run.test.ts: forecastRun accepts no HttpTransport/SitePort at all -- zero requests by construction | COMPLIANT |
| JSONL Append-Only Output | Process killed mid-run leaves valid output | jsonl-item-sink.test.ts: leaves every already-written line valid after a run is killed mid-way | COMPLIANT |
| JSONL Append-Only Output | Records are never mutated | jsonl-item-sink.test.ts: never mutates an already-written line when the same item is observed again | COMPLIANT |
| Mandatory Envelope Fields | Record carries all mandatory envelope fields | scraper.test.ts: writes the same item once with the exact mandatory envelope | COMPLIANT |
| English camelCase Property Naming | Source-language field is renamed on output | payload.test.ts: never emits a source page Portuguese form/query-parameter name as a payload property name | COMPLIANT |
| English camelCase Property Naming | Domain acronym survives translation | payload.test.ts: cpf/oabNumber/oabState preserved | COMPLIANT |
| English camelCase Property Naming | Core envelope does not constrain payload shape | scraper.ts buildEnvelope passes payload through unchanged | COMPLIANT |
| Separate Coverage Ledger File | Coverage and item data are not interleaved | jsonl-coverage-sink.test.ts: never interleaves coverage records into the items file | COMPLIANT |
| Persisted Identifier Stability | Persisted record survives its originating session | persisted-identifier-stability.test.ts (document path, TraversalCursor, CheckpointRecord) | COMPLIANT |
| Persisted Identifier Stability | Session-scoped token is not the only handle | persisted-identifier-stability.test.ts: none of the three targets carry ca/jsessionid/ViewState | COMPLIANT |
| Structured Run Observability | Lifecycle transition is observable after the fact | scraper.test.ts: unit.started/unit.completed, unit.saturated, fetch.retry, session.reprimed, document.persisted/failed via RecordingLogger | COMPLIANT |
| Structured Run Observability | A failing logger does not fail the run | scraper.test.ts: a Logger that throws does not fail the run or change its outcome | COMPLIANT (mutation-confirmed, S5a report) |
| Structured Run Observability | Log output does not corrupt the run summary | console-logger.test.ts (stderr-only) + jsonl-logger.test.ts (file-only), every Logger implementation individually proven never to touch stdout | COMPLIANT, by exhaustive per-implementation proof -- see SUGGESTION 1 |
| Personal Data Handling Rules | Output directories are git-ignored | gitignore entries for output, data, pdfs, logs; git status confirmed clean of these paths at session start | COMPLIANT |
| Personal Data Handling Rules | Test fixtures use synthetic data | per-fixture README checklists (S3/S4a); S5f fixtures are captured-and-redacted per their own header comments | COMPLIANT |
| Personal Data Handling Rules | Emitted log events carry no personal data or session token | redacting-logger.test.ts: redacts cpf/partyName/jsessionid/viewState/ca by field name, never by sniffing values | COMPLIANT |

SUGGESTION 1 (carried forward from the S5a verify report, still open): now that main.ts (S5e) exists, no test drives a true end-to-end run with stdout captured to a file to confirm log events never reach it in the composed system, as opposed to per-Logger-implementation proof. main.test.ts (2 tests plus a pdfsDir persistence test) does not cover this. Low severity, but still open two slices later than when it was first raised.

#### core-scraping-engine (7 requirements / 14 scenarios) -- 5 COMPLIANT, 2 WARNING

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Two-Stage Discover-Then-Fetch Execution | Document fetch fails after successful discovery | scraper.test.ts: still writes the item when its document fetch fails, and records the document failure | COMPLIANT (literal) -- see WARNING 3 |
| Two-Stage Discover-Then-Fetch Execution | Discover stage fails | scraper.test.ts: skips the fetch stage entirely when discovery fails | COMPLIANT |
| Payload-Generic Port Contracts | Engine compiles and runs against a fake adapter | portability.test.ts + portability-non-date.test.ts: full engine suite green against two independent fake adapters; adapters/trf5 never imported | COMPLIANT |
| Payload-Generic Port Contracts | amended -- proven against the first real SitePort implementation | site.test.ts (TRF5Site, 9 tests) + ports-implementation-audit.test.ts | COMPLIANT |
| Opaque Checkpoint Persistence | Cursor round-trips through the checkpoint store | jsonl-checkpoint-store.test.ts: round-trips a cursor as byte-identical JSON | COMPLIANT |
| Enforced Adapter Seam | Engine file imports an adapter module | eslint.config.js no-restricted-imports scoped to src/engine, mutation-confirmed in S5a report | COMPLIANT |
| Enforced Adapter Seam | Engine file imports axios or cheerio directly | same ESLint rule, same mutation-confirmed mechanism | COMPLIANT |
| Bounded In-Process Worker Pool | Concurrency never exceeds the configured limit | pool.test.ts | COMPLIANT |
| Bounded In-Process Worker Pool | No external infrastructure dependency | package.json dependency graph has no Redis/BullMQ/queue client | COMPLIANT |
| Saturation-Driven Subdivision | Saturated unit is subdivided and children are enqueued | scraper.test.ts: calls split on a saturated unit, enqueues its children, and records the parent as subdivided | COMPLIANT (literal, stub-proven) -- see WARNING 4 |
| Saturation-Driven Subdivision | Traversal port reports no further subdivision is possible | scraper.test.ts: records a truncated gap and enqueues nothing when split returns null | COMPLIANT |
| Saturation-Driven Subdivision | A misbehaving port cannot cause an infinite loop | scraper.test.ts: bounds a lineage to the configured max split depth | COMPLIANT (mutation-audited) |
| Saturation-Driven Subdivision | Requeued children resume like any other unit | scraper.test.ts: resumes a subdivided checkpoint by re-splitting it directly | COMPLIANT (mutation-audited) |
| Site-Agnostic Failure Vocabulary | Failure-reason vocabulary contains no site-specific concept | engine/types.ts literal union type; mutation audit confirms the type system rejects a site-specific literal in reason | COMPLIANT, stronger than a runtime test |
| Site-Agnostic Failure Vocabulary | A new site-specific permanent failure does not require an engine type change | detail.test.ts and documents.test.ts D12 tests | COMPLIANT (mutation-audited) |

WARNING 3 and WARNING 4 are detailed in Issues Found below. WARNING 4 is the single most important finding in this report: the live acceptance run in S5f hit a real saturated day and split returned null instead of children, because the class-catalogue fetch in classes.ts is unreliable against a real, aged session -- meaning the mechanism that is fully green and mutation-audited against a stub transport has never yet successfully subdivided a real saturated cell.
#### trf5-adapter (13 requirements / 26 scenarios) -- 10 COMPLIANT, 3 WARNING, 1 NOT IMPLEMENTED

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Session Priming and Field Harvesting | Priming harvests all required fields | session.test.ts: harvest jsessionid/ViewState/fieldNames/triggerId from actual response content | COMPLIANT |
| Session Priming and Field Harvesting | Server-generated ids differ between runs | session.test.ts: two priming responses with different j_id values each use their own harvested values | COMPLIANT |
| Session Expiry Detection and Re-Priming | Expired ViewState triggers re-prime | search.test.ts: re-primes and replays once on an Ajax-Response redirect to login.seam | COMPLIANT |
| Complete Search Form Field Set | All fields present, some empty | search.test.ts: includes every documented field, populated ones with real values and the rest empty | COMPLIANT -- see WARNING 5 |
| Complete Search Form Field Set | Missing date range is rejected before request | search.test.ts: rejects a request built without dataAutuacaoInicio/dataAutuacaoFim before sending | COMPLIANT |
| Detail Fetch Session Requirement | Detail fetch without primed session | detail.test.ts: primes a session first when none is provided, then fetches the detail page | COMPLIANT |
| Document Byte-Level ISO-8859-1 Decoding | Percent-encoded accented label decodes correctly | encoding.test.ts (4 tests: primary decode, second accented label, passthrough, UTF-8 negative case) | COMPLIANT |
| Stable Document Filename Derivation | Three same-labeled documents in one process | documents.test.ts: 3-distinct-paths case | COMPLIANT (mutation-audited, S4d) |
| Stable Document Filename Derivation | Document path is human-navigable | documents.test.ts happy-path case | COMPLIANT |
| Stable Document Filename Derivation | Hostile label cannot escape the output directory | documents.test.ts hostile-label case | COMPLIANT (mutation-audited, S4d mutation #2) |
| Stable Document Filename Derivation | Same document re-scraped in a later session keeps its path | documents.test.ts repeated-call stability case | COMPLIANT (mutation-audited, S4d mutation #4) |
| Document Persistence to Disk | Fetched document reaches the filesystem | fs-document-sink.test.ts: bytes on disk match the fetched body exactly | COMPLIANT (mutation-audited, S4d) |
| Document Persistence to Disk | Failed document fetch writes no file | scraper.test.ts: writes no file when the document fetch fails, while still writing the item and the ledger entry | COMPLIANT |
| Full Field Inventory Extraction | Party with nested lawyer is extracted | detail-page.test.ts, rebuilt in S5f against a real captured detail page | COMPLIANT (literal) -- see WARNING 6 |
| Full Field Inventory Extraction | Assunto hierarchy retains CNJ codes | detail-page.test.ts subjects test, against real captured markup | COMPLIANT |
| Content-Based Validity Chain | Invalid ca token produces a shell page | response-view.test.ts + validity-chain.test.ts, now against a real captured invalid-token shell (5f.1/5f.6) | COMPLIANT -- notably strengthened in S5f from a hand-authored fixture to a captured live response |
| Content-Based Validity Chain | Valid process with zero documents is not mistaken for a shell | validity-chain.test.ts (S4a case), still passing after the S5f rebuild | COMPLIANT |
| Content-Based Validity Chain | Host defect page is distinguished from valid data | validity-chain.test.ts host-defect case | COMPLIANT |
| Declared Result-Page Cap and Item Identity Key | Adapter declares a cap of 30 | site.test.ts: declares a result-page cap of 30; independently confirmed on the live acceptance run (2026-03-10 returned exactly 30 rows) | COMPLIANT |
| Declared Result-Page Cap and Item Identity Key | Adapter declares the process number as identity key | site.test.ts: declares processNumber as the item identity key | COMPLIANT |
| Declared Result-Page Cap and Item Identity Key | Declared identity key populates the envelope itemId | payload.test.ts: produces an item whose declared itemId equals the payload processNumber | COMPLIANT |
| Declared Partition Facet | Adapter declares classeJudicial as the partition facet | traversal.test.ts: declares classeJudicial as its partition facet | COMPLIANT |
| Judicial Record Payload Contract | Payload case class carries both code and label | payload.test.ts, against real captured markup after S5f | COMPLIANT |
| Judicial Record Payload Contract | Payload nests parties, movements, and documents | payload.test.ts | COMPLIANT |
| Judicial Record Payload Contract | Portuguese source field names do not reach the output | payload.test.ts banned-field-name scan | COMPLIANT |
| Declared Seed Kinds and Ranking | Adapter ranks OAB above name | none -- seeds.ts does not exist | NOT IMPLEMENTED |

WARNING 5 (Complete Search Form Field Set): toBrDate (site.ts:39), the function that converts the traversal cursor ISO date into the BR-format dataAutuacaoInicio/dataAutuacaoFim search-form values, has zero test coverage anywhere. search.test.ts exercises buildSearchRequestBody directly with already-formatted date strings supplied by the test, never through TRF5Site.discover, and site.test.ts discover tests use a stub transport without ever inspecting the outgoing request body for the date fields. A defect in this conversion (for example a locale or padding mistake) would silently narrow or shift every search window and would not be caught by any test in the suite.

WARNING 6 (Full Field Inventory Extraction): two disclosed, real-data gaps remain against the literal "MUST extract the complete detail-page field inventory" text, both confirmed present in the code this session: (a) documentoSemLoginHTML document rows (the newer, born-digital document delivery mechanism) are enumerated as skipped, not fetched -- a process whose documents are entirely this shape yields zero fetchable documents; (b) a CNPJ-identified party does not match the CPF-only party regex and is recorded with role UNKNOWN and cpf null rather than being structurally parsed. Both are disclosed in apply-progress.md and docs/RESEARCH.md and neither is silently dropped (the party is still recorded, the document row is still visible in the fixture-driven skip test), but neither satisfies "complete" for real processes exhibiting either shape.
### Correctness (Static Evidence) -- summary

All S1 through S5f production modules named in design.md now have a real, non-fixture implementation, confirmed by engine/ports-implementation-audit.test.ts: TRF5Site (SitePort), TRF5Traversal (TraversalPort), AxiosTransport (HttpTransport), SystemClock (Clock), FsDocumentSink (DocumentSink), JsonlLogger/ConsoleLogger (Logger). The single disclosed, tracked exception is FrontierCapable, which has no implementation because S6 does not exist. This audit is itself mutation-tested (RED observed by temporarily stripping implements SitePort from site.ts).

### Design Coherence

| Decision | Followed? | Notes |
|---|---|---|
| D1 (two adapter-facing ports only) | Yes | SitePort + TraversalPort, confirmed in ports.ts |
| D2 (transport returns bytes, never decoded text) | Yes | HttpResponse.body: Uint8Array; decoding happens in adapters/trf5/decode.ts and encoding.ts |
| D3 (frontier support is a separate interface) | Not yet exercised | FrontierCapable exists on the port surface but has no implementation (S6 not started) |
| D4 (lazy facet expansion) | Yes | traversal.ts split() only expands facets after a saturated single-day window |
| D5 (append-only JSONL state) | Yes | All stores confirmed append-only with torn-line handling |
| D6 (rate limiter is a global gate) | Yes | rate-limiter.test.ts |
| D7 (zod parses a normalized ResponseView) | Yes | response-view.ts / validity-chain.ts |
| D8 (invalid-token shell detected by absence of header/parties block) | Yes, and now real-data-proven | response-view.test.ts against a real captured shell (S5f) |
| D9 (null means known-absent) | Yes | Consistently applied across payload.ts, ports.ts |
| D10 (subdivided cell state) | Yes | coverage.ts / scraper.ts, mutation-audited |
| D11 (resultPageCap: number or null, never a sentinel) | Yes | ports.ts, coverage.ts null-cap guards, scraper.ts explicit cap !== null guard |
| D12 (permanentError.reason site-agnostic, detail opaque) | Yes | types.ts, detail.ts, documents.ts, both TRF5 construction sites confirmed updated |
| Partitioning pseudocode (process(unit)) | Yes, mechanism proven; not yet proven on real saturated data | See WARNING 4 -- classes.ts catalogue reliability blocked this on the one live saturated day observed |

### Issues Found

**CRITICAL** (8 -- 7 unimplemented requirements plus 1 tasks.md bookkeeping defect; the bookkeeping item does not itself block archive but is CRITICAL per this project's own "unchecked tasks always remain CRITICAL" rule):

1. core-frontier-crawl: Deferred Phase-2 Invocation -- not implemented (no engine/frontier.ts).
2. core-frontier-crawl: Seed Harvesting and Prioritization -- not implemented (no adapters/trf5/seeds.ts).
3. core-frontier-crawl: Yield-Decay Stop Condition -- not implemented.
4. core-frontier-crawl: Request Budget Ceiling (frontier-specific) -- not implemented.
5. core-frontier-crawl: Mandatory Date Range on Seed Searches -- not implemented.
6. core-frontier-crawl: Documented Unmeasurable Bias -- not implemented.
7. trf5-adapter: Declared Seed Kinds and Ranking -- not implemented (depends on seeds.ts).
8. tasks.md bookkeeping: tasks 4.17 and 4.18 (S4b) are unchecked despite the described work (documents.ts buildDocumentFilename + documents.test.ts) existing, passing, and being superseded by S4c's buildDocumentPath. No requirement is affected -- Stable Document Filename Derivation is COMPLIANT below on current code -- but the checkbox state itself is wrong and should be corrected in tasks.md.

Findings 1-7 trace to the same root cause: tasks.md 6.1-6.13 (13 tasks) are unchecked and no S6 code exists. Per this project own strict-verification discipline, an unchecked task is always CRITICAL regardless of how well the completed slices score -- this is stated explicitly to avoid the exact failure mode this change has repeatedly caught in its own history (a green suite and a 100% coverage map that both quietly hid a real gap). This is scoped, planned, additive, off-by-default work per tasks.md own sequencing, not a regression introduced by any applied slice; S1 through S5f are not implicated by this finding.

**WARNING** (6):

1. (core-resilience-policy: FetchOutcome to RetryDecision Mapping) No production adapter code anywhere constructs FetchOutcome.kind === 'transient'. Confirmed by exhaustive grep across src/: documents.ts, detail.ts, and site.ts each map every unrecognized or unexpected HTTP status to hostDefect, never transient. The mapping function itself (retry-policy.ts decide()) is correctly proven against hand-built transient literals, satisfying the spec own scenario text and its explicit stubbed-transport-only Purpose statement -- but the practical consequence is that a real 429 or 503 from the live TRF5 host currently gets bounded-retried-then-abandoned via the hostDefect path (cap 2) rather than backed off and cooled down via the transient path (cap 5, global cooldown, Retry-After honored). This is disclosed in apply-progress.md S5f as a known follow-up ("must land before any unbounded live sweep") and independently confirmed here, not merely repeated from the disclosure.
2. (core-resilience-policy: Global 429 Cooldown) Direct consequence of WARNING 1: since transient is never constructed by the adapter, tripCooldown is never reachable from real traffic either. rate-limiter.test.ts proves the RateLimiter class correctly pauses all workers when directly told to trip -- that mechanism is sound -- but nothing in the current adapter ever tells it to.
3. (trf5-adapter: Complete Search Form Field Set) toBrDate (site.ts:39) has zero test coverage, direct or indirect. See WARNING 5 detail above.
4. (trf5-adapter: Full Field Inventory Extraction) documentoSemLoginHTML document rows are skipped entirely, and a CNPJ-identified party falls through to an UNKNOWN/null placeholder rather than being structurally extracted. See WARNING 6 detail above.
5. (core-scraping-engine: Two-Stage Discover-Then-Fetch Execution) DiscoverResult has no partial-failure shape (ports.ts:26-30: items, documentsByItemId, count -- no per-row outcome). The live acceptance run in S5f hit exactly this: a single misclassified row failed the entire discover-stage outcome for the unit, discarding every other item that unit would otherwise have yielded. This does not violate the literal two scenarios (which are both about a whole-stage outcome, not row-level partial failure), but it is a real, live-confirmed correctness gap disclosed in tasks.md own S5f section as a deliberate non-fix.
6. (core-scraping-engine: Saturation-Driven Subdivision) The mechanism is fully wired and mutation-audited against StubTransport (11/11 mutations caught per the S5c report), but the one live saturated day this change has ever observed (2026-03-10, 30/30 rows) did not subdivide: split() returned null because classes.ts unscoped, unvalidated li scan returned far fewer than the real roughly-132-entry class catalogue under a real, already-aged session. Recorded in docs/RESEARCH.md 9.9 and apply-progress.md, and independently corroborated here by reading classes.ts, which indeed has no content-based validity check on the catalogue response (unlike every other TRF5 response type, which is validated through the zod chain). This is the clearest instance in this change of the pattern the launch prompt names: a mechanism proven green against a fixture the implementation itself controls, silent on the one real occasion it was tested.

**SUGGESTION** (1):

1. (core-run-control-and-output: Structured Run Observability) No end-to-end test with a real composed run (main.ts) captures stdout to a file and asserts it contains only summary/forecast output, as opposed to the exhaustive per-Logger-implementation proof that already exists. Carried forward from the S5a verify report; still open two slices later.
### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes, with disclosed exceptions | Every slice S1-S5f has a TDD Cycle Evidence table in apply-progress.md. Two slices (S4c, S5c tasks 7.1-7.27) disclosed lost or retroactive RED and substituted an equal-strength mutation-detection audit instead of a fabricated RED narrative -- itself a strength of this project process, not a compliance failure, since the substitution is independently verifiable and was independently re-run for 5 of 11 S5c-audited behaviors in the historical S5c verify report. |
| All tasks have tests | Yes, for S1-S5f | 145/145 complete tasks map to a covering test or a type-level enforcement, confirmed by source inspection this session. S6 (13 tasks) has no tests because it has no code. |
| RED confirmed (tests exist) | Yes | All referenced test files exist under src/, confirmed by this session grep listing (40 files). |
| GREEN confirmed (tests pass) | Yes | 219/219 pass on this session own independent re-run. |
| Non-vacuousness of substituted RED (S4c, S5c) | Yes | S4d exists specifically to mutation-prove S4c own suite (9/10 caught, 1 gap closed). S5c own entry mutation-proves 11/11 behaviors, 5 of which were independently re-run by the historical S5c verify report, not merely trusted. |
| Strict TDD honesty discipline | Consistently upheld | Every non-vacuous or retroactive cycle across S1-S5f is disclosed by name in apply-progress.md rather than presented as a clean RED. This session found no undisclosed fabricated RED claim anywhere in the trail. |

**TDD Compliance**: honest disclosure confirmed accurate across every slice; no fabricated RED claim found.

---

### Test Layer Distribution

| Layer | Approx. Tests | Tools |
|---|---|---|
| Unit (pure functions, no I/O) | Majority of the 219 | vitest |
| Unit + StubTransport / fake HttpTransport | Session priming, search, traversal, detail, documents, site.ts discover/fetchDocument | vitest + hand-rolled stub |
| Unit + real temp-dir file I/O | JSONL sinks, fs-document-sink, jsonl-logger | vitest + node:fs |
| Unit + in-memory engine stores | scraper.ts full loop (dedup, checkpoint ordering, split/resume, budget, logging) | vitest + in-memory store fakes |
| Unit + local node:http stub server | axios-transport.ts | vitest + a real local server, never the live host |
| Portability / module-graph proof | engine suite against two independent fake adapters | vitest + source-text module-graph check |
| Live-host, automated | None -- forbidden by design | N/A |
| Live-host, manual-smoke-only | One dry-run, one narrow live run (S5e task 9.6, S5f task 5f.8) | Recorded in apply-progress.md, never in the suite |

Integration/E2E in the conventional sense (browser automation) is N/A by explicit design decision (design.md); the closest analogue -- a real composed run over a local stub HTTP server and a real filesystem -- exists via main.test.ts and the two manual-smoke live runs.

---

### Assertion Quality

No tautologies, ghost loops over possibly-empty collections, or assertion-without-production-call patterns were found across the files inspected this session (coverage.test.ts, scraper.test.ts, site.test.ts, detail.test.ts, documents.test.ts, retry-policy.test.ts, backoff.test.ts, rate-limiter.test.ts). Every mutation-audit row in the S4d and S5c apply-progress entries independently demonstrates a real production-code call is exercised and a real, specific failure message is produced, which is a stronger non-vacuousness proof than assertion-shape inspection alone provides.

**Assertion quality**: no CRITICAL or WARNING findings from this session own inspection.

---

### Quality Metrics

**Linter**: not re-run this session (typecheck and full test suite were run; lint was not part of the declared strict-TDD test/build command pair for this verification, and no lint-affecting change was made). Prior sessions (S5a, S5c) confirmed clean.
**Type Checker**: No errors (pnpm typecheck, exit 0) -- independently reproduced this session.
**Tests**: 219/219 passing -- independently reproduced this session.

---

### Verdict

**FAIL** -- not ready to archive as a complete 49-requirement change.

S1 through S5f (143 of 158 tasks, 42 of 49 requirements, 85 of 95 scenarios) are genuinely well-built and well-tested: every completed slice independently re-runs green, the strict-TDD discipline is honestly disclosed throughout including two substituted-RED cases that are themselves mutation-proven, and S5f in particular measurably improved the evidence quality of the weakest prior area (Content-Based Validity Chain and Full Field Inventory Extraction are now proven against real captured live markup, not an invented fixture).

But the change is not complete against its own 49-requirement specification: seven requirements (all of core-frontier-crawl, plus trf5-adapter Declared Seed Kinds and Ranking) have no implementation at all, because S6 (13 tasks) has not been started. This is CRITICAL by this project own stated verification discipline ("unchecked tasks always remain CRITICAL"), and it is the honest reason the previously-persisted verify-report.md (5/5 requirements, scoped to S5c only) could never have been a valid stand-in for a full-change report: it never claimed to cover the other 44 requirements, and this report is what closes that gap.

Independently of S6, six WARNING-level findings are recorded against implemented, tested, and passing code, matching the pattern this project has repeatedly and honestly caught in its own history: real mechanisms (FetchOutcome.transient construction, Global 429 Cooldown reachability, saturation-driven subdivision under a real class catalogue, full field inventory for two real document/party shapes, and the date-format conversion feeding every search) are proven correct only against a fixture or in isolation, and the one live run this change has ever executed surfaced exactly the gap the verification lens warned about for split() and DiscoverResult. None of these six break a literal spec scenario as worded, and none is a regression -- all are already disclosed in apply-progress.md or docs/RESEARCH.md by the applying sessions themselves -- but none should be silently passed either.

**Recommendation**: do not archive yet. Either (a) run sdd-apply for S6 to close the seven NOT IMPLEMENTED requirements and re-verify, or (b) if S6 is to be explicitly descoped from this change, update the spec set and tasks.md to remove or defer core-frontier-crawl and the seed-kinds requirement before archiving, so the archived change no longer claims 49 requirements it does not deliver. The six WARNING findings do not block archive on their own but should be tracked (most urgently WARNING 1/2, since they leave the single most safety-critical mechanism in this change -- 429 handling against a real judicial portal -- currently unreachable).
