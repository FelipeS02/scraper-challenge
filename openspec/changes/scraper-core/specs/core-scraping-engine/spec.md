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
