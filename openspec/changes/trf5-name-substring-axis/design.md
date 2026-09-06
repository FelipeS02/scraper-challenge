# Design: TRF5 Name-Substring Partition Axis

Grounded in the proposal and the delta specs in this change. Every component below traces to
a requirement; no component is introduced that no requirement demands.

## D1 — The name probe lives in the adapter-opaque cursor

Satisfies *Declared Partition Cascade* and *Name-Substring Partition Level*.

`TraversalCursor` gains one optional field. `facetValue` on the `WorkUnit` stays the judicial
class (the declared facet; coverage counts it, `--max-facet-values` bounds it). The name
probe is a sub-partition of a `(day, class)` cell and rides in the cursor, which the engine
round-trips byte-identically and never interprets.

```ts
export interface TraversalCursor {
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly nameProbe?: string; // present only at partition level 3
}
```

`unitKey` extends so name-probe siblings never collide:

```
windowKey                       // level 1: "2026-09-03..2026-09-10"
windowKey|facetValue            // level 2: "2026-09-03..2026-09-03|APELAÇÃO CÍVEL"
windowKey|facetValue|nameProbe  // level 3: "...|APELAÇÃO CÍVEL|DA SILVA"
```

## D2 — One frequency-ranked queue: static dictionary + adaptive harvest

Satisfies *Static Name-Probe Dictionary Floor* and *Adaptive Name-Probe Extension*.

A single probe queue is seeded by the static dictionary (the floor: it works before any row
is seen) and extended by party names harvested from the result rows the adapter already parses
during discover. The engine runs `discover(unit)` before `split(unit)`, so by the time a class
cell is split the harvester already holds that cell's 30 rows' names — the first probe batch is
already data-driven.

```ts
// Adapter-owned, injected into BOTH the site (writes during discover) and the
// traversal (reads during split). This shared instance is the only new coupling.
class NameHarvester {
  private freq = new Map<string, number>();      // bigram -> occurrences this run
  observe(partyNames: readonly string[]): void { /* bump 2-token bigram counts */ }
  ranked(exclude: ReadonlySet<string>): readonly string[] { /* freq desc, minus used */ }
}

// STATIC_SURNAME_BIGRAMS: adapter-owned constant, e.g. ["DA SILVA","DOS SANTOS", ...].
// mergeRanked puts harvested (data-driven) probes ahead of unused dictionary entries.
```

The party names are read from the result-list rows only — the parties column arrives as
`<PARTE A> e outros (N) X <PARTE B>` (`docs/RESEARCH.md` §3). No detail-page fetch, no extra
request.

## D3 — `split()` becomes a four-branch cascade

Satisfies *Name-Substring Partition Level*, *Name-Probe Budget*, and the MODIFIED
*Declared Partition Cascade*.

```ts
async split(unit, saturated): Promise<readonly WorkUnit<TraversalCursor>[] | null> {
  const { dateFrom, dateTo, nameProbe } = unit.cursor;

  // L1 — multi-day window: bisect (unchanged). Keeps facetValue and nameProbe.
  if (dateFrom !== dateTo) { /* ...existing bisection... */ }

  // L2 — single day, no class yet: expand to per-class units (unchanged).
  if (unit.facetValue === null) { /* ...existing class expansion, bounded by maxFacetValues... */ }

  // L3 — single day + class, no name probe yet: expand to name-substring probes.
  if (nameProbe === undefined) {
    if (this.maxNameProbes === 0) return null;                    // level disabled -> truncated
    const queue = mergeRanked(STATIC_SURNAME_BIGRAMS, this.harvester.ranked(this.used));
    const bounded = queue.slice(0, this.maxNameProbes);
    if (bounded.length === 0) return null;
    return bounded.map((p) => nameProbeUnit(dateFrom, unit.facetValue!, p));
  }

  // L4 — class + name probe still saturated: irreducible. nomeParte is one substring;
  //      two cannot be conjoined. Return null -> engine records `truncated`.
  return null;
}
```

The engine is unchanged: it enqueues whatever `split()` returns and records the parent
`subdivided`, or records `truncated` on `null`. It never learns there is a name dimension.

## D4 — CONSTRAINT: `maxSplitDepth` default must cover the extra level

`maxSplitDepth` (`ScraperConfig.maxSplitDepth`) is an engine-level, dimension-agnostic bound
on how many times one lineage may be subdivided; exceeding it is treated exactly as a `null`
from `split()`. It counts every hop, and it does not distinguish date-bisection hops from the
class and name hops. Adding the name level adds one hop to any lineage that reaches it, so:

```
maxSplitDepth ≥ ceil(log2(range_days)) + 2      // +1 for class, +1 for name-substring
```

A one-year run window bisects ~9 times to reach single days, then +1 class +1 name = **11**.
If the default is set below this, the name level is silently cut and its cell is recorded as a
false `truncated` gap. This change MUST update the `maxSplitDepth` default (and its
documentation) to satisfy the inequality for the default run window, and the composition root
SHOULD derive or assert it from the configured date range rather than hardcoding a bare number.

## D5 — Coverage reporting

Satisfies the coverage delta. The name probe is written into `CoverageRecord.dimensions`
(`{ date, class, nameProbe }`) so a `truncated` residue names exactly which day-class-probe
cell is still incomplete. `facetValue` remains the class for per-facet counting. The partition
invariant extends one level: for a `subdivided` class cell, the sum of its name-probe children
counts is `>=` the class cell's recorded saturated count (the sum is inflated by overlap,
which dedup resolves separately).

## D6 — Determinism boundary for Strict TDD

The static path (harvester empty ⇒ queue equals the dictionary) is deterministic and is built
and tested first against the stubbed transport. The adaptive extension is tested with fixtured
result rows carrying synthetic party names (never real CPFs/names — repo PII rule); because
the harvester starts empty and falls back to the dictionary, the static tests are unaffected
when the adaptive layer is added.

## Traversal walkthrough — how the days get probed

This is the concrete order a run visits work units, for a run window of `01/09..10/09` with
`--max-facet-values 132` and `--max-name-probes 30`. It shows both the depth and the day-by-day
probing order.

**Phase A — date bisection (level 1).** `seed()` emits one unit for the whole window,
unfaceted: `01/09..10/09`. Discover saturates (30). `split()` bisects:
`01/09..05/09` and `06/09..10/09`. Each child is discovered; a saturated one bisects again;
an unsaturated one is `complete` and stops. Bisection continues until each surviving saturated
unit is a single day. Depth so far for a 10-day window: `ceil(log2(10)) = 4` hops.

**Phase B — class expansion (level 2).** Take a single day that still saturates, say
`03/09..03/09` (facet `null`). `split()` sees a single day and no class, so it fetches the 132-
class catalogue once and emits up to 132 single-day class units:
`03/09|AÇÃO CIVIL COLETIVA`, `03/09|APELAÇÃO CÍVEL`, `03/09|AGRAVO DE INSTRUMENTO`, …. The
parent day is recorded `subdivided` (count 30). Most class units come back small and
`complete` (measured: 19 of 132 non-empty, most well under 30). This is +1 hop.

**Phase C — name-substring expansion (level 3).** Only the class units that *still* saturate
reach here — measured on `03/09`, exactly two: `APELAÇÃO CÍVEL` and `AGRAVO DE INSTRUMENTO`.
For `03/09|APELAÇÃO CÍVEL` (count 30):

1. Its discover already ran, so the harvester holds ~39 party names from those 30 rows.
2. `split()` builds the queue: harvested bigrams ranked by frequency
   (`SEGURO SOCIAL`, `REGIONAL DE`, `DA SILVA`, `NACIONAL DE`, …) ahead of unused dictionary
   entries, capped at 30.
3. It emits those as name-probe units:
   `03/09|APELAÇÃO CÍVEL|SEGURO SOCIAL`, `03/09|APELAÇÃO CÍVEL|DA SILVA`, …. The class cell is
   recorded `subdivided` (count 30). This is +1 hop (total depth 4 + 1 + 1 = 6, within an
   11-budget).
4. Each name-probe unit is discovered. Measured outcome: every probe returns < 30 → each is
   `complete`; none reaches L4. Dedup by process number collapses the heavy overlap across
   probes. Net for the cell: 30 → ~85–95 unique processes.

**Phase D — residue (level 4), if any.** A name-probe unit that itself returned 30 would be
split again; `split()` at L4 returns `null` and the engine records
`03/09|<class>|<probe>` as `truncated`, with all three dimensions in the coverage record. In
the measurement this branch was never taken (0 of 28 probes saturated), but it is the honest
exit when a single substring on a single day in a single class still overflows.

**What an operator sees in `coverage.jsonl` for `03/09`:** one `subdivided` day cell (30);
~130 class cells (`complete`/empty) plus two `subdivided` class cells (30 each); and, under
each of those two, up to 30 name-probe cells, nearly all `complete`. The run summary counts
only terminal cells; no `subdivided` parent is double-counted. The day that used to report a
single `truncated` gap now reports a near-fully-observed day with, at worst, a small
named residue.
