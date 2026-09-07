# Core Coverage Accounting Specification (delta)

Delta against the `core-coverage-accounting` capability defined in the `scraper-core`
change. Adds `unresolvedItemCount` as a fact orthogonal to the existing `state` enum, and a
separate run-summary tally for it. Unresolved is never folded into `complete`.

## ADDED Requirements

### Requirement: Unresolved Item Count Is Orthogonal to Cell State
`CheckpointRecord` and `CoverageRecord` MUST each carry an `unresolvedItemCount: number`
field, independent of `state`. Recording a non-zero `unresolvedItemCount` on a cell MUST NOT
change that cell's `state`, and `state`'s existing four values (`complete`, `truncated`,
`failed`, `subdivided`) keep exactly their current meaning. A cell MUST be able to carry
both a saturation-driven `state` of `subdivided` and a non-zero `unresolvedItemCount` at the
same time — the two facts are independent and both MUST be persisted.

#### Scenario: Complete cell with one unresolved row keeps both facts
- GIVEN a cell whose result count is under the adapter-declared cap but one of its rows was
  unresolved
- WHEN the cell is recorded
- THEN its `state` is `complete`
- AND its `unresolvedItemCount` is `1`

#### Scenario: Subdivided saturated cell with an unresolved row keeps both facts
- GIVEN a cell that saturated, was successfully split by `TraversalPort.split()`, and had
  one row unresolved before the split was requested
- WHEN the cell is recorded
- THEN its `state` is `subdivided`, carrying the exact result count observed at saturation
- AND its `unresolvedItemCount` is `1`, and neither fact is dropped to accommodate the other

#### Scenario: Unresolved is never folded into complete
- GIVEN a cell with a non-zero `unresolvedItemCount`
- WHEN its `state` is read
- THEN `state` is never coerced to something other than what saturation and retries alone
  would have produced, and `complete` never silently absorbs the unresolved count

## MODIFIED Requirements

### Requirement: Run Summary Arithmetic
The run summary MUST be computed purely as arithmetic over the recorded ledger — counts of
`complete`, `truncated`, and `failed` cells, and item/document totals — with no
independent claim of completeness. A `subdivided` cell MUST be excluded from these three
tallies: it was superseded by its children rather than resolved on its own, so only its
terminal descendants (themselves `complete`, `truncated`, or `failed`) are counted, and a
subdivided parent MUST NEVER be double-counted alongside them. The run summary MUST also
report the total unresolved item count as its own separate tally, summed across all
recorded cells regardless of their `state`. This unresolved tally MUST NOT be added to, or
subtracted from, `complete`, `truncated`, or `failed`, and MUST NOT be presented as an
annotation on any of those three counts.
(Previously: reported only `complete`/`truncated`/`failed`, with no unresolved concept.)

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

#### Scenario: Unresolved rows report as a separate tally, never folded into complete
- GIVEN a ledger with 99 complete cells and one cell recorded `complete` with
  `unresolvedItemCount: 1`
- WHEN the run summary is generated
- THEN it reports 100 complete cells and a separate unresolved-item tally of 1
- AND the unresolved tally never reduces the `complete` count or appears as part of it
