# Archive Report: Partial-Row Tolerance in `discover()`

## Outcome

`discover-partial-row-tolerance` is archived. Its three delta specifications are now canonical OpenSpec specifications, and the active change directory was moved to its immutable dated archive location.

## Canonical Specifications

| Domain | Action | Canonical path |
|---|---|---|
| `core-coverage-accounting` | Created from the full delta specification | `openspec/specs/core-coverage-accounting/spec.md` |
| `core-scraping-engine` | Created from the full delta specification | `openspec/specs/core-scraping-engine/spec.md` |
| `trf5-adapter` | Created from the full delta specification | `openspec/specs/trf5-adapter/spec.md` |

All three canonical destinations did not previously exist, so each full specification was copied mechanically without merging or dropping unrelated requirements.

## Final State at Close

- Persisted tasks: 8/8 complete; no unchecked implementation tasks.
- Final independent Strict TDD verification: **PASS WITH WARNINGS**; 9/9 requirements and 24/24 scenarios pass.
- Focused evidence: 8 files / 110 tests passed.
- Full evidence: 49 files / 378 tests passed.
- Lint, typecheck, format check, build, and clean-source coverage passed.
- Aggregate line coverage: 96.39%.
- No live TRF5 calls were made.
- No commits were created by this archive phase.

Authoritative final verification evidence is `sha256:8f60d087b7b789ba59373e5823c807e7310d33bd15a7a2c2eba23b400a1e7ba1`; the canonical verify report SHA-256 is `1cafc59337c4c106e26cd99cf0290241381de7af132189d95ff54d63f5c6a408`. Focused remediation closed the two missing combined Scraper scenarios and two lint errors; its settlement evidence is `sha256:da29ae31f1a9fe312b2a79f7419ea6b659b05eeba9e61e14e257cf377b6d6312`.

## Archive Integrity

- Archive destination: `openspec/changes/archive/2026-09-06-discover-partial-row-tolerance/`.
- The archive was snapshotted recursively before moving.
- `git mv` could not acquire `.git/index.lock` in the sandbox; after an empty pre-move byte comparison, the directory was moved with PowerShell `Move-Item`.
- Recursive post-move `git diff --no-index --no-ext-diff --no-textconv` output was empty (exit 0), and the SHA-256 manifest matched across all 9 archived pre-report files.
- The archive report is additive and was intentionally written after that identity comparison.
- Unrelated active change `openspec/changes/reorganize-test-topology/` was left untouched.

## Non-blocking Warnings

1. Changed-file line coverage remains below 80% for `src/engine/failure-reason.ts` (66.66%) and `src/main.ts` (77.77%).
2. Remove generated `dist/` before coverage so Vitest does not discover compiled duplicate tests.
3. The checkpoint record gained additive `unresolvedItemCount` data. Existing records default absent counts to zero, but the delta does not carry a formal migration note; this is a configuration-warning only, not a verification blocker.

## Archived Contents

- `proposal.md`
- `specs/`
- `design.md`
- `tasks.md`
- `apply-progress.md`
- `verify-report.md`
- `archive-report.md`

## Closure

The completed change is archived; no further SDD phase is recommended for this change.