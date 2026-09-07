## Exploration: Reorganize test topology

### Current State

The repository has strong behavioral coverage, but its physical layout no longer communicates test scope. Forty-nine test files sit beside 52 production TypeScript files, all are discovered by one undifferentiated `vitest run`, and the production `tsconfig.json` includes every `src/**/*.ts` file. As a result, unit, integration, and structural contract suites share one execution path and production builds can emit test code.

The largest concentration is `src/engine/scraper.test.ts` at 1,493 lines. Its reusable in-memory ports and builders are embedded in the same file as behavior groups for discovery/fetch, budgets, retry/cooldown, persistence/resume, document outcomes, subdivision, dimensions, failure vocabulary, frontier harvesting, observability, and unresolved rows. The groups are separable without changing production behavior.

Fixture ownership is also ambiguous. `src/engine/__fixtures__` contains executable fakes and three real test suites, while `src/adapters/trf5/__fixtures__` mixes captured HTML/XML/PDF samples, a README, and the executable `StubTransport`/fixture loader. Cross-component suites already exist: `src/main.test.ts` drives the composition root, and `src/adapters/trf5/global-cooldown.test.ts` drives the engine with the real TRF5 adapter over a stubbed transport.

Vitest 4.1.11 supports named `test.projects` with disjoint `include` patterns and targeted `--project` execution. The root configuration remains the correct place for process-wide coverage/reporting settings; project definitions should each have a unique name. See the [Vitest 4 projects reference](https://v4.vitest.dev/config/projects) and [Vitest 4 project filtering CLI](https://v4.vitest.dev/guide/cli#project).

### Affected Areas

- `src/engine/**/*.test.ts` — move engine behavior into a component-local test home and split the oversized scraper suite by behavior.
- `src/engine/__fixtures__` — separate reusable fakes/support from executable contract suites; no test file should remain inside a fixture directory.
- `src/adapters/trf5/**/*.test.ts` — classify parser/domain behavior separately from adapter composition and contract audits.
- `src/adapters/trf5/__fixtures__` — move immutable response samples to adapter-owned fixtures and executable helpers to adapter-owned support.
- `src/infra/**/*.test.ts` — distinguish pure unit tests from real filesystem/Axios integration tests.
- `src/cli/**/*.test.ts` — move CLI behavior to a local test home without changing assertions.
- `src/main.test.ts` — move composition-root wiring to the narrow cross-component integration home.
- `vitest.config.ts` — add mutually exclusive `unit`, `integration`, and `contract` projects.
- `package.json` — retain the all-project default while adding explicit project scripts.
- `tsconfig.json` plus dedicated build/test configs — keep editor/lint coverage broad while excluding test trees from production emission.
- `eslint.config.js` — verify typed lint project discovery and preserve engine import boundaries after tests move deeper.

### Approaches

1. **Component-local homes with semantic subfolders** — create `tests/unit`, `tests/integration`, `tests/contract`, `tests/fixtures`, and `tests/support` only where each component needs them; reserve `src/tests/integration` for suites that genuinely cross component boundaries.
   - Pros: Matches the existing engine/adapter/infra/cli architecture; folder paths give Vitest projects disjoint ownership; fixtures remain next to the component whose protocol they model; future checkpoint tests have an obvious home.
   - Cons: Most moves require relative-import updates; the initial diff is mechanically large; boundaries need one topology guard to prevent drift.
   - Effort: Medium

2. **Central mirrored `tests/` tree** — move every suite and fixture under a repository-level `tests/{unit,integration,contract}` tree mirroring `src`.
   - Pros: Production and test files are physically separated; TypeScript build exclusion is simple; execution layers are immediately visible.
   - Cons: Duplicates the production tree; weakens component ownership; fixture edits become distant from the adapter/parser they describe; import paths become longer.
   - Effort: Medium

3. **Keep colocation and classify by filename suffix** — retain current paths and rename files to `*.unit.test.ts`, `*.integration.test.ts`, and `*.contract.test.ts`.
   - Pros: Smallest path migration; simple Vitest globs; production adjacency remains convenient.
   - Cons: Does not fix tests living in `__fixtures__`, mixed fixture/support ownership, the oversized scraper suite, or production/test topology; classification remains a naming convention rather than an architectural boundary.
   - Effort: Low

### Recommendation

Use **component-local homes with semantic subfolders**. It best matches the requested direction and makes test scope recognizable from the path rather than from tribal knowledge.

Recommended target shape:

| Scope | Home | Examples |
|---|---|---|
| Unit | `src/<component>/tests/unit/**` | engine algorithms and scraper orchestration over in-memory ports; TRF5 parsers; CLI formatting/argument parsing; pure logging/clock behavior |
| Integration | `src/<component>/tests/integration/**` | TRF5 site composition over `StubTransport`; filesystem-backed infra adapters; Axios transport integration |
| Cross-component integration | `src/tests/integration/**` | composition-root wiring and engine + real TRF5 adapter cooldown behavior |
| Contract | `src/<component>/tests/contract/**` | port implementation/coverage audits, outcome construction audits, payload construction audits, portability and persisted-identifier contracts |
| Fixtures | `src/<component>/tests/fixtures/**` | immutable HTML/XML/PDF/captured response bytes plus provenance README |
| Support | `src/<component>/tests/support/**` | executable fakes, builders, recording logger, stub transport, and fixture loader |

Support ownership should follow the abstraction being faked: engine port fakes belong to engine tests; TRF5 response fixtures and transport scripting belong to adapter tests. A cross-component suite MAY import those component-owned helpers, but unit tests MUST NOT import support owned by another component. Executable helpers MUST NOT live in `fixtures`, and fixtures MUST NOT contain `*.test.ts` files.

Split `scraper.test.ts` by stable behavior seams, not by arbitrary line count. A practical first cut is: discovery/fetch, budgets, retry/cooldown, persistence/resume, document persistence/outcome write-back, subdivision/coverage metadata, frontier harvesting, and observability/failure reporting. Extract the shared scripted site, traversal, in-memory ports, clock, builders, and constants once into `src/engine/tests/support/scraper-harness.ts`. Keep each current assertion unchanged during the move.

Define three non-overlapping Vitest 4 projects in `vitest.config.ts`, each with an explicit Node environment, unique name, and path-based include:

- `unit`: `src/**/tests/unit/**/*.test.ts`
- `integration`: `src/**/tests/integration/**/*.test.ts`
- `contract`: `src/**/tests/contract/**/*.test.ts`

The default `test`/`test:watch` commands should continue to run all projects. Add `test:unit`, `test:integration`, and `test:contract` using `vitest run --project <name>`. Keep coverage at the root because Vitest coverage is process-wide rather than a per-project option. Do not leave a catch-all default project: an unclassified test should fail the topology guard instead of silently running elsewhere.

Separate TypeScript concerns with shared strict compiler options, a broad no-emit editor/lint config, a production build config that excludes every `tests/**` tree, and a test config that includes production, tests, and `vitest.config.ts`. Point `build` at the production config and make `typecheck` cover both production and test configs. Validate ESLint `projectService` after the split so moved tests do not fall into an inferred project.

Migration should be incremental and behavior-preserving:

1. Start only from an explicitly preserved baseline for the existing `discover-partial-row-tolerance` work; do not implicitly stash or intermingle its modified/untracked test files.
2. Add a failing topology contract that inventories every test exactly once across the three projects and rejects `*.test.ts` outside approved homes; this supplies the RED step for the structural change.
3. Capture the baseline file/test inventory, then move one component at a time with rename-aware operations and import-only edits.
4. Split the scraper suite after its shared harness is extracted, preserving describe/test names and assertion bodies.
5. After each slice, typecheck the test config and compare collected test identities/counts; at the end, run each project independently and the all-project command.
6. Confirm the production build emits no test, fixture, or support files and that the dirty-worktree diff from the earlier change remains byte-for-byte attributable.

Checkpoint strategy semantics are explicitly out of scope. This change may create the later feature's test home, but it MUST NOT introduce checkpoint selection, invalidation, or persistence behavior.

### Risks

- The current dirty worktree modifies many files that this migration would rename, including `scraper.test.ts`, TRF5 suites/fixtures, infra suites, CLI tests, and `main.test.ts`; moving them now would obscure lineage and create avoidable merge conflicts.
- Relative ESM `.js` imports will change when tests move deeper; a missed rewrite may fail at runtime even if a textual move looks correct.
- `StubTransport` currently resolves fixture bytes relative to its own module, so separating support from fixtures requires an explicit stable sibling fixture URL without changing byte loading.
- Structural audit suites scan `src` and currently special-case `__fixtures__`/`.test.ts`; their exclusion logic must follow the new `tests/support` and `tests/fixtures` paths or they may inspect test doubles as production.
- Misclassified or overlapping Vitest globs can duplicate or omit suites. An exclusivity/inventory contract is required.
- Production/test TypeScript separation can break ESLint typed project discovery unless the broad root config continues to include moved tests.
- A single mechanical move may exceed the 400-line review budget even with no behavioral edits; the proposal should plan reviewable component slices while retaining the selected single-PR delivery strategy or record a size exception before apply.

### Ready for Proposal

Yes. The proposal should lock the component-local topology, the three-folder execution taxonomy, fixture/support ownership rules, scraper behavior seams, TypeScript build isolation, and migration invariants. It should also make a clean or explicitly snapshotted baseline for `discover-partial-row-tolerance` a prerequisite and state that checkpoint semantics remain a separate later change.
