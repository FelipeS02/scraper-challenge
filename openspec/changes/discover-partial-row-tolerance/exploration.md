# Exploration: discover-partial-row-tolerance

Investigation only. No production code, no proposal/spec/design/tasks yet.

## Why this change exists

Root cause established live on 2026-09-06 (see `docs/RESEARCH.md` §3, "Bounded live
acceptance attempt (2026-09-06)", and Engram observation 320). Individual TRF5 processes have
permanently broken detail pages returning `errorUnexpected.seam` (as a 200, or as a 302 to it)
with a host-side `PersistenceException`. At least one such record sits in the unfaceted 30-row
result set of every date sampled (2026-09-01, 09-02, 09-03, 09-04).

`TRF5Site.discover()` aborts the entire row set on the first non-`ok` detail outcome, so one
broken record discards 29 good ones and **no full day-level sweep completes today** — this
blocks the pre-existing date × class sweep, not only the newly added name-substring axis.

The cause is per-record, not client-side session state: a brand-new session with zero prior
requests fetched the known-failing process as its first-ever detail request and reproduced the
identical 302. The client-side Seam-conversation hypothesis was tested and falsified. That
question is closed and is not reopened here.

## Current behaviour (verified against the code, 2026-09-06)

| Fact | Location |
|---|---|
| `discover()` port contract returns `Promise<FetchOutcome<DiscoverResult<TItem, TDoc>>>` | `src/engine/ports.ts:80` |
| `FetchOutcome` union: `ok`, `transient`, `sessionExpired`, `hostDefect`, `permanentError` | `src/engine/types.ts:7-23` |
| Row loop aborts the whole call on the first bad row: `if (detailOutcome.kind !== 'ok') return detailOutcome;` | `src/adapters/trf5/site.ts:175` |
| A comment at that line defends never silently dropping a row (design D12) | `src/adapters/trf5/site.ts:171-174` |
| Rows already carry `processNumber` from the search HTML, before any detail fetch | `src/adapters/trf5/parsing/result-fragment.ts:12-13,76-97` |
| Saturation is keyed on the adapter-declared `count`, never `items.length` | `src/engine/scraper.ts:507` (`cap !== null && result.count >= cap`) |
| Permanent vs. transient is already distinguished per outcome kind | `src/engine/retry-policy.ts:17-40` |
| Frontier skips a failed seed search outright: `if (result.kind !== 'ok') continue;` | `src/engine/frontier.ts:151-152` |
| `FrontierRunConfig` has no `FailureLedger` wired in at all | `src/engine/frontier.ts` |
| Coverage/checkpoint `state` enum: `complete \| truncated \| failed \| subdivided` | `src/engine/ports.ts:145,193` |
| Every exported port symbol must trace to a spec requirement | `src/engine/__fixtures__/ports-coverage-audit.test.ts` |

The existing "one row fails all" rule lives **only** as a code comment in `site.ts`. It appears
in no spec. Any change to it therefore needs a spec delta that first states the rule it
replaces.

## The design question

`FetchOutcome` is binary at the call level: partial success has no representation in the port
contract. Two axes need deciding.

### Q1 — where does partial success live?

**Option A (recommended): `DiscoverResult` gains an adapter-declared `unresolved` list;
`FetchOutcome` stays binary.**

- Discovery still "succeeds"; the per-row failures travel as reported data.
- Zero touch to the exhaustive `FetchOutcome` union, so `retry-policy.ts`, `describeOutcome()`
  and every fake adapter and test stay untouched.
- Matches the actual shape of the problem: `discover()` already aggregates N sub-fetches.
- Cost: `items.length` can now be less than `count`, and every future reader must know it.

**Option B (rejected): `FetchOutcome` gains a `partial` kind.**

- Compiler-enforced exhaustiveness is the one real advantage.
- `frontier.ts:151`'s `if (result.kind !== 'ok') continue` would silently discard a partial
  result's resolved items *and* its gap report — precisely the disqualified failure mode.
- Category mismatch: `FetchOutcome` is documented as the outcome of a single fetch attempt,
  not of an aggregate.
- Touches `retry-policy.ts`, `describeOutcome()`, `http-status.ts`.

### Q2 — what coverage state does a cell get when 29 of 30 rows resolved?

**Option 1 (rejected): a fifth `state` value, `partial`.** Saturation state and per-row
resolution are orthogonal facts. A cell that is both saturated and partial cannot be
`subdivided` and `partial` in one enum slot without losing one of them.

**Option 2 (recommended): a new `unresolvedItemCount: number` alongside the existing `state`.**
Orthogonal and additive; `state` keeps exactly today's meaning. This follows the precedent set
by `WorkUnit.dimensions?` in `trf5-name-substring-axis`: a new orthogonal fact is added as a
new optional field, never as a new value in an existing exhaustive union.

### Q3 — how do per-row failures reach the failure ledger?

No ledger schema change is required. Discovery-stage failures are already identified by
`documentId === null` and are already excluded from `retry-failed` eligibility. The one
improvement available for free: the entry's `itemId` can carry the real process number instead
of falling back to `unitKey`, because TRF5 knows the process number before the detail fetch.

### Q4 — interaction with saturation and the partition cascade

No change needed, and this is the trap worth naming explicitly. Saturation reads the
adapter-declared `count` (`scraper.ts:507`), never `items.length`. Under Option A that stays
true, so a partially resolved cell saturates and splits exactly as it does today. Any design
that switched saturation to `items.length` would silently change partition behaviour.

### Q5 — blast radius

- `src/adapters/trf5/site.ts:164-183` — route per-row `hostDefect`/`permanentError` to
  skip-and-record; keep `sessionExpired`/`transient` aborting the whole call, since those
  plausibly affect every remaining row.
- `src/engine/ports.ts` — `DiscoverResult`, `CheckpointRecord`, `CoverageRecord`,
  `LedgerEntry.itemId` doc comment.
- `src/engine/scraper.ts:243-260,401-410,487-517` — per-row ledger recording and
  checkpoint/coverage threading.
- `src/engine/coverage.ts:34-69` — `RunSummary` and `summarizeRunCoverage` tally.
- `src/cli/summary.ts:10-17` — a new visible summary line.
- `src/engine/frontier.ts:151-152,170-171` — no forced code change, but a real reporting-parity
  gap, since `FrontierRunConfig` carries no ledger.
- Tests: `scraper.test.ts`, `site.test.ts`, `coverage.test.ts`, `frontier.test.ts`, a likely new
  generic fake-adapter fixture, and `__fixtures__/ports-coverage-audit.test.ts`.
- Specs: deltas required for `core-scraping-engine`, `core-coverage-accounting` and
  `trf5-adapter`.

## Recommendation

Option A + Option 2. The adapter reports per-row `hostDefect`/`permanentError` failures inside a
still-`ok` `DiscoverResult`; `sessionExpired`/`transient` per-row outcomes keep aborting the
whole call exactly as today. Saturation and split stay keyed on `count`.

## Size estimate

Roughly 95 lines of production code, 150–250 lines of tests and 150–250 lines of spec deltas:
about 400–700 lines total. Inside the cached 800-line review budget, but close enough that
`sdd-tasks` must still run its own explicit forecast.

## Open product decisions

These need a human answer before `sdd-propose`:

1. The reporting shape for `unresolvedItemCount` in `summarizeRunCoverage` and the CLI summary:
   a separate tally, or an annotation on `complete`.
2. Whether a per-row `hostDefect`/`permanentError` gets zero retries, or keeps some bounded
   retry before being marked unresolved. Zero retries is a deliberate change from today's
   whole-call `hostDefectCap` behaviour.
3. Whether `runFrontierCrawl` gets ledger parity, log-only reporting, or explicitly no
   reporting for a per-row unresolved failure.

## Constraints carried into the next phase

- The engine must never learn a TRF5 concept. `isDeeperPartition()` in `coverage.ts:103-111` is
  the reference for how an engine-side check stays adapter-agnostic.
- A gap is reported, never silently dropped. Any option that loses the record of what could not
  be fetched is disqualified.
- The scraper's job is to report the broken record accurately and keep going — not to retry it
  indefinitely or work around the host defect.
