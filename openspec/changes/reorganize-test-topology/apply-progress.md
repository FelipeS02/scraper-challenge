# Apply Progress: Reorganize Test Topology

**Mode:** Strict TDD
**Delivery:** `exception-ok` / accepted `size:exception`; no PR chain or commit was created.
**Status:** Blocked before implementation.

## Completed Tasks

None. `tasks.md` remains 0/14 because the required safety-net baseline did not pass.

## Baseline Evidence

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm.cmd vitest list --json` | 0 | Captured 378 test identities in `docs/test-topology-baseline-list.json`. |
| `pnpm.cmd vitest run` | 1 | 49 suite files; 377 passed and 1 failed before any topology edit. |

## Blocking Failure

`src/main.test.ts:176` expects a persisted document buffer length of 135 bytes but receives 141 bytes. This is unrelated to test topology and must not be fixed or masked by this structural change.

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR | Status |
| --- | --- | --- | --- | --- |
| 1.1 Baseline capture | Existing suite executed; captured one pre-existing failure. | Not reached: safety net is red. | Not reached. | Blocked |
| 1.2–4.4 | Not started. | Not started. | Not started. | Pending |

## Work Unit Evidence

| Work unit | Focused test command/result | Runtime harness | Rollback boundary | Status |
| --- | --- | --- | --- | --- |
| 1 Baseline/config | `pnpm.cmd vitest run` exited 1 (377 passed, 1 failed). | N/A — topology work did not start. | `docs/test-topology-baseline.md` and `docs/test-topology-baseline-list.json` only. | Blocked |
| 2–6 | Not started. | Not started. | Not started. | Pending |

## Next Step

Resolve or explicitly accept the pre-existing `src/main.test.ts` byte-length failure in its owning scope, then re-run the baseline before starting topology RED/GREEN work.

---

## Resumed implementation

**Status:** Partially complete. The topology implementation and functional proof pass;
the final repository-wide Prettier gate remains blocked by unrelated formatting drift.

### Corrective baseline evidence

The original 135/141-byte failure was caused by `core.autocrlf=true` converting the
tracked PDF-like fixture from six LF bytes to CRLF in the working tree. The fixture
loader correctly preserves bytes, so no production code changed. `.gitattributes`
declares the fixture binary and the original main test passes unchanged.

### Completed task state

Tasks 1.1–4.2 and 4.4 are complete. Task 4.3 remains open solely for its required
`pnpm.cmd format:check` gate.

### Verification evidence

| Command | Result |
| --- | --- |
| `pnpm.cmd vitest run --project unit` | 34 files, 235 tests passed. |
| `pnpm.cmd vitest run --project integration` | 15 files, 115 tests passed. |
| `pnpm.cmd vitest run --project contract` | 8 files, 33 tests passed. |
| `pnpm.cmd vitest run` | 57 files, 383 tests passed. |
| Identity multiset comparison | 378 baseline identities, 378 migrated identities after excluding the five topology-contract tests; missing 0, extra 0. |
| `pnpm.cmd typecheck` | Passed. |
| `pnpm.cmd build` | Passed; the `dist/` audit found 0 emitted paths containing `tests`, `fixtures`, or `support`. |
| `pnpm.cmd lint` | Passed. |
| `pnpm.cmd test:coverage` | Passed; 94.36% statements. |
| `pnpm.cmd format:check` | Blocked: Prettier reports 79 files, including untouched production sources and fixture HTML. |

### Work-unit evidence

| Work unit | Focused command/result | Runtime harness | Rollback boundary | Status |
| --- | --- | --- | --- | --- |
| 1 Baseline/config | Contract project passed. | N/A — structural | config + contract + docs | Passed |
| 2 CLI/infra moves | Unit/integration projects passed. | Pure/stubbed | CLI/infra tests | Passed |
| 3 TRF5 moves | All projects passed. | StubTransport and byte-stable fixtures | TRF5 tests/assets | Passed |
| 4 Engine split | Unit project passed. | Scripted port scenarios | engine tests/support | Passed |
| 5 Cross-component | Integration project passed. | Main + stubbed TRF5 | `src/tests` | Passed |
| 6 Proof/docs | Build, lint, typecheck, coverage passed; format check blocked. | N/A | docs/evidence | Blocked on formatting |

### Next step

The native runtime settled this second attempt as failed and now requires a maintainer
objective reset before any further apply attempt: it records 2/2 attempts and 30,112
cumulative changed lines against a 10,000-line budget. Inspect with
`gentle-ai sdd-attempt status --cwd . --change reorganize-test-topology`; its current
revision is `sha256:6baf10c4d9adf064866137c9a979593c618ede67fff3ca7a78adaaa170f148d2`.
After an authorized reset, normalize the 79 repository-wide Prettier findings in a
dedicated formatting change and rerun `pnpm.cmd format:check`.

---

## Task 4.3 formatting remediation

**Status:** Complete. A maintainer reset opened the existing attempt token for this
bounded formatting and final-evidence correction.

### Diagnosis and scope classification

The original Prettier run reported 79 paths. Re-running the check with only
`--end-of-line auto` reduced that to 26 paths: 19 moved/created/rewritten code or
configuration paths and seven moved immutable HTML fixtures. The
remaining 53 reports were untouched production or pre-existing fixture paths whose
only difference was the repository's CRLF checkout under `core.autocrlf=true` against
the prior `endOfLine: lf` rule.

The correction changes the line-ending policy to `auto`, preserving existing checkout
line endings without rewriting unrelated production behavior. It updates the ignored
fixture paths from `__fixtures__` to `tests/fixtures`, so captured response fixtures
remain byte-faithful after the topology migration. Prettier normalized only the
attributable code/configuration files; immutable fixtures were not rewritten.

### TDD cycle evidence

| Task | RED | GREEN | REFACTOR | Status |
| --- | --- | --- | --- | --- |
| 4.3 formatting/evidence | `pnpm.cmd format:check` failed with 79 paths; line-ending-only diagnosis reduced that to 26 topology-attributable paths. | Updated Prettier policy/fixture ignore paths and normalized only attributable code; final format check passed. | Removed generated `coverage/` and `dist/` outputs after verification. | Passed |

### Final verification evidence

| Command | Result |
| --- | --- |
| `pnpm.cmd format:check` | Passed: all matched files use Prettier code style. |
| `pnpm.cmd vitest run --project contract` | 8 files, 33 tests passed. |
| `pnpm.cmd lint` | Passed. |
| `pnpm.cmd typecheck` | Passed. |
| `pnpm.cmd vitest run` | 57 files, 383 tests passed. |
| `pnpm.cmd build` + `dist/` audit | Passed; 0 paths under `tests`, `fixtures`, or `support`. |
| `pnpm.cmd test:coverage` | Passed; 94.36% statements. |

### Correction paths

- `.prettierrc.json` — tolerates repository-native line endings instead of requiring
  a destructive LF rewrite under Windows checkout conversion.
- `.prettierignore` — follows the new `tests/fixtures` topology for captured data.
- `package.json`, `test-topology.ts`, `vitest.config.ts`, `tsconfig*.json`,
  `src/tests/**`, and selected relocated engine test/support files — Prettier-only
  normalization of topology-owned code.

All 14 tasks are now marked complete. Generated `coverage/` and `dist/` outputs were
removed after proof; no product behavior, checkpoint semantics, commits, PRs, or live
host interaction were introduced.

### Native settlement

The resumed attempt token
`sha256:c45fb756b7705ab2da38750b1ef01d2ccafef9165946e9644a2a53f3cae18e13`
settled with `outcome: passed`, remediating
`sha256:b5ad9c9dee241c02344838781e87ba464a8a19d910630e77c7c7c89ca7ed2b3f`.
The native settlement state is `complete` for
`finalize-test-topology-format-and-evidence`.
