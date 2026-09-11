# Test Topology Baseline

Captured before any topology migration on 2026-09-07.

## Inventory

- Git-tracked `src/**/*.test.ts` files: 48 (`docs/test-topology-baseline-files.txt`).
- Vitest-discovered suite files: 49.
- Vitest-discovered test identities: 378 (`docs/test-topology-baseline-list.json`).
- The JSON list is the canonical identity multiset for this change; each entry records the full test title and source file.

## Baseline command results

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm.cmd vitest list --json` | exit 0 | 378 test identity records written to `docs/test-topology-baseline-list.json`. |
| `pnpm.cmd vitest run` | exit 1 | 49 suite files; 377 passing tests, 1 failing test. |

## Pre-existing failure

`src/main.test.ts` has one failing assertion before this change:

```text
runScraper — the composition root wiring (S5e) > persists a fetched document under pdfsDir...
expected Buffer length 135; received 141
src/main.test.ts:176
```

No topology files or production behavior were changed before this baseline run. Strict TDD therefore blocks the migration until the owning change establishes a passing baseline or explicitly scopes this failure as accepted evidence.

## Identity and assertion parity rule

The migration must preserve the 378 Vitest identity records and the existing assertion outcomes. The current baseline is not green because of the one unrelated `main.test.ts` byte-length assertion above; it must not be altered by this topology-only change.

## Reverse rollback

Remove this baseline/evidence file and restore moved tests/configuration in reverse work-unit order. No production or checkpoint behavior is included in the planned topology migration.

## Migration evidence

- The document fixture is declared binary in `.gitattributes`, so Git does not convert
  its six LF bytes to CRLF on checkout. The migration preserves its canonical 135-byte
  payload.
- The 378 baseline identities were preserved exactly. The new topology contract adds
  five tests, giving 383 passing tests in 57 suite files.
- Unit (235), integration (115), contract (33), full-suite, typecheck, build, lint,
  and coverage checks passed. The `dist/` audit found no `tests`, `fixtures`, or
  `support` artifacts.
- `pnpm.cmd format:check` remains blocked by repository-wide Prettier drift: 79 files,
  including untouched production sources and fixture HTML. This change does not
  reformat unrelated files or alter fixture bytes.

## Work-unit evidence

| Work unit | Focused evidence | Rollback boundary | Result |
| --- | --- | --- | --- |
| 1 Baseline/config | Baseline re-run and contract project | config, contract, docs | Passed |
| 2 CLI/infra moves | Unit and integration projects | CLI and infra tests | Passed |
| 3 TRF5/engine moves | All projects | TRF5/engine tests, fixtures, support | Passed |
| 4 Cross-component/identity | Full suite and identity comparison | `src/tests/integration` | Passed |
| 5 Verification | typecheck, build, lint, coverage | generated output only | Format check blocked |
| 6 Documentation | README and this evidence record | documentation only | Passed |
