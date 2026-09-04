# Apply Progress: scraper-core

## Cumulative Task Status

- S1 (1.0–1.16): complete — 749 lines actual, accepted `size:exception`.
- S2a (2.3–2.9, 2.14): complete — 808 lines actual.
- S2b (2.1–2.2, 2.10–2.13): complete — 663 lines actual.
- **S3 (3.1–3.14): complete — 835 lines actual (this batch).**
- S4, S5, S6: not started.

## S3 — TRF5 session, search, and content-based validity

**Mode**: Strict TDD
**Branch**: `feat/scraper-core-s3-trf5-session-search` (forked off `feat/scraper-core-s2b-scraper-loop`)
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #4 in the chain, targeting the S2b branch.

### Completed Tasks

- [x] 3.1 `adapters/trf5/__fixtures__/*` — synthetic priming pages, session-expired XML, error pages, class catalogue; `__fixtures__/README.md` personal-data checklist.
- [x] 3.2 RED `session.test.ts` — harvest jsessionid/ViewState/fieldNames/triggerId from actual response content, two runs never share a value.
- [x] 3.3 GREEN `session.ts` (`primeSession`, `parsePrimingPage`).
- [x] 3.4 RED (extend `search.test.ts`) — `text/xml` + `Ajax-Response: redirect` -> `login.seam` triggers re-prime and single replay.
- [x] 3.5 GREEN re-prime + replay wired in `search.ts` (delegates to `session.ts`).
- [x] 3.6 RED (extend `search.test.ts`) — complete documented field set, empty fields as `""`; missing date range rejected before send.
- [x] 3.7 GREEN `search.ts` (`buildSearchRequestBody`, `validateSearchCriteria`).
- [x] 3.8 RED `traversal.test.ts` — `facetName === 'classeJudicial'`; class catalogue fetched over the wire, never hardcoded.
- [x] 3.9 GREEN `classes.ts` (`fetchClassCatalogue`) + `traversal.ts` (`TRF5Traversal.seed`/`.split`, date bisection with mid/mid+1 boundary contract tests).
- [x] 3.10 RED `site.test.ts` — `resultPageCap === 30`, `identityKeyName === 'processNumber'`.
- [x] 3.11 GREEN `site.ts`.
- [x] 3.12 RED `schemas/validity-chain.test.ts` — ordering sessionExpired > unprimedSession > hostDefect, first match wins.
- [x] 3.13 GREEN `schemas/response-view.ts` (`buildResponseView`) + `schemas/validity-chain.ts` (`classifyValidity`, first three branches; `invalidTokenShell`/`validDetail` return `{ kind: 'unclassified' }`, stubbed pending S4).
- [x] 3.14 Confirmed — no live-host string (`trf5.jus.br`, `pjett.`, `http(s)://`) anywhere under `src/adapters/trf5` (grep-verified). `FakeClock` is not exercised in this slice: no adapter code here calls `Clock.sleep` — that composition point is `engine/scraper.ts` (S2b), already proven against `FakeClock` there.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | N/A (fixtures) | N/A | N/A (new) | N/A | N/A | Triangulation skipped: purely data files, no branching logic | N/A |
| 3.2/3.3 | `session.test.ts` | Unit | N/A (new) | ✅ Module-not-found | ✅ 2/2 passed | ✅ 2 fixtures, distinct harvested values | ✅ Clean |
| 3.4/3.5 | `search.test.ts` | Unit + StubTransport | N/A (new) | ✅ Module-not-found | ✅ 1/1 passed | ➖ Single scenario (spec has one) | ✅ Clean |
| 3.6/3.7 | `search.test.ts` | Unit (pure) | ✅ 1/1 (from 3.5) | ⚠️ See note | ✅ 3/3 passed | ✅ 2 cases (populated + missing-range) | ✅ Clean |
| 3.8/3.9 | `traversal.test.ts` | Unit + StubTransport | N/A (new) | ✅ Module-not-found | ✅ 6/6 passed (1 fix-forward on a wrong test expectation, not a production defect) | ✅ 6 cases: facetName, fetch-not-hardcoded, cap bound, already-faceted, even/odd bisection | ✅ Clean |
| 3.10/3.11 | `site.test.ts` | Unit | N/A (new) | ✅ Module-not-found | ✅ 2/2 passed | ✅ 2 constants | ➖ None needed |
| 3.12/3.13 | `schemas/validity-chain.test.ts` | Unit | N/A (new) | ✅ Module-not-found | ✅ 6/6 passed | ✅ 6 cases: 3 fixture matches + 2 direct-object order-priority + 1 unclassified fallthrough | ✅ Clean — search.ts's ad hoc `isSessionExpired` regex refactored to delegate to `classifyValidity`, all 19 S3 tests still green |
| 3.14 | N/A (confirmation) | N/A | N/A | N/A | N/A | N/A | N/A |

**Note on 3.6/3.7 RED**: `buildSearchRequestBody`/`validateSearchCriteria` were built comprehensively (looping over the full documented field-token set) during 3.5's GREEN step, because the re-prime+replay test at 3.4 already required a working request-body builder to exercise the replay path. When the 3.6 tests were written and run, they passed immediately — no independent RED-fail was observed for this task pair. This is disclosed rather than silently reported as a clean RED; the two 3.6 tests still add real, previously-absent coverage (exact per-field resolution with populated values, and the runtime rejection path) and would fail if the mapping or validation logic were wrong.

### Test Summary

- **Total tests written (S3)**: 19
- **Total tests passing (S3)**: 19
- **Full-suite tests passing**: 73/73 (`vitest run`)
- **Layers used**: Unit (13), Unit + StubTransport (6), Integration/E2E: N/A by design (no live host, ever)
- **Approval tests**: None — no refactoring-of-existing-behavior tasks in this slice
- **Pure functions created**: `parsePrimingPage`, `buildSearchRequestBody`, `validateSearchCriteria`, `resolveFieldName`, `parseClassCatalogue`, `buildResponseView`, `classifyValidity`, `daysBetween`/`addDays`/`windowUnit` (traversal bisection)

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/adapters/trf5/session.test.ts src/adapters/trf5/search.test.ts src/adapters/trf5/traversal.test.ts src/adapters/trf5/site.test.ts src/adapters/trf5/schemas/validity-chain.test.ts` → 5 files, 19 tests, all passed |
| Runtime harness command/scenario and exact result | N/A — no detail/document stage or CLI wired yet (per tasks.md S3 row); every scenario is proven through `StubTransport` against synthetic fixtures, which is this slice's actual runtime boundary |
| Rollback boundary | Delete `src/adapters/trf5/{session,search,classes,traversal,site,decode}.ts`, their `.test.ts` files, `src/adapters/trf5/schemas/{response-view,validity-chain}.ts` + test, and `src/adapters/trf5/__fixtures__/`. S1/S2a/S2b (`engine/`, `infra/`) are untouched. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/adapters/trf5/__fixtures__/README.md` | Created | Personal-data checklist for the fixture directory |
| `src/adapters/trf5/__fixtures__/priming-page-{1,2}.html` | Created | Synthetic priming pages with distinct jsessionid/ViewState/trigger per fixture |
| `src/adapters/trf5/__fixtures__/session-expired.xml` | Created | `Ajax-Response: redirect` -> `login.seam` fixture (case 3) |
| `src/adapters/trf5/__fixtures__/unprimed-session.html` | Created | `errorUnexpected.seam` without `PersistenceException` (case 2) |
| `src/adapters/trf5/__fixtures__/host-defect.html` | Created | `errorUnexpected.seam` with `PersistenceException` (case 5) |
| `src/adapters/trf5/__fixtures__/search-ok.xml` | Created | Minimal successful search fragment (row extraction is S4) |
| `src/adapters/trf5/__fixtures__/classes-catalogue.xml` | Created | Synthetic 6-entry class-suggestion catalogue |
| `src/adapters/trf5/__fixtures__/stub-transport.ts` | Created | `StubTransport` (scripted `HttpTransport`), `fixtureResponse`/`loadFixtureBytes` helpers |
| `src/adapters/trf5/decode.ts` | Created | `decodeLatin1` — the general ISO-8859-1 page decoder (design.md D2) |
| `src/adapters/trf5/session.ts` | Created | `primeSession`/`parsePrimingPage` — harvests jsessionid, ViewState, field names, trigger id |
| `src/adapters/trf5/session.test.ts` | Created | Priming harvest + cross-run independence tests |
| `src/adapters/trf5/search.ts` | Created | `buildSearchRequestBody`, `validateSearchCriteria`, `search` (re-prime + single replay) |
| `src/adapters/trf5/search.test.ts` | Created | Re-prime+replay, full field set, missing-date-range rejection |
| `src/adapters/trf5/classes.ts` | Created | `fetchClassCatalogue` — fetches + parses the class suggestion endpoint, never hardcoded |
| `src/adapters/trf5/traversal.ts` | Created | `TRF5Traversal` — `seed`/`split` (date bisection + lazy facet expansion, design.md D4) |
| `src/adapters/trf5/traversal.test.ts` | Created | facetName, fetch-not-hardcoded, maxFacetValues cap, already-faceted null, bisection boundary |
| `src/adapters/trf5/site.ts` | Created | Declared `resultPageCap`/`identityKeyName` constants |
| `src/adapters/trf5/site.test.ts` | Created | Constant-value tests |
| `src/adapters/trf5/schemas/response-view.ts` | Created | `buildResponseView` — normalizes an `HttpResponse` into inspectable booleans (design.md D7) |
| `src/adapters/trf5/schemas/validity-chain.ts` | Created | `classifyValidity` — ordered zod chain, first three branches; `invalidTokenShell`/`validDetail` stubbed |
| `src/adapters/trf5/schemas/validity-chain.test.ts` | Created | Ordering/priority tests including a direct-object overlap case |
| `.gitignore` | Modified | Added `.codegraph/` (local CodeGraph index, machine-specific, not part of the deliverable) |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 3.1–3.14 `[x]`, recorded 835 actual lines |

## Deviations from Design

- **`search.ts`'s session-expiry check started as an ad hoc regex (3.5), later refactored (3.13) to delegate to `classifyValidity`.** Not a deviation from design.md D7 — the end state is exactly the single-source-of-truth zod chain the design specifies — but the *sequencing* (ad hoc first, canonical chain second) was a strict-TDD sequencing choice: task 3.4/3.5 land before 3.12/3.13 in tasks.md, and the RED-before-GREEN rule forbids building `validity-chain.ts` production code ahead of its own dedicated RED test. The REFACTOR step at 3.13 removed the duplication once the canonical classifier existed; all 19 S3 tests stayed green through that refactor.
- **`site.ts` exports only the two declared constants (`resultPageCap`, `identityKeyName`), not a full `SitePort<TItem, TDoc>` implementation.** tasks.md 3.10/3.11 scope this to "the declared constants" — a full `TRF5Site` class needs `TItem`/`TDoc` types that only exist once S4's payload assembly lands. Documented in `site.ts`'s own header comment.
- **`TRF5Traversal.split()` performs both date bisection and lazy facet expansion**, matching design.md's `Partitioning` pseudocode and D4, even though the pseudocode's prose separates them into two conceptual steps. The `TraversalPort.split()` contract is the engine's *only* point of contact for "expand this unit" — the pseudocode's `else if facetValue==null -> expand` branch is what `split()` does internally, not a second engine-side call. No engine code (`scraper.ts`) was touched; this slice only proves `traversal.ts`'s own `seed`/`split` in isolation, as scoped by 3.8/3.9. Wiring `traversal.split()`'s requeue-on-saturation into the engine loop is not yet done anywhere in the codebase (S1/S2a/S2b did not do it either) and is out of S3's scope.
- **Search form field defaults (including `estadoComboOAB`) are empty string `""`, not the JBoss Seam `NoSelectionConverter` sentinel** that `docs/RESEARCH.md` §2 Step 2 shows as the real captured default. This follows the trf5-adapter spec's own scenario text literally ("every documented form field ... is present, empty ones as empty strings", explicitly listing `estadoComboOAB`), which is this slice's acceptance criterion. Flagging for awareness: a live-host smoke test (out of scope here, manual-only per project convention) should confirm the server accepts `""` for that field the same way it accepts the converter sentinel.

## Issues Found

None blocking. See the two notes above (3.6/3.7 RED and `estadoComboOAB` default) for transparency on judgment calls made under strict TDD sequencing and spec-vs-research reconciliation.

## Workload / PR Boundary

- Mode: chained PR slice (`feature-branch-chain`)
- Current work unit: S3 — TRF5 session, search, and content-based validity
- Boundary: starts from S2b's merged state (`engine/`, `infra/` untouched); ends with a fully tested `src/adapters/trf5/` session/search/traversal/validity-chain layer, stubbed detail/payload branches explicitly deferred to S4
- Estimated review budget impact: 835 authored lines (vs. 800 budget, vs. ~550/600 estimate) — 4.4% over budget, consistent with every prior measured slice in this change also exceeding its estimate (S1 749/380, S2a 808/~390, S2b 663/~390). Not renegotiated; reported for the orchestrator's awareness before S4 is estimated.

### Status

14/14 S3 tasks complete (3.1–3.14). 835/835 lines committed to this slice. Ready for `sdd-verify`, or `sdd-apply` again for S4.
