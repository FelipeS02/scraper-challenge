# Core Scraping Engine Specification (delta)

Delta against the `core-scraping-engine` capability defined in the `scraper-core` change.
Adds adapter-declared partial-row tolerance to `discover()`: a per-row failure travels as
data on an otherwise-successful result, the engine ledgers it without interpreting it, and
frontier crawl reaches the same reporting duty as the sweep.

## ADDED Requirements

### Requirement: Partial Discovery Travels as Result Data, Never a New Outcome Kind
A per-row discovery failure MUST be represented as a field on a still-successful
`DiscoverResult`, never as an additional `FetchOutcome` kind. `FetchOutcome` MUST remain the
binary outcome of one fetch attempt, with exactly its existing kinds.

#### Scenario: A set with one unresolved row still returns ok
- GIVEN a discover call whose row set includes one row the adapter could not resolve
- WHEN the adapter returns its result
- THEN the outcome is `FetchOutcome` with `kind: 'ok'`
- AND the result carries the resolved items plus a record of the one unresolved row

#### Scenario: FetchOutcome gains no new kind
- GIVEN the `FetchOutcome` union type
- WHEN a partial discovery result is represented
- THEN no new kind is added to the union to represent it

### Requirement: Engine Records One Ledger Entry Per Unresolved Row
When a `DiscoverResult` reports unresolved rows, the engine MUST record exactly one
discovery-stage `LedgerEntry` per unresolved row: `itemId` set to the adapter-declared item
identity when the adapter provides one, and `documentId: null`, keeping the entry outside
`retry-failed` eligibility exactly as any other discovery-stage failure.

#### Scenario: Unresolved row is ledgered with its real identity
- GIVEN a `DiscoverResult` reporting one unresolved row with a declared identity and reason
- WHEN the engine processes that result
- THEN it records one `LedgerEntry` whose `itemId` equals the declared identity,
  `documentId` is `null`, and `reason` is the adapter-declared reason

#### Scenario: Every unresolved row gets its own entry
- GIVEN a `DiscoverResult` reporting three unresolved rows
- WHEN the engine processes that result
- THEN exactly three `LedgerEntry` records are written, one per row, and none are merged

### Requirement: Engine Stays Adapter-Agnostic About Unresolved Rows
The engine MUST treat the adapter-declared unresolved-row list, including each row's
failure reason, as opaque data forwarded verbatim into the failure ledger, coverage, and
checkpoint records. It MUST NOT branch on a site-specific reason, condition, or field name —
the same discipline `isDeeperPartition()` (`src/engine/coverage.ts`) already applies to
adapter-declared partition dimensions.

#### Scenario: Engine forwards an unresolved reason without interpreting it
- GIVEN a `DiscoverResult` whose unresolved row carries an adapter-specific reason string
- WHEN the engine records that row's ledger entry
- THEN the reason is copied into `LedgerEntry.reason` unchanged
- AND no engine-level branch inspects or classifies the string's content

### Requirement: Frontier Crawl Reaches Ledger Parity With the Sweep
`FrontierRunConfig` MUST accept a `FailureLedger`. `runFrontierCrawl` MUST record a
discovery-stage ledger entry for every unresolved row a per-seed `discover()` reports, and
for every seed search whose outcome is not `ok`, exactly as the sweep records unresolved
rows and stage failures. A failed or partially-resolved seed search MUST NOT be silently
skipped.

#### Scenario: Failed seed search is recorded, not silently skipped
- GIVEN a frontier seed search whose `discover()` call returns a non-`ok` outcome
- WHEN `runFrontierCrawl` processes that seed
- THEN it records the failure to the `FailureLedger` and continues to the next seed

#### Scenario: Unresolved rows in a frontier result are ledgered
- GIVEN a frontier seed's `discover()` call returning `ok` with one unresolved row
- WHEN `runFrontierCrawl` processes that result
- THEN it records one `LedgerEntry` for the unresolved row, exactly as the sweep would

## MODIFIED Requirements

### Requirement: Saturation-Driven Subdivision
When a work unit's discover-stage result count reaches the adapter-declared result-page
cap, the engine MUST ask `TraversalPort.split()` to subdivide that unit and MUST enqueue
every work unit `split()` returns as new work for the pool. When `split()` succeeds, the
engine MUST still record the parent unit's own coverage cell — as `subdivided`, carrying the
exact result count observed at saturation — rather than discarding it; a `subdivided` cell
is not a coverage gap and MUST NOT be counted as one (see core-coverage-accounting, `Cell
State Ledger` and `Run Summary Arithmetic`). When `split()` returns `null`, the engine MUST
record the unit as a `truncated` coverage gap — the explicit fallback, not the only path.
The engine MUST NOT interpret how a unit is subdivided (by date, by facet, or by any other
adapter-owned dimension); it only asks `split()` and enqueues whatever comes back, and it
records the same `subdivided` state regardless of which dimension the split happened along.
A unit belonging to a site that declares no result-page cap (see core-coverage-accounting,
`Cell State Ledger`) MUST NEVER be treated as saturated and MUST NEVER be passed to
`split()`. The engine MUST bound the number of times a single work-unit lineage may be
subdivided via a configured maximum split depth; exceeding that depth MUST be treated
exactly as a `null` result from `split()`, so a port returning children that fail to shrink
the work cannot cause an unbounded loop. Requeued children MUST participate in the same
checkpointing, deduplication, and coverage accounting as seeded units. Saturation judgment
MUST be based on the adapter-declared `count` field alone; `items.length` — which may be
smaller than `count` when the result carries unresolved rows — MUST NEVER be substituted
for `count` in this judgment, and split() and coverage recording MUST behave identically
whether or not any row is unresolved.
(Previously: silent on partial resolution, since `DiscoverResult` had no unresolved concept.)

#### Scenario: Saturated unit is subdivided and children are enqueued
- GIVEN a work unit whose discover stage returns a result count equal to the
  adapter-declared result-page cap
- WHEN the engine finishes processing that unit
- THEN it calls `TraversalPort.split()` with the unit and its saturation info
- AND every work unit `split()` returns is enqueued for processing
- AND the parent unit is recorded as a `subdivided` coverage cell carrying that result
  count — never as a `truncated` gap, and never silently omitted from the ledger

#### Scenario: Traversal port reports no further subdivision is possible
- GIVEN a saturated work unit for which `TraversalPort.split()` returns `null`
- WHEN the engine processes that unit
- THEN it records the unit as a `truncated` coverage gap
- AND no child work units are enqueued

#### Scenario: A misbehaving port cannot cause an infinite loop
- GIVEN a work-unit lineage already subdivided the configured maximum number of times
- WHEN the engine would otherwise subdivide it again
- THEN it treats the unit as unsubdividable and records it as `truncated`, without calling
  `split()` again for that lineage

#### Scenario: Requeued children resume like any other unit
- GIVEN a run killed after some subdivision children were checkpointed as `complete` and
  others were not yet processed
- WHEN the run is resumed
- THEN the already-`complete` children are skipped
- AND only the remaining children are re-processed, deduplicated, and accounted for exactly
  as seeded units are

#### Scenario: Partially resolved saturated cell still subdivides
- GIVEN a work unit whose discover-stage count equals the adapter-declared cap and whose
  result reports one unresolved row (so `items.length` is one less than `count`)
- WHEN the engine finishes processing that unit
- THEN it calls `TraversalPort.split()` exactly as it would if every row had resolved
- AND the parent cell is recorded as `subdivided` carrying the declared `count`, never the
  smaller resolved-item count
