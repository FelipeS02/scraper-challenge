# Proposal: Partial-Row Tolerance in `discover()`

## Intent

`TRF5Site.discover()` returns the first non-`ok` detail outcome for the whole row set
(`src/adapters/trf5/site.ts:175`). Individual TRF5 processes have permanently broken detail
pages (`errorUnexpected.seam` + host-side `PersistenceException`), and at least one sits in the
unfaceted 30-row set of **every** date sampled (09-01 … 09-04). One broken record therefore
discards 29 good ones and **no full day-level sweep completes today** — this blocks the
pre-existing date × class sweep, not only the name-substring axis.

The cause is per-record, not client-side: a brand-new session fetched the known-failing process
as its first-ever detail request and reproduced the identical 302 (`docs/RESEARCH.md` §3,
"Bounded live acceptance attempt (2026-09-06)"; Engram #320). That question is closed.

The fix is the project's own ethic: report the broken record accurately and keep going.

## Scope

### In Scope

| # | Deliverable |
|---|---|
| 1 | `DiscoverResult` gains an adapter-declared list of unresolved rows (identity + reason); `FetchOutcome` stays binary |
| 2 | TRF5 row loop: a per-row `hostDefect`/`permanentError` is retried within the existing budget, then recorded unresolved and **skipped**, not aborted |
| 3 | Engine records one discovery-stage `LedgerEntry` per unresolved row, `itemId` carrying the real process number instead of `unitKey` |
| 4 | `CheckpointRecord` + `CoverageRecord` gain `unresolvedItemCount: number`, orthogonal to the existing `state` enum |
| 5 | `RunSummary` + CLI summary gain a **separate tally line** for unresolved records |
| 6 | `FrontierRunConfig` gains a `FailureLedger`; `runFrontierCrawl` reports unresolved rows exactly like the sweep |
| 7 | The existing silent skip of a failed seed search (`frontier.ts:151-152`) becomes a recorded ledger entry — **in scope**, since wiring a ledger and still dropping failures silently would leave the same debt in place |

### Out of Scope

- **A `partial` kind on `FetchOutcome`.** `frontier.ts:151`'s `if (result.kind !== 'ok') continue`
  would silently discard both the resolved items and the gap report — the exact failure mode
  this change exists to eliminate. A new variant inherits every `!== 'ok'` test already written.
- **A fifth `state` value.** Saturation and per-row resolution are orthogonal; one enum slot
  cannot hold both. Follows the `WorkUnit.dimensions?` precedent.
- **Changing the retry budget.** `hostDefectCap: 2` is kept deliberately: the cost is ~2 extra
  requests per unit, and it preserves coverage if some `hostDefect` responses are intermittent.
- **Per-row `sessionExpired`/`transient` tolerance.** These plausibly affect every remaining row
  and keep aborting the whole `discover()` call exactly as today.
- Fixing the TRF5 site, retrying broken records indefinitely, or working around the host defect.
- Any `FailureLedger` schema change, or making unresolved rows `retry-failed`-eligible.

## Capabilities

### Modified Capabilities

- `core-scraping-engine`: `discover()` may return successfully with unresolved rows; the engine
  records each one to the failure ledger and threads the count into checkpoint/coverage;
  frontier crawl gains the same reporting duty.
- `core-coverage-accounting`: a coverage/checkpoint cell carries `unresolvedItemCount` alongside
  `state`; the run summary reports unresolved records as its own tally.
- `trf5-adapter`: **supersedes the undocumented "one row fails all" rule** that today lives only
  as a code comment at `site.ts:171-174` and in no spec. The spec delta MUST state that rule
  before replacing it.

### New Capabilities

- None.

## Approach

**Partial success travels as data, not as an outcome kind.** `discover()` still returns
`kind: 'ok'`; the per-row failures ride inside `DiscoverResult`. Zero touch to the exhaustive
`FetchOutcome` union, so `retry-policy.ts`, `describeOutcome()` and every fake adapter stay
untouched. Cost accepted and documented: `items.length` may now be less than `count`.

**Saturation and `split()` stay keyed on the adapter-declared `count`** (`scraper.ts:507`),
never `items.length`. A partially resolved cell saturates and splits exactly as today. This is a
hard constraint: switching it would silently change partition behaviour.

**Bounded per-row retry, then continue.** Today the engine's `runWithRetry` retries the *whole*
`discover()` call twice and still yields zero items. The row loop is restructured so the same
budget is spent on the failing row alone; exhaustion marks it unresolved and continues.

**Portable vs. TRF5-specific.** Portable: the `DiscoverResult` field, ledger recording, the
coverage/checkpoint field, the summary tally, the frontier ledger. TRF5-specific: which per-row
outcomes are tolerable, and the row loop that produces the unresolved list. The engine never
learns a TRF5 concept — it counts and forwards an adapter-declared list, exactly as
`isDeeperPartition()` (`coverage.ts:103-111`) stays adapter-agnostic.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/engine/ports.ts` | Modified | `DiscoverResult.unresolved`; `unresolvedItemCount` on checkpoint + coverage; `LedgerEntry.itemId` doc |
| `src/adapters/trf5/site.ts:164-185` | Modified | Skip-and-record row loop with bounded per-row retry |
| `src/engine/scraper.ts:243-260,398-410,487-517` | Modified | Per-row ledger recording; thread the count into checkpoint/coverage |
| `src/engine/coverage.ts:34-69` | Modified | `RunSummary` unresolved tally |
| `src/cli/summary.ts:10-18` | Modified | New separate summary line |
| `src/engine/frontier.ts:87-103,151-152` | Modified | `FailureLedger` in config; record unresolved rows and failed seed searches |
| `src/main.ts` | Modified | Wire the existing ledger into `FrontierRunConfig` |
| Specs | New | Deltas for the three capabilities above (mandatory — `ports-coverage-audit.test.ts` forces every exported port symbol to trace to a requirement) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Size exceeds the 800-line review budget** | **High** | See below — flagged for an explicit split-or-exception decision before tasks |
| A reader assumes `items.length === count` | Med | The count is reported in coverage, checkpoint and the CLI summary; doc comments on both fields |
| Tolerating a row masks a systemic failure (e.g. every row unresolved) | Med | Unresolved is a visible tally, never folded into `complete`; each row is a ledger entry |
| Checkpoint/coverage format change breaks resume | Low | Additive optional field; an older reader sees it absent, a newer reader treats absent as `0` |
| Per-row retry raises per-unit request cost | Low | ~2 extra requests per unit; `Budget` and the global rate limiter still bound the run |

## Size Estimate — flagged

Honest estimate after the frontier-parity decision: **~145 lines production, ~250–350 tests
(strict TDD), ~200–300 spec deltas → roughly 600–800 authored lines**, before `design.md` and
`tasks.md`. The attempt ledger counts OpenSpec artifacts too, so the realistic total is at or
above the 800-line budget.

**Recommended split seam if the budget holds:** Slice 1 = deliverables 1–5 (sweep path,
autonomous and shippable on its own — it unblocks the day sweep). Slice 2 = deliverables 6–7
(frontier reporting parity), independently verifiable and independently revertible.

## Rollback Plan

- Reverting restores today's abort-on-first-bad-row behaviour; no earlier behaviour regresses.
- **Partitioning/state-format note (config.yaml rule):** the change adds one optional field to
  `CheckpointRecord` and `CoverageRecord` and one optional field to `DiscoverResult`. All are
  append-only and carry `schemaVersion`; a checkpoint written after this change is still
  readable by the pre-change reader, which ignores the extra field. Rolling back does not
  corrupt existing checkpoints — resume continues from the recorded cells.
- No behavioural kill switch is proposed: a zero-tolerance flag would reintroduce the exact
  blocker this change removes.

## Success Criteria

- [ ] A 30-row set containing one permanently broken detail page yields 29 items and a
      `discover()` result that is `ok` with exactly one unresolved row.
- [ ] The unresolved row produces one ledger entry whose `itemId` is its process number and
      whose `documentId` is `null`.
- [ ] A per-row `sessionExpired` or `transient` still aborts the whole `discover()` call.
- [ ] A per-row `hostDefect` is retried within the existing `hostDefectCap` before being marked
      unresolved; exhaustion never aborts the call.
- [ ] Coverage and checkpoint records for that cell carry `unresolvedItemCount: 1`, and `state`
      keeps exactly today's meaning.
- [ ] Saturation and `split()` behaviour is unchanged for a partially resolved saturated cell.
- [ ] The CLI run summary prints unresolved records on its own line, never as an annotation on
      `complete`.
- [ ] `runFrontierCrawl` records unresolved rows and failed seed searches to the failure ledger.
- [ ] `ports-coverage-audit.test.ts` passes: every new exported port symbol traces to a
      requirement in one of the three spec deltas.

## Dependencies

- Builds on `scraper-core` (engine loop, coverage accounting, failure ledger) and the shipped
  `hostDefectRedirectSchema` classification fix that makes the failure honest as `hostDefect`.
- No new runtime dependencies.
