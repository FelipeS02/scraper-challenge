# Core Coverage Accounting Specification

## Purpose

Coverage is measured, never certified. Every `(day, class)` cell records state and an
observation timestamp; the run summary is arithmetic over that ledger, backed by three
verification mechanisms. Saturation and deduplication are judged against values the adapter
declares, never a value hardcoded in the core.

## Requirements

### Requirement: Cell State Ledger
Each `(day, class)` cell MUST record exactly one of `complete`, `truncated`, or `failed`,
plus an observation timestamp for when that state was determined. Saturation MUST be judged
against the adapter-declared result-page cap, never a value hardcoded in the core.

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

### Requirement: Run Summary Arithmetic
The run summary MUST be computed purely as arithmetic over the recorded ledger — counts of
`complete`, `truncated`, and `failed` cells, and item/document totals — with no
independent claim of completeness.

#### Scenario: Summary matches ledger counts
- GIVEN a ledger with 100 complete, 5 truncated, and 2 failed cells
- WHEN the run summary is generated
- THEN it reports exactly those three counts, derived from the ledger, not an estimate

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
than or equal to the unfiltered day count.

#### Scenario: Per-facet-value sum satisfies the invariant
- GIVEN an unfiltered day count equal to the adapter-declared result-page cap (saturated) and per-facet-value counts summing to 45
- WHEN the invariant check runs
- THEN it passes, since the per-facet-value sum exceeds the unfiltered count

#### Scenario: Invariant violation is flagged
- GIVEN per-facet-value counts summing to less than the unfiltered day count
- WHEN the invariant check runs
- THEN it reports a violation rather than silently accepting the discrepancy

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
