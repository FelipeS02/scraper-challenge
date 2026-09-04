# Core Scraping Engine Specification

## Purpose

A payload-generic orchestration core with no knowledge of any specific site. It defines
ports (`SitePort<TItem,TDoc>`, `TraversalPort<TCursor>`, `HttpTransport`, `CheckpointStore`,
`FailureLedger`, `ItemSink<TItem>`, `AdapterStateStore`, `Clock`), runs a two-stage
discover→fetch loop over a bounded worker pool, and checkpoints work it cannot interpret.

## Requirements

### Requirement: Two-Stage Discover-Then-Fetch Execution
The engine MUST complete the `discover` stage (metadata extraction) for a work unit before
attempting the `fetch` stage (document retrieval) for that unit. A document-fetch failure
MUST NOT prevent the metadata already discovered from being written to the sink.

#### Scenario: Document fetch fails after successful discovery
- GIVEN a work unit whose discover stage returns valid item metadata
- WHEN the subsequent fetch stage for its documents fails permanently
- THEN the item metadata is still written to `ItemSink`
- AND the document failure is recorded in the failure ledger without discarding the item

#### Scenario: Discover stage fails
- GIVEN a work unit whose discover stage fails validity checks
- WHEN the engine processes that unit
- THEN the fetch stage is never invoked for it
- AND the failure is recorded in the failure ledger

### Requirement: Payload-Generic Port Contracts
The engine MUST be generic over item type, document type, and cursor type via
`SitePort<TItem,TDoc>` and `TraversalPort<TCursor>`. The engine MUST NOT reference any
concrete type, field name, or business concept belonging to a specific site.

#### Scenario: Engine compiles and runs against a fake adapter
- GIVEN a minimal fake adapter (~20 lines) implementing `SitePort` and `TraversalPort`
- WHEN the engine's unit tests run against that fake
- THEN all tests pass without `adapters/trf5/` being imported or exercised

### Requirement: Opaque Checkpoint Persistence
The engine MUST persist a checkpoint as an opaque `unitKey: string` plus a JSON cursor via
`CheckpointStore`, without interpreting the cursor's internal shape.

#### Scenario: Cursor round-trips through the checkpoint store
- GIVEN a `TraversalPort<TCursor>` that emits an adapter-defined cursor shape
- WHEN the engine persists and later reloads a checkpoint for a `unitKey`
- THEN the reloaded cursor is byte-identical JSON to what was persisted
- AND the engine performs no transformation on the cursor's fields

### Requirement: Enforced Adapter Seam
An ESLint `no-restricted-imports` rule scoped to `engine/**` MUST forbid importing
`**/adapters/**`, `axios`, and `cheerio`. A violation MUST fail the lint build.

#### Scenario: Engine file imports an adapter module
- GIVEN a file under `src/engine/**`
- WHEN it contains `import ... from '../adapters/trf5/...'`
- THEN `eslint` reports an error and the build fails

#### Scenario: Engine file imports axios or cheerio directly
- GIVEN a file under `src/engine/**`
- WHEN it imports `axios` or `cheerio` directly
- THEN `eslint` reports an error and the build fails

### Requirement: Bounded In-Process Worker Pool
The engine MUST execute work units through a bounded in-process worker pool with a
configurable concurrency limit. The engine MUST NOT depend on an external queue or broker.

#### Scenario: Concurrency never exceeds the configured limit
- GIVEN a pool configured with concurrency N
- WHEN more than N work units are pending
- THEN no more than N units are in flight at any observed instant

#### Scenario: No external infrastructure dependency
- GIVEN the engine's dependency graph
- WHEN inspected for runtime dependencies
- THEN no Redis, BullMQ, or other external queue client is present

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
checkpointing, deduplication, and coverage accounting as seeded units.

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

### Requirement: Site-Agnostic Failure Vocabulary
The engine's failure-outcome vocabulary (`FetchOutcome`'s `permanentError.reason` and any
sibling failure-classification type) MUST NOT name a concrete site's page structure, field,
or observed behavior as a literal member. Every member MUST describe a site-agnostic
condition; adapter-specific classification detail belongs to the adapter, carried as
adapter-owned data rather than encoded into the engine's own type.

#### Scenario: Failure-reason vocabulary contains no site-specific concept
- GIVEN the literal members of `FetchOutcome`'s `permanentError.reason` type
- WHEN each member name is inspected
- THEN none of them names a concrete site's page structure, field name, or observed
  behavior (for example, a specific site's "invalid session shell page")

#### Scenario: A new site-specific permanent failure does not require an engine type change
- GIVEN an adapter observing a permanent failure with a detail unique to its own site
- WHEN it reports that failure through `FetchOutcome`
- THEN it does so using only site-agnostic engine-level classification, without adding a
  new site-specific literal member to the engine's type
