```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:8f60d087b7b789ba59373e5823c807e7310d33bd15a7a2c2eba23b400a1e7ba1
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 9/9
scenarios: 24/24
test_command: pnpm.cmd vitest run
test_exit_code: 0
test_output_hash: sha256:4d78d4ea79e36d7e984c52ad9ff15917af3439796cca85b1eebfb9752682899c
build_command: pnpm.cmd build
build_exit_code: 0
build_output_hash: sha256:29c5ee0f6b0b20dbb259b99d01276198c3d28190090706394608d4deda6d2c0b
```

## Verification Report

**Change**: discover-partial-row-tolerance
**Version**: N/A
**Mode**: Strict TDD
**Scope**: Full change against three delta specifications (9 requirements, 24 scenarios)

### Completeness

| Metric | Value |
|---|---:|
| Tasks total | 8 |
| Tasks complete | 8 |
| Tasks incomplete | 0 |
| Requirements compliant | 9/9 |
| Scenarios compliant | 24/24 |

### Build & Tests Execution

**Focused change tests**: Passed.

```text
pnpm.cmd vitest run src/adapters/trf5/site.test.ts src/engine/scraper.test.ts src/engine/coverage.test.ts src/cli/summary.test.ts src/infra/storage/jsonl-checkpoint-store.test.ts src/engine/__fixtures__/ports-coverage-audit.test.ts src/engine/frontier.test.ts src/main.test.ts
Test Files  8 passed (8)
Tests       110 passed (110)
Exit code   0
Output hash sha256:2f2aae2b3eabddc075854c0e8daf33c8153972e66ffb1e1c4ef4430d8de2a4f7
```

**Full tests**: Passed.

```text
pnpm.cmd vitest run
Test Files  49 passed (49)
Tests       378 passed (378)
Exit code   0
Output hash sha256:4d78d4ea79e36d7e984c52ad9ff15917af3439796cca85b1eebfb9752682899c
```

**Lint**: Passed.

```text
pnpm.cmd lint
Exit code   0
Output hash sha256:050c69da23536758722729aeda55a8d0fb9d557495ef6d33d70873a3b64a71c1
```

**Typecheck**: Passed.

```text
pnpm.cmd typecheck
Exit code   0
Output hash sha256:38ac890c60e7f38d59ddfb410325cdfb5fca83c9411765c5481754e01c021630
```

**Format check**: Passed after verification-generated temporary JSON was removed.

```text
pnpm.cmd format:check
All matched files use Prettier code style.
Exit code   0
Output hash sha256:1d66faad74f5e8709353f7288592866bd3a9095da1174a916e7aa632949971e2
```

**Build**: Passed.

```text
pnpm.cmd build
tsc -p tsconfig.json
Exit code   0
Output hash sha256:29c5ee0f6b0b20dbb259b99d01276198c3d28190090706394608d4deda6d2c0b
```

**Coverage**: Passed against source tests after removing build-generated `dist/` before execution.

```text
pnpm.cmd test:coverage
Test Files  49 passed (49)
Tests       378 passed (378)
Statements  94.35% (1320/1399)
Branches    86.25% (678/786)
Functions   93.54% (290/310)
Lines       96.39% (1177/1221)
Exit code   0
Output hash sha256:6179534a190b24ab9075669a54afb0c5e16da606a4c110e1c07c2c85827b82c0
```

No command contacted the live TRF5 host. Build, coverage, and verification-generated temporary outputs were removed after evidence capture.

### Spec Compliance Matrix

| Capability | Requirement | Scenario | Passing runtime evidence | Result |
|---|---|---|---|---|
| core-coverage-accounting | Unresolved Item Count Is Orthogonal to Cell State | Complete cell with one unresolved row keeps both facts | `scraper.test.ts > emits complete coverage and checkpoint records with the unresolved count for an under-cap partial discovery` | COMPLIANT |
| core-coverage-accounting | Unresolved Item Count Is Orthogonal to Cell State | Subdivided saturated cell with an unresolved row keeps both facts | `scraper.test.ts > emits subdivided coverage and checkpoint records with the unresolved count for a saturated partial discovery` | COMPLIANT |
| core-coverage-accounting | Unresolved Item Count Is Orthogonal to Cell State | Unresolved is never folded into complete | `coverage.test.ts > reports unresolved rows as a separate tally across complete and subdivided cells` | COMPLIANT |
| core-coverage-accounting | Run Summary Arithmetic | Summary matches ledger counts | `coverage.test.ts > reports exact counts derived from the ledger, not an estimate` | COMPLIANT |
| core-coverage-accounting | Run Summary Arithmetic | Subdivided parent is not double-counted | `coverage.test.ts > excludes a subdivided parent from all three tallies, counting only its children` | COMPLIANT |
| core-coverage-accounting | Run Summary Arithmetic | Unresolved rows report as a separate tally, never folded into complete | `coverage.test.ts` separate-tally test and `summary.test.ts > prints unresolved rows on a separate tally line` | COMPLIANT |
| core-scraping-engine | Partial Discovery Travels as Result Data, Never a New Outcome Kind | A set with one unresolved row still returns ok | `site.test.ts > keeps 29 resolved rows, retries one broken detail row, and reports its process number with a bounded reason` | COMPLIANT |
| core-scraping-engine | Partial Discovery Travels as Result Data, Never a New Outcome Kind | FetchOutcome gains no new kind | Passing port audit plus adapter tests; `ports.ts` adds data only to `DiscoverResult` | COMPLIANT |
| core-scraping-engine | Engine Records One Ledger Entry Per Unresolved Row | Unresolved row is ledgered with its real identity | `scraper.test.ts > ledgers each adapter-declared row identity, preserves count-based splitting, and persists the unresolved count` | COMPLIANT |
| core-scraping-engine | Engine Records One Ledger Entry Per Unresolved Row | Every unresolved row gets its own entry | `frontier.test.ts > records one entry per unresolved row and a failed seed, then continues to the next seed`, plus the sweep ledger test | COMPLIANT |
| core-scraping-engine | Engine Stays Adapter-Agnostic About Unresolved Rows | Engine forwards an unresolved reason without interpreting it | Sweep and frontier tests preserve adapter-specific reason strings unchanged | COMPLIANT |
| core-scraping-engine | Frontier Crawl Reaches Ledger Parity With the Sweep | Failed seed search is recorded, not silently skipped | `frontier.test.ts` and `main.test.ts` failed-seed ledger tests | COMPLIANT |
| core-scraping-engine | Frontier Crawl Reaches Ledger Parity With the Sweep | Unresolved rows in a frontier result are ledgered | `frontier.test.ts > records one entry per unresolved row and a failed seed, then continues to the next seed` | COMPLIANT |
| core-scraping-engine | Saturation-Driven Subdivision | Saturated unit is subdivided and children are enqueued | `scraper.test.ts > calls split() on a saturated unit, enqueues its children, and records the parent as subdivided` | COMPLIANT |
| core-scraping-engine | Saturation-Driven Subdivision | Traversal port reports no further subdivision is possible | `scraper.test.ts > records a truncated gap and enqueues nothing when split() returns null` | COMPLIANT |
| core-scraping-engine | Saturation-Driven Subdivision | A misbehaving port cannot cause an infinite loop | `scraper.test.ts > bounds a lineage to the configured max split depth` | COMPLIANT |
| core-scraping-engine | Saturation-Driven Subdivision | Requeued children resume like any other unit | `scraper.test.ts > resumes a subdivided checkpoint by re-splitting it directly` | COMPLIANT |
| core-scraping-engine | Saturation-Driven Subdivision | Partially resolved saturated cell still subdivides | `scraper.test.ts` partial saturated tests assert declared-count splitting and emitted subdivided records | COMPLIANT |
| trf5-adapter | Bounded Per-Row Tolerance Supersedes Whole-Row-Set Abort | Permanently broken detail page is skipped, not fatal | `site.test.ts` synthetic 29-resolved-plus-one-broken scenario | COMPLIANT |
| trf5-adapter | Bounded Per-Row Tolerance Supersedes Whole-Row-Set Abort | hostDefect is retried before being marked unresolved | `site.test.ts` parameterized retry test and request-count assertions | COMPLIANT |
| trf5-adapter | Bounded Per-Row Tolerance Supersedes Whole-Row-Set Abort | permanentError is retried before being marked unresolved | `site.test.ts` parameterized retry test and invalid-token unresolved test | COMPLIANT |
| trf5-adapter | Bounded Per-Row Tolerance Supersedes Whole-Row-Set Abort | sessionExpired still aborts the whole call | `site.test.ts` parameterized immediate-abort test | COMPLIANT |
| trf5-adapter | Bounded Per-Row Tolerance Supersedes Whole-Row-Set Abort | transient still aborts the whole call | `site.test.ts` parameterized immediate-abort test | COMPLIANT |
| trf5-adapter | Unresolved Row Identity Comes From Search-Stage Data | Unresolved row reports its process number, not the unit key | `site.test.ts` asserts process `0000030-00.2026.4.05.8300` | COMPLIANT |

**Compliance summary**: 24/24 scenarios and 9/9 requirements are compliant.

### Correctness (Static Evidence)

| Requirement area | Status | Notes |
|---|---|---|
| Partial discovery contract | Implemented | `DiscoverResult.unresolved` carries opaque row identity and reason; `FetchOutcome` remains unchanged. |
| Adapter tolerance | Implemented | Only `hostDefect` and `permanentError` are retried per row; session/transient outcomes escape immediately. |
| Sweep ledger/accounting | Implemented | Sweep forwards unresolved entries, records the count, and bases saturation on adapter `count`. |
| Summary/storage | Implemented | Summary totals unresolved rows separately; legacy checkpoints normalize missing counts to zero. |
| Frontier parity | Implemented | Frontier requires the failure ledger and records failed seed calls and unresolved rows. |
| Complete/subdivided emission | Implemented and tested | Both combined state/count paths emit matching coverage and checkpoint records. |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Partial success travels as `DiscoverResult` data | Yes | No new `FetchOutcome` kind was added. |
| Retry tolerated detail rows inside the TRF5 adapter | Yes | Retry cap/backoff/sleep are injected from composition. |
| Apply the bounded cap to hostDefect and permanentError | Yes | Both kinds share the per-row retry loop. |
| Share outcome-to-ledger text conversion | Yes | `src/engine/failure-reason.ts` is used by sweep and frontier. |
| Sanitize evidence before crossing the port | Yes | Control characters are normalized and reasons are capped at 256 characters. |
| Saturation is based on declared count | Yes | Runtime tests prove splitting uses `count`, not `items.length`. |

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD evidence reported | Yes | `apply-progress.md` contains Slice 1 and Slice 2 RED/GREEN/REFACTOR tables plus bounded remediation evidence. |
| All tasks have tests | Yes | All 8 checked tasks map to existing focused test files or their directly associated quality commands. |
| RED confirmed (tests exist) | Yes | Every referenced test file exists; original behavior work records specific failing assertions before implementation. |
| GREEN confirmed (tests pass) | Yes | 110/110 focused and 378/378 full-suite tests passed independently. |
| Triangulation adequate | Yes | Adapter outcome variants, sweep/frontier routes, and both complete/subdivided state-count combinations are exercised. |
| Safety net for modified files | Yes | Apply progress records focused or full pre-change safety nets for both slices; remediation is explicitly evidence-only. |

**TDD compliance**: 6/6 checks passed.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|---|---:|---:|---|
| Unit | 28 | 2 | Vitest |
| Integration | 82 | 6 | Vitest, StubTransport, in-memory ports, temporary directories |
| E2E/live | 0 | 0 | Not used; live TRF5 calls were forbidden |
| **Total** | **110** | **8** | |

### Changed File Coverage

| File | Line % | Branch % | Uncovered lines | Rating |
|---|---:|---:|---|---|
| `src/adapters/trf5/site.ts` | 100.00% | 91.66% | None | Excellent |
| `src/engine/scraper.ts` | 96.94% | 93.82% | 177, 203-209 | Excellent |
| `src/engine/coverage.ts` | 98.48% | 90.00% | 111 | Excellent |
| `src/engine/frontier.ts` | 100.00% | 90.00% | None | Excellent |
| `src/engine/failure-reason.ts` | 66.66% | 66.66% | 12, 18 | Low |
| `src/main.ts` | 77.77% | 73.80% | 236-254, 270-273 | Low |
| `src/infra/storage/jsonl-checkpoint-store.ts` | 100.00% | 83.33% | None | Excellent |

Aggregate source line coverage is 96.39%. Type-only `ports.ts` and fully covered `cli/summary.ts` did not receive individual rows in the text report. Coverage below 80% is warning-only under the Strict TDD verification contract.

### Assertion Quality

No tautologies, ghost loops, assertion-free tests, smoke-only assertions, or mock-heavy files were found in the eight focused test files. Empty-array assertions are paired with non-empty behavioral evidence or deliberate contract mutation, and the one `toBeDefined()` assertion is paired with exact value assertions.

**Assertion quality**: All inspected assertions verify real behavior.

### Quality Metrics

**Linter**: Passed with no errors.

**Type checker**: Passed with no errors.

**Formatter**: Passed after removal of a verification-generated temporary JSON report; no source formatting mutation was required.

### Issues Found

**CRITICAL**

None.

**WARNING**

1. Changed-file line coverage is below 80% for `src/engine/failure-reason.ts` (66.66%) and `src/main.ts` (77.77%). This does not block verification under the Strict TDD contract.
2. `pnpm.cmd build` emits `dist/**/*.test.js`; clean-source coverage requires removing `dist/` first so Vitest does not discover compiled duplicate tests. The clean run passed and generated outputs were removed.

**SUGGESTION**

1. Add focused branch tests for `failure-reason.ts` and composition branches in `main.ts` if the team wants every changed production file above 80% line coverage.

### Verdict

**PASS WITH WARNINGS** - all 9 requirements and 24 scenarios have passing runtime evidence; focused tests, full tests, lint, typecheck, format, build, and clean-source coverage pass. Remaining findings are non-blocking coverage and build-output hygiene warnings.
