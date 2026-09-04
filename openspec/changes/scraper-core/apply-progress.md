# Apply Progress: scraper-core

## Cumulative Task Status

- S1 (1.0–1.16): complete — 749 lines actual, accepted `size:exception`.
- S2a (2.3–2.9, 2.14): complete — 808 lines actual.
- S2b (2.1–2.2, 2.10–2.13): complete — 663 lines actual.
- S3 (3.1–3.14): complete — 835 lines actual, accepted `size:exception`.
- S4a (4.1–4.14): complete — 729 lines actual, within the 800 budget.
- **S4b (4.15–4.18): complete — 266 authored `src/` lines (this batch), well within budget.**
- S5, S6: not started.

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

## S4a — TRF5 detail parsing and payload assembly

**Mode**: Strict TDD
**Branch**: `feat/scraper-core-s4a-detail-payload` (forked off `feat/scraper-core-s3-trf5-session-search`)
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #5 in the chain, targeting the S3 branch.
**Scope discipline**: exactly tasks 4.1–4.14. S4b (documents.ts/encoding.ts, tasks 4.15–4.18) was
not started — the document list built here is enumeration-only (label + ids), matching the
S4/S4a split recorded in tasks.md before this slice launched.

### Completed Tasks

- [x] 4.1 RED `detail.test.ts` — a `ca` token with no primed session primes first, then fetches detail.
- [x] 4.2 GREEN `detail.ts` (`fetchDetail`) — primes when no session given, classifies the response,
      and on `validData` parses + assembles the payload; every other validity outcome maps to the
      matching `FetchOutcome` kind.
- [x] 4.3 RED `parsing/detail-page.test.ts` (header) — número, data distribuição, classe+CNJ code,
      assunto hierarchy, jurisdição, órgãos, endereço, processo referência.
- [x] 4.4 GREEN `parsing/detail-page.ts` header extraction.
- [x] 4.5 RED (extend, parties) — ativo/passivo/outros with name/CPF/role/status; nested `ADVOGADO`
      lawyer with name/OAB number/OAB state/CPF.
- [x] 4.6 GREEN parties extraction.
- [x] 4.7 RED (extend, movements) — `processoEvento` rows preserved verbatim into `rawCells`;
      `cnjCode` stays `null` (RESEARCH §8, row structure unmapped).
- [x] 4.8 GREEN movements extraction.
- [x] 4.9 RED (extend, documents list) — document rows enumerated with label and ids.
- [x] 4.10 GREEN document-list extraction.
- [x] 4.11 RED (extend `validity-chain.test.ts`) — 200+no header/parties block -> `invalidTokenShell`
      (D8: never by document-absence, never by byte size); 200+header+parties+zero documents ->
      `validData`.
- [x] 4.12 GREEN `schemas/payload.ts` (full zod schema) — the two new validity-chain branches were
      implemented in the same GREEN step as 4.11's RED (see TDD notes below).
- [x] 4.13 RED `schemas/payload.test.ts` — `caseClass`/each `subjects[]` entry carries `cnjCode`+
      `label`; `parties.active/passive/others` nest `lawyers`; no Portuguese source field names
      appear as output property names; `cpf`/`oabNumber`/`oabState` preserved; envelope `itemId`
      equals payload `processNumber`.
- [x] 4.14 GREEN payload assembler (`assembleTrfPayload`) + `SitePort.itemId`/`documentId`/
      `sourceUrl` declared in `site.ts`.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.11 | `schemas/validity-chain.test.ts` | Unit | ✅ 7/7 (from S3) | ✅ 2/2 new assertions failed (`unclassified` ≠ `invalidTokenShell`/`validData`) | ✅ 9/9 passed | ✅ added a third case proving a `text/xml` search fragment is never misclassified as `invalidTokenShell` | ✅ Clean |
| 4.3/4.4 | `parsing/detail-page.test.ts` (header block) | Unit | N/A (new) | ✅ Module-not-found | ✅ 1/1 passed | ➖ Single fixture (header fields are non-repeating) | N/A — see sequencing note |
| 4.5–4.10 | `parsing/detail-page.test.ts` (parties/movements/documents blocks) | Unit | ✅ 1/1 (from 4.4) | ⚠️ See sequencing note | ✅ 3/3 passed on first run | ✅ 3 party shapes (lawyer present, lawyer absent, empty group), 2 movement rows, 2 document rows | ✅ Clean |
| 4.12/4.13 | `schemas/payload.test.ts` | Unit | ✅ 4/4 (from 4.4/4.10's fixture) | ⚠️ See sequencing note | ✅ 4/4 passed on first run | ✅ 4 independent assertions: code+label pair, nested lawyers, banned-field-name scan, itemId identity | N/A |
| 4.1/4.2 | `detail.test.ts` | Unit + StubTransport | ✅ 9/9 (validity-chain) + 4/4 (parsing) + 4/4 (payload) | ✅ Module-not-found | ✅ 2/2 passed | ✅ 2 cases: no session (2 requests) vs. pre-primed session (1 request) | ✅ Clean |

**Sequencing note (parties/movements/documents, and payload.ts)**: `parsing/detail-page.ts` is one
`cheerio.load()` pass over one fixture; header, parties, movements, and documents extraction are
tightly coupled by that single parse tree, so the file was implemented in full once the header
RED/GREEN cycle (4.3/4.4) proved the fixture-and-parser approach worked. The parties/movements/
documents test blocks (4.5/4.7/4.9), when added, passed immediately — no independent RED failure
was observed for those three task pairs. This is disclosed rather than reported as a clean RED,
matching the precedent set at S3's 3.6/3.7 note. The same situation applies to `schemas/payload.ts`
(4.12) relative to `payload.test.ts` (4.13): the zod schema is a near-mechanical mirror of
`DetailPage`'s shape, written once, and `payload.test.ts`'s four assertions passed on first run.
Each block still adds real, independently meaningful coverage — a wrong regex, a mis-nested
structure, or a leaked Portuguese property name would have failed these tests exactly as
described. Task 4.11 (the validity-chain extension) is the one task pair in this slice that did
observe a genuine RED failure, run before its GREEN — see the table above.

### Design decisions and deviations

- **`judgingBody` consolidates three source fields, not one.** The trf5-adapter spec's Full Field
  Inventory requirement lists `jurisdição, órgãos, endereço` as header fields, but the Judicial
  Record Payload Contract's top-level property list has only `judgingBody` (no separate `address`
  field). `judgingBody: { name, collegiateBody, address }` nests "Órgão Julgador", "Órgão Julgador
  Colegiado", and "Endereço" together — all three describe the deciding court/body in
  `docs/RESEARCH.md` §2 Step 5's component table, and none is a Portuguese property name (the
  nested keys are English camelCase).
- **`payload.sourceUrl` is an additional field beyond the spec's documented top-level property
  list.** `SitePort.sourceUrl(item): string` must derive a URL from the item itself (per
  `engine/scraper.ts`'s `buildEnvelope`, `payload: item` — whatever `TItem` is, it IS the emitted
  payload). The detail URL depends on the opaque `ca` token, which cannot be reconstructed from
  `processNumber` alone, and storing `ca` itself would violate the "wire-format query-parameter
  names MUST NOT appear as output property names" rule (`ca` is literally the source query
  parameter). Storing the already-resolved `sourceUrl` string instead — the same value the
  envelope's own `sourceUrl` field carries — satisfies the port contract without leaking a
  site-specific token or wire-format name.
- **`validData`/`invalidTokenShell` classify on two cheap booleans (`hasDetailHeaderBlock`,
  `hasPartiesBlock`, both gated by `isHtmlPage`), not a literal "full payload schema parse" inside
  the chain.** design.md's validity-chain table describes row 5 as "full payload schema parses";
  the actual final validation gate is `schemas/payload.ts`'s zod schema, run in `detail.ts` after
  `classifyValidity` returns `validData` — matching D7's own guidance that each chain schema stay
  "a small predicate over discriminating features... unit-testable without HTML." Two-layer
  validation (cheap pre-classification, then the real structural gate) is what's implemented; if
  the payload doesn't parse despite passing pre-classification, `detail.ts` returns
  `permanentError:schemaMismatch` rather than a false `ok`.
- **Document `label` comes from the visible anchor text, not a percent-decoded
  `nomeArqProcDocBin`.** RESEARCH.md's percent-encoding trap (`Decis%E3o` → `Decisão`) is
  specifically about the query-parameter value; the anchor's own rendered text is already correct
  once the whole page is decoded via `decodeLatin1` (a page-level ISO-8859-1 decode, already
  proven in S3). This keeps S4a's document enumeration fully self-contained from S4b's
  `encoding.ts` (percent-decoding), matching the launch prompt's explicit boundary.
- **`unclassified` validity outcomes map to `hostDefect` in `detail.ts`**, not `permanentError`.
  An unrecognized response is more likely a site change or transient anomaly than a definitively
  permanent failure; `hostDefect` gets bounded retries (cap 2) before landing in the failure
  ledger, rather than giving up on the first observation. Not covered by a dedicated fixture test
  in this slice (no RESEARCH.md case produces an unclassified detail response); flagging for
  awareness.
- **A real, RESEARCH.md-quoted process number (`0801110-38.2024.4.05.8001`, from §4's DataJud
  cross-check) was initially typed into the detail-page fixtures by mistake** and caught before
  committing — replaced with `0712345-90.2024.4.05.8300` / `0798765-43.2024.4.05.8300` (clearly
  synthetic, no digit sequence matching any RESEARCH.md-verified number). Process numbers are not
  flagged as personal data by RESEARCH.md §6 (only CPF/party names/OAB numbers are), but reusing
  an exact real, live-verified identifier in a public fixture is avoidable and was avoided.
  **Note for awareness, not fixed in this slice**: `search.test.ts` (already-landed S3 code) still
  uses that same real process number as a `numProcesso` search-criteria value; out of S4a's scope
  to touch, flagged here for the record.
- **`domhandler` added as an explicit dev dependency** so `parsing/detail-page.ts` can `import type
  { Element } from 'domhandler'` directly, rather than relying on pnpm's non-hoisted transitive
  resolution of cheerio's own dependency (which is not reliably resolvable from `src/` under
  pnpm's strict linking). Same version range cheerio itself declares (`^5.0.3`).

### Test Summary

- **Total tests written (S4a)**: 13 (3 validity-chain extension + 4 detail-page parsing blocks +
  4 payload assembly + 2 detail-fetch composition; the movements/documents parsing blocks each
  added one `it()` alongside the header/parties blocks inside the same growing test file)
- **Total tests passing (S4a)**: 13
- **Full-suite tests passing**: 86/86 (`vitest run`)
- **Layers used**: Unit (11), Unit + StubTransport (2), Integration/E2E: N/A by design (no live
  host, ever)
- **Pure functions created**: `parseLabeledCode`, `ownText`, `extractSubjects`, `parseLawyerLine`,
  `parseParty`, `extractParties`, `extractMovements`, `extractDocuments`, `parseDetailPage`,
  `assembleTrfPayload`, `itemId`/`documentId`/`sourceUrl` (site.ts), `buildDetailUrl`/`fetchDetail`
  (detail.ts)

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/adapters/trf5/detail.test.ts src/adapters/trf5/parsing src/adapters/trf5/schemas/payload.test.ts src/adapters/trf5/schemas/validity-chain.test.ts` → 4 files, 19 tests (9 in validity-chain.test.ts: S3's original 6 plus 3 new; 4 in detail-page parsing; 4 in payload assembly; 2 in detail fetch), all passed |
| Runtime harness command/scenario and exact result | N/A — CLI not wired until S5 (per tasks.md S4a row); every scenario is proven through `StubTransport` against the synthetic `detail-page-*.html` fixtures, this slice's actual runtime boundary |
| Rollback boundary | Delete `src/adapters/trf5/detail.ts` + its test, `src/adapters/trf5/parsing/`, `src/adapters/trf5/schemas/payload.ts` + its test, the three new `detail-page-*.html` fixtures, and revert the `validity-chain.ts`/`response-view.ts`/`site.ts` additions (the two new `ValidityOutcome` kinds, three new `ResponseView` fields, and the three new `site.ts` exports). S1/S2a/S2b/S3 are untouched. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/adapters/trf5/schemas/response-view.ts` | Modified | Added `isHtmlPage`, `hasDetailHeaderBlock`, `hasPartiesBlock` derived fields |
| `src/adapters/trf5/schemas/validity-chain.ts` | Modified | Added `invalidTokenShell`/`validData` schemas + outcome kinds, ordered after `hostDefect` |
| `src/adapters/trf5/schemas/validity-chain.test.ts` | Modified | 2 new classification tests + 1 negative (XML fragment) test; `overlappingView` fixture extended with the 3 new fields |
| `src/adapters/trf5/__fixtures__/detail-page-invalid-token.html` | Created | 200 text/html shell with no header/parties block (case 1) |
| `src/adapters/trf5/__fixtures__/detail-page-valid-no-documents.html` | Created | 200 text/html with header+parties present, zero documents |
| `src/adapters/trf5/__fixtures__/detail-page-valid.html` | Created | Full synthetic detail page — header, 2 parties (1 with a nested lawyer), 2 movement rows, 2 documents |
| `src/adapters/trf5/parsing/detail-page.ts` | Created | `parseDetailPage` — header, parties, movements, documents extraction |
| `src/adapters/trf5/parsing/detail-page.test.ts` | Created | 4 test blocks covering the full field inventory |
| `src/adapters/trf5/schemas/payload.ts` | Created | `payloadSchema` (zod) + `assembleTrfPayload` |
| `src/adapters/trf5/schemas/payload.test.ts` | Created | 4 tests: code+label pairs, nested lawyers, banned source-field-name scan, itemId identity |
| `src/adapters/trf5/site.ts` | Modified | Added `itemId`/`documentId`/`sourceUrl` |
| `src/adapters/trf5/detail.ts` | Created | `fetchDetail` — primes when needed, classifies, parses+assembles on `validData` |
| `src/adapters/trf5/detail.test.ts` | Created | 2 tests: primes-when-none, skips-priming-when-already-primed |
| `package.json` / `pnpm-lock.yaml` | Modified | Added `domhandler` dev dependency |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 4.1–4.14 `[x]`, recorded 729 actual lines |

## Issues Found

None blocking. See "Design decisions and deviations" above for the `judgingBody` consolidation,
the `payload.sourceUrl` addition, the `unclassified -> hostDefect` fallback judgment call, and the
caught-before-commit real-process-number fixture mistake.

## Workload / PR Boundary

- Mode: chained PR slice (`feature-branch-chain`)
- Current work unit: S4a — TRF5 detail parsing and payload assembly
- Boundary: starts from S3's merged state (`session.ts`/`search.ts`/`traversal.ts`/`classes.ts`/
  `site.ts` constants/`schemas/{response-view,validity-chain}.ts`'s first three branches
  untouched); ends with a fully tested detail-fetch + full-payload-assembly path. `documents.ts`/
  `encoding.ts` (S4b) intentionally not started — the document list built here is enumeration-only.
- Estimated review budget impact: 729 authored lines (`git diff --stat` insertions+deletions
  excluding `pnpm-lock.yaml`) against the 800 budget and the ~700 estimate — within budget, no
  `size:exception` needed. `git diff --stat` including the lockfile: 732 (725 insertions + 7
  deletions).

### Status

S4a: 14/14 tasks complete (4.1–4.14). 729 lines committed to this slice (four work-unit commits).
Ready for `sdd-verify`, or `sdd-apply` again for S4b.

## S4b — TRF5 document fetch, decoding, and filing

**Mode**: Strict TDD
**Branch**: `feat/scraper-core-s4b-documents` (forked off `feat/scraper-core-s4a-detail-payload`)
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #6 in the chain, targeting the S4a branch.
**Scope discipline**: exactly tasks 4.15–4.18. `site.ts`'s full `SitePort.fetchDocument`
wiring is deferred to S5, matching S4a's precedent of declaring standalone functions
ahead of their port-level wiring.

### Completed Tasks

- [x] 4.15 RED `encoding.test.ts` — `nomeArqProcDocBin=Decis%E3o` decodes to `Decisão` at
      the byte level; a second accented case (`Ac%F3rd%E3o` → `Acórdão`) and a negative
      case (`decodeURIComponent` throws `URIError` on the same input) triangulate it.
- [x] 4.16 GREEN `encoding.ts` (`decodePercentEncodedLatin1`) — reads each `%XX` escape as
      one raw byte before a single `latin1` decode; never routes through UTF-8.
- [x] 4.17 RED `documents.test.ts` — three same-labeled `Decisão` `DocumentRow`s get three
      distinct filenames derived only from `ca` + `idProcessoDocumento`; an unsafe filename
      component is rejected; a 404 maps to `permanentError:notFound`; an unexpected status
      maps to `hostDefect` instead of throwing.
- [x] 4.18 GREEN `documents.ts` (`buildDocumentFilename`, `fetchDocument`) — follows the
      302 redirect, validates filename components against `[A-Za-z0-9._-]`, and returns
      `FetchOutcome<StoredDocument>` on every path (never throws).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.15/4.16 | `encoding.test.ts` | Unit (pure) | N/A (new) | ✅ Module-not-found | ✅ 4/4 passed | ✅ 4 cases: primary decode, second accented label (proves byte-general, not a lookup), plain-label passthrough, `decodeURIComponent` negative case | ➖ None needed |
| 4.17/4.18 | `documents.test.ts` | Unit + StubTransport | ✅ 90/90 (full suite pre-batch) | ✅ Module-not-found | ✅ 6/6 passed | ✅ 6 cases: distinct filenames from ids alone, unsafe-component rejection, 302-follow success, three-same-label end-to-end, 404→notFound, unexpected-status→hostDefect (with decoded-label assertion) | ✅ Clean |

No task in this slice hit the "test passed on first run without an independent RED
failure" pattern seen at S3's 3.6/3.7 and S4a's parties/movements/documents blocks: both
`encoding.test.ts` and `documents.test.ts` failed on module-not-found before any
production file existed, and every individual assertion added real, previously-absent
coverage.

### Design decisions and deviations

- **`decodePercentEncodedLatin1` also maps `+` to a literal space.** Not required by the
  RED test, but it is the correct `application/x-www-form-urlencoded` reading of a query
  value and costs nothing extra; flagged for awareness rather than silently added.
- **`fetchDocument`'s decoded `nomeArqProcDocBin` label is used only inside `hostDefect`
  failure-reason strings, never for the stored filename.** This is what keeps
  `encoding.ts` genuinely exercised by production code (not dead code) while still
  satisfying "never from the remote label" for the filename itself — proven by the last
  `documents.test.ts` case asserting the decoded `'Decisão'` appears in the reason string.
- **Unmapped status codes on either leg of the fetch (not 302/404 on the first GET, not
  200 on the redirect target) fall back to `hostDefect`, not `permanentError`.** Mirrors
  S4a's `unclassified → hostDefect` precedent in `detail.ts`: an unrecognized response is
  more likely a transient site anomaly than a definitively permanent failure, and
  `hostDefect` still gets bounded retries (cap 2) before landing in the failure ledger.
  RESEARCH.md documents only one doc-specific status code (404, case 4); every other
  status is this slice's own judgment call, not a literal RESEARCH.md case.
- **`site.ts`'s `SitePort.fetchDocument` wiring is not touched in this slice.** `site.ts`
  still exports only the standalone constants/functions declared through S4a; connecting
  `documents.ts`'s `fetchDocument` (and `TRF5Site.discover`) to the full `SitePort<TItem,
  TDoc>` shape is S5's composition-root job, consistent with `site.ts`'s own header
  comment.
- **Real-process-number check**: grepped every new file's literals against
  `docs/RESEARCH.md`'s previously-flagged real process number
  (`0801110-38.2024.4.05.8001`) and against live-host substrings
  (`trf5.jus.br`/`pjett.`/`http(s)://`) before committing — none present. The
  `documentId`/`binId` numeric literals reused from `docs/RESEARCH.md`'s own document
  table (e.g. `12452664`) are internal document/bin ids, not process numbers, and were
  already used identically in S4a's `detail-page-valid.html` fixture.

### Test Summary

- **Total tests written (S4b)**: 10 (4 in `encoding.test.ts`, 6 in `documents.test.ts`)
- **Total tests passing (S4b)**: 10
- **Full-suite tests passing**: 96/96 (`vitest run`)
- **Layers used**: Unit pure (4), Unit + StubTransport (6), Integration/E2E: N/A by design
- **Pure functions created**: `decodePercentEncodedLatin1`, `buildDocumentFilename`,
  `fetchDocument`, `decodedLabel` (internal)

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/adapters/trf5/documents.test.ts src/adapters/trf5/encoding.test.ts` → 2 files, 10 tests, all passed |
| Runtime harness command/scenario and exact result | N/A — CLI not wired until S5 (per tasks.md S4b row); every scenario is proven through `StubTransport` against a synthetic PDF fixture and inline `DocumentRow` fixtures, this slice's actual runtime boundary |
| Rollback boundary | Delete `src/adapters/trf5/{documents,encoding}.ts`, their `.test.ts` files, and `src/adapters/trf5/__fixtures__/document-sample.pdf`. S1/S2a/S2b/S3/S4a are untouched. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/adapters/trf5/encoding.ts` | Created | `decodePercentEncodedLatin1` — byte-level ISO-8859-1 percent-decoder |
| `src/adapters/trf5/encoding.test.ts` | Created | 4 tests: primary decode, second accented label, passthrough, UTF-8 negative case |
| `src/adapters/trf5/documents.ts` | Created | `buildDocumentFilename`, `fetchDocument` — 302-follow, id-only filename, `FetchOutcome<StoredDocument>` wiring |
| `src/adapters/trf5/documents.test.ts` | Created | 6 tests: distinct filenames, unsafe-component rejection, 302-follow, three-same-label end-to-end, 404, unexpected-status |
| `src/adapters/trf5/__fixtures__/document-sample.pdf` | Created | Synthetic PDF-shaped bytes, no personal data |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 4.15–4.18 `[x]` |

## Issues Found (S4b)

None blocking. See "Design decisions and deviations" above for the `hostDefect` fallback
judgment call and the deferred `site.ts` wiring.

## Workload / PR Boundary (S4b)

- Mode: chained PR slice (`feature-branch-chain`)
- Current work unit: S4b — TRF5 document fetch, decoding, and filing
- Boundary: starts from S4a's merged state (`detail.ts`/`parsing/detail-page.ts`/
  `schemas/payload.ts` untouched); ends with a fully tested `fetchDocument` + filename
  derivation path. `site.ts` `SitePort` wiring intentionally not started (S5).
- Estimated review budget impact: 266 authored `src/` lines (`git diff --numstat` against
  the S4a branch tip, excluding `tasks.md`/`apply-progress.md` bookkeeping) against the
  800-line budget and the ~280 estimate — within budget, no `size:exception` needed.

### Status (S4b)

4/4 S4b tasks complete (4.15–4.18). Ready for `sdd-verify`, or `sdd-apply` again for S5.
