# Core Coverage Accounting Specification

## Purpose

Coverage is measured, never certified. Every `(day, class)` cell records state and an
observation timestamp; the run summary is arithmetic over that ledger, backed by three
verification mechanisms. Saturation and deduplication are judged against values the adapter
declares, never a value hardcoded in the core.

## Requirements

### Requirement: Cell State Ledger
Each `(day, class)` cell MUST record exactly one of `complete`, `truncated`, `failed`, or
`subdivided`, plus an observation timestamp for when that state was determined. Saturation
MUST be judged against the adapter-declared result-page cap, never a value hardcoded in the
core. An adapter MAY declare the explicit absence of a result-page cap; a cell belonging to
such a site MUST NEVER be classified as `truncated` or `subdivided` for saturation, and the
ledger's declared-cap value MUST record that absence faithfully — as an explicit "no cap"
value, never as a corrupted or silently-coerced number (for example, a numeric `Infinity`
that JSON serialization turns into `null` behind the adapter's back). A cell that saturates
and is then successfully split by `TraversalPort.split()` MUST be recorded as `subdivided`,
carrying the exact result count observed at saturation. `subdivided` is distinct from
`truncated`: it is not a coverage gap — the cell's real coverage is carried forward by its
children — and it MUST NOT be silently omitted from the ledger merely because it produced
children instead of terminating.

#### Scenario: Cell under the adapter cap is complete
- GIVEN a `(day, class)` search returning fewer results than the adapter-declared result-page cap
- WHEN the cell is recorded
- THEN its state is `complete` with the timestamp of that search

#### Scenario: Saturated single-day cell is truncated
- GIVEN a single-day, single-class search returning exactly the adapter-declared result-page cap with no further bisection possible
- WHEN the cell is recorded
- THEN its state is `truncated`, never silently reported as `complete`

#### Scenario: Cell that exhausted retries is failed
- GIVEN a `(day, class)` search whose retries are exhausted per the resilience policy
- WHEN the cell is recorded
- THEN its state is `failed`

#### Scenario: Successfully subdivided cell is recorded, not discarded
- GIVEN a saturated cell for which `TraversalPort.split()` returns replacement children
- WHEN the cell is recorded
- THEN its state is `subdivided`, carrying the exact result count observed at saturation
- AND it is never silently omitted from the ledger and never conflated with a `truncated` gap

#### Scenario: Site with no declared cap never saturates
- GIVEN an adapter that declares the explicit absence of a result-page cap
- WHEN a cell belonging to that adapter returns any result count
- THEN the cell is recorded as `complete` (or `failed` on error), never `truncated` for
  saturation
- AND no subdivision is ever requested for that cell

#### Scenario: Declared cap absence is recorded faithfully
- GIVEN a cell whose adapter declares no result-page cap
- WHEN its coverage record is written and later read back
- THEN the declared-cap value reads back as the same explicit "no cap" value
- AND it is never observed as a corrupted or coerced number produced by serializing a
  non-finite value

### Requirement: Run Summary Arithmetic
The run summary MUST be computed purely as arithmetic over the recorded ledger — counts of
`complete`, `truncated`, and `failed` cells, and item/document totals — with no
independent claim of completeness. A `subdivided` cell MUST be excluded from these three
tallies: it was superseded by its children rather than resolved on its own, so only its
terminal descendants (themselves `complete`, `truncated`, or `failed`) are counted, and a
subdivided parent MUST NEVER be double-counted alongside them.

#### Scenario: Summary matches ledger counts
- GIVEN a ledger with 100 complete, 5 truncated, and 2 failed cells
- WHEN the run summary is generated
- THEN it reports exactly those three counts, derived from the ledger, not an estimate

#### Scenario: Subdivided parent is not double-counted
- GIVEN a ledger containing one `subdivided` parent cell and its two child cells, one
  `complete` and one `truncated`
- WHEN the run summary is generated
- THEN it reports 1 complete and 1 truncated
- AND the `subdivided` parent contributes to neither count nor any other tally

### Requirement: Idempotence Verification by Set Hash
The system MUST support re-checking a cell's idempotence by comparing the SHA-1 (or
equivalent) hash of its sorted item-id set across two observations.

#### Scenario: Repeated search on an unchanged cell yields matching hash
- GIVEN a cell searched twice with no intervening data change
- WHEN the two result sets are hashed
- THEN the hashes match, confirming idempotence for that check

#### Scenario: Live data change is detected as a hash mismatch
- GIVEN a cell searched twice minutes apart against a live-moving dataset
- WHEN the two result sets are hashed
- THEN a differing hash is reported as observed, not treated as a system error

### Requirement: Deduplication by Adapter-Declared Identity Key
The system MUST deduplicate collected items by the item identity key declared by the
adapter, across all cells and across both phases. The core MUST NOT assume any concrete
field name for that key.

#### Scenario: Same item appears in two overlapping cells
- GIVEN an item returned by both a date-window cell and a class-partition cell
- WHEN both results are ingested
- THEN the item is written to output exactly once, keyed by the adapter-declared identity key

### Requirement: Partition Invariant Verification
The system MUST verify that, for a given day, the sum of per-facet-value counts is greater
than or equal to the unfiltered day count. The unfiltered day count MUST be sourced from
that day's own persisted coverage cell — recorded as `subdivided` when facet expansion
followed it, or as `truncated` if it could not be expanded — never from an assumption about
what the adapter-declared cap must have been, since the ledger records what was actually
observed at the moment of saturation.

#### Scenario: Per-facet-value sum satisfies the invariant
- GIVEN an unfiltered day count equal to the adapter-declared result-page cap (saturated) and per-facet-value counts summing to 45
- WHEN the invariant check runs
- THEN it passes, since the per-facet-value sum exceeds the unfiltered count

#### Scenario: Invariant violation is flagged
- GIVEN per-facet-value counts summing to less than the unfiltered day count
- WHEN the invariant check runs
- THEN it reports a violation rather than silently accepting the discrepancy

#### Scenario: Invariant is checked against the persisted parent record
- GIVEN a day's unfiltered cell recorded as `subdivided` with a result count of 30 after
  triggering facet expansion
- WHEN the invariant check runs against that day's per-facet-value cells
- THEN it compares their summed counts against the `30` recorded on the `subdivided` parent
  cell, not a recomputed or assumed value

### Requirement: Separate Checkpoint and Failure Ledger Concerns
Cell-keyed checkpoint state and the failure ledger MUST be tracked as separate concerns over
one store. The failure ledger is keyed by the adapter-declared item identity key paired with
the adapter-declared document identity key. Retrying a failed document MUST NOT re-run the
discovery request for its cell.

#### Scenario: Document retry does not re-discover
- GIVEN an item whose metadata discovery is complete and one of its documents is in the failure ledger
- WHEN the failed document is retried
- THEN only the document fetch is re-attempted, and no discovery request is re-issued for that cell

### Requirement: Observation-Timestamped Completeness
Every cell and record MUST carry an observation timestamp; a `complete` state MUST be
understood as "complete as observed at that timestamp," never an absolute claim.

#### Scenario: Complete cell later contradicted by a re-check
- GIVEN a cell marked `complete` at timestamp T1
- WHEN a re-check at T2 finds additional items
- THEN the original `complete` record at T1 is not treated as having been false — it remains valid for its observation timestamp
