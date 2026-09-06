# TRF5 Adapter Specification (delta)

Delta against the `trf5-adapter` capability defined in the `scraper-core` change. Adds a
name-substring partition level and the machinery it needs; modifies the single-facet
declaration into an ordered partition cascade. Grounded in `docs/RESEARCH.md` §3 ("Measured
partition yield").

## MODIFIED Requirements

### Requirement: Declared Partition Cascade
The TRF5 adapter MUST declare an ordered partition cascade rather than a single facet. The
cascade is `classeJudicial` (judicial class) first, then name-substring (`nomeParte`). The
judicial class remains the declared facet consumed by core coverage-accounting for per-facet
counting and bounded by `--max-facet-values`; the name-substring level is an adapter-owned
sub-partition applied only within a single-day class cell that still saturates, bounded by
`--max-name-probes`. The adapter MUST NOT apply the name-substring level before the class
level, and MUST NOT apply either level while the date window still spans more than one day.

#### Scenario: Adapter still declares classeJudicial as the partition facet
- GIVEN the TRF5 adapter's traversal port implementation
- WHEN core coverage-accounting queries the declared partition facet
- THEN it receives `classeJudicial`

#### Scenario: Name-substring level applies only after class, within a single day
- GIVEN a saturated work unit whose date window spans more than one day
- WHEN the adapter subdivides it
- THEN it bisects the date window and does NOT introduce a class or name-substring dimension
- AND only once the window is a single saturated day does it expand by class
- AND only once a single-day class cell is itself saturated does it expand by name-substring

## ADDED Requirements

### Requirement: Name-Substring Partition Level
When a work unit is a single day, carries a judicial class, carries no name probe yet, and
has reached the adapter-declared result-page cap, the adapter's `split()` MUST return
name-probe child units — each identical to the parent except that it carries one name-probe
value applied to `nomeParte` — rather than returning `null`. A name-probe value MUST be a
substring of at least two space-separated tokens, consistent with the server's validation
(`docs/RESEARCH.md` §3). Each child's `unitKey` MUST be unique across its siblings by
incorporating the name-probe value. When a work unit already carries a name probe and still
reaches the cap, `split()` MUST return `null`, because `nomeParte` accepts a single substring
and two substrings cannot be conjoined; the engine then records that cell as a `truncated`
gap.

#### Scenario: Saturated single-day class cell expands into name probes
- GIVEN a single-day work unit carrying a judicial class whose discover result reached the cap
- AND the work unit carries no name probe
- WHEN the adapter's `split()` is called
- THEN it returns one or more child units, each carrying a distinct name-probe value on `nomeParte`
- AND each child is otherwise identical to the parent (same day, same judicial class)

#### Scenario: Saturated name-probe cell is irreducible
- GIVEN a single-day work unit carrying both a judicial class and a name probe whose discover result reached the cap
- WHEN the adapter's `split()` is called
- THEN it returns `null`
- AND the engine records the cell as a `truncated` gap carrying its date, class, and name probe

#### Scenario: Discover applies the cursor's name probe to nomeParte
- GIVEN a work unit whose cursor carries a name-probe value
- WHEN the adapter builds the search POST for its discover stage
- THEN the complete search form field set is submitted with `nomeParte` set to that value
- AND the date range and judicial class from the work unit are also present

### Requirement: Static Name-Probe Dictionary Floor
The adapter MUST own a static, deterministic dictionary of name-substring probes (common
PT-BR surname and institutional-litigant bigrams) and MUST use it as the guaranteed probe
floor for the name-substring level. The dictionary MUST be adapter-owned and MUST NOT reside
in the payload-generic engine. When no party names have been harvested yet, the probe queue
for a cell MUST equal the static dictionary, so the level's first behavior is fully
deterministic.

#### Scenario: Empty harvest falls back to the static dictionary
- GIVEN a saturated single-day class cell and a harvester that has observed no party names
- WHEN the adapter builds the name-probe queue for that cell
- THEN the queue equals the static dictionary, in the dictionary's declared order
- AND the resulting child units are deterministic across runs

### Requirement: Adaptive Name-Probe Extension
The adapter MUST harvest party names from the result rows it parses during discover and MUST
extend the name-probe queue with substrings derived from those names, ranked by frequency of
occurrence across harvested names, ahead of unused static-dictionary entries. Harvesting MUST
read only the result-list rows already parsed for discovery — it MUST NOT issue additional
requests or fetch detail pages. The adapter MUST NOT emit a name probe it has already emitted
for the same cell.

#### Scenario: Harvested names are ranked ahead of unused dictionary entries
- GIVEN a saturated single-day class cell whose discover result rows name several parties
- WHEN the adapter builds the name-probe queue for that cell
- THEN name-substring probes derived from the harvested party names appear, ordered by
  descending frequency across those names
- AND they are ordered ahead of static-dictionary entries not yet used for that cell

#### Scenario: Harvesting issues no extra requests
- GIVEN the adapter's discover stage for a work unit
- WHEN it harvests party names for the adaptive extension
- THEN it reads only the already-parsed result-list rows
- AND it does not issue any additional search or detail request to gather names

### Requirement: Name-Probe Budget
The adapter MUST bound the number of name-probe child units produced for a single cell by a
configured maximum (`--max-name-probes`). A value of `0` MUST disable the name-substring
level entirely, making `split()` return `null` at that point exactly as before this change.

#### Scenario: Probe count is bounded
- GIVEN a configured name-probe maximum of N and a queue longer than N
- WHEN the adapter expands a saturated single-day class cell
- THEN it returns at most N name-probe child units

#### Scenario: Zero budget disables the level
- GIVEN a configured name-probe maximum of `0`
- WHEN the adapter's `split()` reaches the name-substring level for a saturated class cell
- THEN it returns `null`
- AND the cell is recorded as a `truncated` gap
