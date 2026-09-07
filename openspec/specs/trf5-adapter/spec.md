# TRF5 Adapter Specification (delta)

Delta against the `trf5-adapter` capability defined in the `scraper-core` change.
Supersedes the undocumented "one row fails all" rule — until now stated only as a code
comment at `src/adapters/trf5/site.ts:171-174` and present in no spec — with bounded
per-row tolerance for the two per-row outcomes that do not plausibly affect the rest of
the row set.

## ADDED Requirements

### Requirement: Bounded Per-Row Tolerance Supersedes Whole-Row-Set Abort
Previously, the adapter's row loop treated any non-`ok` per-row detail-fetch outcome as
fatal to the entire `discover()` call, discarding every already-resolved row alongside the
one that failed; this rule existed only as a code comment, never as a spec requirement.
The adapter MUST replace that behavior with a per-outcome split. A per-row `hostDefect` or
`permanentError` MUST be retried, up to the same configured retry limit already governing
`hostDefect` retries elsewhere in the engine; if every attempt still fails, the row MUST be
recorded as unresolved (identity plus reason) and the loop MUST continue to the next row.
A per-row `sessionExpired` or `transient` outcome MUST still abort the whole `discover()`
call immediately, exactly as before this change, because either condition plausibly
affects every remaining row in the same session or connection.

#### Scenario: Permanently broken detail page is skipped, not fatal
- GIVEN a 30-row search result whose one row has a permanently broken detail page that
  still returns `hostDefect` after exhausting its retries
- WHEN the adapter processes the row loop
- THEN the other 29 rows are resolved and returned as items
- AND that one row is recorded as unresolved with its process number and reason
- AND `discover()` still returns `ok`

#### Scenario: hostDefect is retried before being marked unresolved
- GIVEN a row whose detail fetch returns `hostDefect`
- WHEN the adapter retries that row up to the configured retry limit and every attempt
  still returns `hostDefect`
- THEN the row is recorded as unresolved only after the retry limit is exhausted, never on
  the first failure

#### Scenario: permanentError is retried before being marked unresolved
- GIVEN a row whose detail fetch returns `permanentError`
- WHEN the adapter retries that row up to the configured retry limit and every attempt
  still returns `permanentError`
- THEN the row is recorded as unresolved only after the retry limit is exhausted

#### Scenario: sessionExpired still aborts the whole call
- GIVEN a row whose detail fetch returns `sessionExpired`
- WHEN the adapter processes the row loop
- THEN it returns the `sessionExpired` outcome for the whole `discover()` call immediately
- AND no further rows in that search are attempted, and no partial success is reported

#### Scenario: transient still aborts the whole call
- GIVEN a row whose detail fetch returns `transient`
- WHEN the adapter processes the row loop
- THEN it returns the `transient` outcome for the whole `discover()` call immediately
- AND no further rows in that search are attempted, and no partial success is reported

### Requirement: Unresolved Row Identity Comes From Search-Stage Data
A row's process number is already parsed from the search-result HTML before any detail
fetch is attempted. When a row is recorded as unresolved, the adapter MUST report that
process number as the row's identity, never the work unit's `unitKey` and never a
synthetic placeholder.

#### Scenario: Unresolved row reports its process number, not the unit key
- GIVEN a row already parsed from the search-result HTML carrying a process number, whose
  detail fetch is exhausted as unresolved
- WHEN the adapter reports that row as unresolved
- THEN the reported identity is the row's process number, not the work unit's `unitKey`
