# Core Run Control and Output Specification

## Purpose

CLI-level bounds on every crawl axis, a dry-run forecast, warehouse-oriented JSONL output,
and personal-data handling rules. The core defines the output envelope only; the shape of
what an adapter nests inside a record is that adapter's own record-contract obligation.

## Requirements

### Requirement: CLI Bound Enforcement
The CLI MUST accept and enforce `--from`, `--to`, `--max-days`, `--max-facet-values`,
`--max-items`, `--max-documents` (default 10), and `--documents-per-item`. Each bound MUST
stop further work on its axis once reached, without erroring the whole run.

#### Scenario: Max-documents bound stops document fetching
- GIVEN `--max-documents 10` and 15 documents discovered across processed items
- WHEN the 10th document is fetched
- THEN no further document fetches are issued for the remainder of the run

#### Scenario: Max-items bound stops item collection
- GIVEN `--max-items 50`
- WHEN 50 items have been collected
- THEN discovery of further items stops and the run proceeds to summary

### Requirement: Default Request Ceiling Requiring Override
`--max-requests` MUST carry a default ceiling; an unbounded run MUST require an explicit,
deliberate CLI override rather than being reachable by omission.

#### Scenario: Run without explicit override respects the default ceiling
- GIVEN a `scrape` invocation with no `--max-requests` flag
- WHEN the run executes
- THEN it stops once the default request ceiling is reached

#### Scenario: Unbounded run requires explicit opt-in
- GIVEN an operator wants no request ceiling
- WHEN they invoke the CLI
- THEN they must pass an explicit override flag/value; there is no implicit unbounded mode

### Requirement: Dry-Run Forecast
`--dry-run` MUST forecast the request count and estimated duration for the configured
bounds without issuing any discovery request.

#### Scenario: Dry-run issues zero discovery requests
- GIVEN `--dry-run` combined with a set of date/facet-value bounds
- WHEN the command runs
- THEN it prints a forecasted request count and duration
- AND no discovery request is sent to the target host

### Requirement: JSONL Append-Only Output
Output MUST be JSONL — one JSON object per line, never a JSON array — written append-only.
A killed run MUST leave every already-written line valid.

#### Scenario: Process killed mid-run leaves valid output
- GIVEN a run writing `items.jsonl` that is killed after N complete lines
- WHEN `items.jsonl` is read back
- THEN all N lines parse as valid independent JSON objects

#### Scenario: Records are never mutated
- GIVEN an item already written to `items.jsonl`
- WHEN the same item is observed again later in the same or a later run
- THEN a new line is appended; the original line is never edited or removed

### Requirement: Mandatory Envelope Fields
Every item record MUST be the object `{ schemaVersion, itemId, scrapedAt, sourceUrl, runId,
payload }`, forming the output envelope. `payload` is the adapter-owned nested content —
domain classification, parties, movements, documents, and any other domain-specific fields —
and the core output envelope is agnostic to `payload`'s internal shape, which an adapter
record-contract requirement defines, not this specification.

#### Scenario: Record carries all mandatory envelope fields
- GIVEN a successfully scraped item
- WHEN its JSONL record is written
- THEN it includes `schemaVersion`, `itemId`, `scrapedAt`, `sourceUrl`, `runId`, and a nested `payload`

### Requirement: English camelCase Property Naming
Every property name in every emitted output file — envelope, `payload`, and coverage ledger
alike — MUST be English and `camelCase`, so that a reader who does not speak the target
site's language can consume the output. Established domain acronyms and identifiers that
carry meaning of their own (for example `cpf`, `oab`, `cnj`) MUST be preserved rather than
translated, and are cased to fit camelCase (`oabNumber`, `cnjCode`). A site's own HTML form
or query-parameter names are wire format: they MUST be used verbatim when parsing and MUST
NOT appear as output property names. This is a serialization convention over all output; it
does not constrain `payload`'s internal shape, which remains adapter-owned.

#### Scenario: Source-language field is renamed on output
- GIVEN a source page field parsed from a form input whose name is in the site's own language
- WHEN the adapter builds its output payload
- THEN the emitted property name is the English camelCase equivalent, not the source-language form field name

#### Scenario: Domain acronym survives translation
- GIVEN a lawyer registration identifier whose domain term is an acronym with no English equivalent
- WHEN the property is emitted
- THEN the acronym is preserved within a camelCase name rather than translated away

#### Scenario: Core envelope does not constrain payload shape
- GIVEN an adapter-owned payload nested within a record
- WHEN the core output writer serializes the record
- THEN it passes the payload through unchanged, without validating or transforming domain-specific fields

### Requirement: Separate Coverage Ledger File
The cell coverage ledger MUST be written to a separate `coverage.jsonl` file, distinct from
`items.jsonl`.

#### Scenario: Coverage and item data are not interleaved
- GIVEN a completed run
- WHEN the output directory is inspected
- THEN cell-state records appear only in `coverage.jsonl` and item records only in `items.jsonl`

### Requirement: Persisted Identifier Stability
Any identifier written to durable state — checkpoints, the coverage ledger, the failure
ledger, output records, or document paths — MUST remain resolvable in a later session. A
value whose lifetime is bound to a live session (a session cookie, a view state, or a
site-issued conversation token) MUST NOT be the only handle by which persisted data is
addressed, keyed, or recovered.

Existing requirements govern how persisted values are *formatted* and that they are
round-tripped opaquely; this requirement governs whether they are still *usable* after the
session that produced them ends. A record that can only be acted upon by replaying an
expired token is not durable state, regardless of how faithfully it was serialized.

A point-in-time locator MAY be persisted for provenance — the output envelope's `sourceUrl`
is one — provided the record also carries a session-independent handle that can recover it.

#### Scenario: Persisted record survives its originating session
- GIVEN a checkpoint, ledger entry, or document path written in one run
- WHEN a later run in a new session reads it back
- THEN it resolves to the same work unit, item, or file without replaying any token from the earlier session

#### Scenario: Session-scoped token is not the only handle
- GIVEN an output record whose `sourceUrl` embeds a session-scoped token
- WHEN that token has expired
- THEN the record is still addressable by its adapter-declared identity key

### Requirement: Personal Data Handling Rules
Scraped output MUST NOT be committed to the repository. No test fixture MAY contain a real
CPF, real party name, or real document content. No upload path MUST exist.

#### Scenario: Output directories are git-ignored
- GIVEN a run that writes to `output/`, `data/`, `pdfs/`, or `logs/`
- WHEN `git status` is checked
- THEN none of those paths appear as trackable changes

#### Scenario: Test fixtures use synthetic data
- GIVEN a unit or integration test fixture representing a party
- WHEN the fixture is inspected
- THEN its CPF, name, and any document content are synthetic or redacted, never real
