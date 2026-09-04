# Proposal: TRF5 PJe Scraper Core

## Intent

Deliver the challenge scraper: a TypeScript, HTTP-only collector for the TRF5 PJe public
consultation portal (no browser automation). `src/` does not exist yet; `docs/RESEARCH.md`
is the verified factual base and this change turns it into running code.

The dataset is not the deliverable — the brief states twice that the requester already holds
this data. What is evaluated is capability: functionality, 429 handling, clean code,
robustness, documentation. The proposal therefore optimises for a *demonstrable, bounded,
honest* scraper, not for maximum harvest.

## Scope

### In Scope

| # | Deliverable |
|---|---|
| 1 | `src/engine/` — protocol-level, payload-generic orchestration loop; ports only |
| 2 | `src/adapters/trf5/` — session priming, 2D traversal, detail, documents, parsing, zod |
| 3 | Phase 1 coarse sweep: date window × judicial class (132 classes fetched per run, never hardcoded) |
| 4 | Phase 2 frontier crawl seeded from OAB numbers + exact names harvested in phase 1 |
| 5 | Retry/backoff as composable functions; global 429 cooldown; failure ledger |
| 6 | Coverage ledger (`complete` / `truncated` / `failed` per cell) + run summary |
| 7 | JSONL output (`processes.jsonl`, `coverage.jsonl`), append-only, `schema_version` |
| 8 | CLI bounds on every axis + `--dry-run` forecast; resumable checkpoints |
| 9 | vitest (task #1 — Strict TDD cannot run RED without it), ESLint seam rule, README |

### Out of Scope

- **A second site adapter.** One adapter exercises every port; a second is speculative.
- **A generic multi-axis partitioner in the engine.** Date bisection is *this site's* shape.
- **Redis / BullMQ / any external queue.** Infrastructure is a liability at this size.
- **DataJud as a completeness oracle** — tested and rejected (RESEARCH.md §4).
- **JSON array output**, mutation of written records, any upload path.
- Live-site 429 reproduction; automatic staleness detection; `reportPDF.seam`.

## Capabilities

### New Capabilities
- `scraping-engine`: port contracts, work-unit loop, two-stage discover→fetch, checkpoint store, failure ledger
- `resilience-policy`: retry taxonomy, composable backoff, `Retry-After` precedence, global cooldown
- `trf5-adapter`: JSF session lifecycle, 2D traversal, detail/document fetch, ISO-8859-1, zod validity chain
- `frontier-crawl`: seeded phase-2 traversal, truncated-cell priority, yield-decay stop, request budget
- `coverage-accounting`: cell states, run-summary arithmetic, idempotence/dedup/partition invariants
- `run-control-and-output`: CLI bounds, dry-run forecast, JSONL contract, personal-data rules

### Modified Capabilities
- None (greenfield).

## Approach

**Engine is generic over the payload, not over a domain.** There is no shared `domain/`
folder: a domain is *this* business. The engine owns a protocol — `FetchOutcome<T>`,
`WorkUnit<TCursor>`, `LedgerEntry`, `CoverageGap` — and ports (`SitePort<TItem,TDoc>`,
`TraversalPort<TCursor>`, `HttpTransport`, `CheckpointStore`, `FailureLedger`,
`ItemSink<TItem>`, `AdapterStateStore`, `Clock`). `CheckpointStore` persists an opaque
`unitKey: string` plus a JSON cursor, so it checkpoints work it cannot interpret.
`DateWindow` lives in the adapter.

**Portable vs. TRF5-specific** (config.yaml proposal rule): portable = the loop, retry
taxonomy, rate limiting, checkpointing, ledger, outcome discriminant. TRF5-specific =
ViewState/`jsessionid` lifecycle, the complete-form-field requirement, the `ca` token,
`dataAutuacao` construction, judicial-class enumeration, every cheerio selector and zod
schema, ISO-8859-1 decoding.

**The seam is enforced, not documented.** ESLint `no-restricted-imports` scoped to
`engine/**` forbids `**/adapters/**`, `axios`, `cheerio`. Acceptance test for the
abstraction: `engine/` unit tests pass against a ~20-line fake adapter with
`adapters/trf5/` uninvolved.

**Validity is judged by content, never by status code** (RESEARCH.md §5). An ordered
`.safeParse()` chain — session-expired → host defect → invalid-token shell → valid data —
first match wins, mapping the error catalogue almost 1:1.

**A 429 is a signal about the connection, not the task.** It trips a *global* rate-limiter
cooldown (all workers pause) rather than delaying one task while others keep hammering; the
limit is assumed per-IP. The failed unit returns to the queue. In-process bounded worker
pool, concurrency 2–3.

**Backoff composes**: `fixed`/`linear`/`exponential` decorated by `withJitter(ratio)` and
`withCap(maxMs)`. Two things are deliberately **not** configurable: a server-sent
`Retry-After` always wins (correctness, not policy), and `withCap` is mandatory (uncapped
exponential sleeps for hours by attempt 12). `sessionExpired` re-primes and retries
*immediately* — no backoff. Defaults: base 1 s, factor 2, jitter 0.3, cap 60 s, 5 attempts,
~500 ms politeness delay.

**Coverage is measured, never certified.** Every `(day, class)` cell records state plus an
observation timestamp; the run summary is arithmetic over that ledger. Three verification
mechanisms: idempotence re-check by set hash, dedup by process number, and the partition
invariant (per-class counts for a day ≥ the unfiltered count).

**Phase 2 is targeted, not brute force.** Seeds from `truncated` cells are prioritised —
that is precisely where data is known to be hidden, and seeds from `complete` cells cannot
yield anything new. OAB numbers beat names (unique, ASCII, no homonyms, no encoding hazard).
Stop on yield decay; a request budget is the hard ceiling. Its bias is unmeasurable and
self-reinforcing: coverage grows without the *unknown* portion shrinking measurably.

**Output is warehouse-oriented JSONL**, one object per line — a killed run leaves every
written line valid, appending is trivial, every major warehouse ingests it natively.
Mandatory fields: `schema_version`, `numero_processo` (primary key; enables downstream
upsert and resolves cross-phase duplicates), `scraped_at`, `source_url`, `run_id`. CNJ codes
*and* labels are both kept.

**Tooling deviation from the brief**: pnpm + tsx instead of npm + ts-node (native ESM/TS
execution without ts-node friction under NodeNext). The README must state this explicitly so
an evaluator is not surprised.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/engine/` | New | `types.ts`, `ports.ts`, `scraper.ts`, `retry-policy.ts`, `backoff.ts`, `rate-limiter.ts` |
| `src/adapters/trf5/` | New | `domain/`, `session.ts`, `search.ts`, `detail.ts`, `documents.ts`, `traversal.ts`, `parsing/` |
| `src/http/`, `src/storage/`, `src/logging/` | New | axios transport + cookie jar, JSONL sinks + checkpoint store, structured logs |
| `src/main.ts` | New | Composition root: CLI parsing, wiring, run summary |
| `package.json`, `eslint.config.js` | Modified/New | vitest + eslint dev deps, `no-restricted-imports` seam rule, scripts |
| `README.md` | New | Setup, pnpm/tsx rationale, CLI bounds, coverage-honesty statement, PII rules |
| `openspec/config.yaml` | Modified | `src/` layout line still names `pje/, partition/, domain/` — update to the engine/adapters split |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Phase 2 (frontier) pushes the change past the 800-line review budget | **High** | Slice it out — see below. It is the only self-contained deliverable |
| `TraversalPort` is the weakest seam; may read as overclaimed generality | Med | Name the limitation in README and design; the ESLint rule + fake-adapter test bound what is actually claimed |
| Date-bisection off-by-one double-counts or skips a day | Med | Explicit boundary contract test; dedup by `numero_processo` is the safety net |
| Live data moves between observations (proven: hash changed in minutes) | **High** | Every cell and record carries an observation timestamp; "complete" means "as observed then" |
| Case-5 host defects make some processes permanently unreachable | **High** | Bounded retries, then ledger + continue — never burn the rate budget on them |
| Personal data (CPF/OAB) leaks into the public repo | Low/**Severe** | `.gitignore` covers `output/ data/ pdfs/ logs/`; no fixture carries a real CPF/name/document; no upload path |
| Session/ViewState drift breaks every request | Med | Never hardcode `j_id*`; harvest per run; case-3 detection re-primes and replays |

## Slicing Plan (if the tasks forecast exceeds 800 lines)

Ship as chained PRs in this order; each is independently deliverable and verifiable:

1. **Core** — vitest, engine ports/types, backoff + retry + rate limiter, fake-adapter tests, ESLint seam rule.
2. **Phase 1** — TRF5 adapter, 2D traversal, JSONL output, coverage ledger, CLI bounds, README.
3. **Phase 2** — frontier crawl, seed harvesting, yield-decay stop.

Slices 1+2 alone satisfy every stated evaluation criterion. Slice 3 is additive coverage.

## Rollback Plan

- Greenfield: `git revert` of the change removes `src/` entirely; nothing pre-existing regresses.
- **Session/state and partitioning** (config.yaml rule): checkpoint and coverage files are
  append-only JSONL carrying `schema_version`. Rolling back code does not corrupt them —
  delete `output/` and re-run to rebuild from scratch, or keep them and resume, since every
  record is independently valid.
- Phase 2 is behind a CLI flag (off by default), so it can be disabled without a code revert.

## Dependencies

- `vitest` + `@vitest/coverage-v8` — **not installed**; first task, blocks the Strict TDD RED step.
- `eslint` + config — required for the enforced engine/adapter seam.
- Installed already: axios, axios-cookiejar-support, tough-cookie, cheerio, zod 4.5.4.
- Live TRF5 host availability for manual smoke runs only; all tests use a stubbed
  `HttpTransport` and a fake `Clock`.

## Success Criteria

- [ ] **Functionality**: a bounded run collects processes and PDFs end to end and writes valid JSONL.
- [ ] **429 handling**: stubbed-transport tests prove global cooldown, `Retry-After` precedence, capped exponential backoff with jitter, and requeue — never tested live.
- [ ] **Robustness**: all six RESEARCH.md §5 error cases have a test; a PDF failure never blocks metadata extraction.
- [ ] **Clean code**: `engine/` tests pass against a fake adapter with `adapters/trf5/` uninvolved; the ESLint seam rule fails the build on violation.
- [ ] **Documentation**: README states the pnpm/tsx deviation, every CLI bound, the personal-data rules, and that coverage is measured — never certified.
- [ ] `--dry-run` forecasts request count and duration without issuing a search.
- [ ] A killed run resumes without re-running completed cells; a failed PDF retries without re-running its search POST.

## Resolved Decisions

Four open questions were put to the user and answered. These are binding on `sdd-spec`
and `sdd-design`.

1. **`--max-requests` carries a default ceiling.** An unbounded run must require a
   deliberate override, never an omission. Hammering a court server all night because of a
   partitioning bug is the failure mode this forecloses.

2. **Phase 2 is off by default, and its purpose is verification.** The user reframed it:
   the frontier crawl is not primarily a way to accumulate more data, it is a **second pass
   run deliberately after phase 1 has collected partial data**, to confirm and enrich what
   the coarse sweep found. This makes the two phases separately invocable rather than a
   single continuous run:
   - `scrape` runs phase 1 and persists harvested seeds via `AdapterStateStore`.
   - `scrape --frontier` (or an equivalent subcommand) runs phase 2 later, consuming those
     persisted seeds, prioritising the ones harvested from `truncated` cells.

   Seeds must therefore survive process exit — the seed store is durable state, not
   in-memory state, and phase 2 must be runnable against a store written by an earlier run.

3. **PDFs are fetched for a bounded subset**, governed by `--max-pdfs` and
   `--pdfs-per-process`. The brief states explicitly that downloading everything is not
   required — only demonstrating that the scraper could.

4. **`openspec/config.yaml` is updated inside this change.** Its `src/` layout section still
   names the pre-design folders (`pje/`, `partition/`, `domain/`) and must be corrected to
   the `engine/` + `adapters/trf5/` structure, since later phases read it as project context.
