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
| Estimated changed lines | ~8400 authored (S1 749 actual, S2a 808 actual, S2b 663 actual, S3 835 actual, S4a 729 actual, S4b 266 actual, S4c 409 actual, S4d 83 actual, S5a 575 actual, S5c 1084 actual, S5b 775 actual for tasks 5.1–5.8 only — apply stopped mid-slice on a discovered gap, see the S5b section, S5d 601 actual, S5e 557 actual, S5f 515 actual, S5g 594 actual, S5h ~330, S5j ~340, S5i ~300, S6 ~450) — corrected running total; the S5d/S5e pair is work no earlier slice ever assigned, see "S5d/S5e forecast (decide before launch)" below, S5f is the remediation the first live run made unavoidable, and S5g closes a producer-side gap the full-change verify report found: the entire 429 mechanism is written and tested but unreachable, because no task ever assigned the adapter-side status classification that feeds it. S5h landed at 577 authored `src/` lines against its ~330 estimate, within the 800 budget |
| 800-line budget risk | **Resolved for S5d and S5e: both landed under budget.** S5d at 601 (75% of budget, under its own pre-granted `size:exception` and its ~770 estimate) — recorded for the historical record alongside S1, S3 and S5c's exceptions. S5e at 557 (70% of budget, 43% over its ~390 estimate but comfortably inside 800) needed no exception at all — none was pre-granted for it. S5b stopped itself at 775 rather than overrun |
| Chained PRs recommended | Yes |
| Suggested split | S1 -> S2a -> S2b -> S3 -> S4a -> S4b -> S4c -> S4d -> S5a -> S5c -> S5b -> S5d -> S5e -> S5f -> S5g -> S5h -> S5j -> S5i -> S6 (S1+S2a+S2b hard-gate S3; S5a hard-gates S5c; S5c hard-gates S5b; S5b hard-gates S5d; S5d hard-gates S5e; S5e hard-gates S5f, since only a runnable CLI could expose what S5f fixes; S5f hard-gates S5g only in sequence, not in substance — S5g is independent of the detail parser and could have run at any point after S1, which is precisely the problem it fixes; sequential, no parallel writers) |
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

### S5d/S5e forecast (decide before launch)

S5b's apply stopped at task 5.9 because three production modules named in `design.md` were
never assigned a task in any slice, S1 through S6:

1. `src/adapters/trf5/parsing/result-fragment.ts` (`design.md:24`) — nothing parses the AJAX
   search response fragment into rows. `search.ts` returns the raw `HttpResponse` and stops,
   so the process number and the opaque `ca` token are never extracted. S3's `search-ok.xml`
   fixture is a zero-row stub whose own comment defers row extraction to S4; S4 never took it.
2. `TRF5Site` — a class implementing `SitePort` (`discover`/`fetchDocument`/`reprimeSession`).
   `site.ts` holds only `resultPageCap`, `identityKeyName`, `itemId`, `documentId` and
   `sourceUrl`, plus a comment deferring the real implementation to "S4b/S5". `rg "implements
   SitePort" src` matches the two test fixtures and nothing else.
3. `src/infra/http/axios-transport.ts` (`design.md:25`) — the only `HttpTransport`
   implementation in the repo is `adapters/trf5/__fixtures__/stub-transport.ts`.

`TRF5Traversal` does implement `TraversalPort`; the gap is the site side only.

This is the third instance of one failure class on this change, after S4c (document
persistence) and S5a (structured logging): `design.md` names a module, no spec requirement
demands it by name, and `tasks.md` never assigns it. The Requirement Coverage Map read 100%
throughout because it maps requirement to slice and never port method to concrete
implementation — and the whole suite stayed green because the fakes satisfy `SitePort`
perfectly. A green suite over port fakes proves the engine; it never proves the composition.
Those are two distinct audits, and this change only ever had the first. Task 8.9 adds the
second.

Bottom-up estimate for the whole remainder, summed group by group:

| Group | Estimate |
|---|---|
| `parsing/result-fragment.ts` + tests + a redacted multi-row fixture (the current one has zero rows) | ~350 |
| `TRF5Site` implementing all three `SitePort` methods + stub-transport-driven tests | ~350 |
| Ports-implementation guard test (every declared port has a non-fixture implementation) | ~70 |
| `infra/http/axios-transport.ts` (cookie jar, 302 handling, `Retry-After`) + tests | ~210 |
| `src/main.ts` composition root + wiring tests | ~180 |
| **Total authored `src/`** | **~1160** |

README (5.10) and `openspec/config.yaml` (5.11) are excluded from that count as non-`src/`.

~1160 is 45% over the 800 budget before any overrun, and on this change the measured
overruns are S1 +97%, S2 +168%, S3 +39%, S5a +74%, with S5c landing at 1084 against its own
~950 low end. Treating ~1160 as a floor puts the realistic band at **1160–1700**. Per the
standing rule — split by coherent deliverable rather than raise the budget — and per the
cached `auto-chain` delivery strategy, the remainder is split here into two slices along the
one seam that leaves both halves independently provable:

- **S5d — the adapter can produce items** (`result-fragment.ts` + `TRF5Site` + the ports
  guard, ~770). Provable end to end against redacted fixtures and the stub transport, with
  no network and no CLI. Closes the gap that actually blocks everything else.
- **S5e — the run actually runs** (`axios-transport.ts` + `main.ts` + README + config
  confirmation, ~390 authored `src/`). Thin wiring over an adapter S5d already proved.

Unlike the split declined for S5b's own 5.1–5.8 block, this seam is real: S5d is fully
testable without S5e existing, and S5e is wiring rather than logic.

**Residual risk, stated rather than shaved:** S5d's ~770 is 96% of budget. If the redacted
result fixture or the `discover()` validity-chain paths cost more than estimated, S5d will
cross 800 the way S5b did.

**Owner decision (2026-09-05): `size:exception` granted; S5d ships whole.** The alternative
offered and declined was cutting S5d again into `result-fragment.ts` + fixture (~350) and
`TRF5Site` + ports guard (~420); it keeps both halves in budget but makes the first PR a
parser nothing calls yet — the shape the S5c review already found unhelpful. S5d therefore
joins S1, S3 and S5c as an accepted `size:exception`, and does **not** carry S5b's mid-slice
stop rule: it runs to completion. Reviewers should expect a PR at or above 800 lines and can
treat the parser, the `SitePort` composition, and the ports audit as three separable review
passes even though they land together.

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
| S5b | Run bounds enforced in the engine, plus CLI argument parsing, dry-run forecast and ledger-faithful run summary as independently testable units — **not** an end-to-end runnable CLI, which needs S5d and S5e | PR 11 | `vitest run src/cli src/engine/budget.test.ts` | N/A — no composition root yet; `forecastRun` and `formatRunSummary` are driven directly in tests | Delete `src/cli/*`, `src/engine/budget.ts`; engine/adapter/logging remain independently testable |
| S5d | A real `SitePort` implementation exists and is proven: search-result rows parsed into items, `discover`/`fetchDocument`/`reprimeSession` composed over the existing session, detail, payload and document modules, and a guard test that fails if any declared port has only fixture implementations | PR 12 | `vitest run src/adapters/trf5/parsing src/adapters/trf5/site.test.ts src/engine/ports-implementation-audit.test.ts` | N/A — proven against redacted fixtures and the stub transport; no network | Delete `src/adapters/trf5/parsing/result-fragment.ts`, the `TRF5Site` class body and its test, and the ports-implementation audit; `site.ts`'s existing constants and id functions stay |
| S5e | The bounded run actually runs: a real HTTP transport and the composition root that wires adapter, engine, stores and logger together behind `scrape` / `retry-failed` | PR 13 | `vitest run src/infra/http src/main.test.ts` | `pnpm scrape --dry-run --from 2026-01-01 --to 2026-01-01` (stubbed in tests; live-host smoke is manual only, never automated) | Delete `src/infra/http/axios-transport.ts` and `src/main.ts`; every unit below remains independently testable |
| S5f | Detail parsing rebuilt against captured responses, so a live run reaches the sinks with real data — the first end-to-end proof against the actual portal | PR 14 | `vitest run src/adapters/trf5/parsing src/adapters/trf5/schemas src/adapters/trf5/detail.test.ts` | `pnpm scrape --from 2026-03-10 --to 2026-03-10 --max-facet-values 1 --max-items 2 --max-documents 1 --max-requests 12` — acceptance is real payloads in `output/items.jsonl` and a PDF under `pdfs/`, never a zero exit code | Revert `schemas/response-view.ts` to prefix-exact id matching and `parsing/detail-page.ts` to `#id` selectors; the captured fixtures stay, since they are evidence rather than code |
| S5g | The 429 mechanism becomes reachable: HTTP status classified into `FetchOutcome`, `Retry-After` parsed, and a variant-construction audit that fails when any declared outcome has no production producer | PR 15 | `vitest run src/engine/http-status.test.ts src/engine/outcome-construction-audit.test.ts src/engine/scraper.test.ts src/adapters/trf5` | N/A — and deliberately so: `core-resilience-policy` REQUIRES every 429 scenario to run against a stubbed transport, never the live host. Do not provoke a real 429 against a judicial portal | Delete `src/engine/http-status.ts` and the two new audits; revert the three adapter classification call sites to content-only classification. The engine's retry/cooldown code is untouched by this slice — it was always correct, just unreachable |
| S5h | The documents grid is read whole: every page fetched, and the grid's own declared total reconciled against what was extracted so a shortfall is reported rather than silently lost | PR 16 | `vitest run src/adapters/trf5/parsing src/adapters/trf5/detail.test.ts` | Bounded live run against a process whose grid paginates — acceptance is extracted + skipped counts reconciling to the grid's declared total, never a zero exit code | Revert `parsing/detail-page.ts`'s `extractDocuments` to single-page extraction and drop the declared-total field; the captured multi-page fixture stays, since it is evidence rather than code |
| S5j | Born-digital documents are fetched: the viewer page is read, its `Gerar PDF` submit contract harvested, and the resulting PDF verified by content before it is persisted | PR 17 | `vitest run src/adapters/trf5/parsing src/adapters/trf5/documents.test.ts` | Bounded live run against a process carrying born-digital rows — acceptance is real PDF bytes under `pdfs/` for one such document, never a zero exit code | Revert `documents.ts` to the legacy `idBin` path only and delete `parsing/document-viewer.ts`; the captured viewer and PDF fixtures stay, since they are evidence rather than code |
| S5i | The payload tells the truth about what was extracted and fetched: `fetchStatus`/`byteLength`/`fileName` reflect the real outcome, movement timestamps carry data, and document filenames stay descriptive under sanitization instead of collapsing to a bare id | PR 18 | `vitest run src/adapters/trf5/parsing src/adapters/trf5/documents.test.ts src/engine/scraper.test.ts` | Bounded live run — acceptance is a fetched document whose payload entry shows `fetched` with a real `byteLength`, and a slug that survives a label containing `/` | Revert `deriveSlug` to whole-candidate rejection, `occurredAt` to a hardcoded null, and the document-outcome write-back in `engine/scraper.ts` |
| S6 | Optional, off-by-default second-pass frontier crawl over persisted seeds | PR 19 | `vitest run src/engine/frontier.test.ts src/adapters/trf5/seeds.test.ts` | `pnpm scrape --frontier --dry-run` (manual smoke only; additive, off by default) | Delete `src/engine/frontier.ts`, `src/adapters/trf5/seeds.ts`; phase-1 scrape unaffected |

**Hard ordering**: S1, S2a and S2b must all land before S3 starts (chain is sequential, not parallelizable across writers). S2b depends on S2a's stores. S3 before S4a (detail parsing needs the validity-chain skeleton). S4b depends on S4a: the document list it fetches from is extracted by S4a's parser, and a ledgered document failure must not discard S4a's already-extracted item. S4c depends on S4b: it replaces that slice's filename builder and persists the bytes S4b's fetch already retrieves. S4d follows S4c and hard-gates S5a: the document-persistence suite must be proven defect-detecting before the CLI wires a real filesystem to it. S5a needs S1–S4d (it emits events from the full loop, including the document sink) and hard-gates S5c: `engine/scraper.ts`'s event emission must already exist before S5c adds new lifecycle branches (split, resume-resplit) to the same loop. S5c needs S1–S5a (it modifies `engine/{coverage,scraper,ports}.ts`, which S5a's logging already instruments and emits events through) and hard-gates S5b: `cli/summary.ts` (5.7) prints `summarizeRunCoverage`'s exact counts, so the `subdivided`-aware arithmetic and partition-invariant fixes must land before the CLI can report them honestly. S5b needs S5a and S5c. S5d follows S5b and hard-gates S5e: `main.ts` cannot compose a `SitePort` that does not exist, which is exactly where S5b's apply stopped. S5e needs S5d and closes the S5b remainder (tasks 5.9–5.11, renumbered into groups 8 and 9 below). S5f follows S5e and could not have preceded it: only a runnable CLI could reach the live host, and only the live host could show that the trigger mechanism, the row selectors and the detail-page selectors were invented. S5g follows S5f in sequence only. Unlike every other ordering constraint above, this one is not substantive: S5g touches neither the detail parser nor the CLI, and could have run at any point after S1 — the engine side it feeds has been complete and green since then. It is ordered last because that is when the gap was found, not because anything gated it. S6 is additive but now needs S5f rather than S5e — a frontier pass harvests seeds from parsed items, so it is pointless until the detail parser reads real pages; it also still needs S1–S3 (`AdapterStateStore`, `traversal.ts` split, `budget.ts`). S5h follows S5g and is data-loss remediation, not new capability: the documents grid paginates and only page 1 was ever read. It hard-gates S5i only in sequence — S5i's payload-fidelity work touches the same `extractDocuments`/`documents.ts` surface, so running them in parallel would put two writers on one file. S6 SHOULD NOT start before S5g: a frontier crawl is the widest live traffic this scraper can generate, and it must not be the first thing to discover that the global cooldown never trips.

## Requirement Coverage Map

Every requirement across the six specs maps to exactly one slice below. No requirement is left uncovered.

`S2` in this map now resolves to the S2a/S2b pair: persistence and coverage arithmetic land in
S2a, and anything requiring the loop — two-stage execution, opaque checkpoint persistence from
the engine, envelope assembly, dedup by identity key — lands in S2b. Task numbers are unchanged
by the split, so each row still resolves to the same numbered task.

`S4` resolves the same way to the S4a/S4b pair: detail fetch, field extraction, and payload
assembly land in S4a; document byte-level decoding and stable filename derivation land in S4b.
Task numbers are again unchanged.

`S5` resolves to the S5a/S5b/S5d/S5e group: the logging port, its implementations, and the
engine's event emission land in S5a (tasks 5.12–5.18); the CLI bounds, argument parsing,
dry-run forecast and run summary land in S5b (tasks 5.1–5.8); the real `SitePort`
implementation lands in S5d (tasks 8.1–8.9); the HTTP transport, composition root, README and
config confirmation land in S5e (tasks 9.1–9.6, absorbing what were tasks 5.9–5.11). Tasks
5.12–5.18 are numbered after 5.11 but execute before it.

**Known blind spot of this map.** It maps requirement to slice, never port method to concrete
implementation. That is how `TRF5Site`, `parsing/result-fragment.ts` and
`infra/http/axios-transport.ts` — three modules `design.md` names — reached S5b's apply with
no task assigned to any of them while this map still read 100%. Task 8.9 adds the missing
audit as an executable guard rather than a convention.

| Spec | Requirement | Slice |
|---|---|---|
| core-scraping-engine | Two-Stage Discover-Then-Fetch Execution | S2 |
| core-scraping-engine | Payload-Generic Port Contracts | S1 (declared + proven against fakes) / S5d (amended: proven against the first real `SitePort` implementation, guarded by task 8.9) |
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
| trf5-adapter | Session Expiry Detection and Re-Priming | S3 (detection + replay inside `search`) / S5d (amended: exposed through `SitePort.reprimeSession`) |
| trf5-adapter | Complete Search Form Field Set | S3 |
| trf5-adapter | Detail Fetch Session Requirement | S4 |
| trf5-adapter | Document Byte-Level ISO-8859-1 Decoding | S4 |
| trf5-adapter | Stable Document Filename Derivation | S4b (`ca`-derived) / S4c (amended: `processNumber` + slug) |
| trf5-adapter | Document Persistence to Disk | S4c |
| core-run-control-and-output | Persisted Identifier Stability | S4c |
| trf5-adapter | Full Field Inventory Extraction | S4 |
| trf5-adapter | Content-Based Validity Chain | S3 (cases 2/3/5) + S4 (case 1 + valid-data) / S5d (amended: classified inside `discover`/`fetchDocument` and mapped to the D12 failure vocabulary) |
| trf5-adapter | Declared Result-Page Cap and Item Identity Key | S3 (cap) / S4 (`itemId`/`sourceUrl`) / S5d (amended: `discover` reports the observed row count against the declared cap, which is what drives saturation and split) |
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
- [x] 4.17 RED `adapters/trf5/documents.test.ts`: three same-labeled `Decisão` documents in one process get three distinct filenames, derived only from `ca` + `idProcessoDocumento` (`[A-Za-z0-9._-]`-validated), never from the remote label; a failed document fetch is ledgered without discarding the already-extracted item. **S5g 5g.8 bookkeeping correction**: verified `[x]` — `documents.test.ts` (14 tests) fully covers the three-distinct-filenames and `[A-Za-z0-9._-]`-validation claims; the derivation key is `processNumber` + `idProcessoDocumento`, not `ca`, because S4c amended this exact requirement (see the "Stable Document Filename Derivation" row, `S4b (ca-derived) / S4c (amended: processNumber + slug)`) — a disclosed later amendment, not an uncovered gap. "A failed document fetch is ledgered without discarding the already-extracted item" is proven at the engine level (`engine/scraper.test.ts`, `'still writes the item when its document fetch fails, and records the document failure'`), not inside `documents.test.ts` itself, because `documents.ts` has no access to items or the ledger — `fetchDocument`'s own contribution is returning a `FetchOutcome` failure kind instead of throwing, which `documents.test.ts` does prove (404/hostDefect cases).
- [x] 4.18 GREEN implement `adapters/trf5/documents.ts` (302-follow, filename builder, `FetchOutcome` wiring for `fetchDocument`). **S5g 5g.8**: verified `[x]` — `documents.ts` implements exactly this (302-follow in `fetchDocument`, `buildDocumentPath` as the amended filename builder, every branch returning a `FetchOutcome` per S5g's new 429-precedence check plus the pre-existing 404/hostDefect/ok paths), fully exercised by `documents.test.ts`'s 14 tests.

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

## S5b: CLI bounds, argument parsing, forecast and summary (775 authored `src/` lines actual for 5.1–5.8 — within budget, complete as re-scoped)

Demonstrates: run bounds enforced inside the engine, and the three CLI-facing units — argument
parsing, dry-run forecast, ledger-faithful summary — each independently testable. It does
**not** demonstrate an end-to-end runnable CLI: that needs a real `SitePort` (S5d) and a
composition root (S5e). The original "end to end" claim here was the overclaim that hid the
gap below.

Tasks 5.9–5.11 were moved out of this slice into S5d/S5e and renumbered 8.x/9.x; they are
listed here as pointers only, not as pending work in this slice.

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
- ~~5.9~~ moved to **9.2** (S5e) — the composition root cannot be written before a real `SitePort` exists.
- ~~5.10~~ moved to **9.4** (S5e) — the README documents a run that must exist first.
- ~~5.11~~ moved to **9.5** (S5e) — the layout confirmation is done once, against the final layout.

## S5d: TRF5 site composition — the adapter can produce items (601 authored `src/` lines actual — within budget, complete)

Demonstrates: a real `SitePort` implementation, proven against redacted fixtures and the stub
transport, closing the three-module gap S5b's apply discovered. No network, no CLI.

**`size:exception` granted by the owner on 2026-09-05: S5d ships whole.** The ~770 estimate was
96% of the 800-line budget; the slice landed at 601 authored lines (78% of the estimate, 75% of
the budget) — the first slice on this change to land under its own pre-launch estimate rather
than over it. It did not carry S5b's mid-slice stop rule — it ran to completion in one batch.
See the "S5d/S5e forecast (decide before launch)" section for the original reasoning.

- [x] 8.1 RED `adapters/trf5/parsing/result-fragment.test.ts`: a redacted multi-row search fragment yields one row per result with its process number and opaque `ca` token, in document order; a zero-row fragment yields an empty list rather than throwing; the observed row count is reported so the engine can compare it against `resultPageCap`.
      Result: genuine RED — `Cannot find module './result-fragment.js'` — before the module existed. See `apply-progress.md`.
- [x] 8.2 GREEN add the redacted multi-row fixture (real structure, no personal data — follow the S3/S4a fixture redaction convention) and replace the zero-row `search-ok.xml` stub whose comment deferred row extraction to S4.
      Result: `search-ok.xml` now carries 3 synthetic rows in real markup shape (RESEARCH.md §2 Step 3's `onclick`/`ca=` pattern); the original zero-row stub content moved to a new `search-ok-empty.xml` fixture rather than being deleted, so the "no results" case stays independently fixture-backed.
- [x] 8.3 GREEN implement `parsing/result-fragment.ts` with cheerio, mirroring `parsing/detail-page.ts`'s shape.
      Result: `parseResultFragment` — one cheerio pass, `SearchResultRow`/`SearchResultFragment` exported interfaces, `count` field for the engine's saturation comparison. 3/3 tests passing.
- [x] 8.4 RED `adapters/trf5/site.test.ts`: `TRF5Site.discover()` over the stub transport returns one item per parsed row with `resultCount` set from the observed row count; a saturated fragment (rows equal to `resultPageCap`) is reported as such so the engine can split rather than silently truncate.
      Result: genuine RED — `TRF5Site is not a constructor` — before the class existed. See `apply-progress.md`.
- [x] 8.5 RED same file: `discover()` maps each validity-chain outcome to the D12 site-agnostic failure vocabulary — expired session, invalid reference, host fault — never to a bare status code, and never invents a `permanentError` the chain did not classify.
      Result: covered by 3 dedicated tests (persistent session expiry, host defect, propagated per-row `invalidTokenShell`). Same RED transcript as 8.4 (all 7 new `site.test.ts` cases failed together on the missing constructor).
- [x] 8.6 RED same file: `fetchDocument()` composes the existing `documents.ts` fetch/decode path and returns the adapter's `DocumentRow` as `TDoc`; `reprimeSession()` re-primes and returns fresh session state without replaying the caller's request.
      Result: covered by 2 dedicated tests (302-follow fetch, and a one-priming-GET-then-no-replay reprime test). Same RED transcript as 8.4.
- [x] 8.7 GREEN implement the `TRF5Site` class in `adapters/trf5/site.ts` implementing `SitePort<TrfPayload, DocumentRow>`, composing `session.ts`, `search.ts`, `parsing/result-fragment.ts`, `detail.ts`, `schemas/payload.ts` and `documents.ts`. Keep the existing exported constants and id functions; delete the stale comment deferring this work to "S4b/S5".
      Result: done — 9/9 `site.test.ts` tests passing (2 pre-existing constant tests + 7 new). The stale deferral comment is gone; `resultPageCap`/`identityKeyName`/`itemId`/`documentId`/`sourceUrl` module-level exports are unchanged and now also backed by the class.
- [x] 8.8 REFACTOR: confirm the ESLint seam rule still passes and that `TRF5Site` is reachable from `adapters/` only — the engine must keep importing the port, never the class.
      Result: confirmed — `pnpm lint` clean; `grep -rl "TRF5Site" src` returns only `adapters/trf5/site.ts` and its own test.
- [x] 8.9 RED then GREEN `engine/ports-implementation-audit.test.ts`: every port interface exported from `engine/ports.ts` has at least one implementation outside `__fixtures__/`. Prove it detects the defect by asserting it fails for a port with fixture-only implementations before `TRF5Site` lands. This is the sibling of the reverse-coverage audit in commit `43c4bdf`: that one catches declared-but-never-wired, this one catches declared-but-never-implemented. Neither catches the other, which is why this gap survived to S5b.
      Result: genuine RED observed twice — first an authoring bug (`ENOENT` from an off-by-one path slice in the file walker, fixed before the audit logic was ever exercised), then the real proof: temporarily stripping `implements SitePort<...>` from `site.ts` made the audit fail naming exactly `['SitePort']` (alongside the two already-disclosed gaps), restoring it passed again. The audit's final assertion excludes three disclosed, tracked gaps — `HttpTransport`/`Clock` (S5e tasks 9.1/9.2) and `FrontierCapable` (S6, unstarted) — rather than silently ignoring them; see the "Ports-implementation audit: findings" note in `apply-progress.md`.

## S5e: Real transport and composition root — the run actually runs (557 authored `src/` lines actual — within budget, complete)

Demonstrates: `pnpm scrape` executing a real bounded, resumable run end to end — the claim S5b
originally made and could not keep.

**Branch**: `feat/scraper-core-s5e-transport-composition-root`, forked off
`feat/scraper-core-s5d-trf5-site-composition` (PR #13 in the `feature-branch-chain`).
557 authored `src/` lines (git diff --numstat additions+deletions for new files under `src/`)
against the ~390 estimate (43% over, in line with this change's standing pattern of
under-estimating) and comfortably inside the 800-line budget (70%) — no `size:exception`
needed. `KNOWN_DEFERRED_GAPS` in `engine/ports-implementation-audit.test.ts` shrank from
`['HttpTransport', 'Clock', 'FrontierCapable']` to `['FrontierCapable']`: both `HttpTransport`
(`infra/http/axios-transport.ts`) and `Clock` (`infra/clock.ts`) now have genuine `implements`
production classes.

- [x] 9.1 RED then GREEN `infra/http/axios-transport.test.ts` + `axios-transport.ts`: implements `HttpTransport` over axios with `axios-cookiejar-support`/`tough-cookie` for the session cookie, follows the document 302 without losing bytes, and surfaces `Retry-After` so the existing retry policy can honor it. Tested against a local stub server or a mocked adapter — never the live TRF5 host.
      Result: genuine RED — `Cannot find module './axios-transport.js'` — before the module existed. GREEN against a local `node:http` stub server (7/7 tests): byte-identical bytes (D2), POST body/header forwarding, 302 surfaced with `Location` rather than auto-followed (`maxRedirects: 0`, since `documents.ts` follows the one intended redirect itself), `Retry-After` surfaced verbatim, every status returned as a normal response (`validateStatus`), and per-instance cookie-jar isolation. Encountered and disclosed a real upstream type-declaration incompatibility between `axios-cookiejar-support@5` and this axios version's `NodeNext` exports (the library's own README-documented `wrapper(axios.create({ jar }))` snippet fails `tsc` in isolation); worked around with a narrow, documented cast at the wrapping boundary rather than loosening any project-wide type setting. See `apply-progress.md`.
- [x] 9.2 GREEN implement `src/main.ts` composition root (was 5.9): wires `TRF5Site`/`TRF5Traversal` + `AxiosTransport` + the JSONL stores + the redaction-wrapped `Logger` into `scrape` / `retry-failed`. `--frontier` is S6: wire the command surface only, no frontier behavior.
      Result: `runScraper(args, deps)` composes every real port implementation with `new`, no DI container; `main()` is the thin CLI entry point calling it with `AxiosTransport`/`SystemClock`/real paths, guarded to run only when invoked directly (`import.meta.url === pathToFileURL(process.argv[1]).href`). `--frontier` is left as an already-harmless unrecognized flag in the existing hand-rolled parser (never rejected) rather than adding an unused field — no behavior exists yet for a field to gate. Also added `src/infra/clock.ts` (`SystemClock implements Clock`, design.md's declared module) so the composition root wires a genuine class rather than an inline object literal — required for the ports-implementation audit to detect it (see 9.1's/9.2's audit note below).
- [x] 9.3 RED `src/main.test.ts`: a run driven with a stubbed transport reaches the sinks and writes the expected envelope, proving the wiring rather than re-testing the units.
      Result: genuine RED — `Cannot find module './main.js'` — before `runScraper` existed. GREEN (2/2): a full `discover` → dedup → `items.jsonl` envelope → `coverage.jsonl` → run-summary path over `StubTransport` and existing S3/S4/S5d fixtures (`priming-page-1.html`, `search-ok.xml`'s 3 rows, `detail-page-valid-no-documents.html`), and a `retry-failed` path proving it composes without a discovery bound. See `apply-progress.md`.
- [x] 9.4 GREEN write README (was 5.10): pnpm/tsx deviation, every CLI bound, personal-data rules (including that `logs/` is git-ignored and log fields are redacted by name), the emitted event keys and how to filter them, "coverage is measured, never certified," manual-smoke-only note for 429/session-recovery against the live host.
      Result: rewritten lead-with-outcome per `cognitive-doc-design` — Quick path, a full CLI-bounds table, the pnpm/tsx rationale, personal-data rules, an event-key table with a `jq` filter example, the "measured, never certified" framing, and the manual-smoke-only note. Existing Layout/Testing sections kept, folded in below the new content.
- [x] 9.5 Confirm `openspec/config.yaml` reflects the final layout (was 5.11) — including `src/infra/logging/` and `src/infra/http/` — and testing state (no stale `pje/`, `partition/`, `domain/` references).
      Result: confirmed, no edit needed. `rules.apply.guidelines` already states the final `engine | adapters | infra | cli` layout (no submodule enumeration anywhere in the file, so `infra/logging/`/`infra/http/` need no separate mention); `testing.layers.integration`'s description of "a fake/stubbed HTTP transport implementing the same port as the axios-based client" is now literally true. `grep` for `pje/|partition/|domain/` in the file returns nothing.
- [x] 9.6 Manual smoke only, never automated: one `pnpm scrape --dry-run` and one narrow live run against a single day, to confirm the composition holds outside the fixtures. Record the outcome in `apply-progress.md`; do not add it to the suite.
      Result: `pnpm scrape --dry-run --from 2026-01-01 --to 2026-01-01` executed — printed `Dry run: an estimated 41 requests, ~21s ...`, created no `output/`/`logs/` directory (zero requests, by construction). The live-host half is explicitly out of scope for this apply run (hard constraint: never hit the live TRF5 host) and is left for the owner to run manually — see `apply-progress.md`.

## S5f: Detail parsing against captured responses (515 authored `src/` lines actual — within budget, complete)

Demonstrates: a live run that reaches the sinks with real scraped data — the first
end-to-end proof this change has ever had against the actual portal.

**Why this slice exists.** S5e landed a runnable CLI, and the first live run it made
possible drove out four defects in modules every earlier slice had marked complete. Three
are fixed (commits `c3d17a5`, `436f337`, `135d2e6`): the a4j trigger mechanism, the
nullable `jsessionid`, unresolved site-relative URLs, and the invented row selectors. The
live flow now primes, searches, parses all 30 rows for a saturated day, and fetches a
101318-byte detail page. Parsing that page is what remains.

Every defect shared one shape: `docs/RESEARCH.md` recorded WHAT the site returns, and the
implementation invented HOW it is marked up, then wrote a fixture matching the invention.
The suite stayed green throughout because it only ever proved the parser could read its
own fixture.

**Standing rule adopted with this slice: no fixture in this repository is written by
hand.** Every response fixture is a redacted cut of a captured live response, and its
header comment records when it was captured and what was redacted. A hand-written fixture
is a restatement of the belief under test.

- [x] 5f.1 Capture and redact: cut `detail-page-valid.html` from the real 101318-byte detail page (currently 2635 bytes of invented markup), preserving the `.propertyView` label/value structure, the parties lists, the movements panel and the documents grid. Redact every CPF, party name, OAB number, process number and `ca` token per the fixtures README checklist. Result: captured live for process `0005643-82.2001.4.05.8000` (dataAutuacao 10/03/2026); redacted and installed with a header comment documenting what changed; also captured and installed a real invalid-`ca` shell (`detail-page-invalid-token.html`, 25524 bytes) for task 5f.6.
- [x] 5f.2 RED `schemas/response-view.test.ts`: `hasDetailHeaderBlock` and `hasPartiesBlock` are true for the captured detail page. They are false today because the detectors match `id="processoTrfViewView"` unprefixed while JSF renders `id="j_id146:processoTrfViewView"` — which is why the live run ledgered `invalidReference:invalidTokenShell` against a perfectly valid page. Result: genuine RED — `expected false to be true` — before the fix. See `apply-progress.md`.
- [x] 5f.3 GREEN match by id suffix (`[id$=":name"]` or a bare `id="name"`), never by the server-generated prefix, per `docs/RESEARCH.md` §1. Result: `idBlockPresent()` regex helper in `response-view.ts`; 2/2 new tests passing (also proves the invalid-token shell still classifies as neither block — 5f.6).
- [x] 5f.4 RED `parsing/detail-page.test.ts` against the captured fixture: the header fields come out with real values. They cannot today — `#numeroProcesso`, `#dataDistribuicao`, `#classeJudicial`, `#orgaoJulgador` and `#assuntoList` match nothing on the real page in any form, prefixed or bare. Result: genuine RED — all 4 rewritten test blocks (header, parties, movements, documents) failed for the right reason before the rewrite. See `apply-progress.md`.
- [x] 5f.5 GREEN rewrite header and party extraction to walk `.propertyView` label→value pairs, keyed on the visible Portuguese label (`Número Processo`, `Data da Distribuição`, `Classe Judicial`, …) exactly as the recon inventory recorded them. Only `processoEventoPanel` and `processoDocumentoGridTab` are real containers, and both need the suffix match from 5f.3. Result: full rewrite of `parsing/detail-page.ts` — `.propertyView`/bold-label field extraction, flat-string subject splitting, flat sibling-row party+lawyer extraction, single-cell movement splitting, dual-shape document extraction (legacy `idBin` only; the newer `documentoSemLoginHTML` shape is a disclosed follow-up, docs/RESEARCH.md §9.7). 4/4 tests green; full suite 218/218 after fixing 5 downstream tests that hardcoded the old invented fixture's values.
- [x] 5f.6 RED then GREEN: a fixture-driven test proving a genuinely invalid `ca` still classifies as `invalidTokenShell`, so 5f.3 does not turn the detector into one that accepts everything. Capture that response too — request a detail page with a corrupted token. Result: covered by `response-view.test.ts`'s second case plus the existing `validity-chain.test.ts` case (now against the real captured shell) — both green.
- [x] 5f.7 GREEN reconcile `docs/RESEARCH.md` with what was measured on 2026-09-05: the trigger is a `<script>` component and not a hidden input, the detail page is label-keyed and not id-keyed, ids carry a server-generated form prefix, and a zero-result footer reads "resultados encontrados" with no number. Result: new `docs/RESEARCH.md` §9 (ten dated sub-sections), covering all of the above plus the Assunto truncation, the flat-sibling-row party/lawyer shape, the dual document-delivery mechanisms, the `pdfs/` wiring gap, and the live subdivision reliability finding.
- [x] 5f.8 Live acceptance run, recorded in `apply-progress.md`: `pnpm scrape --from 2026-03-10 --to 2026-03-10 --max-facet-values 1 --max-items 2 --max-documents 1 --max-requests 12`. Passing means `output/items.jsonl` carries real payloads and a PDF lands under `pdfs/` — never "it exited 0". Both a working and a broken request return 200 `text/xml` on this host, so exit status proves nothing. Result: PASSED with real observed evidence — see `apply-progress.md`'s "S5f — Live Acceptance Evidence" table. Along the way, found and fixed a second real gap: `pdfs/` was reserved since S1 (`.gitignore`/README) but never wired — `main.ts` pointed `FsDocumentSink` at `output/documents/` instead. Fixed with a new `RunDeps.pdfsDir`, RED-first in `main.test.ts`.
- [x] 5f.9 Follow-up, decided before it is written: 2026-03-10 returns exactly 30 rows against a declared cap of 30, so the acceptance run is a saturated day and will exercise S5c's `split()` against real data for the first time. Record what it does; do not fix subdivision behavior inside this slice. Result: recorded, not fixed — `unit.saturated` fired correctly, but `split()` returned `null` (finished `truncated`, not `subdivided`); a read-only reproduction traced this to `classes.ts`'s unscoped, unvalidated `<li>` scan returning far fewer than the real ~132-entry catalogue under a real, already-aged run session. Full detail in `docs/RESEARCH.md` §9.9 and `apply-progress.md`.

**Known follow-ups this slice deliberately does NOT take** — each already disclosed, each its own decision:

- `DiscoverResult` has no partial-failure shape, so one bad row fails the whole cell. The live run hit exactly this: a single detail misclassification ledgered the entire unit as failed.
- Nothing in the adapter ever constructs `FetchOutcome.transient`, so the tested 429/backoff/cooldown policy is unreachable from real traffic. This must land before any unbounded live sweep.
- `toBrDate` has no dedicated unit test (S5d disclosure).
- **New in this slice**: the `documentoSemLoginHTML.seam?ca=...&idProcessoDoc=...` "born-digital" document shape is not fetched at all (docs/RESEARCH.md §9.7) — a process whose documents are entirely this newer shape yields zero fetchable documents, not an error.
- **New in this slice**: a CNPJ-identified party does not match the CPF-only party regex (docs/RESEARCH.md §9.5) — recorded with `role: 'UNKNOWN'`, `cpf: null`, never dropped.
- **New in this slice**: `classes.ts`'s judicial-class catalogue fetch has no content-based validity check and is unreliable against a real, already-aged session (docs/RESEARCH.md §9.9) — this is why saturation-driven subdivision did not fire on the live acceptance run.

## S5g: HTTP status classification — making the 429 mechanism reachable (~280 lines)

Demonstrates: the rate-limit safety mechanism this change has carried since S1 actually
fires. Today it cannot.

**Why this slice exists.** The full-change verify report found that no production code
anywhere constructs `FetchOutcome.transient`. The literal appears once, in
`engine/types.ts:12`, as a type declaration. Trace what that means:

| Link | State |
|---|---|
| `infra/http/axios-transport.ts` exposes `status` and every response header | present |
| Something maps `status === 429` to `transient` | **missing** |
| Something parses `Retry-After` into `retryAfterMs` | **missing** |
| `retry-policy.ts:27` routes `transient` + 429 to `requeue` | present, unreachable |
| `scraper.ts:362-366` handles `requeue` by calling `tripCooldown` | present, unreachable |

`tripCooldown` has exactly one call site, inside that unreachable branch. So the global
cooldown never closes, and `rateLimiter.acquire()` at `scraper.ts:346` — awaited before
every single request, correctly — waits on a gate nothing ever shuts. **The global rate
limiter is decorative in production.** A 429 today reaches `documents.ts:107` as a generic
`hostDefect`: the one worker that received it backs off locally while every other worker
keeps issuing requests at full rate. On the search and detail paths it is worse — neither
reads `status` at all, so a 429 body falls through the content validity chain as an
unrecognized response.

`retryAfterMs ?? config.backoff(attempt)` is implemented correctly in both places that need
it (`retry-policy.ts:28`, `scraper.ts:363-364`). The default-value behavior is not the
defect. The defect is that the value never arrives, so the fallback is the only branch that
could ever run.

**The failure shape, for the fourth time in this change — and this instance is the sharpest.**
`design.md` is not silent here. It specifies the work exactly: "404 (case 4) and 429/5xx/timeout
(case 6) are classified at the transport boundary before the chain runs" (§ validity chain),
`transient` 429 maps to `requeue` + `tripCooldown(Retry-After ?? backoff)`, and "`Retry-After`
always wins" (§ Retry mapping). The design was right and complete. **The task breakdown dropped
it.** The engine got tasks 1.8, 1.10, 1.11 and 2.2 for the consumer side; the producer side —
classify the HTTP status at the transport boundary — got no task at all. Nothing downstream
could notice: a spec requirement with no task is invisible to a test suite, and the coverage
map counted the requirement as covered because the *engine* half of it was. The same hole opened for `TRF5Site`, `parsing/result-fragment.ts` and
`infra/http/axios-transport.ts` (the S5d/S5e amendment) and for the detail-page selectors
(S5f). A green suite cannot report a requirement nobody assigned. Task 5g.7 is the first
attempt in this change to make that class of gap self-reporting rather than
discovered-by-accident.

**On fixtures, and an explicit exception to the S5f standing rule.** S5f adopted: no fixture
is written by hand; every one is a redacted cut of a captured live response. That rule
governs *response bodies* — markup the portal invents, which we may not guess. It does not
govern a `429` status line or a `Retry-After` header: those are RFC 9110 protocol facts, not
portal behavior, and `core-resilience-policy` explicitly REQUIRES every 429, backoff and
session-recovery scenario to be exercised against a stubbed `HttpTransport` and a fake clock,
never the live host. **Do not attempt to provoke a real 429 from the TRF5 portal.** Stub it.

- [x] 5g.1 RED `engine/http-status.test.ts`: a status classifier maps 429 to `transient` carrying its status; maps 502/503/504 to `transient`; returns `null` for 200 and 302 so content-based classification still owns every status the site actually uses for failure (`docs/RESEARCH.md` §5: this host answers 200 for most faults). 404 stays `permanentError:notFound` where `documents.ts` already places it — do not relocate that.
- [x] 5g.2 GREEN implement `engine/http-status.ts`. Placement is not an open decision: `design.md` already fixed it — "404 (case 4) and 429/5xx/timeout (case 6) are classified **at the transport boundary** before the chain runs." The engine owns that seam, since `HttpResponse` and `FetchOutcome` are both engine types and 429-means-slow-down is protocol truth rather than TRF5 truth, so a second portal must not re-derive it. Implement what the design already says; do not redesign it.
- [x] 5g.3 RED then GREEN `Retry-After` parsing: a delta-seconds value (`Retry-After: 5`) becomes `retryAfterMs: 5000`. An HTTP-date value, a negative value, a non-numeric value or an absent header all become `null`, so the existing `?? config.backoff(attempt)` default owns the wait. Supporting only delta-seconds is a deliberate, disclosed narrowing — an HTTP-date needs the injected `Clock` and no observed response has ever carried one. Record it as a follow-up, not as a silent omission.
- [x] 5g.4 RED `adapters/trf5` tests: each of the three classification paths — `site.ts` (search), `detail.ts` (detail), `documents.ts` (document fetch) — returns `transient` for a stubbed 429 **before** any content or validity-chain classification runs. All three fail today for three different reasons; the tests must show all three.
- [x] 5g.5 GREEN wire `classifyHttpStatus` as the first check in those three paths. Content-based classification remains the rule for every status this host actually returns; the status check is a narrow precedence, not a replacement.
- [x] 5g.6 RED then GREEN, and this is the test that would have caught the whole gap: drive `engine/scraper.ts` end to end over a stubbed transport where one unit's request answers 429, and assert the *global* cooldown tripped — a second worker's request is delayed and the failed unit returns to the queue. `rate-limiter.test.ts` already proves the `RateLimiter` class in isolation and passed throughout; this must prove the path from a real adapter response to `tripCooldown`, with `vi.useFakeTimers()`.
- [x] 5g.7 RED then GREEN `engine/outcome-construction-audit.test.ts`: fail when any `FetchOutcome` variant declared in `engine/types.ts` has zero construction sites in production code (excluding `*.test.ts` and `__fixtures__/`). This follows the guard precedent S5d established with `ports-implementation-audit.test.ts` and S5c with `ports-coverage-audit.test.ts`. It must genuinely RED against the pre-5g.5 tree; if it cannot be made to fail first, say so rather than asserting it passed.
- [x] 5g.8 Verify then correct the tasks.md bookkeeping defect the verify report raised as CRITICAL: 4.17 and 4.18 are unchecked while `adapters/trf5/documents.ts` exists with 14 passing tests in `documents.test.ts`. Read both tasks against the tests and mark them `[x]` **only** if the tests genuinely cover what each task specified; if any part is uncovered, leave the box unchecked and record precisely what is missing.
- [x] 5g.9 GREEN reconcile `docs/RESEARCH.md` and the `core-resilience-policy` spec notes: state that 429 has still never been observed from this host, that the mechanism is now reachable and stub-proven end to end, and that "Retry-After Precedence" is satisfied for delta-seconds only.

**Known follow-ups this slice deliberately does NOT take** — each its own decision:

- `Retry-After` in HTTP-date form is unparsed (5g.3).
- `DiscoverResult` still has no partial-failure shape, so one bad row fails the whole cell.
- Saturation subdivision did not fire on its first real saturated day (S5f task 5f.9).
- `toBrDate` still has no dedicated unit test.
- The `documentoSemLoginHTML` document shape is skipped; a CNPJ-identified party fails the CPF-only regex (both S5f disclosures).

## S5h: Document-grid pagination — reading the grid whole (577 authored `src/` lines actual — within budget, complete)

Demonstrates: every document a process actually has is seen, and any shortfall is reported
against the grid's own declared total instead of disappearing.

**Why this slice exists.** Reviewing a live-scraped process against the portal UI showed the
documents grid reporting `24 resultados encontrados` across two pages while the scraper
extracted 14 rows — all from page 1. `extractDocuments` (`parsing/detail-page.ts:273`) reads
the rows present in the rendered response and stops there.

**The root cause is a conclusion that outgrew its evidence.** `docs/RESEARCH.md` §3 is titled
"Pagination: there is none, and the cap cannot be escaped", and its table records: *searched
the **search response** for `datascroller`, `scroller`, `rows=` — no such component, zero
matches.* That finding is correct, and it is correct **only about the search response**. The
detail page is a different response and does contain `Richfaces.Datascroller` components —
two are sitting in the already-captured `detail-page-valid.html` right now (both parties
lists, `display: none` because each fits on one page). Nobody re-ran the search against the
detail page. A true finding was generalized past its scope, and every slice after it
inherited the generalization.

Design decisions D13 and D14 now cover this. **Implement them; do not redesign.**

**Evidence already in the repository, and its limit.** `detail-page-valid.html` declares its
grid totals inline: `1`, `2` and `7 resultados encontrados` for the two parties lists and the
movements grid, and `12 resultados encontrados` for the documents grid — against 8 documents
extracted. That gap of 4 is born-digital rows, not pagination, because 12 fits one page and
that fixture renders **no** scroller on the documents grid. So the existing fixture proves the
declared-total reconciliation but **cannot** prove pagination. A new capture is required, from
a process whose grid actually paginates.

**S5f's standing rule is in force**: no fixture is written by hand; every one is a redacted cut
of a captured live response whose header records when it was captured and what was redacted.
Do not hand-write a second page.

- [x] 5h.1 Capture and redact `detail-page-paginated-documents.html` from a process whose documents grid spans more than one page — `0800293-46.2016.4.05.8100` is a known-good subject (24 documents, 2 pages, one born-digital row on page 1). Capture the **page-2 a4j response** as its own fixture too; it is a separate response and the slice cannot be proven without it. Redact per the fixtures README checklist. Result: both fixtures captured live 2026-09-06 and redacted; see apply-progress.md for the exact capture/redaction method.
- [x] 5h.2 RED `parsing/detail-page.test.ts`: the parser reports the documents grid's declared total (`N resultados encontrados`) alongside the rows it extracted. Nothing reads that number today, which is why a shortfall has never been detectable.
- [x] 5h.3 GREEN extract the declared total. Read it from the grid's own footer, matched by the same id-suffix discipline S5f established — never by a server-generated prefix, never by document order on the page.
- [x] 5h.4 RED then GREEN: born-digital rows (`documentoSemLoginHTML.seam`, no `idBin=` anchor) are extracted with their identifiers and a distinct outcome rather than dropped (D14). Prove it against the captured page-1 fixture, where exactly one such row exists. Until this lands, a skipped row and an unseen row are indistinguishable, and 5h.6's reconciliation cannot mean anything.
- [x] 5h.5 RED `parsing/detail-page.test.ts`: the scroller's own submit contract is harvested from the page — form id, scroller id, and the submit shape recorded in D13 — never assembled from a guessed parameter name. **Correction found during this task**: the documents grid's real pager is a `rich:inputNumberSlider` (`Richfaces.Slider`), not the `Richfaces.Datascroller` the two parties-list scrollers in `detail-page-valid.html` use — D13's prose assumed every scroller shared that shape, an inference never re-verified against a paginated documents grid until this live capture corrected it. Harvested from the new fixture instead; see apply-progress.md and the corrected `docs/RESEARCH.md` §3.
- [x] 5h.6 GREEN fetch each further page through that harvested contract and merge its rows, in `detail.ts` where the transport already lives. `parsing/` stays pure: it parses a response, it does not fetch. Every page fetch is one request charged to the run budget, exactly like a detail fetch.
- [x] 5h.7 RED then GREEN reconciliation: after every page is read, the payload carries the declared total, the extracted count and the skipped-by-design count. When extracted + skipped does not equal declared, the shortfall is recorded as a reported gap — never silently tolerated and never inferred away. This is the same "measured, never certified" rule the coverage accounting already follows.
- [x] 5h.8 RED then GREEN: a grid with a single page issues **zero** extra requests. `detail-page-valid.html` (12 documents, no scroller) is the fixture; a slice that pays a request per process for pagination that is not there would be worse than the defect.
- [x] 5h.9 GREEN reconcile `docs/RESEARCH.md`: §3's title and conclusion are now scoped to the search response explicitly, and a new subsection records that the detail page's documents grid paginates through a `rich:inputNumberSlider` (corrected from the assumed `Richfaces.Datascroller`), with the evidence and the date measured. §3's search-response finding stands unchanged — it was never wrong.
- [x] 5h.10 Live acceptance run against `0800293-46.2016.4.05.8100`, recorded in `apply-progress.md`: passing means the payload's declared total is 24 and extracted + skipped reconciles to it. **Never a zero exit code** — both a working and a broken request return 200 on this host. Result: PASSED — see apply-progress.md for the full observed evidence.

**Known follow-ups this slice deliberately does NOT take:**

- The parties and movements grids paginate through the same component. This slice fixes only the documents grid; whether those lists ever exceed one page is unmeasured, and pretending otherwise would be another conclusion outrunning its evidence. Record what the captured totals show.
- Everything already disclosed in S5f, S5g and S5i's scope.

## S5j: Born-digital documents — the PDFs we were leaving behind (526 authored `src/` lines actual — within budget; 5j.1–5j.7 complete, 5j.8 blocked by a disclosed host-side defect)

Demonstrates: the documents this scraper has been declaring unfetchable are fetched.

**Why this slice exists, and the correction it rests on.** Four artifacts in this repository
asserted that a born-digital document has "no PDF at all": `docs/RESEARCH.md`,
`parsing/detail-page.ts`'s `extractDocuments` comment, the `detail-page-valid.html` fixture
header, and this change's own design decision D14. **All four were wrong**, and the evidence
that corrects them came from reading the viewer page in a browser, not from any test.

The viewer renders a `Gerar PDF` JSF command link:

```html
<a id="j_id42:downloadPDF" href="#" title="Imprimir" onclick="… jsfcljs(
  document.getElementById('j_id42'),
  {'j_id42:downloadPDF':'j_id42:downloadPDF',
   'ca':'0f62c432…',
   'idProcDocBin':'11492580'},'') …">Gerar PDF</a>
```

`jsfcljs` is JSF's client-side form-submit helper: it injects those parameters into form
`j_id42` and POSTs it. The response is a real PDF.

**The trap this slice exists to respect.** The PDF is keyed on `idProcDocBin`, and
`idProcDocBin` is **not** `idProcessoDoc`. One observed document carries
`idProcessoDoc=11688717` on its viewer link and `idProcDocBin=11492580` on its PDF button,
under an identical `ca`. Neither derives from the other, and `idProcDocBin` appears **nowhere**
on the detail page — verified: the captured `detail-page-valid.html` holds four born-digital
rows and zero occurrences of the string. So retrieval is necessarily two-step, and any
attempt to shortcut it by reusing `idProcessoDoc` is the "invent HOW the site works" failure
S5f exists to prevent. Design decision D14 now records this. **Implement it; do not redesign.**

**Scale.** In the one captured process, 4 of 12 documents are born-digital — a third of that
process's documents, silently absent from every run so far. `docs/RESEARCH.md` already warns
that a process whose documents are *entirely* born-digital yields zero fetchable documents;
`0008256-27.2005.4.05.8100` came back with zero and is an untested candidate for exactly that.

**S5f's standing rule is in force**: every fixture is a redacted cut of a captured live
response. The viewer page has never been captured.

- [x] 5j.1 Capture and redact `document-viewer-born-digital.html` — the `documentoSemLoginHTML.seam` viewer response — and the PDF response its `Gerar PDF` POST returns. Redact every `ca` token per the fixtures README checklist; keep document/bin ids verbatim per the S4b precedent already recorded in the fixture header. **Result**: the viewer response was captured and redacted as specified. A second response was also captured and committed as `document-viewer-gerar-pdf-host-defect.html` — a 302 to `errorUnexpected.seam` carrying a server-side `NullPointerException`. **Correction (2026-09-06)**: that capture was first recorded here as "the response the POST actually returns", which was wrong. It is the response the POST returns when the viewer GET omits `idProcessoDoc` — the harness bug described in apply-progress.md's "S5j" section, not the host's behaviour. The real success response is `200 application/pdf`. The fixture is kept and still earns its place: it is a genuine `errorUnexpected.seam` response and proves task 5j.5's failure branch.
- [x] 5j.2 RED `parsing/document-viewer.test.ts`: the `Gerar PDF` submit contract is harvested from the captured viewer — form id, the command-link parameter name, `ca`, and `idProcDocBin` — never assembled from a guessed parameter name and never by reusing `idProcessoDoc`.
- [x] 5j.3 GREEN implement the harvest. Match by id suffix, per the S5f rule: JSF renders server-generated prefixes, so `j_id42` is not a stable literal to hardcode.
- [x] 5j.4 RED then GREEN: a born-digital row's PDF is fetched through the two-step flow in `documents.ts`, returning the same `StoredDocument` shape the legacy `idBin` path returns, so `DocumentSink` and the failure ledger need no new case. Proven against `StubTransport` (a scripted successful PDF response, and a scripted 302-then-PDF response); `site.ts`'s S5h filter that kept born-digital rows out of the engine's fetch loop is dropped, since every document now has a real fetch path.
- [x] 5j.5 RED then GREEN: the response is verified to actually be a PDF by content (the literal `%PDF-` magic bytes), not by status or `Content-Type` alone — this host answers 200 for most failures (`docs/RESEARCH.md` §5), so a viewer page returned in place of a PDF classifies as `hostDefect`, never persisted as a document. Proven against both the captured PDF fixture (`document-sample.pdf`, reused per the existing legacy-path convention) and the captured real failure response (`document-viewer-gerar-pdf-host-defect.html`).
- [x] 5j.6 RED then GREEN: a born-digital document that cannot be fetched is ledgered without discarding the already-extracted item — the same rule S4b established for legacy documents, proven again on this path (a unit test asserts `fetchDocument` returns a `FetchOutcome` failure kind rather than throwing); the engine-level "item still written, failure still ledgered" guarantee itself is generic over `documentKind` and already proven in `engine/scraper.test.ts`, exactly as task 4.17's own disclosure records for the legacy path.
- [x] 5j.7 GREEN correct all four artifacts that assert "no PDF at all": `docs/RESEARCH.md` §9.7, `parsing/detail-page.ts`'s `DocumentRow`/`extractDocuments` comments, the `detail-page-valid.html` fixture header, and design.md D14 (found already corrected by a prior slice — 2026-09-05 — so no residue remained; verified, not assumed). Also reconciled the fixtures README's stale "None of these files is a raw capture" claim, already false since S5f/S5h. Recorded how the correction was found: reading the viewer page in a browser, not a test — the same discovery method D14's own prose already disclosed.
- [x] 5j.8 Live acceptance run recorded in `apply-progress.md`, against a process with born-digital rows: passing means a born-digital document lands under `pdfs/` with real PDF bytes and its payload entry reads `fetched`. **Never a zero exit code.** **Passing on the PDF-bytes criterion**: `pnpm scrape --from 2026-03-10 --to 2026-03-10 …` against the live host wrote all four born-digital documents of process `0005643-82.2001.4.05.8000` — `6884889.pdf` (3444 B), `6884888.pdf` (3435 B), `6884882.pdf` (7181 B), `6884879.pdf` (5908 B), every one `%PDF-1.4`/`%%EOF` — with zero failures. The earlier "host-side defect" blocker is **withdrawn**: its cause was an undecoded `&amp;` in the throwaway diagnostic script's viewer URL, which stripped `idProcessoDoc` from the Seam conversation; production was never affected. The `fetchStatus: 'fetched'` half of this criterion remains unsatisfiable here and is S5i's scope, exactly as "Issues Found" #1 disclosed. See apply-progress.md's "S5j" section for the root cause and the passing run.

**Known follow-up this slice deliberately does NOT take**: whether "born-digital" is the correct *explanation* for the two shapes is still unverified. What is measured is the markup shape and the response; the name is an inherited hypothesis. Do not deepen the inference — record the observable and move on.

## S5i: Payload fidelity and descriptive filenames (~300 lines)

Demonstrates: the payload states what actually happened, and a stored document is
identifiable without opening it.

**Why this slice exists.** Three defects found by reading a live payload field by field —
none visible to a green suite.

1. **`fetchStatus` is never written back.** All four scraped items report `fetchStatus: 'skipped'`, `byteLength: null`, `fileName: null` for every document — including the two demonstrably fetched and written to disk at 19441 and 19695 bytes. The item is persisted with its pre-fetch document state, so `items.jsonl` never records what was downloaded; that evidence exists only in the log and on the filesystem.
2. **`occurredAt` is hardcoded `null`** at `parsing/detail-page.ts:252`, for 15 of 15 movements, while `rawDate` beside it holds `"24/08/2026 17:54:56"`. Parsing is never attempted. `design.md` grants a deferral to `cnjCode` explicitly and grants none to `occurredAt`; the amended paragraph now says so.
3. **The slug is all-or-nothing.** `deriveSlug` folds accents, lowercases, dashes the whitespace, then tests the **whole** candidate against `/^[A-Za-z0-9._-]+$/`. One unsafe character discards the entire label. `6896062.pdf` lost its name because its label ends `2ª VARA/CE` — an ordinary label with a slash. The `trf5-adapter` spec requires degradation for a *hostile, empty or unrepresentable* label, not for that.

**And the shape worth naming, because it is the fifth instance in this change.** S5f's rule made
fixtures real. Defect 2 shows the other half: `detail-page.test.ts:84` asserts `occurredAt: null`
against a **real captured fixture**, with `rawDate: '14/05/2026 14:20:07'` on the next line of the
same `toEqual`. A captured fixture does not make an assertion honest. An assertion that restates
what the implementation happens to produce proves nothing, whatever the fixture is cut from.

- [ ] 5i.1 RED `engine/scraper.test.ts`: after a document fetch succeeds, the persisted item's matching document entry carries `fetchStatus: 'fetched'`, its real `byteLength` and its stored `fileName`; after a failure it carries `failed`; a document never attempted stays `skipped`. All three are indistinguishable today.
- [ ] 5i.2 GREEN write the outcome back before the item reaches the `ItemSink`. Keep the ordering rule S4b established: a document failure must never discard the already-extracted item.
- [ ] 5i.3 RED `parsing/detail-page.test.ts`: `occurredAt` carries the parsed timestamp for a movement whose `rawDate` is present, and stays `null` only when `rawDate` itself is absent or unparseable. **Rewrite the existing assertions that encode the hardcoded null** — they are the defect's second half, not a passing test to preserve.
- [ ] 5i.4 GREEN parse `dd/MM/yyyy HH:mm:ss` into `occurredAt`. Decide and record the timezone handling explicitly rather than defaulting to the runner's local zone, which would make the field non-deterministic across machines. `cnjCode` stays `null` — that deferral is real and design-sanctioned; do not close it here.
- [ ] 5i.5 RED `adapters/trf5/documents.test.ts`: a label containing `/` keeps a descriptive slug instead of collapsing to a bare id; `../../etc/passwd` still degrades to `<processNumber>/<idProcessoDocumento>.pdf`; three same-labeled documents still get three distinct paths. The existing hostile-label and collision tests must keep passing untouched — if either breaks, the sanitizer is wrong, not the test.
- [ ] 5i.6 GREEN sanitize per character rather than rejecting the whole candidate: replace every character outside `[A-Za-z0-9._-]` after accent folding, collapse repeats, and degrade to `<idProcessoDocumento>.pdf` only when the result is empty. Uniqueness stays keyed on `processNumber` + `idProcessoDocumento` alone — the slug never participates, per the `trf5-adapter` spec and the amended `design.md`.
- [ ] 5i.7 GREEN use the data already extracted to make the name useful: the label carries a timestamp and a type (`13/05/2025 07:29:53 - Despacho Inspeção - 2068 - INSPEÇÃO ORDINÁRIA 2025 - 2ª VARA/CE`). A date-ordered, type-bearing name is the goal; the id stays in the filename so uniqueness is structural, not hoped for.
- [ ] 5i.8 RED then GREEN, and this is the systemic task: an audit test that fails when a field declared in the payload schema is written as a constant `null` at every production construction site. This is the assertion-side sibling of S5g's `outcome-construction-audit`, and it must genuinely RED against the pre-5i.4 tree. `cnjCode` is a legitimate, design-sanctioned exception and must be exempted **by name, with its design citation**, not by loosening the rule.
- [ ] 5i.9 Live acceptance run recorded in `apply-progress.md`: a fetched document's payload entry shows `fetched` with a real `byteLength`, a movement carries a parsed `occurredAt`, and a document whose label contains `/` lands with a descriptive filename. Never a zero exit code.

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
