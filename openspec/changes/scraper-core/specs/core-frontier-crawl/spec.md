# Core Frontier Crawl Specification

## Purpose

Phase 2: a separate, later verification run over seeds persisted by phase 1 — not a
continuous extension of a single crawl. Off by default. Its purpose is to confirm and
enrich what the coarse sweep found, prioritising `truncated` cells where data is known to
be hidden. Which seed kinds exist and how they rank relative to one another is an adapter
obligation; the core only owns the harvesting, ordering, and stop-condition algorithm.

## Requirements

### Requirement: Deferred Phase-2 Invocation
Frontier crawl MUST be off by default and MUST run as a separate invocation
(`scrape --frontier` or equivalent) consuming seeds persisted by an earlier `scrape` run via
a durable `AdapterStateStore`. It MUST NOT run automatically as part of a phase-1 `scrape`.

#### Scenario: Plain scrape does not run frontier crawl
- GIVEN a `scrape` invocation without the `--frontier` flag
- WHEN the run completes
- THEN no frontier-crawl seed searches were issued
- AND harvested seeds were persisted to `AdapterStateStore` for later use

#### Scenario: Frontier run consumes seeds from a prior process
- GIVEN an `AdapterStateStore` populated by a `scrape` run that has since exited
- WHEN `scrape --frontier` is invoked in a new process
- THEN it reads seeds from that store without requiring the original process to still be running

### Requirement: Seed Harvesting and Prioritization
Seeds MUST be exact-match identifiers harvested from the detail pages of prior results. The
adapter MUST declare a ranking among its seed kinds, and the frontier crawl MUST honor that
adapter-declared ranking when ordering its work queue. Seeds harvested from `truncated`
cells MUST be prioritised over seeds from `complete` cells, regardless of seed-kind ranking.

#### Scenario: Higher-ranked seed kind is selected first
- GIVEN two seed kinds available for the same source, ranked by the adapter's declared ordering
- WHEN the frontier crawl selects its next seed to search
- THEN the higher-ranked seed kind is selected first

#### Scenario: Complete-cell seeds are deprioritised
- GIVEN seeds harvested from both a `truncated` cell and a `complete` cell
- WHEN the frontier crawl orders its work queue
- THEN truncated-cell seeds are scheduled before complete-cell seeds

### Requirement: Yield-Decay Stop Condition
The frontier crawl MUST stop when the rate of new-unique-items-per-seed approaches
zero, independent of the request budget.

#### Scenario: Consecutive seeds yield no new items
- GIVEN a rolling window of seed searches each returning zero previously-unseen item identifiers
- WHEN the yield-decay threshold is crossed
- THEN the frontier crawl stops issuing further seed searches

### Requirement: Request Budget Ceiling
The frontier crawl MUST enforce a hard request budget ceiling independent of yield decay;
reaching it MUST stop the run even if yield has not decayed.

#### Scenario: Budget exhausted before yield decays
- GIVEN a configured request budget of N and seeds still yielding new items
- WHEN the Nth request completes
- THEN no further seed searches are issued

### Requirement: Mandatory Date Range on Seed Searches
Every seed search MUST still carry a mandatory date range and MUST still apply the
adapter's saturation bisection when the adapter-declared result-page cap is reached.

#### Scenario: Seed search without a date range is rejected
- GIVEN a seed search request built without a date range
- WHEN the adapter validates it
- THEN the request is rejected before being sent

#### Scenario: Saturated seed search bisects
- GIVEN a seed search over a date range that returns results at the adapter-declared result-page cap
- WHEN the frontier crawl processes that result
- THEN it bisects the date range using the same recursive bisection as phase 1

### Requirement: Documented Unmeasurable Bias
The system MUST document, in user-facing output or README, that frontier-crawl coverage
gains are unmeasurable and self-reinforcing: coverage grows without the unknown portion
shrinking measurably.

#### Scenario: Run summary states the limitation
- GIVEN a completed frontier-crawl run
- WHEN its summary or documentation is produced
- THEN it explicitly states that the bias toward already-connected data is unmeasured and self-reinforcing
