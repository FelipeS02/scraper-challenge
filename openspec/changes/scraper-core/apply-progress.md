# Apply Progress: scraper-core

## Cumulative Task Status

- S1 (1.0–1.16): complete — 749 lines actual, accepted `size:exception`.
- S2a (2.3–2.9, 2.14): complete — 808 lines actual.
- S2b (2.1–2.2, 2.10–2.13): complete — 663 lines actual.
- S3 (3.1–3.14): complete — 835 lines actual, accepted `size:exception`.
- S4a (4.1–4.14): complete — 729 lines actual, within the 800 budget.
- S4b (4.15–4.18): complete — 266 authored `src/` lines.
- S4c (4c.1–4c.7): complete — 409 authored `src/` lines, within the 800 budget.
- S4d (4d.1–4d.6): complete — 83 authored `src/` lines, within the 800 budget.
- S5a (5.12–5.18): complete — 575 authored `src/` lines + 15 in `eslint.config.js`, within the 800 budget.
- **S5c (7.1–7.29): complete — 1084 authored `src/` lines actual, accepted `size:exception` (forecast ~950–1300).**
- **S5b (5.1–5.8): complete — 775 authored `src/` lines actual. (5.9–5.11): not started —
  apply stopped mid-slice on a discovered gap (`TRF5Site.discover()` needs a
  search-result-row parser no prior slice built). See "S5b" below.**
- **S5d (8.1–8.9): complete — 601 authored `src/` lines actual, within the 800 budget (the
  pre-granted `size:exception` went unused). Closes the `parsing/result-fragment.ts` +
  `TRF5Site` gap S5b's apply discovered. See "S5d" below.**
- S5e (9.1–9.6): complete — 557 authored `src/` lines actual, within the 800 budget. Real
  `AxiosTransport` + `main.ts` composition root; `pnpm scrape --dry-run` smoke-tested. See
  "S5e" below.
- **S5f: complete — 515 authored `src/` lines actual, within the 800 budget. Rebuilt detail
  parsing against captured live responses; found and fixed the `pdfs/` wiring gap; first
  live acceptance run against the real portal passed with real payloads and a real PDF.
  See "S5f" below.**
- **S5g: complete — 594 authored `src/` lines actual, within the 800 budget (forecast ~280 —
  more than double, driven almost entirely by the two integration/audit tests: 246 lines for
  the real-adapter global-cooldown end-to-end test, 154 for the outcome-construction audit).
  Made the 429/global-cooldown mechanism reachable in production for the first time since S1
  by classifying 429/5xx at the transport boundary before content classification runs on all
  three TRF5 request paths; added a guard against this exact class of gap recurring; corrected
  the 4.17/4.18 tasks.md bookkeeping defect. See "S5g" below.**
- S6: not started.

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

## S4c — TRF5 document persistence to disk + stable paths

**Mode**: Strict TDD
**Branch**: `feat/scraper-core-s4c-document-persistence` (forked off `feat/scraper-core-s4b-documents`)
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #7 in the chain, targeting the S4b branch.
**Why this slice exists**: a review after S4b found that nothing in S1–S4b ever writes document
bytes to disk — `fetchDocument` measured `byteLength` and discarded the body, and no port
persisted documents. Two spec requirements were added (`Document Persistence to Disk`,
`Persisted Identifier Stability`) and one amended (`Stable Document Filename Derivation`,
`ca`-keyed -> `processNumber`-keyed).
**Scope discipline**: exactly tasks 4c.1–4c.7. `site.ts`'s `SitePort.fetchDocument` wiring
remains deferred to S5 (S4b's precedent, unchanged by this slice).

### Completed Tasks

- [x] 4c.1 RED (extend `documents.test.ts`) — path is `<processNumber>/<idProcessoDocumento>-<slug>.pdf`;
      three same-labeled `Decisão` documents get three distinct paths; a hostile label
      (`../../etc/passwd`), an empty label, and a non-ASCII-after-folding label (CJK) all
      degrade to `<processNumber>/<idProcessoDocumento>.pdf`; repeated calls (standing in for
      "different `ca` across sessions", since `ca` is no longer a parameter at all) yield the
      identical path.
- [x] 4c.2 GREEN `documents.ts` — `buildDocumentPath(processNumber, documentId, label)` replaces
      `buildDocumentFilename(ca, documentId)`. Slug derivation: NFD-normalize the (already
      ISO-8859-1-decoded via `encoding.ts`'s `decodedLabel` helper) label, strip everything
      outside printable ASCII (folds accents with no lookup table — see deviation note below),
      lowercase, collapse whitespace to `-`, truncate to 60 chars; if the result is empty or
      still contains a character outside `[a-z0-9._-]` (e.g. a literal `/` from a hostile
      label), the slug is discarded entirely — never partially sanitized. `processNumber`/
      `documentId` are each validated against `[A-Za-z0-9._-]+` before joining, matching the
      existing `PATH_COMPONENT_SAFE` gate. `fetchDocument` now takes `processNumber` and
      returns the fetched `bytes` on its `StoredDocument` value (previously discarded).
- [x] 4c.3 RED `infra/storage/fs-document-sink.test.ts` — creates the per-process directory;
      bytes on disk match the fetched body exactly; a `renameSync` failure mid-write (mocked
      via `vi.mock('node:fs', ...)`, call-through by default) leaves no file at the final path.
- [x] 4c.4 GREEN `infra/storage/fs-document-sink.ts` (`FsDocumentSink`) + `DocumentSink` port
      declared in `engine/ports.ts`. Temp-file-then-rename, same crash-safety shape as the S2a
      JSONL sinks: `writeFileSync` to `<finalPath>.tmp-<uuid>`, then `renameSync` into place;
      on any failure the temp file is best-effort removed and the error re-thrown as a rejected
      promise. `write()` returns `statSync(finalPath).size` — the real persisted size, not an
      assumption from the input buffer length.
- [x] 4c.5 RED (extend `engine/scraper.test.ts`) — a successful document fetch writes through
      the `DocumentSink` with the real bytes; a failed fetch writes no file while the item and
      ledger entry are still written exactly as before this slice.
- [x] 4c.6 GREEN `engine/scraper.ts` — `documentSink: DocumentSink` added to `ScraperConfig`;
      both `processUnit`'s fetch loop and `retryFailedDocuments` now call
      `documentSink.write(value.fileName, value.bytes)` on a successful fetch (guarded on
      `fileName` being non-null, which it always is when `fetchDocument` returns `ok`).
- [x] 4c.7 Confirmed — `persisted-identifier-stability.test.ts` asserts a `buildDocumentPath`
      result, a `TRF5Traversal`-seeded `TraversalCursor`, and a hand-built `CheckpointRecord`
      each serialize to JSON containing neither the harvested `jsessionid`/`ViewState` from a
      real primed session fixture, nor a `ca=` query token. The output envelope's `sourceUrl`
      is unchanged by this slice and still embeds `ca` (S4a's `site.ts` `sourceUrl` derivation)
      — this is by design per the new "Persisted Identifier Stability" requirement's own text:
      a point-in-time locator MAY be persisted for provenance provided the record also carries
      a session-independent handle, and the envelope's `itemId`/`payload.processNumber` is that
      handle. `sourceUrl` becoming stale after the originating session expires does not make
      the record unrecoverable — the item stays addressable by `processNumber`, and the
      document itself is addressable by its own derived path (this slice's `buildDocumentPath`)
      with no dependency on `sourceUrl` or `ca` at all.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4c.1/4c.2 | `documents.test.ts` | Unit + StubTransport | ✅ 96/96 (full suite pre-batch) | ✅ Confirmed retroactively: `git stash` on `documents.ts` alone (test file kept) reproduced 7/11 failures — `buildDocumentPath is not a function` (×3) and a wrong-format-filename assertion failure on the `fetchDocument` end-to-end case. Disclosed as retroactive rather than sequenced-first (see note below). | ✅ 11/11 passed | ✅ 9 cases: happy path, 3-distinct-paths, hostile label, empty label, CJK label, repeated-call stability, 2 invalid-component rejections, 302-follow, 404, hostDefect | ✅ Clean |
| 4c.3/4c.4 | `fs-document-sink.test.ts` | Unit + real temp-dir I/O | N/A (new file) | ✅ Confirmed retroactively: moving `fs-document-sink.ts` aside reproduced `Cannot find module` for all 3 tests. | ✅ 3/3 passed | ✅ 3 cases: bytes-match-exactly, no-lingering-temp-file, interrupted-rename-leaves-no-final-file | ✅ Clean |
| 4c.5/4c.6 | `scraper.test.ts` | Unit + in-memory stores | ✅ 108/108 (full suite pre-batch minus the new test) | ⚠️ See note below — the "writes through DocumentSink" case failed retroactively (`[] to deeply equal [...]`); the "writes no file on failure" case passed on the pre-wiring code too, since neither the reverted nor the new code ever wrote a file on a failed fetch. | ✅ 2/2 passed | ✅ 2 cases: success writes real bytes (deliberately mismatched claimed `byteLength: 999` proves the sink, not the adapter's claim, is authoritative), failure writes nothing | ✅ Clean |
| 4c.7 | `persisted-identifier-stability.test.ts` | Unit (confirmation) | ✅ 109/109 (post-4c.6) | N/A — this is a confirmation task, not new behavior; the assertions are true by construction of already-landed S3/S4c code | ✅ 3/3 passed on first run | ✅ 3 targets: document path, TraversalCursor, CheckpointRecord | N/A |

**Note on RED sequencing (all of 4c.1–4c.6)**: this batch's test and implementation files were
authored together rather than test-first with an intermediate `vitest run` checkpoint per task —
a deviation from the strict RED-before-GREEN sequencing followed in S1–S4b. To avoid reporting a
fabricated RED narrative, genuine RED evidence was reconstructed retroactively before this slice
was marked complete: `git stash push -- <implementation file>` (for the two files that were
modifications of tracked files: `documents.ts`, `scraper.ts`) or temporarily moving the file aside
(for the two new files: `fs-document-sink.ts`) while keeping each corresponding test file in its
final form, then running that test file alone and confirming real failures, then restoring the
implementation and confirming green again. The failures observed (module-not-found, wrong
filename format, empty-array-vs-populated-array assertion mismatches) are the same shape of
failure a true test-first RED would have produced, so the tests are confirmed non-vacuous. This
is disclosed as a process deviation, not a silently-reported clean RED — matching the spirit of
the S3 3.6/3.7 and S4a parties/movements/documents disclosures, but going one step further since
those were "passed immediately" cases and this one is "authored out of order, verified
retroactively."

### Design decisions and deviations

- **Accent-folding uses NFD-normalize + strip-everything-outside-printable-ASCII, not the
  Unicode combining-diacritical-marks block (U+0300 to U+036F) directly.** The literal
  intended implementation was a regex targeting that exact code-point range, but this
  repository's write/edit tooling round-trips a raw combining-mark character range identically
  regardless of whether it is typed as literal glyphs or as escaped code-point text, making
  that specific regex impossible to author reliably through the available editing tools in
  this session. The chosen alternative — strip any character outside the literal space
  (0x20) to tilde (0x7E) range after NFD decomposition — is semantically equivalent for this
  use case (every NFD combining mark and every non-ASCII base character falls outside that
  range) and additionally avoids ESLint's `no-control-regex` rule, which flagged a
  control-character-anchored variant tried first. Verified against `documents.test.ts`'s CJK
  ("unrepresentable") and Portuguese-accent ("Decisão" -> "decisao") cases, both passing.
- **The slug is discarded wholesale, not partially sanitized, for any label containing so much
  as one character outside `[a-z0-9._-]` after folding.** `deriveSlug` returns `null` (not a
  best-effort sanitized string) the moment `PATH_COMPONENT_SAFE.test(candidate)` fails. This
  is what makes the hostile-label scenario (`../../etc/passwd`) produce exactly
  `<processNumber>/<idProcessoDocumento>.pdf` as the spec's scenario table requires, rather
  than some dash-mangled-but-still-slug-shaped string — a partial-sanitization approach (e.g.
  replacing `/` with `-`) would technically still be collision-free and non-escaping (no `/`
  ever reaches the joined path), but would not match the spec's literal expected output.
- **`StoredDocument` gained a mandatory `bytes: Uint8Array` field; `DocumentSink.write()`
  returns `Promise<number>` (the real persisted size), not `Promise<void>`.** `ItemSink`/
  `CoverageSink` return `void` because nothing downstream needs their write's result; the whole
  point of `DocumentSink.write()`'s return value is to be the "actually written" source of
  truth per the spec's own wording, so it could not follow the same void-return shape without
  losing that property. `engine/scraper.ts` does not currently do anything further with the
  returned count beyond awaiting it (no document-metadata ledger exists yet to record it into —
  that plumbing, if ever added, is S5's composition-root concern, not this slice's).
- **Both `processUnit`'s per-document fetch loop and `retryFailedDocuments` now call
  `documentSink.write(...)` on a successful fetch.** The task list's wording (4c.6) names only
  "the fetch stage of `engine/scraper.ts`", but `retryFailedDocuments` is also a fetch stage —
  a resolved document-retry that never persists its bytes would silently resolve the failure
  ledger entry for a file that was never written, which is exactly the class of bug this slice
  exists to close. Covered implicitly by the existing `retrying a failed document...` test
  (unchanged assertions, still green) rather than a new dedicated test, since the existing
  `MemoryFailureLedger`-based test does not inspect `documentSink.writes` — flagging this as an
  observation rather than a proven-by-test claim: the wiring is present and type-correct, but
  no test in this batch asserts `documentSink.writes` after `retryFailedDocuments()` runs.
- **`fs-document-sink.test.ts`'s crash-simulation test mocks `node:fs` via `vi.mock` with a
  call-through default (`vi.fn(actual.renameSync)`), not `vi.spyOn`.** `vi.spyOn` on a
  destructured Node ESM built-in export fails with "Cannot redefine property" (module namespace
  objects are non-configurable in ESM) — confirmed by running the naive `vi.spyOn(fs,
  'renameSync')` version first and observing that exact `TypeError`. `vi.mock`'s
  `importOriginal` + `vi.fn(actual.fn)` pattern is the standard Vitest workaround, and it keeps
  every other test in the file exercising the real filesystem (no other `renameSync` calls are
  ever mocked; only the one crash-simulation test uses `mockImplementationOnce`).
- **Real-process-number and live-host check**: grepped every new/changed file's literals
  against `docs/RESEARCH.md`'s previously-flagged real process number
  (`0801110-38.2024.4.05.8001`) and against live-host substrings (`trf5.jus.br`/`pjett.`/
  `http(s)://`) before committing — none present. `documents.test.ts`'s `PROCESS_NUMBER`
  constant (`0123456-78.2026.4.05.8100`) matches the launch prompt's own synthetic-style
  example verbatim.

### Test Summary

- **Total tests written (S4c)**: 19 (9 new `documents.test.ts` cases replacing/extending the
  prior 6; 3 new `fs-document-sink.test.ts`; 2 new `scraper.test.ts` document-persistence
  cases; 3 new `persisted-identifier-stability.test.ts`; net new test count vs. the S4b branch
  tip is 17, since 2 of the 9 `documents.test.ts` cases replace prior `buildDocumentFilename`
  cases 1:1)
- **Total tests passing (S4c)**: 109/109 full suite (`vitest run`)
- **Layers used**: Unit pure (12), Unit + StubTransport (6), Unit + in-memory engine stores (2),
  Unit + real temp-dir filesystem I/O (3), Integration/E2E: N/A by design (no live host, ever)
- **Pure functions created**: `buildDocumentPath`, `foldAccents`, `deriveSlug`
- **Classes created**: `FsDocumentSink`

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/adapters/trf5/documents.test.ts src/infra/storage/fs-document-sink.test.ts src/engine/scraper.test.ts src/adapters/trf5/persisted-identifier-stability.test.ts` → 4 files, 25 tests, all passed |
| Runtime harness command/scenario and exact result | N/A — CLI not wired until S5 (per tasks.md S4c row); every scenario is proven through `StubTransport`/in-memory engine stores/a real temp directory, this slice's actual runtime boundary |
| Rollback boundary | Delete `src/infra/storage/fs-document-sink.ts` + its test and `src/adapters/trf5/persisted-identifier-stability.test.ts`; revert `src/engine/ports.ts` (`StoredDocument.bytes`, `DocumentSink`), `src/engine/scraper.ts` (`documentSink` field + two write call sites), `src/engine/scraper.test.ts`, `src/engine/__fixtures__/fake-site.ts`, and `src/adapters/trf5/documents.ts`/`documents.test.ts` back to S4b's `ca`-derived `buildDocumentFilename`. S1/S2a/S2b/S3/S4a untouched. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/engine/ports.ts` | Modified | Added `StoredDocument.bytes: Uint8Array`; declared the `DocumentSink` port |
| `src/engine/scraper.ts` | Modified | Added `documentSink: DocumentSink` to `ScraperConfig`; wired `documentSink.write(...)` into both `processUnit`'s fetch loop and `retryFailedDocuments` |
| `src/engine/scraper.test.ts` | Modified | `MemoryDocumentSink`; `buildScraper` now wires it; 2 new document-persistence tests; 2 pre-existing `StoredDocument` literals updated with `bytes` |
| `src/engine/__fixtures__/fake-site.ts` | Modified | `fetchDocument`'s `StoredDocument` literal updated with `bytes` |
| `src/adapters/trf5/documents.ts` | Modified | `buildDocumentPath` replaces `buildDocumentFilename`; `fetchDocument` takes `processNumber`, returns `bytes` |
| `src/adapters/trf5/documents.test.ts` | Modified | Full rewrite to the amended path-derivation contract; adds hostile/empty/CJK-label and path-stability cases |
| `src/infra/storage/fs-document-sink.ts` | Created | `FsDocumentSink` — temp-file-then-rename `DocumentSink` implementation |
| `src/infra/storage/fs-document-sink.test.ts` | Created | Bytes-match, no-lingering-temp-file, interrupted-rename tests |
| `src/adapters/trf5/persisted-identifier-stability.test.ts` | Created | 4c.7 confirmation — document path/`TraversalCursor`/`CheckpointRecord` carry no session-scoped value |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 4c.1–4c.7 `[x]`, recorded 409 actual lines, updated the per-slice estimate table |

## Issues Found (S4c)

None blocking. See "Design decisions and deviations" above for the accent-folding tooling
workaround, the wholesale-slug-discard choice, the `DocumentSink.write()` return-type choice,
the `retryFailedDocuments` persistence-coverage gap (wired but not independently tested), and the
`vi.mock`-over-`vi.spyOn` workaround for Node ESM built-ins.

## Workload / PR Boundary (S4c)

- Mode: chained PR slice (`feature-branch-chain`)
- Current work unit: S4c — TRF5 document persistence to disk + stable paths
- Boundary: starts from S4b's merged state (`detail.ts`/`parsing/detail-page.ts`/
  `schemas/payload.ts`/S4b's `ca`-derived filename builder as the pre-slice baseline); ends
  with fetched document bytes actually reaching disk under a `processNumber`-keyed,
  session-independent path. `site.ts`'s `SitePort.fetchDocument` wiring intentionally not
  started (still S5, per S4b's own precedent).
- Estimated review budget impact: 409 authored `src/` lines (`git diff --stat` insertions+
  deletions for modified files, plus full line count for new files, excluding
  `tasks.md`/`apply-progress.md` bookkeeping) against the 800-line budget and the ~350
  estimate — within budget, no `size:exception` needed.

### Status (S4c)

7/7 S4c tasks complete (4c.1–4c.7). `vitest run`: 109/109 passing. `pnpm lint`: clean.
`pnpm typecheck`: clean. `pnpm format:check`: clean (3 files needed `prettier --write` after
authoring; re-verified clean afterward). Ready for `sdd-verify`, or `sdd-apply` again for S5.

## S4d — Strict-TDD remediation for document persistence

**Mode**: Strict TDD (this whole slice exists to repair a strict-TDD sequencing gap disclosed
at the end of S4c).
**Branch**: `feat/scraper-core-s4d-tdd-remediation` (forked off
`feat/scraper-core-s4c-document-persistence`).
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #8 in the chain, targeting the S4c
branch.
**Why this slice exists**: S4c's own apply-progress entry disclosed that tasks 4c.1–4c.6 were
authored test-and-implementation-together, with RED evidence reconstructed afterward via
`git stash`. A RED reconstructed against code that already exists proves only that the file
was missing, not that the test detects a *wrong* implementation. This slice does not re-stage
fake RED cycles over that existing code — it proves, by mutation, that each S4c test actually
detects a defect, and applies genuine strict TDD to the two behaviors S4c left uncovered.
**Scope discipline**: exactly tasks 4d.1–4d.6. No behavior S4c got right was changed — every
mutation introduced during the audit was reverted before the next mutation, and the working
tree is clean of mutations (`git diff` on `src/adapters/trf5/documents.ts`,
`src/engine/scraper.ts`, and `src/infra/storage/fs-document-sink.ts` is empty).

### 4d.1 — Defect-detection audit of the S4c suite

Method: for each behavior, introduce ONE targeted mutation, run only the covering test file,
confirm the failure and read the actual assertion message, then revert and confirm green
again before the next mutation. All ten behaviors named in tasks.md 4d.1 were audited.

| # | Behavior | Mutation | Covering file | Result | Observed failure (quoted) |
|---|---|---|---|---|---|
| 1 | Path keyed on `documentId`, never the label | `buildDocumentPath`: `` `${slug}.pdf` `` instead of `` `${documentId}-${slug}.pdf` `` when a slug exists | `documents.test.ts` | **Caught** — 4 tests failed | `expected '0123456-78.2026.4.05.8100/decisao.pdf' to be '0123456-78.2026.4.05.8100/12452668-de…'` (+ the 3-distinct-paths test: `expected 1 to be 3`) |
| 2 | Hostile label discards the slug | `deriveSlug`: dropped the `!PATH_COMPONENT_SAFE.test(candidate)` branch, kept only the length check | `documents.test.ts` | **Caught** — exactly the hostile-label test, isolated | `Expected: "…/12452668.pdf" Received: "…/12452668-../../etc/passwd.pdf"` |
| 3 | Empty/unrepresentable label degrades to `<documentId>.pdf` | `deriveSlug` returns `candidate` (not `null`) for the empty case; `buildDocumentPath`'s ternary changed from `slug ? …` (truthy) to `slug !== null ? …` (identity) | `documents.test.ts` | **Caught** — exactly the empty-label and CJK-label tests, isolated (hostile-label test unaffected) | `Expected: "…/12452668.pdf" Received: "…/12452668-.pdf"` (both cases) |
| 4 | A different `ca`/session yields an identical path | Appended `Math.random().toString(36).slice(2,8)` to the returned path | `documents.test.ts` | **Caught** — 6 tests failed, including the dedicated stability test | `Expected: "…/z1054t-12452668-decisao.pdf" Received: "…/aixjtu-12452668-decisao.pdf"` |
| 5 | The sink creates the per-process directory | `FsDocumentSink.write`: removed the `mkdirSync(dirname(finalPath), { recursive: true })` call | `fs-document-sink.test.ts` | **Caught** — all 3 tests failed | `Error: ENOENT: no such file or directory, open '…\0123456-78.2026.4.05.8100\12452668-decisao.pdf.tmp-…'` |
| 6 | Written bytes equal fetched bytes | `writeFileSync(tempPath, bytes)` → wrote `bytes.slice(0, bytes.byteLength - 1)` (dropped the last byte) | `fs-document-sink.test.ts` | **Caught** — exactly the bytes-match test | `expected Uint8Array[ 1, 2, 3, 4 ] to deeply equal Uint8Array[ 1, 2, 3, 4, 5 ]` |
| 7 | An interrupted write leaves no file that reads as complete | Wrote directly to `finalPath` instead of `tempPath` (skipped the temp-file step; the subsequent `renameSync` call was left in place but now renames a temp file that was never created) | `fs-document-sink.test.ts` | **Caught** — all 3 tests failed, including the crash-simulation test on the exact assertion it exists to protect | `expected true to be false` on `existsSync(join(dir, 'proc-1', 'doc-1.pdf'))` — a "complete" file existed despite the simulated rename crash |
| 8 | `write()` reports the persisted size, not the received size | `return Promise.resolve(bytes.byteLength)` instead of `Promise.resolve(statSync(finalPath).size)` | `fs-document-sink.test.ts` | **NOT caught** by the existing 3 tests — see below | N/A (existing suite: 3/3 still passed) |
| 9 | A successful fetch writes through the sink | `engine/scraper.ts`: removed the `documentSink.write(...)` call in `processUnit`'s fetch loop | `scraper.test.ts` | **Caught** — exactly the "writes a successfully fetched document" test | `expected [] to equal [ { bytes: …, path: "item-A/doc-1.pdf" } ]` |
| 10 | A failed fetch writes no file, yet still writes the item and ledger entry | `engine/scraper.ts`: added an unconditional `documentSink.write(...)` call in the failure-ledger branch | `scraper.test.ts` | **Caught** — exactly the "writes no file when the document fetch fails" test | `expected [ { path: 'item-A/doc-1.pdf', … } ] to have a length of +0 but got 1` |

**9/10 mutations caught by the existing S4c suite, for the right reason in every case** (the
quoted assertion messages name the actual defect, never a module-not-found or unrelated
import-time crash). Mutation #8 is a genuine gap in the S4c suite: nothing in
`fs-document-sink.test.ts` distinguishes "reports the bytes it was given" from "reports the
bytes actually on disk" — every existing scenario writes exactly the bytes it receives, so the
two values are always equal by coincidence there.

**Closing the gap (RED-first, genuine)**: added `fs-document-sink.test.ts`'s
`'reports the size actually persisted on disk, not the byte length it received'`, which mocks
`statSync` (via the file's existing `vi.mock('node:fs', …)`, extended to also wrap `statSync`)
to return `999` for a 3-byte input. With mutation #8 still in place, this new test failed:
`expected 3 to be 999` — a genuine RED, observed before any implementation change. Reverting
mutation #8 (restoring `statSync(finalPath).size`) turned it green: `4 tests passed`. No
production code changed — `FsDocumentSink.write` was already correct; only the missing test
was added.

### 4d.2/4d.3 — `retryFailedDocuments` sink coverage

Extended `scraper.test.ts` with a new test,
`'retryFailedDocuments writes the recovered document through DocumentSink'`, asserting
`documentSink.writes` directly (S4c's existing `'retrying a failed document…'` test only
asserted `fetchCalls`/`discoverCalls`/ledger resolution — it never inspected the sink, exactly
as the launch prompt described).

Run against the **unmodified** S4c implementation, this test **passed immediately**
(`10 tests passed`, no failure) — no genuine RED was available, because S4c's task 4c.6 already
wired `documentSink.write(...)` into `retryFailedDocuments` correctly. Rather than stage a false
RED, non-vacuousness was confirmed by mutation instead: temporarily removed the
`if (result.value.fileName) { await documentSink.write(...) }` block from
`retryFailedDocuments`, re-ran the new test, and observed a genuine failure —
`expected [] to equal [ { bytes: Uint8Array [9, 9], path: "item-A/doc-1.pdf" } ]` — proving the
test is not vacuous. Reverted the mutation; the test passed again (`10 tests passed`). No
production code change was needed for 4d.3: the call was already correct, only independently
untested.

### 4d.4/4d.5 — Accent-folding correctness

S4c's `foldAccents` strips every character outside the printable-ASCII range (space through
tilde) after NFD-normalizing. Verified directly (`node -e`, quoted in the launch context)
that NFD decomposes every one of `á é í ó ú â ê î ô û ã õ ñ ç` and their uppercase forms into
an ASCII base letter plus one combining mark (U+0300–U+036F, or U+0327 for ç/Ç) — and every
combining mark falls outside the printable-ASCII range the strip already targets. So this
specific character set was already folding correctly before this slice touched anything:
`á→a, é→e, í→i, ó→o, ú→u, â→a, ê→e, î→i, ô→o, û→u, ã→a, õ→o, ñ→n, ç→c` (uppercase forms fold
identically before the final `.toLowerCase()`), and `Petição` already folded to `peticao`.

Added two tests to `documents.test.ts` covering this directly (rather than only indirectly via
`Decisão`, which never exercises á/é/í/ó/ú/â/ê/î/ô/û/ñ): the full accented set concatenated,
and the literal `Petição → peticao` case from the launch prompt. Run against the unmodified
implementation, both **passed immediately** — no genuine RED was available, because the
implementation was already correct for this exact character set (matching the launch prompt's
own instruction: "If the existing approach already handles a character correctly, say so
rather than inventing a failure").

Non-vacuousness was confirmed by mutation: temporarily removed `.normalize('NFD')` from
`foldAccents` (the change that would actually break this — without decomposition, an accented
character is a single non-ASCII codepoint that gets stripped to nothing, not folded to its
base letter). Re-running `documents.test.ts` showed 4 failures, including both new tests:
`Expected: "…/12452668-peticao.pdf" Received: "…/12452668-petio.pdf"` (the combining mark
survives without NFD in a way that silently drops the base letter for some inputs) and the
full-set test failing identically. Reverted the mutation; all 13 tests passed again. No
production code change was needed for 4d.5.

### Strict-TDD compliance for S4d

| Cycle | Genuine RED observed? | Reason if not |
|---|---|---|
| 4d.1 mutation audit (all 10 rows) | N/A — audit method, not a RED/GREEN cycle. Each mutation's failure *is* the recorded evidence; each revert restores green. | — |
| 4d.1 gap closure (persisted-size test) | **Yes** — `expected 3 to be 999` against the still-mutated sink, before any GREEN | — |
| 4d.2/4d.3 (retryFailedDocuments sink coverage) | **No** | The behavior under test (`retryFailedDocuments` calling `DocumentSink.write()`) was already correctly implemented in S4c (task 4c.6). Writing the assertion against the unmodified code could only pass or fail based on whether that wiring was correct — and it was. A true RED would have required either (a) a real defect to exist, which none did, or (b) writing the test against a deliberately-reverted implementation, which is the exact "fake RED against code we're about to un-delete" pattern this slice exists to reject. Non-vacuousness was proven by mutation instead (see above), which is the honest substitute available here. |
| 4d.4/4d.5 (accent-folding) | **No** | Same shape of reason: the exact character set named in the task was already handled correctly by S4c's strip-after-NFD approach. No defect existed to reproduce as a RED. Non-vacuousness was proven by mutation instead (dropping `.normalize('NFD')`), which is disclosed above with the exact failing assertion. |

Both "No" rows are disclosed honestly per the launch prompt's own instruction: "if a cycle
cannot produce a real RED, say so and explain why rather than staging one." In both cases the
underlying S4c code was already correct, so the value delivered by this slice is proof (via
mutation, not narrative) that the code is correct and that the added tests would catch a
regression — not a defect fix.

### Test Summary

- **Total tests added (S4d)**: 4 (1 in `fs-document-sink.test.ts` — persisted-size gap closure;
  1 in `scraper.test.ts` — retryFailedDocuments sink coverage; 2 in `documents.test.ts` —
  full accented-set and `Petição` folding)
- **Total tests passing (S4d)**: 4/4
- **Full-suite tests passing**: 113/113 (`vitest run`), up from 109/109 at S4c
- **Mutations introduced during the audit**: 10 (4d.1) + 2 (non-vacuousness checks for 4d.2 and
  4d.4) = 12, all reverted; working tree clean (`git diff` on the three audited implementation
  files is empty)
- **Tests that failed to detect their mutation**: **1 of 10** — mutation #8 (`write()`
  reporting received size instead of persisted size). Closed with a new test in this slice.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/adapters/trf5/documents.test.ts src/infra/storage/fs-document-sink.test.ts src/engine/scraper.test.ts` → 3 files, 27 tests, all passed |
| Runtime harness command/scenario and exact result | N/A — CLI not wired until S5 (per tasks.md S4d row); every scenario is proven through `StubTransport`/in-memory engine stores/a real temp directory, unchanged from S4c's runtime boundary |
| Rollback boundary | `git diff` on `src/adapters/trf5/documents.ts`, `src/engine/scraper.ts`, `src/infra/storage/fs-document-sink.ts` is empty — nothing to roll back in implementation. Revert `src/infra/storage/fs-document-sink.test.ts`'s `statSync` mock and new test, `src/engine/scraper.test.ts`'s new `retryFailedDocuments` sink test, and `src/adapters/trf5/documents.test.ts`'s two new accent-folding tests to return to exactly S4c's committed state. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/infra/storage/fs-document-sink.test.ts` | Modified | Extended the `vi.mock('node:fs', …)` to also wrap `statSync`; added the persisted-vs-received-size test |
| `src/engine/scraper.test.ts` | Modified | Added `'retryFailedDocuments writes the recovered document through DocumentSink'` |
| `src/adapters/trf5/documents.test.ts` | Modified | Added the full accented-character-set test and the `Petição → peticao` test |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 4d.1–4d.6 `[x]`; recorded 83 authored `src/` lines actual |

## Issues Found (S4d)

None blocking. One genuine test-coverage gap was found and closed (mutation #8, `write()`'s
persisted-vs-received size). No production defect was found in the S4c implementation itself —
every other audited behavior was both correctly implemented and correctly tested.

## Workload / PR Boundary (S4d)

- Mode: chained PR slice (`feature-branch-chain`)
- Current work unit: S4d — strict-TDD remediation for document persistence
- Boundary: starts from S4c's merged state; ends with every S4c document-persistence test
  proven to detect a defect (or, for the one gap found, a new test that does), plus genuine
  strict-TDD coverage of the two behaviors S4c left untested. No S4c behavior was changed.
- Estimated review budget impact: 83 authored `src/` lines (`git diff --numstat` against the
  S4c branch tip, test files only, excluding `tasks.md`/`apply-progress.md` bookkeeping)
  against the 800-line budget — well within budget, no `size:exception` needed.

### Status (S4d)

6/6 S4d tasks complete (4d.1–4d.6). `vitest run`: 113/113 passing. `pnpm lint`: clean.
`pnpm typecheck`: clean. `pnpm format:check`: clean (1 file needed `prettier --write` after
authoring the new sink test; re-verified clean afterward). Ready for `sdd-verify`, or
`sdd-apply` again for S5.

## S5a — Structured logging port and implementations

**Mode**: Strict TDD
**Branch**: `feat/scraper-core-s5a-structured-logging` (forked off
`feat/scraper-core-s4d-tdd-remediation`, at the `948cb50` S5a-planning-split commit).
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #9 in the chain, targeting the S4d
branch.
**Why this slice exists**: `design.md` line 25 declared `infra/logging/logger.ts` and
`proposal.md` promised structured logs, but no task ever built either and no spec required
them until this slice's planning split added `Structured Run Observability` and extended
`Personal Data Handling Rules` — see `tasks.md`'s own S5a preamble.
**Scope discipline**: exactly tasks 5.12–5.18. No `src/cli/*`, no `src/main.ts`, no
`engine/budget.ts` — the loggers take level and destination as constructor arguments in this
slice; S5b's `cli/args.ts` chooses them from the command line later.
**Resumed after a provider rate limit**: an earlier attempt on this same work unit
terminated on an HTTP 429 session limit before any file was written (working tree was
clean at `948cb50`, no `src/infra/logging/` directory existed). This entry covers the full
slice, produced in one continuous run from task 5.12.

### Completed Tasks

- [x] 5.12 RED `infra/logging/redacting-logger.test.ts` — a `LogEvent` whose `fields` carry
      `cpf`, `partyName`, `jsessionid`, `viewState`, or `ca` reaches the wrapped `Logger`
      with those values replaced; a CPF-shaped value under an unlisted key (`referenceNumber`)
      is left untouched, proving redaction is keyed on field name, never on sniffing values.
- [x] 5.13 GREEN declared `LogLevel`/`LogEvent`/`Logger` in `engine/ports.ts`; implemented
      `withRedaction(inner: Logger): Logger` in `infra/logging/redacting-logger.ts` — a
      decorator over any `Logger`, same composable shape as `withJitter`/`withCap`
      (`engine/backoff.ts`). Redacted field set: `cpf`, `partyName`, `jsessionid`,
      `viewState`, `ca` → `'[REDACTED]'`.
- [x] 5.14 RED `infra/logging/jsonl-logger.test.ts` + `console-logger.test.ts` — the JSONL
      logger appends one valid JSON object per line to `logs/run-<runId>.jsonl` (a non-ASCII
      field, `Petição inicial`, round-trips byte-identical); a level below the configured
      threshold writes nothing (file never created). The console logger writes exactly one
      JSON line to `process.stderr.write`, never to `process.stdout.write`; below-threshold
      writes nothing to either stream.
- [x] 5.15 GREEN implemented `infra/logging/jsonl-logger.ts` (`JsonlLogger`, reusing
      `infra/storage/jsonl.ts`'s `appendJsonlLine`) and `infra/logging/console-logger.ts`
      (`ConsoleLogger`); added `engine/__fixtures__/recording-logger.ts` (`RecordingLogger`)
      and `infra/logging/null-logger.ts` (`NullLogger`) as structural, non-branching fixtures.
- [x] 5.16 RED (extended `engine/scraper.test.ts`) — the loop emits `unit.started`,
      `unit.saturated`, `fetch.retry`, `session.reprimed`, `cooldown.triggered`,
      `document.persisted`, `document.failed`, and `unit.completed` at the matching
      lifecycle transitions, asserted through `RecordingLogger.events`, never by spying on
      `console`. A `ThrowingLogger` that throws on every call does not change the run's item,
      coverage, or checkpoint outcome.
- [x] 5.17 GREEN added `logger: Logger` to `ScraperConfig`; wired a private
      `emit(level, event, fields)` helper (try/catch, absorbs any throw) into
      `retryFailedDocuments`, `processUnit`, and `runWithRetry`. Replaced the direct
      `console.warn` in `infra/storage/jsonl.ts`'s `readJsonlFile` with
      `logger.log({ event: 'jsonl.tornLineDropped', ... })`, behind a new optional
      `logger: Logger = new NullLogger()` parameter (backward-compatible — every existing
      call site keeps its 1-argument call).
- [x] 5.18 Confirmed the seam: `grep -rn "infra/logging" src/engine` — empty.
      `grep -rln "console\." src` outside `infra/logging/` — only
      `jsonl-item-sink.test.ts`, which spies on `console.warn` to assert it is *not* called
      (a negative proof, not a production call). Strengthened `eslint.config.js`'s
      `no-console` rule from `'warn', { allow: ['warn','error'] }` to a global `'error'`,
      carved out (`'off'`) only for `src/infra/logging/**/*.ts` — the same
      build-enforced-seam pattern as the pre-existing `engine/**` adapter-import rule, so
      both halves of this check are now lint-enforced, not just grep-confirmed. `pnpm check`
      (typecheck + lint + format) clean.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.12/5.13 | `redacting-logger.test.ts` | Unit (pure) | N/A (new) | ✅ Module-not-found: `Cannot find module './redacting-logger.js'` | ✅ 2/2 passed | ✅ 2 cases: multi-field redaction + pass-through, value-sniffing negative case | ➖ None needed |
| 5.14/5.15 | `jsonl-logger.test.ts` + `console-logger.test.ts` | Unit + real temp-dir I/O (jsonl) / Unit + spied `process.std{err,out}` (console) | N/A (new) | ✅ Module-not-found: `Cannot find module './jsonl-logger.js'` / `'./console-logger.js'` | ✅ 4/4 passed | ✅ 4 cases: append+non-ASCII round-trip, below-threshold no-op (jsonl); stderr-only, below-threshold no-op (console) | ➖ None needed |
| 5.15 (null-logger, recording-logger) | `null-logger.test.ts` (recording-logger has no dedicated test — fixture precedent, see `stub-transport.ts`/`fake-site.ts`) | Unit (structural) | N/A (new) | N/A — purely structural, no branching (skip-triangulation allowance) | ✅ 1/1 passed | Triangulation skipped: single no-op method, one possible output | N/A |
| 5.16/5.17 | `scraper.test.ts` | Unit + in-memory engine stores | ✅ 10/10 (from S4d) | ✅ 7/15 tests failed for the right reason (see transcript below) | ✅ 15/15 passed | ✅ 8 event categories × dedicated/extended assertions (see below) | ✅ Clean — refactored `processUnit`'s duplicate `classifyCellState` call into one shared `state` local, passed into `buildCoverageRecord` |
| 5.17 (jsonl.ts) | `jsonl-item-sink.test.ts` | Unit + real temp-dir I/O | ✅ 5/5 (from S2a) | ✅ `expected [] to have a length of 1 but got +0` — before the `logger` parameter was wired | ✅ 6/6 passed | ➖ Single scenario (one torn-line case; the pass-through default is already covered by the 5 pre-existing tests calling the 1-arg form) | ➖ None needed |

**5.16's RED transcript** (`pnpm exec vitest run src/engine/scraper.test.ts`, before `scraper.ts`
emitted any event): 7 of the (then) 15 tests failed —
`expected undefined to match object { level: 'warn', fields: {...} }` for `document.failed`,
`cooldown.triggered`, `document.persisted`, `unit.saturated`, `fetch.retry`, and
`session.reprimed`; `expected -1 to be greater than or equal to 0` for the `unit.started`
index lookup. The 8th new test (`ThrowingLogger` safety) trivially "passed" against the
unwired code, since nothing called `logger.log(...)` yet to throw — disclosed below rather
than silently counted as a clean RED.

**"Saturation split" mapped to `unit.saturated`, not an actual split call**: confirmed by
reading `engine/scraper.ts` (this slice's own diff) and `design.md`'s own Partitioning
pseudocode that `TraversalPort.split()`'s children-requeue path has never been wired into the
engine loop in any slice S1 through S5a — S3's apply-progress explicitly flagged this as
"out of S3's scope," and no later slice's task list revisits it before S6 (which only reuses
`traversal.ts`'s split *function* for the frontier seed-search path, task 6.11/6.12 — still
not the discover-loop's own saturation handling). The only observable "a cell saturated"
signal the current engine loop produces is `classifyCellState(...) === 'truncated'`, so
`unit.saturated` is emitted exactly there. This is disclosed as a deliberate mapping decision,
not silently narrowed scope.

**Cycle that could not produce a genuine RED**: the `ThrowingLogger` safety test
("a Logger that throws does not fail the run or change its outcome") passed both before and
after `scraper.ts` was wired to call `logger.log(...)` — before wiring, nothing called the
throwing logger at all, so the test passed vacuously for the wrong reason; after wiring, it
passes because the `emit()` helper's try/catch genuinely absorbs the throw. Non-vacuousness
was confirmed by mutation: temporarily removed the `try { ... } catch {}` wrapper from
`emit()` (calling `this.config.logger.log(...)` directly), re-ran the test, and observed a
real failure — `Error: simulated logger failure` propagating out of `scraper.run()`,
unhandled. Reverted the mutation; the test passed again. This matches the S4d precedent for
disclosing a non-RED cycle honestly rather than staging a fake one.

### Design decisions and deviations

- **`LogEvent` carries no `timestamp` field.** Neither the RED tests nor the three spec
  scenarios (Lifecycle transition observable, Failing logger does not fail the run, Log
  output does not corrupt the run summary) require one; `JsonlLogger` is constructed
  per-run with `runId`, not per-event, so correlating a run is already possible from the
  file name alone. Adding an untested field would be scope creep beyond what 5.12–5.18 ask
  for (design.md's "no over-engineering" constraint).
- **`LEVEL_RANK` (`debug`/`info`/`warn`/`error` → 0..3) is duplicated identically in
  `jsonl-logger.ts` and `console-logger.ts` rather than extracted to a shared file.** A
  4-entry object literal used in exactly two places did not justify inventing a third
  unlisted file; matches design.md's "Declined Abstractions" ethos for trivial shared
  constants.
- **`readJsonlFile`'s new `logger` parameter is optional, defaulting to `NullLogger`, and no
  other call site (`jsonl-checkpoint-store.ts`, `jsonl-failure-ledger.ts`,
  `jsonl-adapter-state-store.ts`) was updated to pass a real logger.** Task 5.17 scopes the
  change to "replace the direct `console.warn` in `infra/storage/jsonl.ts`," not to wire a
  logger through every store; wiring every store's `readJsonlFile` call to the run's actual
  logger is `main.ts`'s composition-root job (S5b), matching S4b/S4c's precedent of
  declaring functions ahead of their full call-site wiring.
- **Redacted field-name set is fixed (`cpf`, `partyName`, `jsessionid`, `viewState`, `ca`),
  not configurable.** Task 5.12 names exactly these five categories; no task in this slice's
  scope asks for a caller-supplied list, and the engine's own emitted events (this slice)
  never populate any of these five keys — the decorator exists as a defense-in-depth seam
  for adapter-originated fields that might reach a log in a later slice (e.g. detail parsing
  fields), consistent with the `Personal Data Handling Rules` requirement's general intent
  for `logs/`.
- **`unit.completed` fires only on the fully-processed path (after the checkpoint write),
  never on a discovery failure or a 429 requeue.** Matches the literal pairing "unit
  start/complete" in task 5.16: a requeued or failed unit did not complete, so it would be
  misleading to emit a completion event for it. `unit.started` still fires unconditionally
  at the top of `processUnit`, so a trace can distinguish "started but never completed" from
  "started and completed" by unitKey correlation alone.
- **Event levels are a judgment call** (`unit.started`/`unit.completed`/`document.persisted`
  → `info`; `unit.saturated`/`fetch.retry`/`session.reprimed`/`cooldown.triggered`/
  `document.failed` → `warn`), not specified by any task or spec scenario. Chosen so a
  `warn`-threshold logger surfaces every retry/failure/gap signal while staying quiet on
  the routine unit/document lifecycle.
- **`ConsoleLogger` and `JsonlLogger` both serialize `LogEvent` as a raw JSON line**, not a
  human-formatted string. Task 5.14 only specifies the destination (stderr-only /
  `logs/run-<runId>.jsonl`) and the threshold gate, not a display format; JSON keeps both
  loggers trivially parseable and consistent with the rest of this project's JSONL-first
  output convention (design.md D5), and avoids inventing an unlisted formatting concern.

### Test Summary

- **Total tests added (S5a)**: 18 (2 `redacting-logger.test.ts`, 2 `jsonl-logger.test.ts`,
  2 `console-logger.test.ts`, 1 `null-logger.test.ts`, 5 new `scraper.test.ts` tests +
  3 extended existing `scraper.test.ts` assertions (no new `it()` blocks for those 3), 1 new
  `jsonl-item-sink.test.ts` test) = 13 new test files' tests + 5 new scraper.test.ts tests =
  18; plus 3 existing tests gained additional assertions without becoming new tests.
- **Total tests passing (S5a)**: 18/18 new + all pre-existing tests still green
- **Full-suite tests passing**: 126/126 (`vitest run`), up from 113/113 at S4d
- **Layers used**: Unit pure (4: redacting-logger), Unit + real temp-dir I/O (2: jsonl-logger,
  1: jsonl-item-sink), Unit + spied `process.std{err,out}` (2: console-logger), Unit
  structural (1: null-logger), Unit + in-memory engine stores (scraper.test.ts, 15 total
  including 5 new)
- **Pure functions/decorators created**: `withRedaction`
- **Classes created**: `JsonlLogger`, `ConsoleLogger`, `NullLogger`, `RecordingLogger`
  (fixture)

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/infra/logging src/engine/scraper.test.ts src/infra/storage/jsonl-item-sink.test.ts` → 6 files, 39 tests, all passed |
| Runtime harness command/scenario and exact result | N/A — no CLI/composition-root wired yet (S5b's job, per tasks.md S5a row); every scenario is proven through `RecordingLogger`/`ThrowingLogger` over the existing in-memory-store engine loop and real temp-directory file I/O for the JSONL/console loggers, this slice's actual runtime boundary |
| Rollback boundary | Delete `src/infra/logging/` and `src/engine/__fixtures__/recording-logger.ts`; revert `src/engine/ports.ts` (`LogLevel`/`LogEvent`/`Logger`), `src/engine/scraper.ts` (`logger` field, `emit()`, all `this.emit(...)` call sites, the `buildCoverageRecord` state-parameter refactor), `src/engine/scraper.test.ts`, `src/infra/storage/jsonl.ts` (`logger` parameter, `NullLogger` import), `src/infra/storage/jsonl-item-sink.test.ts`, and `eslint.config.js` (the `no-console` tightening + `infra/logging` carve-out). S1–S4d are untouched. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/engine/ports.ts` | Modified | Added `LogLevel`, `LogEvent`, `Logger` |
| `src/infra/logging/redacting-logger.ts` | Created | `withRedaction` — field-name-keyed redaction decorator |
| `src/infra/logging/redacting-logger.test.ts` | Created | 2 tests: multi-field redaction + pass-through, value-sniffing negative case |
| `src/infra/logging/jsonl-logger.ts` | Created | `JsonlLogger` — appends to `logs/run-<runId>.jsonl` via `appendJsonlLine` |
| `src/infra/logging/jsonl-logger.test.ts` | Created | 2 tests: append + non-ASCII round-trip, below-threshold no-op |
| `src/infra/logging/console-logger.ts` | Created | `ConsoleLogger` — stderr-only JSON-line writer |
| `src/infra/logging/console-logger.test.ts` | Created | 2 tests: stderr-only, below-threshold no-op |
| `src/infra/logging/null-logger.ts` | Created | `NullLogger` — default no-op |
| `src/infra/logging/null-logger.test.ts` | Created | 1 test: accepts any event, does nothing |
| `src/engine/__fixtures__/recording-logger.ts` | Created | `RecordingLogger` — in-memory `Logger` test fixture |
| `src/engine/scraper.ts` | Modified | Added `logger: Logger` to `ScraperConfig`; added `emit()` (try/catch-absorbing); wired 8 event emissions across `processUnit`, `runWithRetry`, `retryFailedDocuments`; refactored duplicate `classifyCellState` call into one shared `state` local |
| `src/engine/scraper.test.ts` | Modified | `buildScraper` now wires a `RecordingLogger` by default (overridable); 5 new tests (`unit.started`/`unit.completed`, `unit.saturated`, `fetch.retry`, `session.reprimed`, `ThrowingLogger` safety); 3 existing tests extended with event assertions |
| `src/infra/storage/jsonl.ts` | Modified | `readJsonlFile` gained an optional `logger: Logger = new NullLogger()` parameter; replaced `console.warn` with `logger.log({ event: 'jsonl.tornLineDropped', ... })` |
| `src/infra/storage/jsonl-item-sink.test.ts` | Modified | Added a test proving the torn-line warning now reaches a given `Logger`, not `console.warn` |
| `eslint.config.js` | Modified | `no-console` tightened from `['warn', { allow: ['warn','error'] }]` to a global `'error'`, carved out (`'off'`) for `src/infra/logging/**/*.ts` |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 5.12–5.18 `[x]`; recorded 575 authored `src/` lines actual (updated the per-slice estimate table) |

## Issues Found (S5a)

None blocking. See "Design decisions and deviations" above for the fixed redaction field
set, the `unit.saturated`-as-saturation-split mapping (`TraversalPort.split()` remains
unwired in the engine loop, a pre-existing gap disclosed rather than silently worked
around), the `readJsonlFile` optional-logger backward-compatibility choice, and the
one non-vacuous-by-mutation cycle (`ThrowingLogger` safety test).

## Workload / PR Boundary (S5a)

- Mode: chained PR slice (`feature-branch-chain`)
- Current work unit: S5a — structured logging port and implementations
- Boundary: starts from S4d's merged state (no `src/infra/logging/` directory, no `Logger`
  port); ends with every S1–S4d lifecycle transition the engine loop makes observable
  through a redaction-capable, fire-and-forget `Logger` port, with `NullLogger`/
  `ConsoleLogger`/`JsonlLogger`/`RecordingLogger` implementations, but no CLI/composition
  root wiring them yet (S5b).
- Estimated review budget impact: 575 authored `src/` lines (`git diff --numstat` for
  modified files + full line count for new files, excluding `tasks.md`/`apply-progress.md`
  bookkeeping and `pnpm-lock.yaml`) + 15 lines in `eslint.config.js`, against the 800-line
  budget and the ~330 estimate — 74% over the estimate but well within budget, no
  `size:exception` needed; consistent with every prior slice in this change also exceeding
  its estimate.

### Status (S5a)

7/7 S5a tasks complete (5.12–5.18). `vitest run`: 126/126 passing. `pnpm typecheck`: clean.
`pnpm lint`: clean (engine-seam and console-seam both build-enforced by ESLint).
`pnpm format:check`: clean. Ready for `sdd-verify`, or `sdd-apply` again for S5b (S5b
requires this slice's `Logger` port and implementations, which now exist).

## S5c — Saturation-driven subdivision wired end to end

**Mode**: Strict TDD (see the lost-RED disclosure below — this slice's compliance story is
not a normal RED→GREEN→REFACTOR table for tasks 7.1–7.27).
**Branch**: `feat/scraper-core-s5c-saturation-subdivision` (forked off
`feat/scraper-core-s5a-structured-logging`, at the `9283548` S5c-planning commit).
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #10 in the chain, targeting the S5a
branch. **Owner-accepted `size:exception`**: this slice's own forecast (~950–1300 authored
`src/` lines) already exceeded the 800-line budget before implementation started; it shipped
whole, per the owner's 2026-09-04 decision recorded in `tasks.md`.
**This entry completes a slice a previous actor was interrupted mid-way through.** Tasks
7.1–7.27 (`engine/{types,ports,coverage,scraper}.ts`, the two D12 adapter construction sites,
the non-date portability fake, `docs/sweep-flow.md`) were already implemented and passing
when this run started. Tasks 7.28–7.29 (the reverse-coverage audit) were not yet written. This
entry: (a) verifies every already-implemented behavior actually satisfies its task via a
mutation-detection audit, since the original RED evidence for 7.1–7.27 no longer exists; (b)
writes the missing reverse-coverage audit (7.28–7.29) as genuine, observed strict TDD; (c)
records the two findings tasks (7.26 partition-fake audit, 7.29 reverse-coverage audit) that
this slice's own instructions require to be reported honestly rather than engineered to pass.

### The lost-RED disclosure

**The original RED evidence for tasks 7.1–7.27 was lost when the implementing session was
interrupted and restarted.** A previous actor drove real RED failures for these tasks —
`pnpm test` moved from 126/126 (S5a) to 146/146 across this work — but the transcript
containing that RED output was never captured into this file before the session ended, and it
cannot be reconstructed honestly. This project already has one precedent (S4c → S4d) for what
happens when RED evidence is reconstructed after the fact against code that already exists:
S4c's `git stash`-based retroactive RED was disclosed as a process deviation, and an entire
following slice (S4d) existed solely to prove, by mutation, that the S4c suite could actually
detect a defect rather than merely confirm a file's existence. Repeating that reconstruction
here — restaging a fake RED narrative for code and tests that already exist and already pass —
would be strictly worse than the original problem, because it would misrepresent an audit as a
genuine TDD cycle. **No claim is made anywhere in this entry that a RED failure for tasks
7.1–7.27 was directly observed in this session.** What follows instead is the S4d pattern
applied fresh: one targeted mutation per behavior, the covering test run in isolation, the
real failure observed and quoted, then the mutation reverted. Task 7.28's audit test *is* new
in this session, and its RED evidence (the "Reverse-coverage audit" section below) *was*
genuinely observed here and is quotable as such — that distinction is kept explicit throughout.

### Mutation-detection audit (tasks 7.1–7.27 defect-detection guarantee)

Method: for each of the eleven behaviors this slice's launch prompt named, one targeted
mutation was introduced directly in the implementation, the exact covering test command was
run in isolation, the failure was read and confirmed to name the right defect, the mutation
was reverted, and the suite was confirmed green again before the next mutation. All eleven
mutations were caught. `grep -rn "MUTATION (audit" src/` returns nothing — the working tree
carries none of them.

| # | Behavior | Mutation | Covering command | Result | Observed failure (quoted) |
|---|---|---|---|---|---|
| 1 | A saturated unit calls `split()` and enqueues the returned children | `processUnit`: removed `queue.push(child)` from the child-enqueue loop (kept `splitDepth.set`) | `vitest run src/engine/scraper.test.ts` | **Caught** — 2 tests failed | `expected [ 'item-1', 'item-2', 'item-3', …(2) ] to deeply equal [ 'item-1', 'item-2', 'item-3', …(4) ]` (children's items never appear) + a second failure in the max-split-depth test whose child never got enqueued to reach `discover()` |
| 2 | `split()` returning `null` records the unit `truncated` | `processUnit`: added an unconditional `state = 'subdivided'` before the `children !== null` check | `vitest run src/engine/scraper.test.ts` | **Caught** — exactly the null-split regression test | `expected { …(13) } to match object { state: 'truncated' }` — `- "state": "truncated"` / `+ "state": "subdivided"` |
| 3 | A successfully split parent is recorded `subdivided`, carrying the observed result count | `buildCoverageRecord`: `resultCount: state === 'subdivided' ? 0 : result.count` | `vitest run src/engine/scraper.test.ts` | **Caught** — exactly the subdivided-parent test | `expected { …(13) } to match object { state: 'subdivided', resultCount: 5 }` — `- "resultCount": 5` / `+ "resultCount": 0` |
| 4 | Exceeding max split depth behaves exactly like a `null` split, without calling `split()` again | `processUnit`: replaced `if (depth < this.config.maxSplitDepth)` with `if (true)` | `vitest run src/engine/scraper.test.ts` | **Caught** — exactly the max-split-depth test | `expected [ { …(2) }, { …(2) } ] to have a length of 1 but got 2` (`splitCalls` — the depth-exhausted child was split anyway) |
| 5 | Max split depth is engine-owned state keyed by `unitKey`, never stored on the adapter's `WorkUnit` | `processUnit`: enqueued children as `{ ...child, depth: depth + 1 }` instead of the bare `WorkUnit` | `vitest run src/engine/scraper.test.ts` | **Caught** — exactly the max-split-depth test's WorkUnit-shape assertion | `expected [ 'cursor', 'depth', …(4) ] to deeply equal [ 'cursor', 'facetValue', …(3) ]` — the leaked `depth` key is visible in the diff |
| 6 | `summarizeRunCoverage` excludes `subdivided` from all three tallies and never double-counts a parent against its children | `coverage.ts`: reverted the explicit three-branch `if`/`else if`/`else if` to the old catch-all `else failed += 1` | `vitest run src/engine/coverage.test.ts` | **Caught** — exactly the subdivided-exclusion test | `expected { … } to deeply equal { complete: 1, truncated: 1, …(1) }` — `- "failed": 0` / `+ "failed": 1` |
| 7 | `verifyPartitionInvariant` sources the unfiltered count from the persisted parent cell (latest-by-`observedAt`, never first match) | `coverage.ts`: replaced the latest-by-`observedAt` `reduce` with a bare `Array.find` first match | `vitest run src/engine/coverage.test.ts` | **Caught** — exactly the "sources ... from the LATEST ... never the first array match" test | `expected [ { …(3) } ] to deeply equal [ { …(3) } ]` — `- "unfilteredCount": 30` / `+ "unfilteredCount": 12` (the stale earlier observation shadowed the real parent) |
| 8 | `CheckpointRecord` round-trips `facetValue` and `label` | `JsonlCheckpointStore.put`: persisted `{ ...record, facetValue: null, label: '' }` instead of `record` | `vitest run src/infra/storage/jsonl-checkpoint-store.test.ts` | **Caught** — exactly the facetValue/label round-trip test | `expected null to be 'APELAÇÃO CÍVEL'` |
| 9 | Resume re-splits a `subdivided` parent without re-issuing its discover request | `Scraper.run()`'s resume loop: added `await this.config.site.discover(reconstructed)` before `split()` | `vitest run src/engine/scraper.test.ts` | **Caught** — exactly the resume test, which throws by design if `discover` is called on the un-scripted parent | `Error: no scripted discover outcome for A` |
| 10 | A site declaring `resultPageCap: null` never saturates and is never passed to `split()` | `classifyCellState`: removed the `declaredCap === null` guard | `vitest run src/engine/scraper.test.ts` | **Caught** — exactly the null-cap test, on the `state` field. **Defense-in-depth finding**: `traversal.splitCalls` stayed at `0` even under this mutation, because `scraper.ts`'s own `cap !== null` guard independently prevents `split()` from ever being invoked for a null-cap unit — a second, redundant layer of protection beyond `classifyCellState` itself | `expected { …(11) } to match object { state: 'complete', … }` — `- "state": "complete"` / `+ "state": "truncated"` |
| 11a | `permanentError`'s adapter-owned detail rides in `detail`, not folded into `reason` | `detail.ts`: the `invalidTokenShell` branch returned `detail: null` instead of `detail: 'invalidTokenShell'` | `vitest run src/adapters/trf5/detail.test.ts` | **Caught** — exactly the D12 vocabulary test | `expected { …(2) } to deeply equal { …(2) }` — `- "detail": "invalidTokenShell"` / `+ "detail": null` |
| 11b | `permanentError.reason` carries no site-specific literal | `detail.ts`: moved the site-specific string `'invalidTokenShell'` into the `reason` field itself | `pnpm typecheck` | **Caught — by the type system, not a unit test** | `src/adapters/trf5/detail.ts(34,40): error TS2322: Type '"invalidTokenShell"' is not assignable to type '"notFound" \| "invalidReference" \| "schemaMismatch"'.` |

**11/11 mutations caught, for the right reason in every case.** No gap was found — unlike
S4d, this audit did not need to write a new test to close a discovered hole. Two findings are
worth recording plainly rather than treated as failures: audit #10 shows the null-cap
protection is enforced *twice* (once in `coverage.ts`'s `classifyCellState`, once in
`scraper.ts`'s own `cap !== null` guard before calling `split()`), and audit #11b shows that
half of the "site-agnostic failure vocabulary" requirement (no site-specific literal in
`reason`) is enforced by TypeScript's literal-union type itself, not by a runtime assertion —
a stronger guarantee than a test can provide, and the reason no runtime test could have caught
that particular mutation even if one had been written for it.

### Partition-contract fake: findings (tasks 7.24–7.26)

`engine/__fixtures__/portability-non-date.test.ts` runs the full saturation/split path against
`FakeNonDateSite`/`FakeNonDateTraversal`, which partition a numeric "region" range instead of a
date range, and (in a second scenario) declare `resultPageCap: null`. Both scenarios pass.
What this fake actually had to do to `RunBounds` and `TraversalPort`, reported plainly:

- **`RunBounds.dateFrom`/`dateTo` were repurposed as opaque numeric-string bounds.**
  `FakeNonDateTraversal.seed()` does `Number(bounds.dateFrom)` / `Number(bounds.dateTo)` to
  recover the region range's numeric endpoints. This works — the engine never parses these
  fields as dates, so nothing in `engine/` cares what an adapter puts in them — but it is a
  **type-level fiction**: the field names themselves (`dateFrom`, `dateTo`) assert a date
  shape that this fake's own values are not. A non-date adapter is not blocked by this, but it
  is quietly encouraged to lie about what its own bounds mean. This is a genuine finding, not
  a blocker: `RunBounds` is engine-declared and every field on it is opaque to the engine by
  design (same opacity pattern as `cursor`/`payload`), so nothing breaks at runtime — but the
  *names* leak a date-shaped assumption into what is supposed to be a payload-generic engine
  contract. A future portability slice could rename these to bounds-agnostic terms (e.g.
  `rangeFrom`/`rangeTo`) without any behavior change; this slice does not do that rename, since
  it is out of scope for a fixture-only proof and would touch every TRF5 call site for no
  behavior change.
- **`RunBounds.maxFacetValues` was entirely unused and left meaningless.** `FakeNonDateSite`/
  `FakeNonDateTraversal` never read it. Nothing broke by ignoring it — the field is simply
  irrelevant to a fake that has no facet-expansion dimension of its own (its splits are pure
  date-style bisection, not TRF5's facet-catalogue branch) — but this means the field's
  presence on the shared `RunBounds` type is itself somewhat TRF5-specific in spirit (it exists
  to bound `--max-facet-values`, a concept `TraversalPort.split()`'s design deliberately keeps
  adapter-internal). No test in this fixture exercises what happens if an adapter's `split()`
  *does* want a bound on facet-style expansion along a non-date, non-class dimension.
- **`TraversalPort.facetName`'s singular contract did not block this fake, because this fake
  only ever splits along one dimension (the region number itself) — it never needed a second,
  facet-like axis the way TRF5's date→class fallback does.** `FakeNonDateTraversal.facetName`
  is simply `'region'`, declared but never consulted by the engine outside of what TRF5 does
  with it (nothing — `facetName` is read by nothing in `engine/`, only recorded as a
  declaration). So the honest finding is: **this fake did not actually test whether a genuinely
  multi-dimensional split (needing more than one facet-like axis, the way TRF5 falls back from
  date-bisection to class-facet-expansion) would be blocked or merely inconvenienced by the
  singular `facetName` field — because this fake never needed a second dimension to reach
  every leaf under the cap.** That question remains open for a future slice that builds a fake
  needing two independent partitioning axes; nothing here proves or disproves it either way.

**Nothing broke** in the sense of a compile error, a runtime throw, or a failing assertion —
both scenarios in `portability-non-date.test.ts` pass green. The findings above are about
what the fake had to *quietly accept* (opaque-but-misleadingly-named fields, an unused field)
rather than what it could not do at all.

### Reverse-coverage audit: findings (tasks 7.28–7.29)

`engine/__fixtures__/ports-coverage-audit.test.ts` extracts every `export interface`/`export
type` declaration from `engine/ports.ts` by reading its source text (interfaces and type
aliases are compile-time-only, so there is nothing to introspect at runtime — the same
source-text-reading technique `portability.test.ts`'s module-graph check already uses),
and checks each extracted symbol against a hand-maintained map to at least one requirement
heading under `openspec/changes/scraper-core/specs/`.

**Genuine RED observed for task 7.28** (quotable, unlike the mutation-audit section above,
because this test and its map are new in this session): the map was authored with `Logger`'s
entry temporarily removed, and the audit assertion failed exactly as expected —

```
AssertionError: expected [ 'Logger' ] to deeply equal []
```

— before the entry was restored and the suite went green (`3 tests passed`). This is the one
genuine, test-first RED this slice can honestly claim, and it is disclosed as such precisely
because the rest of this entry disclaims that same claim for tasks 7.1–7.27.

**Finding: all 25 symbols exported from `engine/ports.ts` trace to at least one named
requirement. No untraced symbol was found.** Per this task's own instruction, no requirement
was invented or reworded to make this outcome true — the map below is what it is:

| Symbol | Requirement(s) |
|---|---|
| `HttpRequest` | core-resilience-policy: Stubbed-Transport Test Isolation; trf5-adapter: Complete Search Form Field Set |
| `HttpResponse` | core-resilience-policy: Stubbed-Transport Test Isolation; trf5-adapter: Document Byte-Level ISO-8859-1 Decoding |
| `HttpTransport` | core-resilience-policy: Stubbed-Transport Test Isolation |
| `DiscoverResult` | core-scraping-engine: Two-Stage Discover-Then-Fetch Execution |
| `StoredDocument` | trf5-adapter: Document Persistence to Disk |
| `DocumentSink` | trf5-adapter: Document Persistence to Disk |
| `SitePort` | core-scraping-engine: Payload-Generic Port Contracts |
| `RunBounds` | core-run-control-and-output: CLI Bound Enforcement; core-frontier-crawl: Mandatory Date Range on Seed Searches |
| `SaturationInfo` | core-scraping-engine: Saturation-Driven Subdivision |
| `TraversalPort` | core-scraping-engine: Payload-Generic Port Contracts; core-scraping-engine: Saturation-Driven Subdivision |
| `Seed` | core-frontier-crawl: Seed Harvesting and Prioritization |
| `FrontierCapable` | core-frontier-crawl: Deferred Phase-2 Invocation; core-frontier-crawl: Seed Harvesting and Prioritization |
| `CheckpointRecord` | core-scraping-engine: Opaque Checkpoint Persistence; core-scraping-engine: Saturation-Driven Subdivision |
| `CheckpointStore` | core-scraping-engine: Opaque Checkpoint Persistence |
| `LedgerEntry` | core-coverage-accounting: Separate Checkpoint and Failure Ledger Concerns |
| `FailureLedger` | core-coverage-accounting: Separate Checkpoint and Failure Ledger Concerns |
| `OutputRecord` | core-run-control-and-output: Mandatory Envelope Fields |
| `ItemSink` | core-run-control-and-output: JSONL Append-Only Output; core-coverage-accounting: Deduplication by Adapter-Declared Identity Key |
| `CoverageRecord` | core-coverage-accounting: Cell State Ledger |
| `CoverageSink` | core-run-control-and-output: Separate Coverage Ledger File |
| `AdapterStateStore` | core-frontier-crawl: Deferred Phase-2 Invocation |
| `Clock` | core-resilience-policy: Stubbed-Transport Test Isolation |
| `LogLevel` | core-run-control-and-output: Structured Run Observability |
| `LogEvent` | core-run-control-and-output: Structured Run Observability; core-run-control-and-output: Personal Data Handling Rules |
| `Logger` | core-run-control-and-output: Structured Run Observability |

This is a genuinely different result from S4c/S5a's own history: both of those slices found a
real gap this exact shape of check would have caught (`DocumentSink`, `Logger` themselves, in
fact — both now present and correctly traced above). That earlier history is exactly why this
audit exists; that it currently finds nothing is a report on the current state of
`engine/ports.ts`, not evidence the audit is toothless — its own non-vacuousness is proven by
the genuine RED quoted above, which is unaffected by whether the *current* file happens to be
fully covered.

### Strict-TDD compliance for S5c

| Task range | Genuine RED observed by this session? | Compliance status |
|---|---|---|
| 7.1–7.27 | **No — lost, not reconstructed.** | Disclosed above. Each behavior instead carries a mutation-audit row (11/11 caught) proving the covering test detects a wrong implementation, which is the guarantee RED exists to provide, obtained by a different honest method. |
| 7.28 (RED) | **Yes** — `expected [ 'Logger' ] to deeply equal []`, observed before the map was restored | Genuine strict TDD: real RED, quoted, before GREEN. |
| 7.29 (GREEN) | N/A — implementation already satisfied the audit once the map was complete; no further code change was needed | The audit passing against the real `engine/ports.ts` *is* task 7.29's GREEN. |

No task in this slice is marked FAILED: 7.1–7.27's status is an honest "unknown/lost,
substituted by an equivalent-strength mutation audit," never a silent claim of clean RED — and
7.28–7.29's status is genuine, observed strict TDD.

### Design decisions and deviations

- **Correction, added by a later S5c follow-up session (see "S5c follow-up: `resultCount`
  fabrication" at the end of this section):** the claim immediately below was inaccurate. A real
  deviation from `design.md` D10 existed in the code this session reviewed — `run()`'s resume
  loop fabricated `SaturationInfo.resultCount` from the declared cap instead of the observed
  count, and `design.md`'s own "Re-split inputs" row described a mechanism
  (`CoverageSink.load()`) that has never existed. Neither was introduced by this session, but
  the claim that no deviation existed was wrong: the deviation was there, unnoticed by this
  session's own mutation audit (which targeted the *behaviors* the existing tests already
  covered, not the resume loop's un-asserted `saturated` argument), and was found by a
  subsequent `sdd-verify` review, not by apply. The original sentence is preserved below,
  unedited, as an honest record of what this session believed at the time:
- **No implementation deviation from `design.md` D10–D12 was found or introduced by this
  session.** Every mutation in the audit above targeted the *existing* implementation exactly
  as this slice's predecessor left it; none required a design correction to make the covering
  test pass again after reverting.
- **The reverse-coverage audit (`ports-coverage-audit.test.ts`) reads `ports.ts`'s source text
  with a regex rather than importing the module and inspecting runtime exports.** TypeScript
  `interface`/`type` declarations are erased at compile time and have no runtime
  representation, so there is nothing to `Object.keys()` — the same constraint
  `portability.test.ts`'s own module-graph check already works around by reading source text
  directly. This is a structural necessity, not a design choice with an alternative.
- **The non-vacuousness proof for the reverse-coverage audit mutates a local copy of the map
  inside the test itself (`{ ...REQUIREMENT_MAP }`, `delete mutatedMap.CoverageSink`), in
  addition to the separately-disclosed manual mutation of the real module-level map (removing
  `Logger`'s entry) used to produce the genuine RED transcript above.** Both exist for
  different reasons: the in-test mutation is a permanent regression guard that runs on every
  `vitest run` forever; the manual module-level mutation was a one-time act to produce
  quotable, observed RED evidence for this apply-progress entry, then reverted.

### Test Summary

- **Total tests added this session**: 3 (`ports-coverage-audit.test.ts`) — everything else
  under tasks 7.1–7.27 (coverage.test.ts, scraper.test.ts, jsonl-checkpoint-store.test.ts,
  detail.test.ts, documents.test.ts, retry-policy.test.ts, persisted-identifier-stability.test.ts,
  portability-non-date.test.ts and its two fakes) was already present and passing when this
  session started.
- **Full-suite tests passing**: 149/149 (`vitest run`), up from 146/146 at session start (the
  3 new audit tests) and up from 126/126 at S5a.
- **Mutations introduced during the audit**: 11 (one per behavior) + 2 (the genuine-RED
  manual mutation on `ports-coverage-audit.test.ts`'s map, applied and reverted twice — once to
  observe RED, once implicitly confirmed already-fixed by restoring) = effectively 12 distinct
  edit/revert cycles across the session, all reverted; `grep -rn "MUTATION (audit" src/`
  returns nothing and `git diff` on every mutated file shows no residual change beyond this
  slice's own already-intended additions.
- **Mutations caught**: 11/11 (no gap found — unlike S4d, no new test needed to be added to
  close a hole).
- **Layers used**: Unit pure (coverage.ts, encoding-adjacent D12 sites), Unit + in-memory
  engine stores (scraper.ts saturation/subdivision/resume paths), Unit + real temp-dir I/O
  (jsonl-checkpoint-store.ts), Unit + StubTransport (detail.ts/documents.ts D12 sites),
  source-text audits (portability module-graph check, reverse-coverage audit) — no
  Integration/E2E layer, by design, as in every prior slice.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/engine/coverage.test.ts src/engine/scraper.test.ts src/engine/__fixtures__ src/infra/storage/jsonl-checkpoint-store.test.ts src/adapters/trf5/detail.test.ts src/adapters/trf5/documents.test.ts` → all green (subset of the full 30-file, 149-test suite) |
| Runtime harness command/scenario and exact result | N/A — CLI not wired until S5b (per `tasks.md`'s S5c row); every scenario is proven through in-memory engine stores, `StubTransport`, and the two fake-adapter fixtures, this slice's actual runtime boundary |
| Rollback boundary | Delete the `subdivided` state, split-depth tracking, and checkpoint `facetValue`/`label` fields from `engine/{ports,coverage,scraper}.ts`; revert `SitePort.resultPageCap`/`CoverageRecord.declaredCap` to non-null `number`; revert `permanentError.reason`/`detail` in `engine/types.ts` and the two TRF5 construction sites; delete the non-date fake, `docs/sweep-flow.md`, and `ports-coverage-audit.test.ts`. S5a and every earlier slice remain unaffected — confirmed by the full 149-test suite passing with zero further changes. |

### Files Changed (this session)

| File | Action | What Was Done |
|------|--------|---------------|
| `src/engine/__fixtures__/ports-coverage-audit.test.ts` | Created | Reverse-coverage audit — maps every `engine/ports.ts` export to a named requirement; proven non-vacuous by a genuine, observed mutation-and-restore RED/GREEN cycle |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 7.1–7.29 `[x]` with per-task result notes; recorded 1084 actual authored `src/` lines; updated the running estimate table |
| `openspec/changes/scraper-core/apply-progress.md` | Modified | This section — merged in without altering any prior slice's recorded evidence |

All other `src/` files touched under tasks 7.1–7.27 (`engine/{types,ports,coverage,scraper}.ts`
and their tests, `infra/storage/jsonl-checkpoint-store.test.ts`,
`adapters/trf5/{detail,documents}.ts` and their tests, `adapters/trf5/retry-policy.test.ts`,
`adapters/trf5/persisted-identifier-stability.test.ts`, the two non-date fakes and their test,
`docs/sweep-flow.md`) were already present in the working tree when this session started; this
session read, verified, and mutation-audited them rather than rewriting them. No line in any of
those files was changed by this session except through a mutation that was immediately
reverted.

## Issues Found (S5c)

None blocking. Two findings are recorded above rather than silently engineered away: the
partition-contract fake's `RunBounds.dateFrom`/`dateTo` type-level fiction and unused
`maxFacetValues` (tasks 7.24–7.26), and the reverse-coverage audit's honest "nothing untraced"
result (tasks 7.28–7.29) alongside the defense-in-depth null-cap guard and the
type-system-enforced half of the site-agnostic-vocabulary requirement (mutation audit #10/#11b).

## Workload / PR Boundary (S5c)

- Mode: chained PR slice (`feature-branch-chain`), owner-accepted `size:exception`
- Current work unit: S5c — saturation-driven subdivision wired end to end
- Boundary: starts from S5a's merged state (`Logger` port and implementations exist, but
  `TraversalPort.split()` was never called from `engine/scraper.ts`); ends with `split()`
  genuinely wired into both the live-saturation path and the resume-from-checkpoint path,
  `subdivided` correctly ledgered and excluded from summary arithmetic, split depth bounded
  and engine-owned, the D12 site-agnostic failure vocabulary landed at both TRF5 construction
  sites, a second (non-date, null-cap) portability fixture proving the mechanism is not
  date-shaped, `docs/sweep-flow.md` for onboarding, and a reverse-coverage audit proving every
  `engine/ports.ts` export still traces to a requirement. S5b remains unstarted.
- Estimated review budget impact: **1084 authored `src/` lines** — 587 from 13 modified files
  (545 insertions + 42 deletions, `git diff --numstat`), plus 358 lines across 4 new files
  already present at session start (`detail-page-schema-mismatch.html` 17,
  `fake-non-date-site.ts` 82, `fake-non-date-traversal.ts` 47, `portability-non-date.test.ts`
  212), plus 139 lines for this session's new `ports-coverage-audit.test.ts` — against the
  800-line budget and the slice's own ~950–1300 forecast: **above the budget, within the
  forecast's own range**, consistent with the owner's explicit `size:exception`.
  `docs/sweep-flow.md` (185 lines) is documentation, excluded from this count per `tasks.md`
  7.27's own instruction.

### Status (S5c)

29/29 S5c tasks complete (7.1–7.29). `vitest run`: 149/149 passing. `pnpm typecheck`: clean.
`pnpm lint`: clean. `pnpm format:check`: clean. Ready for `sdd-verify`, or `sdd-apply` again
for S5b (S5b requires this slice's amended `summarizeRunCoverage`/`verifyPartitionInvariant`
arithmetic, which now exists and is mutation-audited).

### S5c follow-up: `resultCount` fabrication (task 7.30)

**Found by a subsequent `sdd-verify` review of this slice, not by this apply session.** The
review verified `run()`'s resume loop (`scraper.ts`, then lines ~125–129) and found it fabricated
`SaturationInfo.resultCount` by passing the site's declared cap (`cap ?? 0`) as if it were the
observed result count:

```ts
const cap = this.config.site.resultPageCap;
const children = await this.config.traversal.split(reconstructed, {
  resultCount: cap ?? 0,
  cap,
});
```

This substitution is usually harmless for a saturated TRF5 cell, whose result count equals its
cap by definition, but it is wrong for any site whose search reports more matches than it
displays — a real coverage number silently replaced by a plausible-looking one, which
contradicts this project's central claim that it never fabricates coverage numbers.

**Design.md's own "Re-split inputs" row was also wrong, independent of the code.** It stated
`SaturationInfo` "is read off the parent's own `subdivided` coverage record." `CoverageSink`
(`engine/ports.ts`) has only ever declared `write(record)`, never `load()`, and `CoverageRecord`
carries no way back into the resume path — the design named a mechanism that does not exist.

**Fix, strict-TDD (RED observed, quoted, before GREEN):**

1. Extended the existing `scraper.test.ts` test "persists facetValue and label alongside
   cursor..." with `resultCount: 1` in the `toMatchObject` assertion on the checkpoint written
   by a normal run. Extended the existing test "resumes a subdivided checkpoint by
   re-splitting it directly..." with a checkpoint `resultCount: 7` (deliberately greater than
   the site's declared cap of 5, so a fabricated cap cannot pass by coincidence) and a new
   assertion `expect(traversal.splitCalls[0]?.saturated).toEqual({ resultCount: 7, cap: 5 })`.
2. Ran `pnpm exec vitest run src/engine/scraper.test.ts` against the unmodified implementation.
   Both assertions failed genuinely:
   ```
   AssertionError: expected { unitKey: 'A', …(6) } to match object { unitKey: 'A', …(3) }
   -   "resultCount": 1,

   AssertionError: expected { resultCount: 5, cap: 5 } to deeply equal { resultCount: 7, cap: 5 }
   -   "resultCount": 7,
   +   "resultCount": 5,
   ```
   The second failure is the exact defect: the resume loop handed the fabricated cap (5) where
   the persisted observation (7) belonged.
3. GREEN: added `resultCount: number` to `CheckpointRecord` (`engine/ports.ts`), populated it at
   the `checkpointStore.put(...)` call site in `processUnit` from the already-in-scope
   `discoverResult.value.count`, and changed the resume loop to pass `checkpoint.resultCount`
   instead of `cap ?? 0`. Re-ran the same focused test: both assertions passed. Updated the four
   other `CheckpointRecord` literal construction sites (`jsonl-checkpoint-store.test.ts` ×3,
   `persisted-identifier-stability.test.ts` ×1) to supply the now-required field, with no
   behavioral change to those tests.
4. Corrected `design.md`'s "Re-split inputs" row and its `CheckpointRecord` comment to describe
   the mechanism that actually exists: `resultCount` is the third field the checkpoint persists,
   reconstructed on resume alongside `cursor`/`facetValue`/`label`; `cap` is read live from
   `SitePort.resultPageCap` (a static site property, not run history) and is never itself
   persisted. `CoverageSink.load()` was not invented — the checkpoint was already the correct
   home, since the resume path already reads it for `cursor`/`facetValue`/`label`.

#### TDD Cycle Evidence (task 7.30)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 7.30 | `src/engine/scraper.test.ts` | Unit (in-memory engine stores) | ✅ 149/149 (full suite, pre-change) | ✅ Written — quoted failure above | ✅ Passed — `vitest run src/engine/scraper.test.ts` 23/23 | ✅ 2 cases (write-site population; resume-loop consumption), each a distinct causal step in the same defect | ➖ None needed — the two fixes are each a one-line change at an already-clear call site |

#### Work Unit Evidence (task 7.30)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/engine/scraper.test.ts` → 23/23 passing (was 21/23 before the GREEN fix, with the 2 failures quoted above) |
| Runtime harness command/scenario and exact result | N/A — same as the rest of S5c: CLI not wired until S5b; proof is the in-memory engine-store test above |
| Rollback boundary | Revert `resultCount: number` from `CheckpointRecord` (`engine/ports.ts`), the `resultCount,` addition to the `checkpointStore.put(...)` call and the `checkpoint.resultCount` read in the resume loop (`engine/scraper.ts`), the two extended assertions in `scraper.test.ts`, and the four now-required-field additions in `jsonl-checkpoint-store.test.ts`/`persisted-identifier-stability.test.ts`; every other S5c file is unaffected |

#### Files Changed (task 7.30)

| File | Action | What Was Done |
|------|--------|---------------|
| `src/engine/ports.ts` | Modified | Added `resultCount: number` to `CheckpointRecord`, commented in the same style as `facetValue`/`label` |
| `src/engine/scraper.ts` | Modified | `processUnit`'s `checkpointStore.put(...)` now includes `resultCount` (the already-in-scope observed count); the resume loop in `run()` passes `checkpoint.resultCount` instead of `cap ?? 0` |
| `src/engine/scraper.test.ts` | Modified | Extended two existing tests with RED-first assertions on the persisted and resumed `resultCount` |
| `src/infra/storage/jsonl-checkpoint-store.test.ts` | Modified | Added `resultCount` to 4 pre-existing `CheckpointRecord` literals for type-correctness; no behavioral change |
| `src/adapters/trf5/persisted-identifier-stability.test.ts` | Modified | Added `resultCount` to 1 pre-existing `CheckpointRecord` literal for type-correctness; no behavioral change |
| `openspec/changes/scraper-core/design.md` | Modified | Corrected the `CheckpointRecord` comment and the "Re-split inputs" row to describe the actual mechanism, not a `CoverageSink.load()` that never existed |
| `openspec/changes/scraper-core/tasks.md` | Modified | Added task 7.30, marked `[x]`, with a result note |

#### Issues Found (task 7.30)

The defect and the `design.md` inaccuracy are both described above. No further issue found:
`pnpm test` (149/149 — both new assertions extended existing `it()` blocks rather than adding
new ones), `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` are all clean after the fix.

#### Status (task 7.30)

1/1 follow-up task complete. Full suite: 149/149 passing (2 existing tests extended, no new
`it()` blocks added). `pnpm typecheck`/`lint`/`format:check`: clean. Ready for `sdd-verify`.

## S5b — CLI, bounds, and run control (partial: tasks 5.1–5.8 complete, 5.9–5.11 stopped)

**Mode**: Strict TDD
**Branch**: `feat/scraper-core-s5b-cli-run-control` (forked off
`feat/scraper-core-s5c-saturation-subdivision`, at commit `8189bf9`).
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #11 in the chain, targeting the S5c
branch.
**Budget**: 800 authored `src/` lines for this slice. **Stopped at 775/800** after 5.1–5.8,
before starting 5.9, per the launch prompt's explicit hard stop rule ("if mid-slice you can
see the slice will land materially above 800 authored src lines, STOP").

### Why this apply stopped mid-slice

Task 5.9 reads: "GREEN implement `src/main.ts` composition root: wires `TRF5Site`/
`TRF5Traversal` + `AxiosTransport` + JSONL stores + the redaction-wrapped `Logger` into
`scrape` / `scrape --frontier` / `retry-failed`." Wiring `TRF5Site` requires a full
`SitePort<TrfPayload, DocumentRow>` implementation — concretely, a `discover(unit)` method
that: (1) builds `SearchCriteria` from a `WorkUnit`, (2) calls `search()` (already built,
S3), (3) **parses the AJAX search-response fragment into a list of `ca` tokens plus a result
count** — the input `classifyCellState`/`isSaturated` need to judge saturation — and (4) calls
`fetchDetail(...)` (already built, S4a) per row to assemble the final `TrfPayload` list.

Step (3) does not exist anywhere in this codebase, and was never built by any prior slice:

- `src/adapters/trf5/__fixtures__/search-ok.xml` (created in S3, task 3.1) is a literal
  zero-row stub whose only content is the comment `<!-- synthetic fixture: zero rows;
  result-row extraction lands in S4 -->`.
- S4a's apply-progress (task 3.10/3.11 note, reproduced there) explicitly scoped `site.ts` to
  "the declared constants... a full `TRF5Site` class needs `TItem`/`TDoc` types that only
  exist once S4's payload assembly lands," deferring the full implementation onward.
- S4b's apply-progress restates: "`site.ts`'s `SitePort.fetchDocument` wiring is not touched
  in this slice... connecting `documents.ts`'s `fetchDocument` (and `TRF5Site.discover`) to
  the full `SitePort<TItem, TDoc>` shape is S5's composition-root job."
- S4c's apply-progress repeats the same deferral a third time, unchanged.
- No task in S3, S4a, S4b, S4c, S5a, or S5c ever creates `parsing/result-fragment.ts` (named
  in `design.md`'s own module layout, line 24: `parsing/ (detail-page.ts
  result-fragment.ts)`) or any equivalent. Grepped the whole `src/` tree for
  `openPopUp|ca=|resultado|dataTable|parseSearch|result-fragment|ResultFragment` before
  concluding this — the only matches are the already-known `ca=` query-parameter usages in
  `detail.ts`/`documents.ts`/tests, none of which parse a *list* of rows out of a search
  response.

This is the same shape of planning gap S4c (document persistence never wired to disk) and
S5a (the logging port `design.md` promised but no task ever built) each disclosed before
landing — a component or behavior implied by `design.md`'s module layout and required by the
literal task wording, invisible to the change's own Requirement Coverage Map because that map
checks "requirement -> slice", not "port method -> concrete implementation." Building it
honestly requires:

1. `adapters/trf5/parsing/result-fragment.ts` — extract `ca` tokens (regex/cheerio over the
   `openPopUp(...)` `onclick` handlers, per `docs/RESEARCH.md` Step 3) and a result count from
   the AJAX fragment; a new redacted fixture with synthetic rows (the current `search-ok.xml`
   has zero rows by design and cannot exercise this).
2. `TRF5Site` (or an extension of `site.ts`) implementing `discover`/`fetchDocument`/
   `reprimeSession` — composing `search.ts` + the new row parser + `detail.ts` per row,
   deciding what happens when a per-row detail fetch fails mid-loop (a genuinely new adapter
   design question, not a wiring exercise).
3. `infra/http/axios-transport.ts` — the first real (non-stub) `HttpTransport`
   implementation, using `axios` + `axios-cookiejar-support` + `tough-cookie` per
   `design.md`'s module layout.
4. `src/main.ts` itself, wiring all of the above plus the JSONL stores and the
   redaction-wrapped `Logger`.

Given 5.1–5.8 already measured 775 of the 800-line budget, and items 1–4 above are, by their
own nature, at least as large as any single already-measured slice in this change (S3 alone,
which built comparable session/search-composition logic, measured 835 lines), continuing
would put this single PR at an estimated 1400–1700+ authored lines — well past even S5c's
1084-line `size:exception`, and for a *different* deliverable than 5.1–5.8's CLI/bounds work,
which is itself complete, independently testable, and coherent on its own (this is exactly
the "split by coherent deliverable" standing rule the tasks.md forecast has repeated since
S2). Stopping here rather than pushing through is what the launch prompt's hard stop rule
asks for.

**Recommendation for the orchestrator**: split S5b's remaining scope (5.9–5.11) into its own
follow-up slice — analogous to how S4c/S4d/S5a were each spawned as their own slice when a
planning gap was found mid-change — sized and reviewed independently of this already-complete
CLI/bounds deliverable. `cli/args.ts`, `cli/dry-run.ts`, and `cli/summary.ts` need no further
change to support that follow-up slice; `main.ts` will import them as-is.

### Completed Tasks

- [x] 5.1 RED `engine/budget.test.ts` — `--max-documents` (global ceiling) stops further
      fetches once reached; `--max-items` stops discovery once reached; an omitted
      `--max-requests` still stops at the default ceiling; only the literal `"unbounded"`
      opts out; `--documents-per-item` bounds independently of the global document ceiling;
      `clampDateRange` truncates `dateTo` rather than rejecting an oversized range.
- [x] 5.2 GREEN implement `engine/budget.ts` (`Budget`, `unboundedBudget`, `clampDateRange`,
      `DEFAULT_MAX_REQUESTS`, `DEFAULT_MAX_DOCUMENTS`); wired into `engine/scraper.ts` at
      three points: the worker loop (stops pulling further units once the item or request
      ceiling is exhausted — the whole run stops, never just one unit), the items loop (stops
      collecting once `--max-items` is hit, the cell still proceeds to its
      coverage/checkpoint record, never erroring the run), and the documents loop (stops
      fetching once `--max-documents`/`--documents-per-item` is hit, a global bound checked
      before every fetch attempt). `Budget` added as a required `ScraperConfig` field, with
      `unboundedBudget()` as the default in `scraper.test.ts`'s `buildScraper` helper and the
      second `new Scraper(...)` construction site in `portability-non-date.test.ts` (both
      needed the update once `budget` became required — neither TDD-covered independently,
      since they are test-fixture plumbing, not production behavior).
- [x] 5.3 RED `cli/args.test.ts` — parses the complete documented flag set for `scrape`;
      applies every documented default when a flag is omitted; requires `--from`/`--to`
      (never implicitly unbounded); only the literal `"unbounded"` disables `--max-requests`;
      `--dry-run` sets `dryRun: true`; an unrecognized `--log-level` is rejected;
      `retry-failed` parses with no further flags required; an unknown command is rejected.
- [x] 5.4 GREEN implement `cli/args.ts` — zero-dependency hand-rolled `--flag value` /
      `--flag=value` reader (no CLI-parsing library added for a ~10-flag surface, matching
      `design.md`'s "Declined Abstractions" ethos); `ParsedArgs = ScrapeArgs |
      RetryFailedArgs` discriminated union on `command`.
- [x] 5.5 RED `cli/dry-run.test.ts` — forecasts one search request per day in the optimistic
      non-saturated case; adds forecasted detail/document requests bounded by the declared
      `resultPageCap`; never exceeds an explicit `--max-requests`; clamps the forecasted day
      count to `--max-days`; estimates duration from the forecasted request count and
      politeness spacing; `printDryRunForecast` writes exactly one line carrying both numbers.
- [x] 5.6 GREEN implement `cli/dry-run.ts` (`forecastRun`, `printDryRunForecast`) — a
      disclosed heuristic, explicitly not a certified prediction (the same honesty the
      project already applies to coverage arithmetic). "Zero discovery requests" holds **by
      construction**: `forecastRun`'s signature accepts no `HttpTransport`/`SitePort`
      argument at all, so it is structurally incapable of issuing one — this is disclosed
      here rather than asserted against a stub transport that could never have been called
      regardless of the implementation (see "Deviations" below).
- [x] 5.7 RED `cli/summary.test.ts` — printed summary equals `summarizeRunCoverage`'s exact
      counts; a `subdivided` record contributes to none of the three printed tallies (S5c's
      D10 exclusion); only the latest observation per `unitKey` is reflected, exactly as
      `summarizeRunCoverage` already does.
- [x] 5.8 GREEN implement `cli/summary.ts` (`formatRunSummary`, `printRunSummary`) — calls
      `summarizeRunCoverage` directly and prints its three counts verbatim; makes no
      independent completeness claim.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.1/5.2 | `budget.test.ts` | Unit (pure) | N/A (new) | ✅ `Cannot find module './budget.js'` | ✅ 8/8 passed | ✅ 8 cases: document ceiling (global, cross-item), item ceiling, per-item document cap, default request ceiling, explicit-unbounded opt-out, `unboundedBudget()` never stops, two `clampDateRange` cases | ➖ None needed |
| 5.2 (scraper.ts wiring) | `scraper.test.ts` (2 new tests) | Unit + in-memory engine stores | ✅ 25/25 (full pre-batch suite) | ✅ 2/2 new tests failed for the right reason (see transcript below) | ✅ 25/25 (23 pre-existing + 2 new) passed | ✅ 2 cases: max-items truncates the items loop but still proceeds to checkpoint; max-documents stops the doc loop globally, mid-item, without discarding the item | ➖ None needed |
| 5.3/5.4 | `args.test.ts` | Unit (pure) | N/A (new) | ✅ `Cannot find module './args.js'` | ✅ 8/8 passed | ✅ 8 cases: full flag set, defaults, missing-`--from`/`--to` rejection, `unbounded` literal vs. omission, `--dry-run` presence, unrecognized `--log-level`, `retry-failed`, unknown command | ➖ None needed |
| 5.5/5.6 | `dry-run.test.ts` | Unit (pure) | N/A (new) | ✅ `Cannot find module './dry-run.js'` | ✅ 6/6 passed | ✅ 6 cases: no-cap/no-doc baseline, cap+documents combined, `--max-requests` ceiling, `--max-days` clamp (unclamped vs. clamped), duration-from-count, single-line print output | ➖ None needed |
| 5.7/5.8 | `summary.test.ts` | Unit (pure) | N/A (new) | ✅ `Cannot find module './summary.js'` | ✅ 3/3 passed | ✅ 3 cases: all three states plus a `subdivided` exclusion, latest-observation-per-unitKey, sink-writing variant | ➖ None needed |

**5.2's wiring RED transcript** (`pnpm exec vitest run src/engine/scraper.test.ts`, before
`budget` was read anywhere in `scraper.ts`): the "stops collecting further items" test failed
with `AssertionError: expected [...] to have a length of 1 but got 2` (both items were
written — the unbounded default meant nothing constrained collection yet); the "stops
fetching further documents" test failed with `Error: no scripted fetch outcome for
item-A:doc-2` (the loop fetched a second document the budget should have blocked, and the
test's script only stubbed one outcome — the fetch attempt itself is the observable proof the
ceiling was not yet enforced). Both are genuine failures for the right reason: the assertion
each protects is exactly the behavior 5.2's GREEN step adds.

### Deviations and design decisions

- **`--max-requests` counts logical fetch operations (one `discover()` attempt, one
  `fetchDocument()` attempt), not raw HTTP requests.** `TRF5Site.discover()` (not yet built —
  see the stop discussion above) will itself compose multiple physical HTTP calls internally
  (one search POST plus N detail GETs), which the engine's `runWithRetry` never observes
  individually — it only sees the coarse-grained `FetchOutcome` `discover()`/`fetchDocument()`
  return. Enforcing a true per-HTTP-request ceiling would require plumbing budget awareness
  into the transport layer itself, which no task in this slice's scope asks for and which
  would blur the seam between "engine-level fetch attempt" (what `Budget` tracks today) and
  "adapter-internal request composition" (an adapter concern). This is a disclosed
  simplification, not a silently narrower reading — `budget.test.ts`'s and `args.test.ts`'s
  own tests describe the axis as "requests" in the CLI-facing sense the spec uses, and the
  wiring in `scraper.ts` calls `recordRequest()` at exactly the two points where the engine
  itself initiates a fetch.
- **`cli/dry-run.test.ts`'s task wording ("zero discovery requests reach the stub transport")
  is satisfied by construction, not by a stub-transport spy assertion.** `forecastRun`'s
  signature takes only `(dateFrom, dateTo, config: DryRunConfig)` — no transport, no
  `SitePort`, nothing capable of issuing a request exists in its call graph. A test asserting
  "a spy transport was never called" would only prove the test harness never called it, not
  that the *implementation* could not — the stronger, honest proof is that the function's own
  type signature makes a discovery request structurally unreachable. This is disclosed here
  rather than papered over with a spy-transport test that would pass trivially regardless of
  implementation.
- **`forecastRun`'s heuristic is deliberately optimistic and explicitly labeled as such** in
  `printDryRunForecast`'s own output string ("heuristic — not a certified prediction").
  Neither the spec scenario nor the task wording pins an exact formula; the chosen one (one
  search request per day, plus `min(maxItems, days × resultPageCap)` detail requests, plus
  `min(maxDocuments, detailRequests)` document requests, all capped by `maxRequests`) mirrors
  the same "coverage is measured, never certified" honesty the project already applies to
  `engine/coverage.ts`'s arithmetic — a forecast that claimed precision it cannot deliver
  (since saturation/subdivision genuinely cannot be predicted without running discovery) would
  be a worse defect than an honestly-labeled approximation.
- **`--max-days`/`--max-facet-values` default to `Number.POSITIVE_INFINITY`/`20`
  respectively when omitted**, not values pinned by any spec scenario (the two documented
  scenarios in `core-run-control-and-output` only cover `--max-documents`/`--max-items`
  explicitly). `Number.POSITIVE_INFINITY` for `--max-days` means "no truncation unless the
  operator opts in," consistent with every other axis in this slice defaulting to "no cap"
  when the CLI doesn't specify one *except* `--max-requests`, which the spec explicitly
  requires a non-omittable default for. `20` for `--max-facet-values` is a judgment call
  against `TRF5Traversal.split()`'s existing consumption of `bounds.maxFacetValues` (already
  built in S3) — small enough that a saturated single day does not default to fetching and
  spawning all ~132 classes.
- **`Budget`'s document ceiling is enforced at the moment a fetch is *attempted*, not at the
  moment it *succeeds*.** The spec scenario reads "WHEN the 10th document is fetched THEN no
  further document fetches are issued" — read as counting attempts, matching
  `scraper.ts`'s existing `document.failed`/`document.persisted` event pair, both of which
  fire only after an attempt was already committed to.
- **The two pre-existing `new Scraper(...)` construction sites outside `scraper.test.ts`'s
  `buildScraper` helper** (`portability-non-date.test.ts`, both scenarios) needed a
  `budget: unboundedBudget()` addition once `ScraperConfig.budget` became a required field.
  This is disclosed as fixture plumbing, not independently TDD-covered — the two tests
  already existing (from S5c) fully protect the behavior; only the construction call needed
  updating to keep compiling/running, exactly the same category of change S5a's own
  `buildScraper` `logger` addition needed.

### Test Summary

- **Total tests added (S5b, 5.1–5.8)**: 27 (8 `budget.test.ts`, 2 new `scraper.test.ts`, 8
  `args.test.ts`, 6 `dry-run.test.ts`, 3 `summary.test.ts`)
- **Total tests passing (S5b, 5.1–5.8)**: 27/27
- **Full-suite tests passing**: 176/176 (`vitest run`), up from 149/149 at S5c's task 7.30
- **Layers used**: Unit pure (25: budget, args, dry-run, summary), Unit + in-memory engine
  stores (2: the scraper.ts wiring tests)
- **Pure functions/classes created**: `Budget`, `unboundedBudget`, `clampDateRange`,
  `parseArgs`, `forecastRun`, `printDryRunForecast`, `formatRunSummary`, `printRunSummary`

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/engine/budget.test.ts src/engine/scraper.test.ts src/cli` → 6 files, 42 tests, all passed |
| Runtime harness command/scenario and exact result | N/A for 5.1–5.8 — `pnpm scrape --dry-run --from 2026-01-01 --to 2026-01-01` (the S5b row's documented runtime harness) requires `main.ts` (task 5.9), which is deliberately not built in this batch; every scenario in 5.1–5.8 is proven at the unit level (`Budget`/`parseArgs`/`forecastRun`/`formatRunSummary` are all pure, and the `scraper.ts` wiring is proven through the existing in-memory-store engine test harness), which is this batch's actual runtime boundary |
| Rollback boundary | Delete `src/engine/budget.ts` + its test, `src/cli/args.ts` + its test, `src/cli/dry-run.ts` + its test, `src/cli/summary.ts` + its test; revert `src/engine/scraper.ts` (the `budget` field, the three enforcement points), `src/engine/scraper.test.ts` (the `budget` import/parameter/two new tests), `src/engine/__fixtures__/portability-non-date.test.ts` (the `unboundedBudget()` additions), and `eslint.config.js` (the `src/cli/dry-run.ts`/`src/cli/summary.ts` no-console carve-out). S1–S5c are untouched — no file outside `src/engine/{budget.ts,scraper.ts,scraper.test.ts,__fixtures__/portability-non-date.test.ts}`, `src/cli/*`, and `eslint.config.js` was touched. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/engine/budget.ts` | Created | `Budget` (request/item/document ceilings), `unboundedBudget`, `clampDateRange`, `DEFAULT_MAX_REQUESTS`, `DEFAULT_MAX_DOCUMENTS` |
| `src/engine/budget.test.ts` | Created | 8 tests covering every `Budget` axis + `clampDateRange` |
| `src/engine/scraper.ts` | Modified | Added `budget: Budget` to `ScraperConfig`; enforced at the worker loop, items loop, and documents loop |
| `src/engine/scraper.test.ts` | Modified | `budget` import + optional override in `buildScraper` (default `unboundedBudget()`); 2 new tests |
| `src/engine/__fixtures__/portability-non-date.test.ts` | Modified | Added `budget: unboundedBudget()` to both `new Scraper(...)` construction sites |
| `src/cli/args.ts` | Created | `parseArgs` — hand-rolled flag parser, `ScrapeArgs \| RetryFailedArgs` |
| `src/cli/args.test.ts` | Created | 8 tests covering the full flag set, defaults, and rejections |
| `src/cli/dry-run.ts` | Created | `forecastRun`, `printDryRunForecast` |
| `src/cli/dry-run.test.ts` | Created | 6 tests covering the forecast heuristic and print output |
| `src/cli/summary.ts` | Created | `formatRunSummary`, `printRunSummary` |
| `src/cli/summary.test.ts` | Created | 3 tests covering exact-arithmetic consumption and `subdivided` exclusion |
| `eslint.config.js` | Modified | Narrow `no-console: 'off'` carve-out for exactly `src/cli/dry-run.ts` and `src/cli/summary.ts` (never a blanket `src/cli/**` allowance) |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 5.1–5.8 `[x]` with result notes; added the mid-slice-stop disclosure to the S5b section header; updated the running-estimate line |

## Issues Found (S5b, 5.1–5.8)

None blocking within the completed scope. The one significant finding is the 5.9 planning gap
described at length above (a never-built search-result-row parser blocking `TRF5Site`), which
is the reason this apply stopped before 5.9–5.11 rather than a defect in 5.1–5.8 itself.

## Workload / PR Boundary (S5b, 5.1–5.8)

- Mode: chained PR slice (`feature-branch-chain`)
- Current work unit: S5b — CLI, bounds, and run control (**partial: 5.1–5.8 only**)
- Boundary: starts from S5c's merged state (`engine/{coverage,scraper,ports}.ts` untouched
  beyond the additive `budget` field; no prior `src/cli/` directory existed); ends with a
  fully tested, in-budget CLI bounds/parsing/forecast/summary layer that has **no dependency
  on `main.ts` existing** — every file in this batch is independently unit-tested and
  importable by a future composition root without modification.
- Estimated review budget impact: 775 authored `src/` lines (`git diff --numstat` against the
  S5c branch tip, excluding `tasks.md`/`apply-progress.md`/`eslint.config.js`) against the
  800-line budget for this slice — 97% consumed by 5.1–5.8 alone, before 5.9's composition
  root (which needs a previously-unbuilt result-row parser) was even started. **Recommend the
  orchestrator split 5.9–5.11 into its own follow-up slice** rather than raise this slice's
  budget, consistent with the standing "split by coherent deliverable" rule already applied to
  S2, S4, and S5 in this change.

### Status (S5b, 5.1–5.8)

8/11 S5b tasks complete (5.1–5.8). `vitest run`: 176/176 passing. `pnpm typecheck`: clean.
`pnpm lint`: clean. `pnpm format:check`: clean. **Not** ready for `sdd-verify` on the whole
S5b slice — 5.9–5.11 remain. Ready for `sdd-apply` again once the orchestrator decides how to
scope the 5.9–5.11 follow-up (new slice vs. `size:exception` continuation of this same PR).

## S5d — TRF5 site composition: the adapter can produce items

**Mode**: Strict TDD
**Branch**: `feat/scraper-core-s5d-trf5-site-composition` (forked off
`feat/scraper-core-s5b-cli-run-control`).
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #12 in the chain, targeting the S5b
branch.
**`size:exception` granted by the owner on 2026-09-05: S5d ships whole**, no mid-slice stop
rule. It did not need it — landed at 601/800 authored `src/` lines (75% of the budget, 78% of
the ~770 estimate), the first slice on this change to land under its own pre-launch estimate.
**Closes**: the `parsing/result-fragment.ts` + `TRF5Site` gap S5b's apply discovered and
disclosed at length in the "S5b" section above (`infra/http/axios-transport.ts`, the third
module named there, is explicitly S5e's scope, not this one's).

### Completed Tasks

- [x] 8.1 RED `adapters/trf5/parsing/result-fragment.test.ts` — a redacted multi-row fragment
      yields one row per result (process number + opaque `ca` token) in document order; the
      observed row count is reported; a zero-row fragment yields an empty list, never a throw.
- [x] 8.2 GREEN add the redacted multi-row fixture; move the original zero-row stub content to
      a new `search-ok-empty.xml` rather than deleting it, so "no results" stays independently
      fixture-backed.
- [x] 8.3 GREEN implement `parsing/result-fragment.ts` (`parseResultFragment`), mirroring
      `parsing/detail-page.ts`'s one-cheerio-pass shape.
- [x] 8.4 RED `adapters/trf5/site.test.ts` — `TRF5Site.discover()` returns one item per parsed
      row with `resultCount` set from the observed row count; a saturated fragment (rows ===
      `resultPageCap`) is reported truthfully, never silently clamped.
- [x] 8.5 RED same file — `discover()` maps the search response's own validity-chain outcome to
      the D12 vocabulary (`sessionExpired`/`hostDefect`), and propagates a per-row
      `fetchDetail` failure (already D12-classified) unchanged rather than re-inventing one.
- [x] 8.6 RED same file — `fetchDocument()` composes `documents.ts`'s fetch/decode path;
      `reprimeSession()` issues exactly one priming GET and never replays the caller's request.
- [x] 8.7 GREEN implement `TRF5Site` in `adapters/trf5/site.ts`, composing `session.ts`,
      `search.ts`, `parsing/result-fragment.ts`, `detail.ts`, `schemas/payload.ts`, and
      `documents.ts`. Deleted the stale "S4b/S5" deferral comment.
- [x] 8.8 REFACTOR confirm the ESLint seam rule still passes and `TRF5Site` is reachable from
      `adapters/` only.
- [x] 8.9 RED then GREEN `engine/ports-implementation-audit.test.ts` — every behavioral port
      has a non-fixture, non-test implementation, except three disclosed, tracked gaps.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 8.1/8.3 | `parsing/result-fragment.test.ts` | Unit (pure) | N/A (new) | ✅ `Cannot find module './result-fragment.js'` | ✅ 3/3 passed | ✅ 3 cases: multi-row order-preserving extraction, count-equals-length, zero-row list | ➖ None needed |
| 8.4–8.6/8.7 | `site.test.ts` (7 new cases) | Unit + StubTransport | ✅ 2/2 (pre-existing constant tests) | ✅ 7/7 failed together: `TypeError: TRF5Site is not a constructor` | ✅ 9/9 passed (2 pre-existing + 7 new) | ✅ 7 cases: multi-row discover, saturated (30-row) discover, persistent session expiry, host defect, propagated per-row failure, `fetchDocument` composition, `reprimeSession` no-replay | ✅ Clean |
| 8.9 | `engine/ports-implementation-audit.test.ts` | Unit (filesystem scan, real `src/` tree) | N/A (new) | ✅ Two genuine failures — see below | ✅ 3/3 passed | ✅ 3 cases: non-empty sanity, synthetic-mutation RED proof (`CoverageSink`-style, adapted to `SitePort`), full behavioral-port sweep | ➖ None needed |

**8.9's RED transcript, in full** (this task asked for it explicitly): the first RED was an
authoring bug, not the intended proof — `walkTsFiles`'s relative-path slicing used
`fullPath.slice(root.length + 1)` assuming `srcRoot` had no trailing separator, but
`fileURLToPath(new URL('..', import.meta.url))` on a file URL always resolves `'..'` to a
directory URL (trailing slash included), so the slice cut one character too many and produced
`ENOENT: ... 'src\dapters\trf5\classes.ts'` (the leading `a` of `adapters` silently eaten).
Fixed by stripping the trailing separator from `srcRoot` before walking. The **second**, real
RED is the one 8.9 asks for: with `implements SitePort<TrfPayload, DocumentRow>` temporarily
removed from `site.ts` (`class TRF5Site {` with no `implements` clause), the third test failed
—

```
AssertionError: expected [ 'Clock', 'FrontierCapable', …(2) ] to deeply equal [ 'Clock', 'FrontierCapable', …(1) ]
- Expected
+ Received
  [ "Clock", "FrontierCapable", "HttpTransport", + "SitePort" ]
```

— naming exactly `SitePort` as newly untraced, alongside the two already-disclosed gaps.
Restoring the `implements` clause made the same test pass again. This is the literal state
S5b's apply left the repository in (`SitePort` implemented only by `FakeSite`/`ScriptedSite`/
`FakeNonDateSite`, all fixture- or test-file-scoped), reproduced and observed directly rather
than only simulated via the in-memory mutation in the second test.

### Ports-implementation audit: findings

The audit's `BEHAVIORAL_PORTS` list (12 entries: every `engine/ports.ts` interface actually
targeted by an `implements` clause anywhere in `src/`, verified against a full grep before
writing the list) resolves to exactly three ports with no implementation outside
`__fixtures__/`/`.test.ts` files, after `TRF5Site` closes the `SitePort` gap this slice targets:

- **`HttpTransport`** — only `StubTransport` (`__fixtures__/stub-transport.ts`) exists. The
  real implementation is `infra/http/axios-transport.ts`, S5e task 9.1. Explicitly out of this
  slice's scope per the launch prompt.
- **`Clock`** — only `FakeClock` (inside `scraper.test.ts` and `portability-non-date.test.ts`)
  exists. The real implementation is wired inline in `main.ts`'s composition root, S5e task 9.2.
- **`FrontierCapable`** — zero implementations anywhere, fixture or production. Phase-2 only
  (design.md D3); S6 is entirely unstarted.

All three are disclosed in the test file itself (`KNOWN_DEFERRED_GAPS`, with the exact
follow-up task cited for each) rather than silently excluded from the scan — the audit still
scans every behavioral port; it only tolerates these three, by name, with a reason. No new
finding beyond the three already-named modules from the S5b discovery surfaced.

### Design decisions and deviations

- **A per-row `fetchDetail` failure inside `discover()`'s loop fails the WHOLE `discover()`
  call**, returning that row's already-classified `FetchOutcome` unchanged, rather than
  skipping the row or inventing a partial-success shape. `DiscoverResult<TItem, TDoc>` has no
  room for "N items ok, 1 row failed" — it is one `FetchOutcome` wrapping one whole result — so
  a partial-failure design would need a new type this slice's task list never asked for. This
  also keeps 8.5's "never invents a `permanentError` the chain did not classify" constraint
  trivially true: the propagated outcome is `fetchDetail`'s own return value, verbatim, never
  reconstructed. Documented as a real design decision, not an oversight: a future slice could
  reconsider this if a saturated day with one bad row turns out to be common enough in
  practice to want partial results instead of a whole-cell retry.
- **The search response's own validity classification (`classifyValidity` over
  `buildResponseView(response)`) never reaches `invalidTokenShell`/`validData` for a search
  fragment**, because both schemas require `isHtmlPage: true` and a `text/xml` AJAX response
  never sets it. A genuinely successful search response (with rows, or legitimately zero rows)
  therefore always classifies as `'unclassified'` at this point, and `discover()` treats that
  outcome as "proceed to row parsing" rather than mapping it to `hostDefect` the way `detail.ts`
  maps its own `'unclassified'` case. This is a **deliberate departure from `detail.ts`'s
  precedent**, not an inconsistency: `detail.ts`'s `unclassified -> hostDefect` mapping exists
  because a detail page has no other success schema to fall through to (`validData` already
  covers success). A search response has no success schema in `validity-chain.ts` at all — it
  was never meant to (design.md's validity-chain table is written for the detail page) — so
  `'unclassified'` is the ONLY value success ever takes for a search response, and mapping it
  to a failure would make every successful search discoverable as a false `hostDefect`.
- **`toBrDate` (ISO `2026-09-01` -> the search form's `01/09/2026`) is new, adapter-owned logic
  with no dedicated unit test of its own** — it is exercised indirectly through every
  `discover()` test in `site.test.ts` (each scripts a `TraversalCursor` and asserts the whole
  `discover()` call succeeds against fixtures that don't independently assert the wire-format
  date string). Flagging this as a real, if minor, coverage gap: a defect in `toBrDate` alone
  (e.g. swapped day/month) would not be caught by any test in this slice, since no test
  inspects the actual POST body `search()` builds from `criteria.dataAutuacaoInicio`/`Fim`. A
  follow-up could add a direct `toBrDate` unit test or extend one `site.test.ts` case to
  inspect `transport.requests[1]?.body`.
- **The saturated-fragment test (8.4) scripts 30 full detail-page fetches** (one per row),
  because `TRF5Site.discover()`'s design — matching `design.md`'s Data Flow diagram exactly —
  fetches every row's detail page before returning, so `DiscoverResult.items` is fully
  populated by the time the engine can compare `count` against `resultPageCap`. This mirrors
  the real site's actual behavior (a search response gives only `ca` tokens; the payload is
  only known after a detail fetch) rather than being a test-authoring shortcut. The resulting
  test issues 32 in-memory fixture reads (1 prime + 1 search + 30 details) — no real network
  cost, but noted for anyone tuning this suite's runtime later.
- **`site.test.ts`'s `searchFragment(rows)` helper builds an XML string in-test rather than
  loading a static fixture file**, for the saturated-30-row and the single-row propagation
  cases — a 30-row static fixture file would be pure repetition with no independent
  informational value over the 3-row `search-ok.xml` fixture already added in 8.2. All text in
  the generated fragment is ASCII-only, matching the project's established convention (see
  `search-ok.xml`'s own "Consulta publica", not "pública") to avoid the ISO-8859-1/UTF-8 byte
  mismatch trap `decodeLatin1` exists to guard against.

### Test Summary

- **Total tests added (S5d)**: 13 (3 `result-fragment.test.ts` + 7 new `site.test.ts` + 3
  `ports-implementation-audit.test.ts`)
- **Total tests passing (S5d)**: 13/13
- **Full-suite tests passing**: 189/189 (`vitest run`), up from 176/176 at S5b's 5.1–5.8
- **Layers used**: Unit pure (3: result-fragment), Unit + StubTransport (7: site.ts), Unit +
  real filesystem scan of the actual `src/` tree (3: the ports-implementation audit — a
  genuinely different layer from every prior audit in this change, which read one file
  (`ports.ts`) rather than walking the whole tree)
- **Pure functions/classes created**: `parseResultFragment`, `TRF5Site`, `toBrDate` (private)

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/adapters/trf5/parsing src/adapters/trf5/site.test.ts src/engine/ports-implementation-audit.test.ts` → 3 files, 15 tests (3 result-fragment + 9 site.test.ts [2 pre-existing + 7 new] + 3 audit), all passed |
| Runtime harness command/scenario and exact result | N/A — proven against redacted fixtures and `StubTransport` only, no network and no CLI (per the S5d row in `tasks.md`); `main.ts`/`pnpm scrape` composition is S5e's runtime boundary, not this slice's |
| Rollback boundary | Delete `src/adapters/trf5/parsing/result-fragment.ts` + its test, `src/adapters/trf5/__fixtures__/search-ok-empty.xml`, `src/engine/ports-implementation-audit.test.ts`; revert `src/adapters/trf5/__fixtures__/search-ok.xml` to its S3 zero-row stub content, and revert `src/adapters/trf5/site.ts`/`site.test.ts` to S4a's declared-constants-only shape. S1–S5b and every other file are untouched. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/adapters/trf5/parsing/result-fragment.ts` | Created | `parseResultFragment` — cheerio row extraction, `SearchResultRow`/`SearchResultFragment` |
| `src/adapters/trf5/parsing/result-fragment.test.ts` | Created | 3 tests: multi-row order, observed count, zero-row list |
| `src/adapters/trf5/__fixtures__/search-ok.xml` | Modified | Replaced the zero-row stub with a redacted 3-row search fragment |
| `src/adapters/trf5/__fixtures__/search-ok-empty.xml` | Created | The original zero-row stub content, preserved under its own name |
| `src/adapters/trf5/site.ts` | Modified | Added `TRF5Site implements SitePort<TrfPayload, DocumentRow>` (`discover`/`fetchDocument`/`reprimeSession`) and `TRF5SiteConfig`; deleted the stale "S4b/S5" deferral comment; existing module-level exports unchanged |
| `src/adapters/trf5/site.test.ts` | Modified | 7 new tests covering `discover`/`fetchDocument`/`reprimeSession`; 2 pre-existing constant tests untouched |
| `src/engine/ports-implementation-audit.test.ts` | Created | Whole-`src/`-tree `implements` scan; `BEHAVIORAL_PORTS`/`KNOWN_DEFERRED_GAPS`; sanity + RED-proof + full-sweep tests |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 8.1–8.9 `[x]` with result notes; updated the running-estimate line and the S5d budget-risk row |

## Issues Found (S5d)

None blocking. See "Design decisions and deviations" above for the whole-`discover()`-fails-on
-one-bad-row design choice, the deliberate `unclassified` departure from `detail.ts`'s
precedent, and the disclosed `toBrDate` coverage gap.

## Workload / PR Boundary (S5d)

- Mode: chained PR slice (`feature-branch-chain`), `size:exception` pre-granted but unused
- Current work unit: S5d — TRF5 site composition (tasks 8.1–8.9)
- Boundary: starts from S5b's merged state (`cli/*`, `engine/budget.ts` untouched); ends with a
  real, fixture-proven `SitePort` implementation and the audit that guards against this exact
  gap recurring. `infra/http/axios-transport.ts` and `main.ts` (S5e) intentionally not started.
- Estimated review budget impact: 601 authored `src/` lines (`git diff --numstat`, new +
  modified files under `src/`, excluding `tasks.md`/`apply-progress.md`) against the 800-line
  budget and the ~770 estimate — 75%/78% respectively, the first under-estimate slice on this
  change. The pre-granted `size:exception` was not needed.

### Status (S5d)

9/9 S5d tasks complete (8.1–8.9). `vitest run`: 189/189 passing. `pnpm typecheck`: clean.
`pnpm lint`: clean. `pnpm format:check`: clean. Ready for `sdd-verify`, or `sdd-apply` again
for S5e.

## S5e — Real transport and composition root: the run actually runs

**Mode**: Strict TDD
**Branch**: `feat/scraper-core-s5e-transport-composition-root` (forked off
`feat/scraper-core-s5d-trf5-site-composition`).
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #13 in the chain, targeting the S5d
branch. Not pushed and no PR opened by this apply run, per the launch instructions.
**No `size:exception`**: estimated ~390 authored `src/` lines against the 800-line budget;
landed at 557 (70% of budget, 43% over its own estimate — in line with this change's standing
pattern of underestimating single-deliverable slices, but still comfortably inside budget).
**Closes**: the `infra/http/axios-transport.ts` gap S5b's apply discovered and disclosed, and
the composition root (`main.ts`) that S5b's own apply explicitly deferred (tasks 5.9–5.11,
renumbered 9.2/9.4/9.5 here).

### Completed Tasks

- [x] 9.1 RED then GREEN `infra/http/axios-transport.test.ts` + `axios-transport.ts` — the real
      `HttpTransport` implementation over axios, proven against a local `node:http` stub server.
- [x] 9.2 GREEN `src/main.ts` composition root + `src/infra/clock.ts` (`SystemClock`).
- [x] 9.3 RED then GREEN `src/main.test.ts` — the wiring proof, driven with a stubbed transport.
- [x] 9.4 GREEN README rewrite (`cognitive-doc-design` shape).
- [x] 9.5 Confirmed `openspec/config.yaml` — no edit needed.
- [x] 9.6 Manual smoke: `pnpm scrape --dry-run` executed here; the live-host half is left for
      the owner (hard constraint: never hit the live TRF5 host from this apply run).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 9.1 | `infra/http/axios-transport.test.ts` | Integration (local `node:http` server, never the live host) | N/A (new) | ✅ `Cannot find module './axios-transport.js'` | ✅ 7/7 passed | ✅ 7 cases: byte-identical binary body, POST body/header forwarding, 302 surfaced (not auto-followed), `Retry-After` surfaced, non-2xx never throws, per-instance cookie-jar isolation, cross-request cookie persistence | ➖ None needed |
| 9.2/9.3 | `main.test.ts` | Integration (full composition, `StubTransport` + `FakeClock`) | N/A (new) | ✅ `Cannot find module './main.js'` | ✅ 2/2 passed | ✅ 2 cases: `scrape` reaching every sink with dedup, `retry-failed` composing without a discovery bound | ➖ None needed |
| 9.2 (Clock) | `infra/clock.test.ts` | Unit (`vi.useFakeTimers()`) | N/A (new) | ✅ `Cannot find module './clock.js'` | ✅ 2/2 passed | ✅ 2 cases: `now()` returns the faked wall-clock time, `sleep(ms)` resolves only once the delay elapses | ➖ None needed |

Every RED transcript above is a genuine "module not found" failure, observed before its
matching implementation file existed — the same discipline S3–S5d established, never a
reconstructed RED.

### The ports-implementation audit, closed as designed

`engine/ports-implementation-audit.test.ts` (added in S5d, task 8.9) failed the moment
`AxiosTransport`/`SystemClock` existed, exactly as the launch instructions predicted: the
allowlist `KNOWN_DEFERRED_GAPS` was now too large. The fix was to shrink it, never to loosen
the assertion:

- **`HttpTransport`** — closed by `infra/http/axios-transport.ts`'s `AxiosTransport implements
  HttpTransport`.
- **`Clock`** — closed by a new `infra/clock.ts`'s `SystemClock implements Clock`, a genuine
  class rather than the inline `{ now, sleep }` object literal `main.ts` first held. The
  audit's `IMPLEMENTS_PATTERN` regex only finds an `implements` clause on a class declaration —
  an object literal satisfies the `Clock` interface structurally but leaves no `implements`
  clause anywhere in `src/` for the scan to see. `infra/clock.ts` is also design.md's own
  declared module (`infra/ ... clock.ts`), so this is not a workaround invented for the audit;
  it is the module the design already named, built one slice later than everything beside it.
- `KNOWN_DEFERRED_GAPS` now reads `['FrontierCapable']` — S6, entirely unstarted, phase-2 only
  (design.md D3).

### Design decisions and deviations

- **`axios-cookiejar-support`@5's compiled type declarations do not resolve against this axios
  version's `NodeNext`-conditional exports.** Reproduced in isolation before writing any
  workaround: the library's own README-documented `wrapper(axios.create({ jar }))` snippet
  fails `tsc -p tsconfig.json --noEmit` with "`AxiosInstance`/`AxiosStatic`... two different
  types with this name exist, but they are unrelated," and `jar` is reported as not existing on
  `CreateAxiosDefaults` despite `axios-cookiejar-support`'s own `declare module 'axios'`
  augmentation targeting `AxiosRequestConfig` (which `CreateAxiosDefaults` extends via `Omit`).
  Both packages resolve to the identical physical file at runtime
  (`node -e "console.log(require.resolve('axios'))"` from both the root project and from
  inside `axios-cookiejar-support`'s own resolution context returns the same path), so this is
  a genuine type-surface mismatch between library versions, not a duplicate-install artifact.
  Fixed with a narrow, fully-commented cast at the exact wrapping boundary
  (`src/infra/http/axios-transport.ts`): call `axios.create()` without `jar` in the literal
  (which typechecks), cast `wrapper` to a minimal structural function type to sidestep its
  broken generic, and set `.jar` on `.defaults` afterward through one more cast — verified
  against `axios-cookiejar-support`'s own plain-JS implementation (`dist/index.js`) that this
  is runtime-equivalent: `wrapper()` is a plain interceptor registration that reads
  `config.jar` off the per-request merged config, and `instance.defaults` is exactly what gets
  merged into every request. No project-wide type setting (`strict`, `exactOptionalPropertyTypes`,
  `skipLibCheck`) was loosened to make this pass.
- **`TRF5Traversal` needs its own primed `SessionState`, separate from `TRF5Site`'s internally,
  lazily primed session.** `TraversalConfig.session: SessionState` is a synchronous constructor
  requirement (S3), while `TRF5Site.ensureSession()` primes lazily on its own first `discover()`
  call (S5d). There is no session-sharing mechanism between the two adapter classes — none was
  ever built, and design.md's D1 ("session lifecycle is... adapter-internal") does not require
  one. `runScraper` therefore issues one explicit `primeSession()` call for the traversal before
  constructing either adapter object, meaning a `scrape` run issues **two** priming GETs total
  (one explicit for `TRF5Traversal`, one lazy inside `TRF5Site.discover()`), and a `retry-failed`
  run issues **one** priming GET it never actually needs, purely to satisfy
  `ScraperConfig.traversal`'s unconditional requirement. Both are disclosed here as a real, if
  minor, inefficiency rather than silently absorbed — fixing it would mean either giving
  `ScraperConfig` two shapes (a bigger change than this task asks for) or teaching `TRF5Site`
  and `TRF5Traversal` to share session state (a design change outside S5e's assigned scope).
- **`--frontier` is left as an already-harmless unrecognized flag, not a new typed field.**
  `cli/args.ts`'s hand-rolled parser (`parseFlags`) already stores any `--flag` it does not
  recognize into its internal map without rejecting it; nothing in `parseArgs` ever reads a
  `frontier` key, so `pnpm scrape --frontier --dry-run` already runs without error today. Adding
  a dedicated `frontier: boolean` field to `ScrapeArgs` that `main.ts` then deliberately ignores
  would be a field with no consumer — S6 is the slice that should add both the field and its
  behavior together, not this one. This satisfies "wire the command surface only, no frontier
  behavior" literally: there is no behavior for a surface to gate yet.
- **A disclosed, out-of-scope gap found while wiring, not fixed here: 429/5xx/timeout are never
  classified into `FetchOutcome.transient` anywhere in the TRF5 adapter.** design.md states
  "404 (case 4) and 429/5xx/timeout (case 6) are classified at the transport boundary before
  the chain runs" (the "Validity chain" section), but `HttpTransport.send()`'s contract is
  `Promise<HttpResponse>` only — it has no `FetchOutcome` variant to return, so this
  classification can only happen one layer up, inside `session.ts`/`search.ts`/`detail.ts`/
  `documents.ts` (all S3/S4, already "complete"). None of them do it: `detail.ts`'s only
  fallback for an unrecognized response is `{ kind: 'hostDefect', reason: 'unrecognized detail
  response' }` (bounded to 2 retries, no `Retry-After` honored, never trips the global 429
  cooldown), and `documents.ts` maps any non-302/404 status — including a real 429 or 503 — to
  `hostDefect` the same way. `core-resilience-policy`'s fully-built and fully-tested `transient`
  path (5-attempt cap, `Retry-After` precedence, the global cooldown gate) is therefore
  currently unreachable from any real TRF5 traffic; `retry-policy.test.ts`/`scraper.test.ts`
  exercise it only with hand-constructed `FetchOutcome` values, never through the adapter.
  This is the same shape of gap S4c, S5a, and S5d each disclosed before landing — a behavior
  `design.md` names, no task ever assigned, a green suite because nothing exercises the real
  path — caught here while wiring the transport that would finally make it reachable. **Not
  fixed in this slice**: closing it means adding status-code-based classification to four
  already-"complete" S3/S4 modules, which is design work outside S5e's assigned task list
  (9.1–9.6) and would have pushed well past this slice's line budget. Flagged as a candidate for
  a follow-up task before any live 429 traffic is expected to behave per `core-resilience-policy`.
- **`AxiosTransport` never auto-follows redirects (`maxRedirects: 0`).** `documents.ts`'s
  `fetchDocument` already follows the one intended 302 itself, by inspecting `initial.status`
  and issuing a second `send()` to `initial.headers.location` — auto-following at the transport
  layer would collapse that into a single response and silently break that contract. Confirmed
  by reading `documents.ts` before writing the transport, not discovered by a failing test.

### Test Summary

- **Total tests added (S5e)**: 13 (7 `axios-transport.test.ts` + 2 `main.test.ts` + 2
  `clock.test.ts` + 2 pre-existing `ports-implementation-audit.test.ts` assertions flipping from
  red to green as a consequence, not newly authored)
- **Total tests passing (S5e)**: 11/11 newly authored, plus the full suite green
- **Full-suite tests passing**: 204/204 (`vitest run`), up from 189/189 at S5d
- **Layers used**: Integration against a real local HTTP server (7: `axios-transport.test.ts`),
  Integration against the full composition with `StubTransport`/`FakeClock` (2: `main.test.ts`),
  Unit with `vi.useFakeTimers()` (2: `clock.test.ts`)
- **Classes created**: `AxiosTransport`, `SystemClock`; functions `runScraper`, `main`,
  `resolveLogger` (private)

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/infra/http src/infra/clock.test.ts src/main.test.ts src/engine/ports-implementation-audit.test.ts` → 4 files, 18 tests, all passed |
| Runtime harness command/scenario and exact result | `pnpm scrape --dry-run --from 2026-01-01 --to 2026-01-01` → `Dry run: an estimated 41 requests, ~21s (heuristic — not a certified prediction; a saturated day issues more requests than forecast).` Created no `output/`/`logs/` directory (zero requests, by construction). The narrow live-host half of task 9.6 is explicitly deferred to the owner per this apply run's hard constraint. |
| Rollback boundary | Delete `src/infra/http/axios-transport.ts` (+ test), `src/infra/clock.ts` (+ test), `src/main.ts` (+ test); revert `README.md` and `src/engine/ports-implementation-audit.test.ts`'s `KNOWN_DEFERRED_GAPS` back to S5d's three-entry list. S1–S5d and every other file are untouched. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/infra/http/axios-transport.ts` | Created | `AxiosTransport implements HttpTransport` over axios + `axios-cookiejar-support`/`tough-cookie` |
| `src/infra/http/axios-transport.test.ts` | Created | 7 tests against a local `node:http` stub server |
| `src/infra/clock.ts` | Created | `SystemClock implements Clock` |
| `src/infra/clock.test.ts` | Created | 2 tests with `vi.useFakeTimers()` |
| `src/main.ts` | Created | `runScraper`/`main` composition root; `SystemClock`/`AxiosTransport` wired for the real CLI entry point |
| `src/main.test.ts` | Created | 2 tests proving the wiring against `StubTransport`/`FakeClock` |
| `src/engine/ports-implementation-audit.test.ts` | Modified | `KNOWN_DEFERRED_GAPS` shrunk from 3 entries to `['FrontierCapable']`; comment updated |
| `README.md` | Rewritten | Lead-with-outcome restructure (`cognitive-doc-design`): Quick path, CLI bounds table, pnpm/tsx rationale, personal-data rules, event-key table, "measured, never certified," manual-smoke-only note; existing Layout/Testing sections kept |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 9.1–9.6 `[x]` with result notes; updated the S5e header, the running-estimate line, and the budget-risk row |

## Issues Found (S5e)

None blocking the assigned scope. See "Design decisions and deviations" above for the two
disclosed, out-of-scope findings: the 429/5xx/timeout `transient`-classification gap in the S3/S4
adapter modules (real, functionally significant, explicitly not fixed here), and the
`axios-cookiejar-support` type-declaration incompatibility (fixed with a documented, narrow cast).

## Workload / PR Boundary (S5e)

- Mode: chained PR slice (`feature-branch-chain`), no `size:exception` needed
- Current work unit: S5e — real transport and composition root (tasks 9.1–9.6)
- Boundary: starts from S5d's merged state (`TRF5Site`/`TRF5Traversal` proven against fixtures
  only); ends with `pnpm scrape`/`pnpm retry-failed` actually running end to end behind
  `AxiosTransport` and `main.ts`. S6 (`--frontier` behavior, `FrontierCapable`) intentionally
  not started.
- Estimated review budget impact: 557 authored `src/` lines (`git diff --numstat`, new files
  under `src/`, excluding `tasks.md`/`apply-progress.md`/`README.md`) against the 800-line
  budget and the ~390 estimate — 70%/143% respectively. No exception needed.

### Status (S5e)

6/6 S5e tasks complete (9.1–9.6; 9.6's live-host half is owner-pending by design). `vitest run`:
204/204 passing. `pnpm typecheck`: clean. `pnpm lint`: clean. `pnpm format:check`: clean.
`pnpm scrape --dry-run` smoke-tested successfully. Ready for `sdd-verify`.

## S5f — Detail parsing rebuilt against captured responses

**Mode**: Strict TDD
**Branch**: `feat/scraper-core-s5e-transport-composition-root` (continued on the same branch
per this apply run's launch instructions; no new branch created).
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #14 in the chain, targeting the S5e
branch. Not pushed and no PR opened by this apply run.
**No `size:exception` needed**: estimated ~450 authored `src/` lines against the 800-line
budget; landed at 515 (64% of budget, 14% over its own estimate — the smallest overrun this
change has measured for a single-deliverable slice).
**Why this slice exists**: S5e's first live run drove out four defects in modules every
earlier slice had marked "complete" (S5e/S5d disclosures + this slice's own launch prompt).
Three were fixed in commits `c3d17a5`, `436f337`, `135d2e6`. The fourth — detail-page parsing
built against invented markup instead of a captured response — is what this slice rebuilds.
**Live network required and used**: every fixture below is a redacted cut of a response
captured by running the production adapter/transport code against the real host on
2026-09-05, per this slice's standing rule. No fixture was written by hand.

### Completed Tasks

- [x] 5f.1 Captured and redacted `detail-page-valid.html` (real 101318-byte detail page, process
      `0005643-82.2001.4.05.8000`, dataAutuacao 10/03/2026) and `detail-page-invalid-token.html`
      (real 25524-byte invalid-`ca` shell). See "Capture method" below.
- [x] 5f.2 RED `schemas/response-view.test.ts` (new file) — `hasDetailHeaderBlock`/
      `hasPartiesBlock` asserted true against the captured page; false today.
- [x] 5f.3 GREEN `idBlockPresent()` regex helper in `response-view.ts` — matches `id="(?:[^"]*:)?name"`,
      never a hardcoded prefix.
- [x] 5f.4 RED `parsing/detail-page.test.ts` (full rewrite) — header, parties, movements,
      documents, all against the captured fixture with real (redacted) expected values.
- [x] 5f.5 GREEN full rewrite of `parsing/detail-page.ts` — see "Production rewrite" below.
- [x] 5f.6 Covered by `response-view.test.ts`'s second case (both blocks false on the captured
      invalid-token shell) plus the existing `validity-chain.test.ts` `invalidTokenShell` case,
      now running against the real capture instead of an invented one.
- [x] 5f.7 `docs/RESEARCH.md` §9 (ten dated sub-sections) — full reconciliation, see below.
- [x] 5f.8 Live acceptance run — passed. See "Live Acceptance Evidence" below.
- [x] 5f.9 Recorded, not fixed. See "Saturation on real data" below and `docs/RESEARCH.md` §9.9.

### Capture method

Two throwaway `tsx` scripts in the scratchpad directory (never committed) imported the
production `AxiosTransport`, `primeSession`, `search`, and `parseResultFragment` modules
directly by absolute path, primed a session, searched `10/03/2026` (30 rows), took the first
row's `ca`, and fetched its detail page — exactly the production `TRF5Site.discover()` path,
reproduced request by request. A second capture built a detail URL with a corrupted 40-byte
hex `ca` against the same primed session to get the real invalid-token shell. A third
diagnostic script (5f.9) reproduced the exact request sequence a saturated-day run drives
(prime → prime → search 30 rows → 30 detail fetches → classes-catalogue POST) to inspect what
`split()`'s own class-catalogue fetch receives under a real, already-aged session — read-only,
no production code touched by it.

Redaction (`redact-detail.cjs`, scratchpad-only): targeted string replacement on the raw
latin1-decoded byte string — the process number (2 occurrences), one CNPJ-identified active
party's name+CNPJ, one passive party's name+CPF, one lawyer's name/OAB/CPF, and the four `ca`
tokens on `documentoSemLoginHTML` links (4 occurrences) — verified afterward by grepping the
redacted output for every original value (zero matches). Document ids/bin ids/hashes were kept
verbatim, matching the S4b precedent that these are not personal data. All file I/O used
`latin1` encoding explicitly (`Buffer.toString('latin1')`/`fs.writeFileSync(path, str, 'latin1')`)
to round-trip the site's own ISO-8859-1 bytes exactly — a UTF-8 round-trip would have corrupted
every accented character, which is exactly what broke the `detail-page-valid-no-documents.html`
fixture the first time it was touched with the accented literal label text (see below).

### Production rewrite (`parsing/detail-page.ts`)

The real detail page differs from the invented S4a fixture in every dimension the file
touches:

| Old assumption (S4a, invented) | Real shape (captured 2026-09-05) |
|---|---|
| `<div id="processoTrfViewView">` container, `#numeroProcesso` etc. spans inside it | A `<form id="j_id146:processoTrfViewView">` that HTML parsing **silently drops as an element** (nested `<form>` is invalid HTML) — detection must be a text/regex test (5f.3), and extraction cannot scope to "inside the container" at all |
| Fields are separately-id'd elements | Fields are `.propertyView` label→value blocks, keyed by the visible Portuguese label text; two fields share one blank-labeled block each, with the real sub-label carried by a `<b>` tag inside the value |
| `#assuntoList`, a nested `<ul>` hierarchy | One flat string, levels joined by `" - "`; the site itself truncates the last segment with no closing `")"` on the observed process |
| `<ul class="advogados"><li><span class="advogado-linha">` nested under a party `<li>` | A flat `tbody` of sibling `<tr>` rows; a lawyer row is the next sibling whose line `<span>` has `class=""` instead of a party row's `class="text-bold"` |
| `#processoEventoPanel tr.evento`, separate date/description cells | `tr.rich-table-row` (no `.evento` class anywhere on the page), ONE cell holding `"dd/mm/yyyy hh:mm:ss - description"` |
| `a.documento-linha` | Two unrelated shapes in the same grid: legacy `a[href*="idBin="]` (still fetched) and a newer `documentoSemLoginHTML.seam?ca=...&idProcessoDoc=...` HTML-viewer link with `href="#"` (not fetched — disclosed follow-up) |

Two new helpers carry this: `extractPropertyFields` (label→value map) and
`extractBoldLabeledFields` (walks each `<b>` element's raw domhandler `.next` sibling chain,
not cheerio's `.nextUntil()` — the value text after a `<b>` is a bare text node, and
`.nextUntil()` only ever returns element siblings, silently dropping it). `isTag` from
`domhandler` replaces a raw `node.type === 'tag'` string comparison ESLint's
`no-unsafe-enum-comparison` rule correctly flagged.

**A debugging trap worth recording**: an early version of `extractParties` selected
`$tr.find('span').first()` to get a row's line text, on the assumption the party/lawyer line
span was the first `<span>` in the row. It is not — the FIRST `<span>` in document order is an
unclassed wrapper spanning the entire cell (including a `<style>` block and a nested `<ul>`),
and `.text()` on it concatenated everything. Fixed by selecting `span.text-bold` (party) /
`span[class=""]` (lawyer) specifically, confirmed with a targeted Node probe against the raw
captured file before writing the fix.

### Downstream tests updated to the real fixture (not new behavior, but real values changed)

Five previously-green tests hardcoded the OLD invented fixture's specific values and broke
once the fixture became the real capture — expected and disclosed, not silently patched:

- `schemas/payload.test.ts` — `caseClass`, the lawyer's name/OAB/party group (moved from
  active to passive in the real data), and the expected `itemId`.
- `site.test.ts` — expected `processNumber`.
- `main.test.ts` — `detail-page-valid-no-documents.html` (a synthetic, classification-only
  fixture predating this slice's standing rule, kept synthetic by design since it exists to
  prove wiring/classification, not field-extraction fidelity) needed a minimal `.propertyView`
  block added so its `processNumber` still resolves under the new `.propertyView`-based
  extraction — payload schema validation was silently failing to empty `processNumber`,
  producing zero written items with no thrown error, until this was found.
  **This fixture rewrite hit the same latin1/UTF-8 trap the redaction script was built to
  avoid**: the Edit tool saves UTF-8, and the accented label `"Número Processo"` written
  through it round-tripped as mojibake once `decodeLatin1` ran on it, so the field lookup
  silently missed. Fixed by writing the file byte-for-byte via a Node script with explicit
  `latin1` encoding, matching every other fixture in this codebase.

### A second, real gap found while proving 5f.8's acceptance criterion: `pdfs/` never wired

`.gitignore` and `README.md` have documented a top-level `pdfs/` output directory since S1.
`main.ts` (S5e) instead wired `FsDocumentSink` at `join(outputDir, 'documents')` —
`output/documents/`, never a separate `pdfs/` root. No test caught this because no test
exercised a real document fetch through the full composition root before this slice's new
`main.test.ts` case. Fixed RED-first: a new test scripted a real document fetch (302 + PDF
bytes) through `runScraper()` and asserted the file landed under a distinct `pdfsDir`,
confirmed to fail with `ENOENT` before the fix. GREEN: `RunDeps` gained a required `pdfsDir`
field; `runScraper` wires `documentSink: new FsDocumentSink(deps.pdfsDir)` directly (no
`outputDir` nesting); `main()`'s real CLI entry point defaults it to `'pdfs'`. This is the
same shape of gap S4c, S5a, and S5d each disclosed before landing — a documented convention
with no task or test ever wiring it — caught here because 5f.8's acceptance criterion
(explicitly "a PDF lands under `pdfs/`") is exactly specific enough to expose it.

### Live Acceptance Evidence (task 5f.8)

Command: `pnpm scrape --from 2026-03-10 --to 2026-03-10 --max-facet-values 1 --max-items 2 --max-documents 1 --max-requests 12`

Observed console output (structured JSONL logs to stderr, `--log-level` default):

```
{"level":"info","event":"unit.started","fields":{"unitKey":"2026-03-10..2026-03-10","windowKey":"2026-03-10..2026-03-10"}}
{"level":"info","event":"document.persisted","fields":{"itemId":"0005643-82.2001.4.05.8000","documentId":"6884863","path":"0005643-82.2001.4.05.8000/6884863-despacho-inspecao---2188---inspecao-geral-ordinaria---2025.pdf","bytesWritten":19441}}
{"level":"warn","event":"unit.saturated","fields":{"unitKey":"2026-03-10..2026-03-10","resultCount":30,"cap":30}}
{"level":"info","event":"unit.completed","fields":{"unitKey":"2026-03-10..2026-03-10","windowKey":"2026-03-10..2026-03-10","state":"truncated"}}
Run summary (measured, not certified):
  complete: 0
  truncated: 1
  failed: 0
```

Real observed evidence beyond the exit code (per this task's own explicit warning that exit
status proves nothing on this host):

| Evidence | Value |
|---|---|
| `output/items.jsonl` | 2 lines (bounded by `--max-items 2`); both real payloads |
| First item's `processNumber` | `0005643-82.2001.4.05.8000` (a real, live process) |
| First item's `caseClass` | `{"cnjCode":"1728","label":"APELAÇÃO / REMESSA NECESSÁRIA"}` — matches the capture exactly |
| First item's `subjects` | 3 entries, the last one's `cnjCode: "10124"` recovered from the site's own truncated (no closing paren) text — the same live quirk found during capture, confirmed independently on a second live run |
| First item's `parties.active`/`passive` counts | 1 / 1 |
| First item's `movements` count | 7 |
| First item's `documents` count | 8 (legacy `idBin` shape only, per this slice's disclosed scope) |
| `pdfs/0005643-82.2001.4.05.8000/` | 1 file: `6884863-despacho-inspecao---2188---inspecao-geral-ordinaria---2025.pdf`, 19441 bytes on disk |
| `output/coverage.jsonl` | 1 record, `state: "truncated"`, `resultCount: 30`, `declaredCap: 30`, `saturated: true` |
| `output/state/failures.jsonl` | absent — zero failures on this run (contrast: an earlier same-day run by a different actor, found already present in `output/state/` before this apply run started and removed before this run, had ledgered `invalidReference:invalidTokenShell` against this exact date — the defect this slice fixes) |

Acceptance criterion met: real payloads in `output/items.jsonl`, a real PDF under `pdfs/`,
with byte counts and file paths recorded above — not inferred from a zero exit code.

### Saturation on real data (task 5f.9 — recorded, not fixed)

`unit.saturated` fired correctly (`resultCount: 30`, `cap: 30`), but the engine's own
`split()` call returned `null`, so the cell finished `truncated` rather than `subdivided`.
This is the first time S5c's subdivision mechanism has ever run against a real saturated day
— every prior proof was against `StubTransport`.

A read-only diagnostic script reproduced the exact request sequence a live run drives before
reaching `split()` (prime → prime → search 30 rows → 30 detail fetches, all sharing one
cookie-jar session) and then issued the same POST `classes.ts`'s `fetchClassCatalogue` makes,
using the untouched traversal session captured at the very start of the run. Result: `200
text/xml`, 52904 bytes — not a `login.seam` redirect — but only 6 `<li>` elements matched a
naive scan, far short of the documented ~132-entry catalogue. The live run's own count was a
clean `0` (`bounded.length === 0`); the reproduction's count (`6`) does not match it exactly,
so the precise trigger is not fully pinned down — but both runs agree the catalogue fetch is
unreliable under a real, already-aged session, and `classes.ts`'s `parseClassCatalogue` has no
content-based validity check at all (unlike every other TRF5 response schema in this
codebase): it blindly scans the whole document for `<li>` with no scope to the suggestion
box's own container, so it cannot distinguish "the real catalogue" from a handful of unrelated
`<li>` elements elsewhere on whatever page it actually received. Full writeup in
`docs/RESEARCH.md` §9.9. **Not fixed in this slice** — task 5f.9's explicit instruction.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5f.2/5f.3 | `schemas/response-view.test.ts` | Unit (real fixture) | ✅ 9/9 (existing validity-chain tests) | ✅ `expected false to be true` | ✅ 2/2 passed | ✅ 2 cases: valid page (both true), invalid-token shell (both false) | ✅ Clean |
| 5f.4/5f.5 | `parsing/detail-page.test.ts` | Unit (real fixture) | N/A (full rewrite of an existing suite) | ✅ 4/4 blocks failed for the right reason (empty processNumber, empty parties, empty movements, empty documents) | ✅ 4/4 passed | ✅ header (all 8 fields incl. truncated subject), parties (party+lawyer+CNPJ fallthrough), movements (first+last of 7), documents (first of 8 + full-length assertion) | ✅ Clean — `bySuffixId`/`extractPropertyFields`/`extractBoldLabeledFields` factored out, each single-purpose |
| 5f.8 (pdfsDir) | `main.test.ts` | Integration (`StubTransport`, real fs temp dirs) | ✅ 2/2 (existing S5e cases) | ✅ `ENOENT` — the target path never existed before the fix | ✅ 1/1 passed | ➖ Single scenario (one document, one path) — the fix itself is structural (a single string-literal target change), triangulation would not exercise different logic | ✅ Clean |

### Test Summary

- **Total tests added (S5f)**: 5 (2 `response-view.test.ts` + 1 new `main.test.ts` pdfsDir case;
  the 4 `detail-page.test.ts` blocks replace 4 existing ones rather than adding net-new cases)
- **Total tests passing (S5f)**: 219/219 full suite (`vitest run`), up from 218 measured
  mid-slice before the pdfsDir fix, up from 204 at S5e
- **Layers used**: Unit against real captured fixtures (6), Integration against `StubTransport`
  + real fs temp dirs (1), live-host integration via throwaway capture/diagnostic scripts (3
  scripts, never committed, per this slice's launch instructions)
- **Downstream tests updated (not new coverage, real-value corrections)**: 3 files, 5 tests —
  `payload.test.ts` (3), `site.test.ts` (1), `main.test.ts`'s existing case (1, via the
  `detail-page-valid-no-documents.html` fixture fix)

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/adapters/trf5/parsing src/adapters/trf5/schemas src/adapters/trf5/detail.test.ts src/main.test.ts` → all passing (exact count: 8 test files in that glob set, all green) |
| Runtime harness command/scenario and exact result | `pnpm scrape --from 2026-03-10 --to 2026-03-10 --max-facet-values 1 --max-items 2 --max-documents 1 --max-requests 12` against the real live TRF5 host — see "Live Acceptance Evidence" above for full observed evidence (byte counts, file paths, real field values) |
| Rollback boundary | Revert `src/adapters/trf5/schemas/response-view.ts` to prefix-exact id matching, delete `src/adapters/trf5/schemas/response-view.test.ts`, revert `src/adapters/trf5/parsing/detail-page.ts`/`detail-page.test.ts` to the S4a `#id`-selector version, revert `src/adapters/trf5/schemas/payload.test.ts`/`src/adapters/trf5/site.test.ts` to their old expected values, revert `src/main.ts`'s `RunDeps.pdfsDir` addition and `src/main.test.ts`'s new case, revert `docs/RESEARCH.md` §9 and the `openspec/changes/scraper-core/tasks.md` S5f section. The redacted fixtures (`detail-page-valid.html`, `detail-page-invalid-token.html`, `detail-page-valid-no-documents.html`) stay — they are evidence, not code, matching the S5f task table's own stated rollback convention. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/adapters/trf5/__fixtures__/detail-page-valid.html` | Replaced | Real captured, redacted 101318-byte (+ header comment) detail page, replacing the invented 2635-byte one |
| `src/adapters/trf5/__fixtures__/detail-page-invalid-token.html` | Replaced | Real captured, redacted 25524-byte invalid-`ca` shell |
| `src/adapters/trf5/__fixtures__/detail-page-valid-no-documents.html` | Modified | Added a minimal real-shaped `.propertyView` block so `main.test.ts`'s existing case still resolves a valid `processNumber` under the new extraction |
| `src/adapters/trf5/schemas/response-view.ts` | Modified | `idBlockPresent()` suffix/bare-id regex helper replaces two hardcoded `bodyText.includes('id="..."')` checks |
| `src/adapters/trf5/schemas/response-view.test.ts` | Created | 2 tests: real valid page (both blocks true), real invalid-token shell (both false) |
| `src/adapters/trf5/parsing/detail-page.ts` | Rewritten | `.propertyView`/bold-label field extraction, flat-string subject splitting, flat sibling-row party+lawyer extraction, single-cell movement splitting, dual-shape (legacy-only) document extraction |
| `src/adapters/trf5/parsing/detail-page.test.ts` | Rewritten | All 4 test blocks against the real captured fixture with real (redacted) expected values |
| `src/adapters/trf5/schemas/payload.test.ts` | Modified | `caseClass`, lawyer expectation (moved to passive party), `itemId` updated to real captured/redacted values |
| `src/adapters/trf5/site.test.ts` | Modified | Expected `processNumber` updated |
| `src/main.ts` | Modified | `RunDeps.pdfsDir` (required); `runScraper` wires `FsDocumentSink(deps.pdfsDir)`; `main()` defaults `pdfsDir: 'pdfs'` |
| `src/main.test.ts` | Modified | New test proving a document round-trips through `pdfsDir`, separate from `outputDir`; both existing tests updated to supply `pdfsDir` |
| `docs/RESEARCH.md` | Modified | New §9, ten dated sub-sections reconciling every discovery in this slice |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 5f.1–5f.9 `[x]` with result notes; updated the S5f header and the running-estimate line |
| `openspec/changes/scraper-core/apply-progress.md` | Modified | This section; corrected the stale top-of-file cumulative summary (S5e/S5f were missing) |

## Issues Found (S5f)

None blocking. See "A second, real gap found" above (the `pdfs/` wiring drift, fixed) and
"Saturation on real data" above (the subdivision reliability finding, disclosed and recorded
per the task's explicit instruction, not fixed). The CNPJ-party and born-digital-document gaps
are recorded as known follow-ups in `tasks.md`'s S5f section and `docs/RESEARCH.md` §9.5/§9.7.

## Workload / PR Boundary (S5f)

- Mode: chained PR slice (`feature-branch-chain`), no `size:exception` needed
- Current work unit: S5f — detail parsing rebuilt against captured responses (tasks 5f.1–5f.9)
- Boundary: starts from S5e's merged state (a runnable but detail-parsing-broken CLI); ends
  with a live run that reaches every sink with real data, a real PDF on disk, and `docs/
  RESEARCH.md` reconciled with everything measured. S6 (`--frontier`) intentionally not
  started.
- Estimated review budget impact: 515 authored `src/` lines (`git diff --numstat` against the
  S5e branch tip, excluding fixtures/`tasks.md`/`apply-progress.md`/`docs/RESEARCH.md`)
  against the 800-line budget and the ~450 estimate — 64%/114% respectively. No exception
  needed. (Redacted fixture files, `docs/RESEARCH.md`, and the two SDD artifacts add
  substantial additional diff size not counted in this figure, consistent with the project's
  standing convention of counting authored `src/` risk only.)

### Status (S5f)

9/9 S5f tasks complete (5f.1–5f.9). `vitest run`: 219/219 passing. `pnpm typecheck`: clean.
`pnpm lint`: clean. `pnpm format:check`: clean. Live acceptance run against the real TRF5 host
passed with real observed evidence (see above). Ready for `sdd-verify`, or `sdd-apply` again
for S6.

## S5g — HTTP status classification: making the 429 mechanism reachable

**Mode**: Strict TDD
**Branch**: `feat/scraper-core-s5e-transport-composition-root` (continued on the same branch
per this apply run's launch instructions; no new branch created).
**Delivery**: `auto-chain` / `feature-branch-chain` — PR #15 in the chain, targeting the S5f
work. Not pushed and no PR opened by this apply run.
**No `size:exception` needed**: estimated ~280 authored `src/` lines against the 800-line
budget; landed at 594 (74% of budget, over double its own estimate — the two new
integration/audit tests, `global-cooldown.test.ts` (246 lines) and
`outcome-construction-audit.test.ts` (154 lines), account for 400 of the 594 by themselves;
the actual production wiring — `http-status.ts` plus the three call sites in `site.ts`/
`detail.ts`/`documents.ts` — is under 90 lines).
**Why this slice exists**: the full-change verify report (`verify-report.md`) found that no
production code anywhere constructed `FetchOutcome.transient` — the literal appeared exactly
once, as a type declaration in `engine/types.ts:12`. `retry-policy.ts` and `scraper.ts` both
correctly handled it, `rate-limiter.test.ts` correctly proved `RateLimiter` in isolation, and
every test passed throughout — because nothing ever built the value those correct consumers
were waiting for. The global rate limiter was decorative in production: `rateLimiter.acquire()`
was awaited before every request, correctly, but waited on a gate nothing ever closed.
**No live network used or required**: `core-resilience-policy`'s own "Stubbed-Transport Test
Isolation" requirement mandates every 429/backoff/session-recovery scenario run against a
stubbed `HttpTransport` and a fake clock, never the live host — this slice needed, and used,
zero real requests. A 429 status line and a `Retry-After` header are RFC 9110 protocol facts,
not portal-invented markup, so this is a disclosed, deliberate exception to S5f's "no fixture
is written by hand" rule (which governs response bodies), not a violation of it.

### Completed Tasks

- [x] 5g.1 RED `engine/http-status.test.ts` — `classifyHttpStatus` maps 429/502/503/504 to
      `transient` carrying the status; returns `null` for 200/302/404 so content-based
      classification (and `documents.ts`'s own 404 handling) keeps ownership of every status
      this host actually uses. `parseRetryAfterMs` cases exercised in the same file/cycle
      (5g.3's RED, landed together since both functions live in one small, tightly coupled
      module — see the TDD note below).
- [x] 5g.2 GREEN `engine/http-status.ts` (`classifyHttpStatus`) — placed in `engine/` per
      design.md's own instruction ("classified at the transport boundary before the chain
      runs"), not redesigned.
- [x] 5g.3 RED then GREEN `parseRetryAfterMs` — delta-seconds only; HTTP-date, negative,
      non-numeric, and absent all resolve to `null`. Landed in the same file/cycle as 5g.1/5g.2
      (see TDD note).
- [x] 5g.4 RED three new tests, one per file — `site.test.ts` (search), `detail.test.ts`
      (detail), `documents.test.ts` (document fetch) — each asserting a stubbed 429 classifies
      as `transient` before any content/validity-chain classification runs. Confirmed genuinely
      RED for three different reasons: `site.ts` returned a silent `{ kind: 'ok', count: 0 }`
      (a 429's empty body parses as a genuine zero-row result — the most dangerous of the
      three, since it looks like success); `detail.ts` returned
      `permanentError:invalidTokenShell`; `documents.ts` returned `hostDefect`.
- [x] 5g.5 GREEN wired `classifyHttpStatus` as the first check, before content classification,
      in `site.ts`'s `discover()` (after the search POST), `detail.ts`'s `fetchDetail` (after
      the detail GET), and `documents.ts`'s `fetchDocument` (after the initial GET, before the
      existing 404/302 checks).
- [x] 5g.6 RED then GREEN `adapters/trf5/global-cooldown.test.ts` — a new, dedicated
      integration test composing the REAL `engine/scraper.ts` `Scraper` with the REAL
      `TRF5Site` (production `site.ts` → `search.ts` → `classifyHttpStatus`) over a stubbed
      `HttpTransport`, concurrency 2, three work units. One unit's search POST answers 429
      (with `Retry-After: 3`); the test asserts (a) `cooldown.triggered` fires with
      `cooldownMs: 3000`, (b) the failure ledger stays empty throughout, (c) at t=2999ms no
      unit has completed, and (d) at t=3000ms every unit (including the requeued one) has a
      checkpoint and exactly 4 POSTs were ever issued (the 429, its successful retry, and the
      other two units' single successful searches). Confirmed genuinely RED by literally
      stashing `site.ts`'s 5g.5 wiring and re-running this exact test file — it fails on the
      `cooldown.triggered` assertion, `undefined` where `{ level: 'warn', ... }` was expected,
      because without the wiring `TRF5Site.discover()` never produces a `transient` outcome for
      this unit to route through `decide()`/`tripCooldown` in the first place.
- [x] 5g.7 RED then GREEN `engine/outcome-construction-audit.test.ts` — derives the
      `FetchOutcome` variant list from `engine/types.ts` (never hand-listed, same discipline as
      `ports-implementation-audit.test.ts`), scans every non-test, non-`__fixtures__/`,
      non-`types.ts` `.ts` file under `src/` for a real object-literal construction of each
      variant, and fails if any variant has zero. Confirmed genuinely RED against the real
      pre-5g.5 tree: stashed `engine/http-status.ts` + the three wired adapter files and
      re-ran this suite — `transient` was the only unconstructed variant, exactly as the
      full-change verify report found. The test file's own internal RED-proof (a mutation test
      matching the sibling audits' precedent) reproduces the same result without needing a
      stash, by filtering only the `transient` matches contributed by those four files out of
      the match set (never removing their OTHER, pre-existing matches for `ok`/`hostDefect`/
      `permanentError`, which predate this slice).
- [x] 5g.8 Verified and corrected the tasks.md bookkeeping defect. See "Task 4.17/4.18
      verification" below.
- [x] 5g.9 `docs/RESEARCH.md` §9.11 added — reconciles that a 429 has still never been
      observed from this host (true as of 2026-09-05, unchanged since S1's reconnaissance and
      every live run since, including S5f's acceptance run), that the whole mechanism
      (classification, global cooldown, `Retry-After` precedence, failed-unit-returns-to-queue)
      is now stub-proven end to end, and that "Retry-After Precedence" is satisfied for
      delta-seconds form only. `core-resilience-policy`'s `spec.md` itself needed no edit: its
      requirements already describe the intended behavior correctly (they were never wrong —
      the task breakdown simply never assigned the producer-side work), and editing a spec
      during `sdd-apply` is out of this phase's role; the reconciliation lives in
      `docs/RESEARCH.md`, the project's living research/discovery log.

### Task 4.17/4.18 verification (5g.8)

Read both tasks' literal text against `documents.test.ts`'s 14 pre-existing tests plus
`engine/scraper.test.ts`'s pre-existing document-failure test:

- **4.17** ("three same-labeled `Decisão` documents... get three distinct filenames, derived
  only from `ca` + `idProcessoDocumento`..."): the "three distinct filenames" and
  `[A-Za-z0-9._-]`-validation claims are fully covered (`documents.test.ts`'s
  `buildDocumentPath` describe block, 9 tests). The literal `ca`-keyed wording is now stale,
  not uncovered: S4c amended this exact requirement to `processNumber`-keyed (recorded in
  tasks.md's own Requirement Coverage Map, "Stable Document Filename Derivation: S4b
  (`ca`-derived) / S4c (amended: `processNumber` + slug)") for a stronger stability guarantee
  (`ca` is session-scoped; `processNumber` is not). The current, amended behavior is fully
  tested — including a dedicated "there is no session token input at all" case. "A failed
  document fetch is ledgered without discarding the already-extracted item" is proven at the
  engine level (`engine/scraper.test.ts`, `'still writes the item when its document fetch
  fails, and records the document failure'`, pre-existing since S1/S2), not inside
  `documents.test.ts` — because `documents.ts` has no access to items, sinks, or the ledger at
  all; its own contribution to that guarantee is returning a `FetchOutcome` failure kind
  instead of throwing, which `documents.test.ts` does prove directly (404 → `permanentError`,
  unexpected status → `hostDefect`, both without throwing).
- **4.18** ("GREEN implement `adapters/trf5/documents.ts` (302-follow, filename builder,
  `FetchOutcome` wiring for `fetchDocument`)"): implemented exactly as described and fully
  exercised — 302-follow (2 tests), `buildDocumentPath` as the (amended) filename builder (9
  tests), `FetchOutcome` wiring for every branch including this slice's own new 429-precedence
  branch (4 tests: 429, 404, unexpected-status/hostDefect, ok).

Both marked `[x]`. No part of either task was left uncovered — the only correction needed was
recognizing that S4c's disclosed amendment superseded the literal `ca`-keyed wording, not that
anything was actually missing.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5g.1/5g.2/5g.3 | `engine/http-status.test.ts` | Unit (pure) | N/A (new) | ✅ Module-not-found | ✅ 11/11 passed | ✅ 11 cases: 429 (bare + Retry-After), 502/503/504, 200/302/404 null, delta-seconds, zero-seconds, HTTP-date, negative, non-numeric, absent | ➖ None needed |
| 5g.4/5g.5 (site.ts) | `site.test.ts` (new block) | Unit + StubTransport | ✅ 9/9 (existing) | ✅ `{kind:'ok', count:0}` ≠ expected `transient` | ✅ 1/1 passed | ➖ Single scenario (the precedence check itself is structural, one call site) | ✅ Clean |
| 5g.4/5g.5 (detail.ts) | `detail.test.ts` (new block) | Unit + StubTransport | ✅ 4/4 (existing) | ✅ `hostDefect` ≠ expected `transient` | ✅ 1/1 passed | ➖ Single scenario | ✅ Clean |
| 5g.4/5g.5 (documents.ts) | `documents.test.ts` (new block) | Unit + StubTransport | ✅ 14/14 (existing) | ✅ `hostDefect` (wrong reason) ≠ expected `transient` | ✅ 1/1 passed | ➖ Single scenario | ✅ Clean |
| 5g.6 | `adapters/trf5/global-cooldown.test.ts` | Integration (real `Scraper` + real `TRF5Site` + `StubTransport`, `vi.useFakeTimers()`) | N/A (new file); confirmed 238/238 full-suite green immediately before this task | ✅ Confirmed retroactively by stashing `site.ts`'s wiring: `cooldownEvent` was `undefined` | ✅ 1/1 passed | ➖ Single scenario by design (concurrency 2, 3 units, 1 forced 429) — the claim is about production wiring, not about enumerating retry-policy branches already covered elsewhere | ✅ Clean |
| 5g.7 | `engine/outcome-construction-audit.test.ts` | Unit (static analysis over real source files) | N/A (new file) | ✅ Confirmed retroactively by stashing `http-status.ts` + the 3 wired adapter files: `['transient']` was the only unconstructed kind | ✅ 4/4 passed | ✅ Includes its own internal RED-proof test (mutation-style, matching `ports-implementation-audit.test.ts`'s precedent) | ➖ None needed |

**Note on 5g.1/5g.2/5g.3 sequencing**: `classifyHttpStatus` and `parseRetryAfterMs` were
written and tested together in one RED/GREEN cycle rather than two sequential ones, because
they are tightly coupled (the former calls the latter directly) and live in one small,
newly-created file — splitting them into two artificial cycles would not have produced any
independent RED evidence beyond what the combined 11-test RED already gave (confirmed
module-not-found before any implementation existed).

**Note on 5g.6/5g.7's retroactive RED confirmation**: both were written, then verified
genuinely RED by temporarily reverting the exact production files their claim depends on
(`git stash push -- <files>`, re-run, confirm real failure, `git stash pop`, confirm green
again) rather than a strict test-first sequencing — because both are audits/integration proofs
*of* the 5g.1–5g.5 wiring, so they could only meaningfully RED once that wiring already existed
to be reverted. This is the same disclosed pattern S4c used for its own retroactive RED
confirmations, applied here for the same reason (a proof-of-integration test cannot RED before
the thing it integrates exists).

### Test Summary

- **Total tests added (S5g)**: 19 — 11 (`http-status.test.ts`) + 1 (`site.test.ts`) + 1
  (`detail.test.ts`) + 1 (`documents.test.ts`) + 1 (`global-cooldown.test.ts`) + 4
  (`outcome-construction-audit.test.ts`, including its own derivation-sanity and RED-proof
  tests)
- **Total tests passing (S5g)**: 238/238 full suite (`vitest run`), up from 219 at S5f
- **Layers used**: Unit pure (11), Unit + `StubTransport` (3), Integration (real `Scraper` +
  real `TRF5Site` + `StubTransport` + `vi.useFakeTimers()`, 1), Static-analysis-over-source (4)
- **Pure functions created**: `classifyHttpStatus`, `parseRetryAfterMs`
- **Retroactive RED confirmations**: 2 (5g.6, 5g.7 — see note above), by literal
  `git stash push -- <file>` / re-run / confirm real failure / `git stash pop` / confirm green

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/engine/http-status.test.ts src/adapters/trf5/site.test.ts src/adapters/trf5/detail.test.ts src/adapters/trf5/documents.test.ts src/adapters/trf5/global-cooldown.test.ts src/engine/outcome-construction-audit.test.ts` → 6 files, 46 tests, all passed |
| Runtime harness command/scenario and exact result | N/A — `core-resilience-policy`'s own "Stubbed-Transport Test Isolation" requirement forbids exercising 429/backoff/cooldown behavior against the live host; `adapters/trf5/global-cooldown.test.ts` (real `Scraper` + real `TRF5Site` over a stubbed transport, `vi.useFakeTimers()`) is this slice's actual runtime boundary, not a live acceptance run |
| Rollback boundary | Delete `src/engine/http-status.ts` + its test, `src/adapters/trf5/global-cooldown.test.ts`, `src/engine/outcome-construction-audit.test.ts`; revert the 429-precedence blocks added to `src/adapters/trf5/{site,detail,documents}.ts` and their `.test.ts` files back to their S4c/S5f state; revert `docs/RESEARCH.md` §9.11 and the `openspec/changes/scraper-core/tasks.md` S5g section and the 4.17/4.18 checkbox correction. S1–S5f are untouched. |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/engine/http-status.ts` | Created | `classifyHttpStatus`, `parseRetryAfterMs` — transport-boundary 429/5xx classification |
| `src/engine/http-status.test.ts` | Created | 11 tests: 429/502/503/504 classification, 200/302/404 null, Retry-After parsing (delta-seconds, zero, HTTP-date, negative, non-numeric, absent) |
| `src/adapters/trf5/site.ts` | Modified | `discover()` calls `classifyHttpStatus` on the search response before content classification |
| `src/adapters/trf5/site.test.ts` | Modified | +1 test: stubbed 429 search response classifies as `transient` |
| `src/adapters/trf5/detail.ts` | Modified | `fetchDetail` calls `classifyHttpStatus` on the detail response before content classification |
| `src/adapters/trf5/detail.test.ts` | Modified | +1 test: stubbed 429 detail response classifies as `transient` |
| `src/adapters/trf5/documents.ts` | Modified | `fetchDocument` calls `classifyHttpStatus` on the initial response before the 404/302 checks |
| `src/adapters/trf5/documents.test.ts` | Modified | +1 test: stubbed 429 on the document link classifies as `transient` |
| `src/adapters/trf5/global-cooldown.test.ts` | Created | Real `Scraper` + real `TRF5Site` + `StubTransport` + `vi.useFakeTimers()`: a real 429 response trips the global cooldown, pauses further requests, and returns the failed unit to the queue |
| `src/engine/outcome-construction-audit.test.ts` | Created | Derives `FetchOutcome` variants from `types.ts`; audits every non-test/fixture `src/` file for a real construction site per variant; includes a mutation-style RED-proof |
| `openspec/changes/scraper-core/tasks.md` | Modified | Marked 5g.1–5g.9 `[x]`; corrected 4.17/4.18 from `[ ]` to `[x]` with the amendment/coverage note (5g.8) |
| `docs/RESEARCH.md` | Modified | New §9.11 — 429-mechanism reconciliation (still never observed live; now stub-proven end to end; Retry-After delta-seconds-only) |
| `openspec/changes/scraper-core/apply-progress.md` | Modified | This section; updated the top-of-file cumulative summary |

## Issues Found (S5g)

None blocking. The pre-existing race in `TRF5Site.ensureSession()` (two concurrent workers
each seeing a null session and both priming) surfaced while designing `global-cooldown.test.ts`
and was worked around in the test (`await site.reprimeSession()` before `scraper.run()`), not
fixed in production — it is out of this slice's scope and not new: it existed identically
before S5g and does not affect correctness (the last write to `this.session` wins, and both
primed sessions are independently valid), only a harmless extra priming GET under concurrent
first-use. Flagged here for awareness, not silently absorbed.

## Workload / PR Boundary (S5g)

- Mode: chained PR slice (`feature-branch-chain`), no `size:exception` needed
- Current work unit: S5g — HTTP status classification, making the 429 mechanism reachable
  (tasks 5g.1–5g.9)
- Boundary: starts from S5f's merged state (429 classification unreachable, `documents.ts`'s
  4.17/4.18 bookkeeping unmarked); ends with the 429/global-cooldown mechanism reachable and
  stub-proven end to end on all three TRF5 request paths, a standing audit guarding against
  this exact class of gap recurring, the tasks.md bookkeeping defect corrected, and
  `docs/RESEARCH.md` reconciled. S6 (`--frontier`) intentionally not started.
- Estimated review budget impact: 594 authored `src/` lines (`git diff`/new-file line counts
  against the S5f tip, excluding `tasks.md`/`apply-progress.md`/`docs/RESEARCH.md`) against the
  800-line budget and the ~280 estimate — 74%/212% respectively. No exception needed, but this
  is the largest estimate-to-actual overrun ratio measured in this change; see the two
  integration/audit test files' sizes in the slice header above for why.

### Status (S5g)

9/9 S5g tasks complete (5g.1–5g.9). `vitest run`: 238/238 passing. `pnpm typecheck`: clean.
`pnpm lint`: clean. `pnpm format:check`: clean. Ready for `sdd-verify`, or `sdd-apply` again
for S6.
