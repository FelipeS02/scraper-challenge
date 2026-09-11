# Design: Reorganize Test Topology

## Technical Approach

Make paths the single source of test scope. Suites move into component-owned `tests/{unit,integration,contract}` homes; repository-wide integration and topology contracts live under `src/tests`. One topology definition drives Vitest and an inventory contract. Production behavior, assertions, titles, coverage, HTTP flow, and checkpoints remain unchanged.

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|---|---|---|---|
| Ownership | Component homes; `src/tests/integration` for cross-component suites and `src/tests/contract` for repository topology | Central mirror; suffixes | Paths expose owner and scope without duplicating `src`. |
| Execution | Exactly `unit`, `integration`, `contract`, generated from `test-topology.ts`, Node environment, path-only includes | Catch-all; duplicated globs | One definition prevents overlap and omission. |
| Assets | Bytes/README in `tests/fixtures`; executable helpers in `tests/support` | Mixed `__fixtures__` | Helpers remain typed code; fixtures contain no suites. |
| TypeScript | Shared base; no-emit editor config; production build config; test config | One project | Build exclusion and analysis coverage become explicit. |

## Classification and Boundaries

| Home | Suites |
|---|---|
| `src/cli/tests/unit` | args, dry-run, summary |
| `src/infra/tests/unit` | clock; console/null/redacting loggers |
| `src/infra/tests/integration` | Axios, filesystem, JSONL adapters/logger |
| `src/adapters/trf5/tests/unit` | classes, encoding, probes, seeds, traversal, parsers, schemas |
| `src/adapters/trf5/tests/integration` | session, search, detail, documents, site over `StubTransport` |
| `src/adapters/trf5/tests/contract` | payload audit, identifier stability |
| `src/engine/tests/unit` | algorithms, frontier, scraper over in-memory ports |
| `src/engine/tests/contract` | port/outcome audits, portability proofs |
| `src/tests/integration` | `main` wiring, engine+TRF5 cooldown |

The engine stays payload-generic; only the TRF5 adapter owns PJe captures:

```text
engine ports -> TRF5 adapter -> prime GET -> AJAX search -> detail GET -> PDF GET/302
                    |                                      |
                    +------ fixture bytes/StubTransport ---+
```

No live host is contacted. Retry/error behavior remains exactly `docs/RESEARCH.md`.

## Checkpoint Invariants

`output/state/checkpoints.jsonl` remains append-only `CheckpointRecord` storage: `unitKey`, `windowKey`, `facetValue`, `label`, opaque `cursor`, `resultCount`, optional `unresolvedItemCount`, `state`, and `observedAt`. Loading still selects the latest timestamp per `unitKey`. Missing or `failed` units remain pending; `complete` and `truncated` units are skipped; `subdivided` units are reconstructed and split without repeating discovery. Latest-record-wins plus skipping completed work preserves idempotent resume. This refactor changes no checkpoint shape, completion rule, invalidation, write order, or persistence path.

## File Changes and Enforceable Contracts

| Path | Action | Contract |
|---|---|---|
| `test-topology.ts`, `vitest.config.ts` | Create | Export only three names/includes; retain root coverage. |
| `src/tests/contract/test-topology.test.ts` | Create | Inventory `*.test.ts`, normalize separators, require exactly one match, reject suites in fixtures/support or outside approved homes. Parse static import/export and literal `import()` specifiers with the TypeScript AST; resolve relative paths; for every unit suite reject any resolved `src/<other-component>/tests/support/**` target. Non-relative local support imports are forbidden because no path aliases are defined. |
| `tsconfig.base.json`, `tsconfig.build.json`, `tsconfig.test.json`; `tsconfig.json` | Create/modify | Separate shared, emit, test, editor scopes. |
| `package.json`, `eslint.config.js` | Modify | Keep all-project defaults, add three project scripts, and make `projectService` resolve the explicit test project. |
| `src/**/{*.test.ts,__fixtures__/**}` | Move | Use `git mv`; preserve basename; rewrite only relative ESM imports, retaining `.js`; no aliases. |
| `src/engine/tests/support/scraper-harness.ts` | Create | Shared scripted ports, clock, builders, logger, constants. |
| `src/engine/tests/unit/scraper-*.test.ts` | Create | Eight seams: discovery-fetch, budgets, retry-cooldown, persistence-resume, document-outcomes, subdivision-coverage, frontier, observability-failures. Preserve every title, assertion, hook, and within-group order. |

`StubTransport` resolves unchanged fixture names through `new URL('../fixtures/', import.meta.url)`; byte-equality guards URL stability. Structural audits exclude explicit `tests/**` paths and retain non-vacuous production-scan assertions.

## Testing and Migration

1. Capture a clean file inventory and `vitest list --json` identity multiset; add the inventory contract and observe RED.
2. Apply reviewable slices: topology/config, CLI, infra, TRF5, engine support/split, cross-component/audits. Per slice run its project, typecheck, inventory, and identity/assertion comparison; revert that slice on mismatch.
3. Final verification runs each project and all projects, lint/format/typecheck/build, and proves `dist` has no tests, fixtures, or support. Roll back slices in reverse order.

## Threat / Applicability Matrix

| Boundary | Applicability | Safe/failure behavior | Planned RED test |
|---|---|---|---|
| Package scripts | Applicable: fixed Vitest/tsc process entrypoints change | Each named script selects only its project; unknown names/catch-all are absent | Assert exact script-to-project mapping |
| Vitest config | Applicable: project routing controls collection | Every suite matches once; zero/multiple matches fail | Inventory invalid/overlap fixtures |
| Documentation-like executable paths | N/A: classifier handles only `*.test.ts` | No executable-file decision | None |
| Git repository selection | N/A: no Git command construction | Repository authority unchanged | None |
| Commit state | N/A: no index automation | Index semantics unchanged | None |
| Push state | N/A: no push automation | Ref resolution unchanged | None |
| PR commands | N/A: no PR automation | Argument ownership unchanged | None |

## Open Questions

None.
