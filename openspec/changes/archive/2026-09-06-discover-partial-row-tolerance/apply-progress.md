# Apply Progress: Partial-Row Tolerance in `discover()`

## Work Unit

- Unit: Slice 1 - sweep tolerance, accounting, and summary (PR #1 against the feature/tracker branch).
- Status: Complete. Tasks 1.1-2.3 are complete (8/8).
- Delivery strategy: `auto-chain`; `feature-branch-chain`.
- Scope boundary: Slice 1 and Slice 2 are complete; frontier parity is implemented and no unrelated scope was added.

## Completed Tasks

- [x] 1.1 Adapter RED tests for bounded per-row tolerance.
- [x] 1.2 Adapter and port contracts plus row retry implementation.
- [x] 1.3 Engine, coverage, CLI, storage, and traceability RED tests.
- [x] 1.4 Sweep ledger/accounting/summary/storage implementation.
- [x] 1.5 Refactor and repository-wide formatting check.

## TDD Cycle Evidence

| Task | Test File(s) | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `src/adapters/trf5/site.test.ts` | StubTransport integration | 82 focused tests passed | Site test failed: 3 new tolerance assertions | Site suite passed: 21 tests | 29+1 host defect, host/permanent exhaustion, fatal session/transient paths | Retry loop and reason sanitation extracted; `FetchOutcome` unchanged |
| 1.2 | site, ports, failure-reason, main | Integration | Existing adapter behavior included in 1.1 safety net | Covered by 1.1 | Adapter suite passed | Cap-two retry, tolerated vs. fatal outcomes | Shared outcome-to-reason formatter avoids future frontier duplication |
| 1.3 | scraper, coverage, summary, storage, port audit | Unit/integration | Focused suites passed before edits | Focused command failed: 6 expected assertions | Focused command passed: 91 tests | Complete/subdivided counts, legacy zero, ledger identity, count-based split | Unresolved tally remains orthogonal to state |
| 1.4 | scraper, coverage, summary, checkpoint store | Unit/integration | Focused safety net | Covered by 1.3 | Full suite passed: 48 files / 354 tests | Unresolved and saturated paths differ | Kept items -> coverage -> checkpoint ordering unchanged |
| 1.5 | Quality commands | N/A | Full suite passed before the initial format check | N/A | Focused tests, full tests, and typecheck passed; the first `pnpm.cmd format:check` failed on pre-existing `src/engine/http-status.ts`; the authorized correction rerun passed | N/A | Authorized Prettier-only correction to the bounded out-of-slice `src/engine/http-status.ts`; semantics unchanged |

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused tests | `pnpm.cmd vitest run src/adapters/trf5/site.test.ts src/engine/scraper.test.ts src/engine/coverage.test.ts src/cli/summary.test.ts src/infra/storage/jsonl-checkpoint-store.test.ts src/engine/__fixtures__/ports-coverage-audit.test.ts` - PASS, 6 files / 91 tests |
| Runtime harness | StubTransport synthetic 30-row search with one broken detail page - PASS; no live site and no live 429 calls |
| Full tests | `pnpm.cmd vitest run` - PASS, 48 files / 354 tests |
| Typecheck | `pnpm.cmd typecheck` - PASS |
| Format | First `pnpm.cmd format:check` - FAILED only on the pre-existing, out-of-slice `src/engine/http-status.ts`; authorized `pnpm.cmd exec prettier --write src/engine/http-status.ts`; rerun `pnpm.cmd format:check` - PASS |
| Rollback boundary | Revert ports/site/failure-reason/scraper/coverage/summary/checkpoint-store/main changes and their tests together; no frontier behavior is included. |

## Files Changed

- `src/engine/ports.ts` - unresolved discovery and count contracts.
- `src/engine/failure-reason.ts` - shared outcome formatting helper.
- `src/adapters/trf5/site.ts` - bounded tolerated-row retries and sanitized unresolved data.
- `src/main.ts` - injects the existing retry policy into adapter row retry configuration.
- `src/engine/scraper.ts` - records unresolved rows and count-based coverage/checkpoints.
- `src/engine/coverage.ts`, `src/cli/summary.ts` - separate unresolved tally.
- `src/infra/storage/jsonl-checkpoint-store.ts` - legacy missing count normalized to zero.
- `src/engine/http-status.ts` - authorized Prettier-only correction; no semantic changes.
- Related Slice 1 tests and `tasks.md`.

## Deviations

None. The retry cap and backoff are injected from the existing `RETRY_POLICY`; only `hostDefect` and `permanentError` are tolerated per row. `FetchOutcome` and cell states are unchanged.

## Correction Evidence

The first repository-wide `pnpm.cmd format:check` failed only on the pre-existing, out-of-slice `src/engine/http-status.ts`. The second bounded attempt then ran Prettier only on that file, as explicitly authorized. The subsequent repository-wide `pnpm.cmd format:check` passed; no behavior changed.

## Slice 2 Completion

- Status: Complete. Tasks 2.1-2.3 implement frontier failure-ledger parity.
- Boundary: PR #2 is based on PR #1 and changes only frontier reporting/composition plus their tests.
- Behavior: Every non-ok frontier discover call writes one discovery-stage ledger entry keyed by the frontier work-unit key. Every adapter-declared unresolved row writes one entry keyed by its supplied item identity. Traversal continues to later seeds. `retry-failed` eligibility is unchanged because every new entry has `documentId: null`.
- Files: `src/engine/frontier.ts`, `src/main.ts`, `src/engine/frontier.test.ts`, and `src/main.test.ts`.

### Slice 2 TDD Cycle Evidence

| Task | Test File(s) | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1 | `src/engine/frontier.test.ts`, `src/main.test.ts` | Unit/integration | `pnpm.cmd vitest run src/engine/frontier.test.ts src/main.test.ts` passed: 15 tests | Same command failed: unresolved/failed-seed entries were absent and composed ledger file did not exist | Same command passed: 17 tests | Failed seed plus two opaque unresolved rows, continued traversal, and composition JSONL wiring | Tests use only scripted sites and StubTransport |
| 2.2 | `src/engine/frontier.ts`, `src/main.ts` | Unit/integration | Covered by task 2.1 safety net | Covered by task 2.1 | Shared formatter and required ledger dependency pass focused tests | Non-ok seed uses the shared formatter; unresolved rows are forwarded unchanged | No retry eligibility logic changed |
| 2.3 | Focused/full quality commands | N/A | Focused tests pass after normalization | N/A | Full test/typecheck/format checks pass | N/A | Prettier normalization completed before final verification |

### Slice 2 Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused tests | `pnpm.cmd vitest run src/engine/frontier.test.ts src/main.test.ts` - PASS, 2 files / 17 tests |
| Runtime harness | Scripted frontier SitePort and StubTransport failed-seed composition scenario - PASS; no live site and no live 429 calls |
| Full tests | `pnpm.cmd vitest run` - PASS, 48 files / 356 tests |
| Typecheck | `pnpm.cmd typecheck` - PASS |
| Format | `pnpm.cmd format:check` - PASS |
| Rollback boundary | Revert `src/engine/frontier.ts` and its failure-ledger wiring in `src/main.ts`, together with `frontier.test.ts` and `main.test.ts`; Slice 1 sweep behavior remains intact. |

## Next Recommended

`next_recommended: sdd-verify` - all 8 implementation tasks are complete; run independent verification before archive.

## Remaining Tasks

- None. All implementation tasks are complete; proceed to verification.

## Verification Remediation (failed evidence `sha256:80bcddcb2032f643889a205be0102c976efd10c8026eb4fa5f4b5fc13e96af96`)

- Scope: bounded evidence remediation only; all original 8 tasks remain complete.
- Outcome: added the two previously missing runtime `Scraper` scenarios and corrected the two reported change-related lint errors. No live TRF5 calls were made.

### TDD / Remediation Evidence

| Work item | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| Complete partial discovery emission | `pnpm.cmd vitest run src/engine/scraper.test.ts src/adapters/trf5/site.test.ts` passed: 56 tests | N/A — production behavior already existed; this remediation adds missing runtime proof and does not claim a fabricated failing behavior test | Added a `Scraper` test proving both emitted coverage and checkpoint records keep `state: complete` and `unresolvedItemCount: 1`; focused suite passed: 58 tests | Paired with the saturated/subdivided scenario below | None needed |
| Subdivided partial discovery emission | Same safety net | N/A — same evidence-only remediation constraint | Added a `Scraper` test proving the emitted saturated parent coverage and checkpoint records keep `state: subdivided` and `unresolvedItemCount: 1`; focused suite passed: 58 tests | Under-cap complete and saturated subdivided paths now prove both required state/count combinations | None needed |
| Lint correction | Focused site and scraper suite passed before correction | N/A — no product behavior change | Replaced the unsafe matcher-object assignment with typed behavioral assertions and replaced the control-character regex with character-code sanitation; focused suite and lint passed | Existing reason-length/control-character assertions continue to exercise sanitation | Prettier normalized `src/adapters/trf5/site.ts`; all checks reran |

### Verification Remediation Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused tests | `pnpm.cmd vitest run src/engine/scraper.test.ts src/adapters/trf5/site.test.ts` — PASS, 2 files / 58 tests |
| Runtime harness | In-memory `Scraper` with scripted site/traversal proves complete and subdivided partial-discovery emission into both coverage and checkpoint stores — PASS; no live host calls |
| Lint | `pnpm.cmd lint` — PASS |
| Full tests | `pnpm.cmd vitest run` — PASS, 49 files / 378 tests |
| Typecheck | `pnpm.cmd typecheck` — PASS |
| Format | `pnpm.cmd format:check` — PASS after `pnpm.cmd exec prettier --write src/adapters/trf5/site.ts` |
| Rollback boundary | Revert the two `Scraper` runtime tests and the lint-only changes in `src/adapters/trf5/site.test.ts` and `src/adapters/trf5/site.ts`; no unrelated worktree changes are part of this remediation. |

### Files Changed by This Remediation

- `src/engine/scraper.test.ts` — complete and subdivided partial-discovery runtime emission tests.
- `src/adapters/trf5/site.test.ts` — typed assertions replacing the unsafe matcher-object assignment.
- `src/adapters/trf5/site.ts` — lint-compliant control-character sanitation with equivalent behavior.
- `openspec/changes/discover-partial-row-tolerance/apply-progress.md` — cumulative remediation evidence appended without removing prior Slice 1 or Slice 2 evidence.
