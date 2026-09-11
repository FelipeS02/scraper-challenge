# Proposal: Reorganize Test Topology

## Intent

Make test ownership and scope visible from paths, classify every suite once, and exclude test artifacts from production emission without changing behavior.

## Scope

### In Scope
- Move suites into component-owned `tests/unit`, `tests/integration`, or `tests/contract`; reserve `src/tests/integration` for cross-component suites.
- Put immutable bytes in `tests/fixtures` and executable helpers in `tests/support`; fixtures contain no suites.
- Split `src/engine/scraper.test.ts` by behavior seam, preserving test identities and assertions through one shared harness.
- Define exactly three disjoint Vitest projects (`unit`, `integration`, `contract`), project scripts, and a topology inventory contract.
- Separate production emission from editor/test typechecking while preserving typed ESLint discovery.
- Migrate in reviewable component slices because moves may exceed 400 changed lines.

### Out of Scope
- Runtime behavior, public APIs, coverage semantics, and checkpoint selection, invalidation, or persistence.
- A fourth Vitest project, live-site testing, browser automation, or delivery/PR creation during planning.

## Capabilities

### New Capabilities
None. This is a behavior-preserving structural refactor.

### Modified Capabilities
None. Existing product requirements remain unchanged.

## Approach

Add a failing inventory contract, then migrate CLI, infrastructure, TRF5 adapter, engine, and cross-component tests in slices. Use exclusive Vitest includes, preserve collected test identities/counts, and change imports only. The topology and engine harness are portal-agnostic; TRF5 fixtures, support, and suites remain PJe-TRF5-specific.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/**/tests/**`, `src/tests/integration/**` | Modified | Classified suites, fixtures, and support |
| `src/engine/scraper.test.ts` | Removed | Replaced by seam-focused suites and shared harness |
| `vitest.config.ts`, `package.json` | Modified | Projects, scripts, inventory enforcement |
| `tsconfig*.json`, `eslint.config.js` | Modified | Build/test separation and typed lint coverage |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Missed ESM import rewrite | Medium | Typecheck and run each project per slice |
| Duplicate or omitted suite | Medium | Enforce exactly-once inventory |
| Fixture loader path regression | Medium | Keep stable component-owned URLs and byte assertions |
| Large mechanical diff | High | Preserve rename lineage and use reviewable component slices |

## Rollback Plan

Revert slices in reverse order, restoring original paths and configuration. No data or checkpoint migration is required.

## Dependencies

- Clean feature-branch baseline.
- Vitest 4.1.11 and the current behavior suite.

## Success Criteria

- [ ] Every `*.test.ts` is classified exactly once by one of three named projects.
- [ ] All-project and per-project runs preserve baseline test identities and assertions.
- [ ] Production build emits no test, fixture, or support files.
- [ ] Test/editor typechecking and typed ESLint pass for moved files.
- [ ] No production behavior or checkpoint semantics change.
