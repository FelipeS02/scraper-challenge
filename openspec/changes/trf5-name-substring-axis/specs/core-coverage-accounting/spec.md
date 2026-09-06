# Core Coverage Accounting Specification (delta)

Delta against the `coverage-accounting` capability defined in the `scraper-core` change.
Extends cell identity and reporting so a name-substring sub-partition is legible, without
changing the payload-generic engine. The name probe is an adapter-owned dimension carried in
the existing `CoverageRecord.dimensions` map — the core does not learn a concrete name field.

## MODIFIED Requirements

### Requirement: Cell State Ledger
Each coverage cell MUST record exactly one of `complete`, `truncated`, `failed`, or
`subdivided`, plus an observation timestamp. A cell is identified by its adapter-owned
partition dimensions carried in `CoverageRecord.dimensions`; beyond `(day, class)` a cell MAY
additionally carry a name-probe dimension. Saturation MUST be judged against the
adapter-declared result-page cap, never a value hardcoded in the core. The `complete` /
`truncated` / `failed` / `subdivided` semantics apply identically at every partition level: a
saturated cell successfully split by `TraversalPort.split()` is `subdivided`; a saturated cell
`split()` cannot subdivide further — including a cell already carrying a name probe — is
`truncated`; and a `subdivided` cell is never a coverage gap and never omitted from the ledger.

#### Scenario: Cell under the adapter cap is complete
- GIVEN a search returning fewer results than the adapter-declared result-page cap
- WHEN the cell is recorded
- THEN its state is `complete` with the timestamp of that search

#### Scenario: Subdivided class cell records its name-probe children
- GIVEN a single-day class cell that saturated and was split into name-probe children
- WHEN the cells are recorded
- THEN the class cell's state is `subdivided`, carrying the exact result count observed at saturation
- AND each name-probe child is recorded as its own cell carrying the date, class, and name-probe dimensions

#### Scenario: Saturated name-probe cell is a truncated residue
- GIVEN a single-day cell carrying both a class and a name probe that reached the cap and could not be subdivided further
- WHEN the cell is recorded
- THEN its state is `truncated`
- AND its `dimensions` carry the date, the class, and the name-probe value, so the residual gap is legible

### Requirement: Partition Invariant Verification
The system MUST verify that, for a saturated parent cell, the sum of its child cells' counts
is greater than or equal to the parent's recorded count, at each partition level. For a day,
the sum of per-class counts MUST be greater than or equal to the unfiltered day count. For a
saturated single-day class cell that was expanded by name probe, the sum of its per-name-probe
counts MUST be greater than or equal to the class cell's recorded (saturated) count. Each
parent count MUST be sourced from that parent's own persisted coverage cell, never from an
assumption about the declared cap. Name-probe child counts overlap heavily (a substring can
match a process another substring also matches); the invariant is a lower-bound sanity check
on counts and is independent of deduplication, which resolves the overlap separately by the
adapter-declared identity key.

#### Scenario: Per-class sum satisfies the invariant
- GIVEN a saturated unfiltered day count and per-class counts summing to more than it
- WHEN the invariant check runs
- THEN it passes

#### Scenario: Per-name-probe sum satisfies the invariant against the class parent
- GIVEN a class cell recorded as `subdivided` with a saturated count of 30, expanded into
  name-probe cells whose counts sum to 140
- WHEN the invariant check runs against that class cell's name-probe children
- THEN it compares their summed counts against the `30` recorded on the `subdivided` class
  cell and passes, independent of how many processes are shared across the probes

#### Scenario: Invariant violation is flagged
- GIVEN per-name-probe counts summing to less than the class cell's recorded count
- WHEN the invariant check runs
- THEN it reports a violation rather than silently accepting the discrepancy
