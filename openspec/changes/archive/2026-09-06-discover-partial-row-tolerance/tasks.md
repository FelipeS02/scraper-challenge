# Tasks: Partial-Row Tolerance in `discover()`

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 600-800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 sweep deliverables 1-5 -> PR #2 frontier parity 6-7 |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Sweep tolerance, accounting, summary | #1 base: feature/tracker branch | `pnpm vitest run src/adapters/trf5/site.test.ts src/engine/scraper.test.ts src/engine/coverage.test.ts` | StubTransport: 30 rows, one broken detail | Revert ports/site/scraper/storage/summary changes together |
| 2 | Frontier ledger parity | #2 base: PR #1 branch | `pnpm vitest run src/engine/frontier.test.ts src/main.test.ts` | StubTransport seed search plus failed/partial rows | Revert frontier/main wiring only |

## Phase 1: Slice 1 - Sweep Deliverables 1-5

- [x] 1.1 **RED:** In `src/adapters/trf5/site.test.ts`, prove 29+1 host defect, capped host/permanent retries, process-number identity, bounded sanitized reason, and immediate sessionExpired/transient abort.
- [x] 1.2 **GREEN:** Add unresolved contracts in `src/engine/ports.ts`; add shared `src/engine/failure-reason.ts`; make `src/adapters/trf5/site.ts` retry tolerated rows and return ok data only.
- [x] 1.3 **RED:** Extend `src/engine/scraper.test.ts`, `src/engine/coverage.test.ts`, `src/cli/summary.test.ts`, `src/infra/storage/jsonl-checkpoint-store.test.ts`, and `src/engine/__fixtures__/ports-coverage-audit.test.ts`: per-row ledger identity/reason, count-based split, complete/subdivided counts, legacy zero, separate tally, traceability.
- [x] 1.4 **GREEN:** Update `src/engine/scraper.ts`, `src/engine/coverage.ts`, `src/cli/summary.ts`, and `src/infra/storage/jsonl-checkpoint-store.ts` to ledger opaque rows, persist counts, normalize absent counts, and retain items -> coverage -> checkpoint ordering.
- [x] 1.5 **REFACTOR:** Simplify Slice 1 without changing FetchOutcome/state semantics; run `pnpm vitest run`, `pnpm typecheck`, and `pnpm format:check`. No live-site or 429 test.

## Phase 2: Slice 2 - Frontier Parity Deliverables 6-7

- [x] 2.1 **RED:** In `src/engine/frontier.test.ts` and `src/main.test.ts`, require one ledger entry per unresolved row and per non-ok seed search, continued traversal, shared reason text, and composition wiring.
- [x] 2.2 **GREEN:** Require and use `FailureLedger` in `src/engine/frontier.ts`; wire it in `src/main.ts`; reuse `src/engine/failure-reason.ts` without retry-failed eligibility changes.
- [x] 2.3 **REFACTOR:** Run the focused harnesses, `pnpm vitest run`, `pnpm typecheck`, and `pnpm format:check`; verify #2 targets only PR #1. Threat matrix is N/A: no routing, shell, subprocess, VCS, executable, or process-boundary cases apply.
