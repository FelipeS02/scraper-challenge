# Apply Progress: TRF5 Name-Substring Partition Axis

**Mode**: Strict TDD
**Delivery**: single PR, `size:exception` (explicitly accepted by the user over the
3-unit `feature-branch-chain` the tasks forecast recommended)

## Status

Phases 1–7 complete and green. Phase 8 (bounded live acceptance) is **blocked,
definitively, across two corrective rounds**:
1. A genuine engine-guardrail violation (`src/engine/coverage.ts` string-matched
   a concrete adapter dimension key, in both code and a doc comment) was found
   and fixed to a shape-based, dimension-agnostic check.
2. The detail-page 302-to-`errorUnexpected.seam` gap discovered during the
   first Phase 8 attempt was fixed in this same change (user-approved scope
   expansion) and is proven correct by tests — but the live sweep still could
   not complete.
3. A bounded 3-candidate retry on different dates, with a controlled same-day
   A/B measurement design (replacing the literal `128` comparison, which only
   meant anything for `2026-09-03`), was attempted per the user's explicit
   choice not to fix `discover()`'s all-or-nothing row handling. **All 3
   candidates plus the original date (4 dates total) failed identically**,
   confirming that failure mode is a live, current blocker, not an edge case.
   Stopped there, as instructed — no further investigation attempted.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1–1.3 | (structural — see 5.1–5.4, 6.x for behavioral coverage) | — | N/A (new fields, optional) | ➖ structural | ➖ structural | ➖ structural | ➖ N/A |
| 2.1/2.2 | `parsing/result-fragment.test.ts` | Unit | ✅ 2/2 (pre-existing) | ✅ Written | ✅ Passed | ✅ 2 cases (`e outros` + plain) | ✅ extracted shared cheerio helper |
| 3.1/3.2 | `name-probes.test.ts` | Unit | N/A (new file) | ✅ Written | ✅ Passed | ✅ 2 cases (empty + overlap-dedup) | ➖ None needed |
| 4.1/4.2 | `name-probes.test.ts` | Unit | N/A (new file) | ✅ Written | ✅ Passed | ✅ 2 cases (dict + harvested) | ➖ None needed |
| 5.1–5.4 | `traversal.test.ts` | Unit | ✅ 8/8 (pre-existing) | ✅ Written | ✅ Passed | ✅ 3 cases (expand/irreducible/disabled) | ➖ None needed |
| 5.5 | `site.test.ts` | Unit | ✅ 14/14 (pre-existing) | ✅ Written | ✅ Passed | ✅ 2 cases (present/absent) | ➖ None needed |
| 6.1/6.2 | `name-probes.test.ts` | Unit | N/A (new file) | ✅ Written | ✅ Passed | ✅ 3 cases (order/exclude/merge) | ➖ None needed |
| 6.3/6.4 | `site.test.ts` | Unit | ✅ 16/16 (pre-existing) | ✅ Written | ✅ Passed | ➖ Single scenario | ➖ None needed |
| 7.1/7.2 | `scraper.test.ts` | Unit | ✅ 32/32 (pre-existing) | ✅ Written (reverted GREEN, re-confirmed RED, reapplied) | ✅ Passed | ✅ 2 cases (declared bag / default empty) | ➖ None needed |
| 7.3/7.4 | `coverage.test.ts` | Unit | ✅ 17/17 (pre-existing) | ✅ Written | ✅ Passed | ✅ 2 cases (holds / violation) | ➖ None needed |
| 7.5 | `args.test.ts` | Unit | ✅ 11/11 (pre-existing) | ✅ Written | ✅ Passed | ✅ 2 cases (custom / default / zero) | ➖ None needed |
| 7.6 | `main.test.ts` | Unit | ✅ 5/5 (pre-existing) | ✅ Written | ✅ Passed | ✅ 3 cases (1 day / 10 days / 1 year) | ➖ None needed |
| **corrective 1** — shape-based partition-invariant detection | `coverage.test.ts` | Unit | ✅ 19/19 (post-Phase-7) | ✅ Written (new "third axis, no `nameProbe` key" case + degenerate-case proof) | ✅ Passed | ✅ 2 new cases (unrelated-key third axis / all-empty-dimensions degenerate) | ✅ Renamed `isNameProbeChild` → `isDeeperPartition`/`isDeeperThanSomeSibling`; comment rewritten to describe actual shape-based behavior |
| **corrective 2** — 302→`errorUnexpected.seam` classification | `response-view.test.ts`, `validity-chain.test.ts`, `detail.test.ts` | Unit | ✅ 5/5, 11/11, 7/7 (pre-fix) | ✅ Written (3+2+2 cases) | ✅ Passed | ✅ positive case + "does NOT swallow an unrelated 302" negative case, at all 3 layers | ➖ None needed |

### Test Summary
- **Total tests written**: 28 (Phases 1–7) + 9 (corrective round: 2 degenerate/generalization tests for coverage.ts, 3+2+2 for the 302 fix) = **37 new test cases**
- **Total tests passing**: 345/345 (baseline was 308/308 — zero regressions across both rounds)
- **Layers used**: Unit (37), Integration (0 — no integration harness in this
  project; live acceptance is the closest analog, attempted in Phase 8), E2E (0)
- **Approval tests**: 1 — `result-fragment.test.ts`'s pre-existing exact-shape
  assertion was extended (not rewritten) to include the new `parties` field,
  after confirming it failed with the new field present, then updating the
  expectation.
- **Pure functions created**: `mergeRanked`, `extractPartyNames`, `nameProbeUnit`,
  `deriveMaxSplitDepth`, `isDeeperPartition`, `isDeeperThanSomeSibling`,
  `latestByObservedAt`

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm vitest run` → 48 files, 345 tests, all passing (baseline 47/308) |
| Runtime harness command/scenario and exact result | `pnpm scrape --from <DATE> --to <DATE> --max-facet-values 132 --max-name-probes {0,30}` against a fresh `output/`, run 5 times total across `2026-09-03` (×2, before/after the 302 fix), `2026-09-01`, `2026-09-02`, `2026-09-04` — **blocked on all 5, confirming a live, current, cross-date `discover()` all-or-nothing failure**, see Phase 8 |
| Rollback boundary | `git diff` touches 22 `src/` files (2 new: `name-probes.ts`, `name-probes.test.ts`); reverting this commit restores the pre-change two-level (date × class) cascade exactly. `--max-name-probes 0` neutralizes the new level without any revert. |

Additional gates: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm format:check`
clean for every file this change touches (one pre-existing, unrelated drift in
`src/engine/http-status.ts` was left untouched).

## Phase-by-Phase Notes

### Phase 1 — Foundation
`TraversalCursor.nameProbe` and `TraversalConfig.maxNameProbes`/`harvester` were
made **optional** (not required, as the task literally reads) with safe defaults
(`maxNameProbes ?? 0`, `harvester ?? new NameHarvester()`). A required field would
have forced editing every existing `new TRF5Traversal({...})` call site across the
test suite for zero behavioral gain, since the default (`0`/fresh harvester)
reproduces the pre-change two-level cascade byte-for-byte. Verified: every
pre-existing `traversal.test.ts`/`site.test.ts` test that never mentions the name
axis passes unmodified. Same reasoning applied to `TRF5SiteConfig.harvester`.

### Phase 2 — Row-level party-name extraction
Confirmed the orchestrator's flagged gap firsthand: `SearchResultRow` had only
`processNumber`/`ca`. Added `parties: string` (the raw trailing text after the
row's process-number anchor, e.g. `PARTE A e outros (2) X PARTE B`), extracted via
a `domhandler` `isTag`/`isText` walk of the cell's child nodes (an `ElementType`
enum-comparison lint rule rejected the more obvious `node.type === 'tag'` string
comparison — fixed by importing the already-a-direct-dependency `domhandler`
helpers instead).

### Phase 3–4 — `name-probes.ts`
`mergeRanked`, `extractPartyNames`, `STATIC_SURNAME_BIGRAMS` (18 generic PT-BR
surname/institutional bigrams, no real names/CPFs), and `NameHarvester` (frequency
map + `ranked(exclude)`) are all pure/deterministic and unit-tested directly, no
mocks needed.

### Phase 5 — `split()` cascade
Restructured `TRF5Traversal.split()` from a flat `if (facetValue !== null) return
null` into the L1→L2→L3→L4 cascade design.md D3 specifies, reusing the exact same
bisection code for L1. Added a per-cell `usedNameProbes` map (keyed by the class
cell's own `unitKey`) so a resumed `split()` call for the same cell never re-emits
an already-issued probe (trf5-adapter spec, "MUST NOT emit a name probe it has
already emitted for the same cell").

### Phase 6 — Adaptive harvest
`TRF5Site.discover()` now runs one extra pass over already-parsed rows
(`extractPartyNames` + `harvester.observe`) before the existing per-row detail
loop — no additional request, verified by asserting `transport.requests.length`
stays unchanged in the new test.

### Phase 7 — Coverage, depth, CLI
- `WorkUnit.dimensions?: Readonly<Record<string, unknown>>` is a **generic**
  pass-through field; `src/engine/` never reads or interprets any key inside it —
  verified by grep: the only place in `src/engine/` that touches `dimensions` is
  `buildCoverageRecord`'s `unit.dimensions ?? {}`, a structural passthrough.
- `verifyPartitionInvariant` was extended to also compare a `subdivided` class
  cell against the sum of its own deeper children. **First implementation
  attempt leaked a concrete key name** (`record.dimensions.nameProbe`) —
  caught in a coordinator review round and fixed, see "Corrective Round" below.
- `--max-name-probes` defaults to 30 (`DEFAULT_MAX_NAME_PROBES`, sized from
  `docs/RESEARCH.md` §3's measured 22–28-probe desaturation runs).
- `MAX_SPLIT_DEPTH` (bare constant `20`) was replaced by `deriveMaxSplitDepth(dateFrom, dateTo)`,
  computed from the actually configured run window and floored at the same `20`
  so no existing run window gets *less* headroom than before. `retry-failed` (no
  date range at all) still gets the floor.

## Corrective Round (post-Phase-7 coordinator review)

### 1. Engine guardrail violation — fixed

The launch prompt was explicit: "If you find yourself writing `nameProbe`
anywhere under `src/engine/`, you have gone too far — stop and report it." The
first implementation of `verifyPartitionInvariant`'s one-level-down check wrote
exactly that:

```ts
function isNameProbeChild(record: CoverageRecord): boolean {
  return record.dimensions.nameProbe !== undefined;
}
```

This directly contradicts `specs/core-coverage-accounting/spec.md` lines 5–6
("the core does not learn a concrete name field") and would silently do nothing
for a second adapter's own differently-named extra partition level. **I wrote
this and did not report it in my first return — that was a real miss, not a
borderline call.**

**Fix**: replaced the concrete-key check with a purely SHAPE-based one. Within a
`windowKey`+`facetValue` bucket, the shallowest record (smallest `dimensions`
key-set size, ties broken by latest `observedAt`) is the partition-level
representative; any record whose key set is a STRICT SUPERSET of that
shallowest record's key set is a deeper child — regardless of what the extra
keys are named:

```ts
function isDeeperPartition(parent: CoverageRecord, child: CoverageRecord): boolean {
  const parentKeys = dimensionKeys(parent);
  const childKeys = dimensionKeys(child);
  if (childKeys.size <= parentKeys.size) return false;
  for (const key of parentKeys) if (!childKeys.has(key)) return false;
  return true;
}
```

Proven with two new RED→GREEN tests in `coverage.test.ts`:
- A hypothetical third-axis child carrying `{date, class, region}` (no
  `nameProbe` key anywhere) is still detected as a deeper partition — this
  genuinely failed (RED) under the old literal-key check, confirming it was
  really coupled to the concrete name, not just verbose.
- The degenerate case (every record in a group declares `dimensions: {}`)
  produces zero deeper-partition entries, reproducing the pre-Phase-7 day-level
  check exactly.

`grep -ri 'nameprobe\|nameharvester\|nomeparte' src/engine/` now returns matches
only inside **test** files (`coverage.test.ts`, `scraper.test.ts`), used purely
as sample adapter data standing in for a real adapter's dimension bag.

**Correction**: my first "zero matches in any production file" claim was
imprecise — it checked the CODE but not every doc COMMENT. Two prose lines in
`PartitionInvariantResult`'s doc comment still said "name-probe-level check"
and "its own name-probe children" (the coordinator caught and fixed this
directly). The code itself was clean by then, but a comment naming the same
concrete concept in prose is the identical class of leak the guardrail exists
to prevent — a future reader trusts the comment as much as the code. Re-grepped
after the coordinator's fix: genuinely zero matches now, in code AND comments,
across all of `src/engine/`.

### 2. Detail-page 302→`errorUnexpected.seam` — fixed (user-approved scope expansion)

Per the user's explicit decision (relayed by the coordinator), fixed in this
same change rather than deferred:

- `ResponseView` gained `isErrorRedirect: boolean` — true only for a 3xx status
  whose `Location` header includes `errorUnexpected.seam`. `AxiosTransport`'s
  `maxRedirects: 0` was left untouched, as instructed; this reads the header,
  it does not follow the redirect.
- `validity-chain.ts` gained one more schema, `hostDefectRedirectSchema`,
  checked right after the existing (directly-rendered, 200-status)
  `hostDefectSchema`, mapping to the same `{ kind: 'hostDefect' }` outcome.
- Strict TDD: RED first at all three layers (`response-view.test.ts`,
  `validity-chain.test.ts`, `detail.test.ts`) with a stubbed 302 response
  pointing at `errorUnexpected.seam`; confirmed each failed, then implemented.
  Never tested against the live site.
- Triangulated with a negative case at every layer: a 302 to an UNRELATED
  location is not swallowed — it still falls through to `unclassified` →
  `hostDefect`-by-fallback exactly as before, proven by
  `detail.test.ts`'s own assertion of the *different* fallback reason string
  ("unrecognized detail response" vs. the new branch's "errorUnexpected.seam
  with PersistenceException").

This fix is **correct and fully proven by tests** — but re-running the live
acceptance in Phase 8 below still could not complete, for a genuinely different
and deeper reason.

## Phase 8 — Bounded Live Acceptance: BLOCKED (confirmed across 4 dates, not an edge case)

**Not completed. Not faked. Ran the live acceptance 5 times total** across this
apply batch and its corrective rounds: `2026-09-03` before the 302 fix,
`2026-09-03` again after it, then the bounded 3-candidate retry
(`2026-09-01`/`02`/`04`) — each against a fresh `output/` (the pre-existing
`output/` was moved aside before every run and restored immediately afterward;
no prior data was lost at any point).

### Attempt 1 (before the 302 fix)

The unfaceted level-1 `discover()` for `2026-09-03` failed: the search returns
30 rows (`docs/RESEARCH.md` §3), but the second row's detail-page fetch
(process `0001647-83.2005.4.05.8308`) returned a 302 to
`errorUnexpected.seam?cid=104706`, which `detail.ts`'s validity chain classified
as `unclassified` → `hostDefect` (reason: "unrecognized detail response") —
the exact gap the corrective round's item 2 fixed.

### Attempt 2 (after the 302 fix) — still blocked, confirmed the fix works, found a deeper cause

Re-ran the identical command. The failure ledger now reads:

```json
{"itemId":"2026-09-03..2026-09-03","documentId":null,"reason":"errorUnexpected.seam with PersistenceException","observedAt":"2026-09-06T17:36:02.658Z"}
```

**This proves the 302 fix works exactly as intended** — the response is now
correctly classified as `hostDefect` (same reason string as the
directly-rendered 200 case), not `unclassified`. But the unit STILL ends up
`failed`, for a reason the 302 fix was never meant to address: `detail.ts`'s
`fetchDetail` is retried under `hostDefectCap: 2` (two attempts, exponential
backoff), and this specific process's detail page returns the identical 302
EVERY time — it is not a transient host hiccup, it is a permanent, per-process
server-side fault (confirmed deterministic across three separate diagnostic
runs and now this live run). Once `hostDefectCap` is exhausted, `runWithRetry`
returns `recordAndStop`, and `TRF5Site.discover()`'s per-row loop already
returns the FIRST non-`ok` detail outcome immediately (`site.ts`: "A single
row's detail-fetch failure fails the whole discover() call rather than
silently dropping the row") — so the entire 30-row day-level unit is recorded
`failed` before any class or name-probe level is ever reached, exactly as
before, just via the correct classification this time instead of the wrong one.

**This is a genuinely different, deeper, and still out-of-scope finding**: the
existing engine/adapter design has no path for "skip one permanently broken row
and keep processing the other 29" — a detail-fetch failure anywhere in a page
fails the whole discover() call, full stop. That is a pre-existing behavioral
choice (`site.ts`'s own comment defends it explicitly: "rather than silently
dropping the row"), not a bug the 302 classification fix could or should also
change, and building a partial-row-tolerant discover() is a materially larger,
unscoped behavioral change to `trf5-adapter`/`core-scraping-engine` — not
something to improvise here. Per the coordinator's own instruction not to start
a third investigation, I am stopping and reporting this rather than attempting
a further fix.

**Numbers I can report**: none from a completed live run — the day-level
`discover()` still never returns `ok` for `2026-09-03`, for this new reason.
Everything else (Phase 1–7 behavior, the 302 classification itself, the
`nomeParte`/search-side wiring, party-name extraction against real live rows)
is proven either by the unit-test evidence above or by the throwaway
diagnostic scripts run during root-causing (not committed, deleted after use),
which confirmed the search response, row parsing, and `nomeParte` field mapping
all work correctly against the real site as of 2026-09-06.

### Third attempt (this batch) — bounded 3-candidate retry on different dates, controlled A/B design

The user chose option 2 above over fixing `discover()`. Per the coordinator's
explicit instruction, `discover()`'s partial-row tolerance was NOT touched —
that stays a separate change.

**Measurement design changed to a controlled A/B**, because `tasks.md` 8.2's
literal `128` only ever meant anything for `2026-09-03`: the plan was to run
the SAME candidate date twice against a fresh `output/` each time —
`--max-name-probes 0` (class-only baseline) then `--max-name-probes 30`
(axis on) — and compare the day against itself, never a different day's number.

**Candidate selection**: ordinary weekdays near `2026-09-03`, avoiding
`2026-09-07` (Dia da Independência, a Brazilian national holiday). Tried, in
order, up to the hard 3-candidate bound:

| # | Date | Day | Result |
|---|---|---|---|
| 1 | `2026-09-02` | Wednesday | `discover()` failed — `errorUnexpected.seam with PersistenceException` |
| 2 | `2026-09-04` | Friday | `discover()` failed — same `hostDefect` reason |
| 3 | `2026-09-01` | Tuesday | `discover()` failed — same `hostDefect` reason |

Each attempt ran only the class-only-baseline half (`--max-name-probes 0`)
first, against a fresh `output/` (pre-existing `output/` moved aside before
each attempt and restored immediately after — no data lost). Since the
unfaceted level-1 `discover()` is a shared prerequisite for BOTH halves of the
A/B, none of the three candidates ever reached the point where a baseline
count — let alone the axis-on comparison — could be produced. **The axis-on
(`--max-name-probes 30`) half was never run for any of the 3 candidates**,
since the baseline half it depends on never returned `ok`.

**All 3 candidates plus the original `2026-09-03` (tried twice) — 4 dates
total — died on the IDENTICAL failure class**: at least one process among that
day's unfaceted 30-row result set has a detail page that unconditionally
returns `errorUnexpected.seam` (directly-rendered or via a 302), every retry,
every date tried.

**This is the answer the bounded retry was designed to surface, per the
coordinator's own framing**: hitting this on every single date tried — not one
unlucky process on one unlucky day — means `TRF5Site.discover()`'s
all-or-nothing row-failure handling is not a rare edge case for current live
conditions. It is a live, present, and apparently CURRENT blocker (measured
2026-09-06) for any full day-level sweep with detail fetching enabled, entirely
independent of the name-substring axis this change adds. The class axis itself
(`APELAÇÃO CÍVEL`/`AGRAVO DE INSTRUMENTO`, etc.) never gets exercised on any of
these 4 dates today, because the very first unfaceted `discover()` call never
completes for any of them.

**Stopping here, as instructed** — not starting a fourth investigation, not
widening the candidate search, not attempting a `discover()` fix. Recorded in
`docs/RESEARCH.md` §3 alongside (never overwriting) the existing `2026-09-03`
class-axis measurements; recorded in `tasks.md` 8.1/8.2/8.3 as unchecked, with
the actually-run A/B design documented in place of the old literal-`128`
criterion. This finding itself is evidence the recommended follow-up (a
`discover()` partial-row-tolerance fix) is not optional polish — it is now the
prerequisite for observing this change's own name-substring axis live at all.

### Root-cause diagnostic (this batch, read-only, no production changes): H1 confirmed decisively over H2

The coordinator correctly pushed back on the "permanently broken process /
cross-date site defect" reading above: reproducing 5/5 through one shared
`discover()` code path only proves that path always fails, not that the DATA
(H1) rather than OUR OWN session/conversation handling (H2) is the cause. Two
targeted, read-only diagnostics (throwaway scripts, not committed, deleted
after use) told the hypotheses apart directly:

- **Test A (decisive)**: a completely fresh session (new cookie jar, new
  `jsessionid`, new ViewState, zero prior requests) fetched
  `2026-09-03`'s row-index-1 process (`0001647-83.2005.4.05.8308`) as its
  FIRST detail request — before anything else. It failed identically
  (`302 → errorUnexpected.seam?cid=109060`, same `PersistenceException`
  shape). **This falsifies H2**: there was no prior conversation for this
  request to inherit or poison, so the fault cannot be a client-side
  session/conversation-order bug. It travels with the process.
- **Test B (cross-date confirmation, run since Test A alone, while decisive
  for H2/H1 in general, only directly examined one process)**: fresh session
  per date, sequential row-order fetch, stop at first failure —
  `2026-09-03` failed at index 1 (`0001647-83.2005.4.05.8308`, `cid=107039`),
  `2026-09-02` failed at index 1 (`0820320-27.2019.4.05.8300`, `cid=107049`).
  Two DIFFERENT process numbers, both at index 1. Read in isolation this
  matches the pattern that would suggest H2 (a positional/order bug) — but
  Test A already ran the direct causal experiment on exactly the `2026-09-03`
  row this table also names and falsified that mechanism for it. The
  consistent-index pattern is a real, currently-unexplained property of the
  CORPUS/site (why do broken records cluster near index 1 across sampled
  dates?), not evidence of a client-side defect.
- Total requests across both tests: well under the ~80 politeness budget
  (Test A: 1 prime + 1 search + 1–3 detail fetches; Test B: 2×(1 prime + 1
  search + ≤2 detail fetches)) — all with the existing 500ms politeness
  interval respected manually in the throwaway scripts.

**Conclusion**: H1 wins, decisively, not merely by elimination across dates
(which the coordinator correctly rejected as insufficient) but by a direct
causal isolation that rules out H2's required mechanism. `docs/RESEARCH.md` §3
has been corrected in place — not left standing next to a wrong reading — to
state this plainly, with the full raw evidence (status codes, `Location`
headers, `cid` values, process numbers). The recommended fix is unchanged
(`discover()` partial-row tolerance is still the right target), but the
CERTAINTY of the diagnosis is now direct evidence, not an inference from
repeated symptom.

## Changed Lines by Area

| Area | Insertions | Deletions |
|---|---|---|
| `src/` (staged, Phases 1–7 + both corrective rounds) | 1098 | 56 |
| `docs/RESEARCH.md` | 134 (41 pre-existing from before this session + ~93 from this batch's §3 addendum and root-cause correction) | 2 |
| `openspec/` (untracked, intended-untracked per frozen inventory) | ~574 (pre-existing 5 files, untouched as a block) + `tasks.md` in-place edits + `apply-progress.md` (new) | — |

`src/` total (1154 lines) exceeds the 800-line review budget but is within the
1800-line ledger cap and the explicitly accepted `size:exception` for this
single PR. `src/` grew by almost nothing in this final bounded-retry batch (zero
production code changes — only documentation/tracking files were touched).

## Deviations from Design

1. `TraversalConfig.maxNameProbes`/`harvester` and `TRF5SiteConfig.harvester` are
   **optional with defaults**, not required as `design.md`/`tasks.md` literally
   describe. Functionally equivalent (see Phase 1 note above); done to avoid an
   unnecessary blast-radius edit across every existing test call site.
2. Phase 8 could not be completed — see above, now for a second, different,
   deeper reason than originally reported. Everything else matches the design
   (D1–D6) with no other deviation.
3. (Corrective round) The `verifyPartitionInvariant` extension's FIRST
   implementation deviated from `core-coverage-accounting`'s own spec text
   ("the core does not learn a concrete name field") by string-matching a
   concrete key. This was a defect, not an intentional deviation — caught in
   review and fixed to the shape-based approach described above. Disclosed
   here for completeness, not to relitigate it.
4. (Corrective round, user-approved) The detail-page 302→`errorUnexpected.seam`
   classification fix was originally scoped OUT of this change and reported as
   a follow-up recommendation; the user explicitly approved bringing it into
   this same change, so `src/adapters/trf5/schemas/response-view.ts`,
   `validity-chain.ts`, and their tests are now part of this PR's diff.

## Unverified Hypothesis (correction)

An earlier version of this document's Key Learnings speculated that
`docs/RESEARCH.md` §3's "128 unique processes" baseline was "very likely"
measured via search-response set-hash comparison rather than full per-row
detail-page fetches. **This was never verified and should not have been
recorded as a finding.** It remains unverified after both corrective rounds:
the day-level live sweep still cannot complete on any date tried (see Phase 8
above), so there is still no way to directly compare a completed
full-detail-fetch run against the RESEARCH.md number for any date. Marking this
explicitly as an **open, unverified hypothesis**, not a conclusion.

## Remaining Tasks
- [ ] 8.1 Run the controlled same-day A/B (baseline vs. axis-on) on a date that
      does not hit a permanently-broken row — blocked: 4/4 dates tried
      (`2026-09-01`, `02`, `03` ×2, `04`) all failed identically before either
      half of the A/B could run
- [ ] 8.2 Verify the A/B pass criterion against `coverage.jsonl` — blocked,
      depends on 8.1
- [ ] 8.3 Record the observed numbers — done as a BLOCKED finding instead (no
      numbers exist to record): see `docs/RESEARCH.md` §3's new "Bounded live
      acceptance attempt (2026-09-06)" subsection, added alongside (never
      overwriting) the existing `2026-09-03` class-axis measurements
