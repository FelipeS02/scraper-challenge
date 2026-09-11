# Delta for Test Topology

## ADDED Requirements

### Requirement: Three-Project Classification and Inventory
The test system MUST expose exactly three uniquely named Vitest projects: `unit`, `integration`, and `contract`. Their path rules MUST be mutually exclusive, and every repository test suite MUST be classified by exactly one project. The topology inventory MUST reject an unclassified or multiply classified suite.

#### Scenario: Complete exclusive inventory
- GIVEN the repository test-suite inventory
- WHEN the topology contract evaluates it
- THEN every suite belongs to exactly one named project
- AND no fourth or catch-all project exists

#### Scenario: Invalid test location
- GIVEN a `*.test.ts` file outside an approved project home
- WHEN the topology contract evaluates it
- THEN it fails rather than silently collecting the suite

### Requirement: Component-Owned Test Assets
A component's unit, integration, and contract suites MUST live in that component's `tests` home. Suites crossing component boundaries MUST live in `src/tests/integration`. Immutable samples MUST live only in component-owned `tests/fixtures`; executable fakes, builders, loaders, and harnesses MUST live only in `tests/support`. Fixtures MUST NOT contain test suites, and component unit suites MUST NOT depend on another component's support.

#### Scenario: Fixture and helper separation
- GIVEN captured TRF5 response bytes and an executable transport stub
- WHEN they are organized for tests
- THEN bytes are in the TRF5 fixture home and the stub is in its support home
- AND no fixture path contains a test suite

### Requirement: Scraper Suite Decomposition Preserves Behavior
The engine scraper suite MUST be decomposed into seam-focused suites using shared engine-owned harness support. The seams MUST cover discovery/fetch, budgets, retry/cooldown, persistence/resume, document outcomes, subdivision/coverage, frontier harvesting, and observability/failure reporting. Moves and splits MUST preserve existing test identities and assertion outcomes.

#### Scenario: Split scraper inventory
- GIVEN the baseline `scraper.test.ts` identities and assertions
- WHEN its behavior seams are moved into focused suites
- THEN the collected identity and assertion inventory is unchanged
- AND the shared harness contains no production behavior

### Requirement: Production, Editor, and Test Analysis Boundaries
The production build MUST exclude every `tests`, `fixtures`, and `support` tree from emitted output. Editor and test typechecking MUST include moved tests and Vitest configuration, and typed ESLint MUST resolve moved test files through an explicit TypeScript project rather than an inferred project.

#### Scenario: Separate build and analysis scopes
- GIVEN a moved test, fixture, and support helper
- WHEN production build and analysis commands run
- THEN production emits none of those artifacts
- AND typechecking and typed ESLint include the test and support source

### Requirement: Stable Fixture Loading and Behavioral Parity
Fixture loaders MUST retain stable component-owned URLs and load the same immutable bytes after support is separated. All-project and per-project collection MUST preserve the baseline suite/test inventory and assertions, including existing host-defect and session-expired coverage. This refactor MUST NOT change runtime behavior, public APIs, coverage semantics, or checkpoint selection, invalidation, persistence, and resumability semantics. Tests MUST use stubs; live-site and browser testing MUST NOT be introduced.

#### Scenario: Fixture relocation remains byte-stable
- GIVEN an existing captured response fixture
- WHEN its loader is used after topology migration
- THEN it resolves the same bytes from its component-owned fixture home
- AND its existing assertions continue to pass

#### Scenario: Runtime behavior remains unchanged
- GIVEN baseline all-project and per-project inventories
- WHEN the migrated suite runs against stubs
- THEN identities and assertions match the baseline
- AND no checkpoint behavior or live/browser test is added