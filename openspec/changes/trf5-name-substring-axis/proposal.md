# Proposal: TRF5 Name-Substring Partition Axis

## Intent

Add a third partition axis to the TRF5 phase-1 sweep so that a `(day, class)` cell that
still saturates at the 30-result cap can be subdivided further, instead of being written off
as a `truncated` coverage gap.

`docs/RESEARCH.md` §3 ("Measured partition yield") establishes the factual base: on the
saturated day `03/09/2026` the existing date × class sweep recovers 128 of a capped 30, but
leaves 2 classes still saturated. A name-substring sub-partition on those residual cells
lifts the day to 191 unique processes and fully desaturates them (0 of 28 probes still hit
the cap). The mechanism is `nomeParte` / `nomeAdv`, which are literal case-insensitive
SUBSTRING filters that compose with both the date window and the class filter.

This is not a rework of the frontier crawl. The frontier crawl is phase 2, seeded from
exact-match identifiers (OAB, exact name) harvested from detail pages, and it stays exactly
as specified. This change is a phase-1 partition axis — the same role judicial class already
plays — and it reuses the engine's existing saturation-driven subdivision without any engine
change.

## Scope

### In Scope

| # | Deliverable |
|---|---|
| 1 | A name-substring partition level in `TRF5Traversal.split()`, fired only when a single-day class cell still saturates |
| 2 | A static PT-BR surname/entity bigram dictionary (adapter-owned) as the guaranteed probe floor |
| 3 | An adaptive probe extension: probes ranked by frequency across party names harvested from returned result rows |
| 4 | A per-cell probe budget (`--max-name-probes`), analogous to `--max-facet-values` |
| 5 | Coverage reporting of the name-probe dimension so a residual `truncated` cell is legible |
| 6 | A design note that the engine's `maxSplitDepth` default must account for the extra level |

### Out of Scope

- **Any change to the frontier crawl (phase 2).** Exact-match seeds and its yield-decay stop
  are untouched.
- **Any change to the payload-generic engine.** `split()` already returns children and the
  engine records the parent `subdivided`; it stays dimension-agnostic.
- **Elevating the name probe to a second generic facet in the engine.** It lives in the
  adapter-opaque cursor, reported through the existing `CoverageRecord.dimensions` map.
- **AND-ing two substrings, or longer-substring extension of a still-saturated probe.** A
  name-probe cell that itself saturates is the irreducible residue and is reported as such.
- **`nomeAdv` as a distinct level in this change.** The axis is modelled on `nomeParte`;
  `nomeAdv` is a documented future extension using the identical mechanism.

## Capabilities

### Modified Capabilities

- `trf5-adapter`: the declared partition facet becomes an ordered partition cascade
  (`classeJudicial` → name-substring); the traversal gains the name-probe level; the adapter
  declares a name-probe budget and owns the static dictionary and the row-name harvester.
- `coverage-accounting`: a coverage cell may carry a name-probe dimension; a name-probe cell
  that still saturates maps to `truncated`, a subdivided cell to `subdivided`.

### New Capabilities

- None.

## Approach

**The name probe rides in the adapter-opaque cursor, not in the engine.** `TraversalCursor`
gains an optional `nameProbe`. `facetValue` stays the judicial class (the declared facet that
coverage counts and `--max-facet-values` bounds). This keeps the engine generic: it round-
trips the cursor byte-identically and never learns there is a name dimension.

**One mechanism, two contributors ("use both").** A single frequency-ranked probe queue is
seeded by the static dictionary (the floor — it works before any row is seen) and extended by
party names harvested from the rows the adapter already parses during `discover()`. Because
the engine runs `discover(unit)` before `split(unit)`, by the time a class cell is split the
adapter has already harvested that cell's 30 rows' names into shared adapter state, so the
ranking is data-driven from the first probe batch.

**Portable vs. TRF5-specific.** Portable (unchanged): the loop, saturation-driven
subdivision, `maxSplitDepth`, coverage accounting, the `dimensions` reporting channel.
TRF5-specific (this change): the substring semantics of `nomeParte`, the PT-BR dictionary,
the row-name harvester, and the name-probe level inside `split()`.

**Determinism boundary for Strict TDD.** The static-dictionary path is fully deterministic
(fixed probes → fixed expectation against a stubbed transport) and is built and tested first.
The adaptive extension depends on live row content, so it is tested with fixtured rows that
carry synthetic party names; the harvester starts empty and falls back to the dictionary, so
the first tests hold unchanged.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/trf5/traversal.ts` | Modified | `TraversalCursor.nameProbe`; name-probe level in `split()`; name-probe budget |
| `src/adapters/trf5/` (new file) | New | Static bigram dictionary + a row-name harvester shared with the site |
| `src/adapters/trf5/site.ts` (discover) | Modified | Map `cursor.nameProbe` into `nomeParte`; feed harvested row names to the harvester |
| `src/adapters/trf5/search.ts` | Modified | `nomeParte` already exists in `SearchCriteria`; wired from the cursor |
| coverage reporting | Modified | Name-probe dimension surfaced via `CoverageRecord.dimensions` |
| CLI | Modified | `--max-name-probes` bound |
| design.md | New | Cursor model, harvester, `split()` levels, `maxSplitDepth` constraint |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| The name level exhausts the `maxSplitDepth` budget and truncates prematurely | Med | Design constraint: default `maxSplitDepth ≥ ceil(log2(range_days)) + 2`; documented and asserted |
| Adaptive ranking makes `split()` non-deterministic and hard to test | Med | Static path is the tested floor; adaptive tested with fixtured row names; harvester empty ⇒ dictionary |
| Probe budget too low ⇒ residual saturation reported as truncated (false gap) | Med | `--max-name-probes` default sized from the measured yield; a saturated probe cell is honestly `truncated`, never silently complete |
| Extra requests per saturated cell burn the rate-limit budget | Med | Level fires only on a still-saturated single-day class cell (2 of 132 cells in the measurement); global rate limiter and `--max-requests` still bound the run |
| Substring bias mistaken for completeness | Low/**Severe** | Coverage stays "measured, never certified"; a name-probe residue is reported, and the README/summary keep the honest-gap statement |

## Rollback Plan

- The axis is additive to `split()`. Reverting this change restores the two-level cascade
  (date → class → `truncated`); no earlier behavior regresses.
- **Partitioning-format note (config.yaml rule):** the change adds one optional field
  (`nameProbe`) to the adapter-opaque cursor and one optional dimension to coverage records.
  Both are append-only and carry `schema_version`; a checkpoint or coverage file written with
  a name probe is still readable by the pre-change reader (it treats the extra field as opaque
  round-tripped data). Rolling back the code does not corrupt existing checkpoints — resume
  continues from the date/class cells; any name-probe cells simply re-run under the older
  two-level logic and are recorded as `truncated`.
- The level can be neutralised without a code revert by setting `--max-name-probes 0`, which
  makes the name level return `null` (i.e., the pre-change behavior).

## Success Criteria

- [ ] A single-day class cell that reaches the cap is subdivided into name-probe units; a
      cell already carrying a name probe that still saturates is recorded `truncated`.
- [ ] With the harvester empty, the probe queue equals the static dictionary (deterministic).
- [ ] With fixtured rows, harvested names are merged into the ranking ahead of unused
      dictionary entries.
- [ ] `--max-name-probes` bounds the number of probe children per cell; `0` disables the level.
- [ ] A `truncated` name-probe cell carries its date, class, and name-probe in the coverage
      record's `dimensions`.
- [ ] `maxSplitDepth` default documented and asserted to accommodate the extra level for the
      configured date range.

## Dependencies

- Builds on `scraper-core` (engine saturation-driven subdivision, `TRF5Traversal`,
  coverage accounting). This change assumes those are in place.
- No new runtime dependencies.
