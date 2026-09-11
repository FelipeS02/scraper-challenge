# Tasks: Reorganize Test Topology

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 3,000–4,500 lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Six local commits; direct merge |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception (no PR chain) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Commit | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Baseline/config | `test: lock topology` | `pnpm vitest --project contract` | N/A—structural | config + contract |
| 2 | CLI/infra moves | `refactor(test): relocate cli infra` | `pnpm test:unit` | N/A—pure/stubbed | cli/infra tests |
| 3 | TRF5 moves | `refactor(test): relocate trf5` | `pnpm test:integration` | StubTransport scenario | trf5 tests/assets |
| 4 | Engine split | `refactor(test): split scraper seams` | `pnpm test:unit` | scripted port scenario | engine tests/support |
| 5 | Cross-component | `refactor(test): classify integration` | `pnpm test:integration` | main + stubbed TRF5 | src/tests only |
| 6 | Proof/docs | `docs(test): record topology evidence` | `pnpm check && pnpm test:coverage` | N/A—verification only | docs/evidence |

**Direct-local-merge boundary:** Conventional Commits merge to main under accepted exception; no PR chain.

## Phase 1: Baseline and topology contract

- [x] 1.1 **RED**: confirm Vitest 4.1.11; capture `git ls-files`, `vitest list --json` identities/assertions, and baseline in `docs/test-topology-baseline.md`.
- [x] 1.2 **RED**: add `src/tests/contract/test-topology.test.ts` for exactly-once classification, invalid locations, fixture/support suites, scripts, and unit-to-support AST imports.
- [x] 1.3 **GREEN→REFACTOR**: create `test-topology.ts` and `vitest.config.ts`; expose three exclusive projects and coverage.

## Phase 2: Analysis boundaries and low-coupling moves

- [x] 2.1 **RED→GREEN→REFACTOR**: create `tsconfig.base.json`, `tsconfig.build.json`, `tsconfig.test.json`; update `tsconfig.json`, `package.json`, and `eslint.config.js` for emit exclusion, analysis, typed lint, scripts.
- [x] 2.2 **RED→GREEN→REFACTOR**: `git mv` `src/cli/{args,dry-run,summary}.test.ts` to `src/cli/tests/unit/`; rewrite only `.js` ESM imports and prove identity parity.
- [x] 2.3 **RED→GREEN→REFACTOR**: `git mv` `src/infra/{clock,http,logging,storage}/**/*.test.ts` to `src/infra/tests/{unit,integration}/`; prove exclusive projects.

## Phase 3: TRF5 and engine ownership

- [x] 3.1 **RED→GREEN→REFACTOR**: move `src/adapters/trf5/__fixtures__/**` to `src/adapters/trf5/tests/fixtures/` and `stub-transport.ts` to `tests/support/`; preserve URL byte equality and no fixture suites.
- [x] 3.2 **RED→GREEN→REFACTOR**: move TRF5 root, `parsing`, `schemas` suites into `tests/{unit,integration,contract}/`; retain host-defect/session-expired stubs.
- [x] 3.3 **RED→GREEN→REFACTOR**: move engine `__fixtures__` executable fakes/loggers to `src/engine/tests/support/` and portability/audit suites to `tests/contract/`; keep engine payload-generic.
- [x] 3.4 **RED→GREEN→REFACTOR**: move engine algorithms to `src/engine/tests/unit/`; replace `src/engine/scraper.test.ts` with `tests/support/scraper-harness.ts` and eight `scraper-{discovery-fetch,budgets,retry-cooldown,persistence-resume,document-outcomes,subdivision-coverage,frontier,observability-failures}.test.ts`, preserving titles, assertions, hooks, order.

## Phase 4: Integration, identity, and delivery evidence

- [x] 4.1 **RED→GREEN→REFACTOR**: move `src/main.test.ts` and `global-cooldown.test.ts` to `src/tests/integration/`; prove main wiring and engine+TRF5 cooldown use stubs only.
- [x] 4.2 Run each project/all projects; compare identity/assertion multisets with `docs/test-topology-baseline.md`, fixing only relocation/import defects.
- [x] 4.3 Run `pnpm build`; audit `dist/` contains no `tests`, `fixtures`, or `support`, then run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:coverage`.
- [x] 4.4 **REFACTOR/evidence**: update `README.md` and `docs/test-topology-baseline.md` with commands, identity/emission results, work-unit evidence, and reverse rollback.
