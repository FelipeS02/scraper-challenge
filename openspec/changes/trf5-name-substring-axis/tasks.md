# Tasks: TRF5 Name-Substring Partition Axis

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650–900 (src/) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Cursor field, harvester scaffolding, party-name extraction, static dictionary floor (Phases 1–3) | PR 1 (base: feature/tracker) | `pnpm vitest run src/adapters/trf5/name-probes.test.ts src/adapters/trf5/parsing/result-fragment.test.ts` | N/A — pure unit tests, no live transport | Revert PR 1 branch; no other code depends on it yet |
| 2 | `split()` cascade, two-token guard, adaptive harvest, `maxSplitDepth`, coverage dimensions/invariant (Phases 4–7) | PR 2 (base: PR 1 branch) | `pnpm vitest run src/adapters/trf5/traversal.test.ts src/engine/coverage.test.ts` | N/A — stubbed transport/fixtures | Revert PR 2; PR 1's dictionary/harvester stay inert (unused by traversal) |
| 3 | CLI flag, composition-root wiring, live acceptance (Phase 8) | PR 3 (base: PR 2 branch) | `pnpm vitest run src/cli/args.test.ts src/main.test.ts` | `pnpm scrape --from 2026-09-03 --to 2026-09-03 --max-facet-values 132 --max-name-probes 30` in a clean `output/` dir | `--max-name-probes 0` neutralizes without revert; full revert removes CLI flag only |

## Phase 1: Foundation

- [x] 1.1 `src/adapters/trf5/traversal.ts`: add `nameProbe?: string` to `TraversalCursor`; extend `windowUnit`/add `nameProbeUnit` so `unitKey` appends `|<nameProbe>`.
- [x] 1.2 New `src/adapters/trf5/name-probes.ts`: declare `STATIC_SURNAME_BIGRAMS` (PT-BR surname/institutional bigrams, each ≥2 tokens) and `NameHarvester` class skeleton (`observe`, `ranked`).
- [x] 1.3 `TraversalConfig` gains `maxNameProbes: number` and `harvester: NameHarvester`; `TRF5SiteConfig` gains `harvester: NameHarvester` (shared instance, injected once in `main.ts`).

## Phase 2: Row-level party-name extraction (gap found — rows carry no names today)

- [x] 2.1 RED `src/adapters/trf5/parsing/result-fragment.test.ts`: a fixture row with parties text `<A> e outros (N) X <B>` yields `SearchResultRow.parties` with both names.
- [x] 2.2 GREEN `src/adapters/trf5/parsing/result-fragment.ts`: extend `SearchResultRow` with `readonly parties: string`; parse the cell alongside `ca`/`processNumber`.

## Phase 3: Static dictionary floor (TDD first — deterministic path)

- [x] 3.1 RED `src/adapters/trf5/name-probes.test.ts`: empty harvester ⇒ `mergeRanked` returns the dictionary in declared order.
- [x] 3.2 GREEN: implement `mergeRanked(dictionary, harvested)`.

## Phase 4: Two-token substring constraint

- [x] 4.1 RED `src/adapters/trf5/name-probes.test.ts`: a probe value with one token throws before becoming a work unit.
- [x] 4.2 GREEN: add a guard in `nameProbeUnit`/`mergeRanked` rejecting single-token values; assert every `STATIC_SURNAME_BIGRAMS` entry has ≥2 tokens.

## Phase 5: `split()` four-branch cascade

- [x] 5.1 RED `src/adapters/trf5/traversal.test.ts`: single-day saturated class cell with no `nameProbe` → `split()` returns bounded name-probe children, unique `unitKey`s.
- [x] 5.2 RED: same cell already carrying a `nameProbe` and still saturated → `split()` returns `null`.
- [x] 5.3 RED: `maxNameProbes: 0` → `split()` returns `null` at the name level.
- [x] 5.4 GREEN `src/adapters/trf5/traversal.ts`: implement L3/L4 per design D3, reusing `mergeRanked`/dictionary/harvester.
- [x] 5.5 `src/adapters/trf5/site.ts`: map `cursor.nameProbe` into `SearchCriteria.nomeParte`; RED+GREEN in `site.test.ts`.

## Phase 6: Adaptive harvest (after the static path is proven)

- [x] 6.1 RED `src/adapters/trf5/name-probes.test.ts`: `observe(names)` then `ranked()` orders bigrams by descending frequency, ahead of unused dictionary entries; already-emitted probes for a cell are excluded.
- [x] 6.2 GREEN: implement frequency map and exclusion set in `NameHarvester`.
- [x] 6.3 RED `src/adapters/trf5/site.test.ts`: `discover()` calls `harvester.observe()` with each row's `parties`, issuing no extra request.
- [x] 6.4 GREEN: wire the call in `TRF5Site.discover()` after row parsing.

## Phase 7: Coverage, depth, and CLI wiring

- [x] 7.1 RED `src/engine/scraper.test.ts`: `CoverageRecord.dimensions` passes through an adapter-declared `WorkUnit.dimensions` bag unchanged (generic pass-through only — engine never interprets keys).
- [x] 7.2 GREEN: add optional `dimensions?: Readonly<Record<string, unknown>>` to `WorkUnit`; `buildCoverageRecord` uses `unit.dimensions ?? {}`; TRF5 traversal populates `{ date, class, nameProbe }` on name-probe units.
- [x] 7.3 RED `src/engine/coverage.test.ts`: `verifyPartitionInvariant` compares a subdivided class cell's recorded (saturated) count against the sum of its name-probe children.
- [x] 7.4 GREEN `src/engine/coverage.ts`: extend the invariant check one level down per core-coverage-accounting delta.
- [x] 7.5 `src/cli/args.ts`: add `--max-name-probes` (default sized from measured yield, e.g. 30); RED+GREEN in `args.test.ts`.
- [x] 7.6 `src/main.ts`: raise/derive `MAX_SPLIT_DEPTH` to satisfy `ceil(log2(range_days)) + 2`; assert it in `main.test.ts`; wire `maxNameProbes`/`harvester` into `TRF5Traversal`/`TRF5Site`.

## Phase 8: Bounded live acceptance

**Revised after live attempts against `2026-09-03` (twice) and three bounded
candidate dates all failed on the same permanently-broken-row `hostDefect`
(`errorUnexpected.seam` reached via a 302, and once via its directly-rendered
200 form) — see `apply-progress.md` "Phase 8" for the full record.** The
literal-128 comparison below was replaced with a controlled same-day A/B
(class-only baseline vs. axis-on) because the constant `128` only ever meant
anything for `2026-09-03` specifically.

- [ ] 8.1 Run the SAME acceptance date twice against a FRESH `output/` each
      time (a re-run over an already-checkpointed date is a silent no-op):
      1. `pnpm scrape --from <DATE> --to <DATE> --max-facet-values 132 --max-name-probes 0` (class-only baseline; `0` neutralizes the new axis)
      2. `pnpm scrape --from <DATE> --to <DATE> --max-facet-values 132 --max-name-probes 30` (axis on)
- [ ] 8.2 Pass criterion (controlled A/B, not the literal `128`): run 2's unique
      item count strictly exceeds run 1's, AND run 2's `coverage.jsonl` shows
      ≥1 `subdivided` class cell with deeper (name-probe) children — never
      merely a zero exit code.
- [ ] 8.3 Record the observed numbers (or the blocking finding, if every
      candidate date dies first) in `docs/RESEARCH.md` §3, alongside — never
      overwriting — the existing `2026-09-03` class-axis measurements.

**Outcome as of this apply batch: BLOCKED before either A/B run could start.**
The day-level unfaceted `discover()` — a prerequisite for BOTH the baseline and
axis-on runs — failed identically on `2026-09-03` (twice: once as
`unclassified`, once, after the 302 fix, as the correctly-classified
`hostDefect`) and on all 3 bounded candidate dates tried afterward
(`2026-09-01`, `2026-09-02`, `2026-09-04`), each hitting the identical
`errorUnexpected.seam with PersistenceException` failure on at least one row in
that day's unfaceted 30-row result set. Per the bounded-retry instruction, this
is the answer: `TRF5Site.discover()`'s all-or-nothing row-failure handling is
not an edge case for a single unlucky process — it is a live, current blocker
across every date tried. See `apply-progress.md` for full detail; 8.1/8.2/8.3
stay unchecked.

## Reverse Audit

Every task traces to a requirement: Declared Partition Cascade (1.1, 5.1–5.4), Name-Substring
Partition Level (2.*, 5.*), Static Dictionary Floor (3.*), Adaptive Extension (6.*), Name-Probe
Budget (5.3, 7.5), Cell State Ledger + dimensions (7.1–7.2), Partition Invariant (7.3–7.4),
`maxSplitDepth` constraint (7.6), Success Criteria live proof (8.*). No engine subdivision/loop
logic changes; the one `WorkUnit.dimensions` pass-through is generic plumbing the coverage delta
requires, not a name-specific interpretation.
