# TRF5 Adapter Specification

## Purpose

All TRF5 PJe site-specific behavior: JSF/Seam session lifecycle, the 2D date×class
traversal, detail/document fetch, ISO-8859-1 decoding, and content-based validity. Every
behavior here is grounded in `docs/RESEARCH.md`.

## Requirements

### Requirement: Session Priming and Field Harvesting
The adapter MUST harvest, on every priming request, the `jsessionid` from the form `fPP`
action attribute, the `javax.faces.ViewState` value, the search form's field names, and the
trigger control id — never hardcoded.

#### Scenario: Priming harvests all required fields
- GIVEN a GET to `listView.seam` returning the priming page HTML
- WHEN the adapter parses the response
- THEN it extracts `jsessionid`, ViewState value, field name set, and trigger control id from that response's actual content

#### Scenario: Server-generated ids differ between runs
- GIVEN two priming responses with different `j_id*` values for the ViewState and trigger
- WHEN each is parsed independently
- THEN the adapter uses each run's own harvested values, never a value from a prior run

### Requirement: Session Expiry Detection and Re-Priming
The adapter MUST detect an expired/invalid ViewState by content — a `text/xml` body
containing `Ajax-Response: redirect` pointing to `login.seam` — and MUST re-prime and replay
the request once.

#### Scenario: Expired ViewState triggers re-prime
- GIVEN a search POST response with `Ajax-Response: redirect` and `Location: /pjeconsulta/login.seam`
- WHEN the adapter evaluates the response
- THEN it re-primes the session and replays the original request
- AND does not treat the redirect response itself as data

### Requirement: Complete Search Form Field Set
The adapter MUST submit the complete search form field set on every search POST, including
empty fields, and MUST always include the date range fields.

#### Scenario: All fields present, some empty
- GIVEN a search with only a date range and no name/class filters
- WHEN the adapter builds the POST body
- THEN every documented form field (`numProcesso`, `nomeParte`, `nomeAdv`, `classeJudicial`, `documentoParte`, `estadoComboOAB`, date range fields) is present, empty ones as empty strings

#### Scenario: Missing date range is rejected before request
- GIVEN a search request built without `dataAutuacaoInicio`/`dataAutuacaoFim`
- WHEN the adapter validates the request before sending
- THEN it rejects the request rather than submitting a partial field set

### Requirement: Detail Fetch Session Requirement
A detail fetch by `ca` token MUST use a primed session; an unprimed request MUST be
detected and trigger re-priming.

#### Scenario: Detail fetch without primed session
- GIVEN a `ca` token and no active primed session
- WHEN the adapter requests the detail page
- THEN it primes a session first, then performs the detail fetch

### Requirement: Document Byte-Level ISO-8859-1 Decoding
The adapter MUST follow the document 302 redirect and decode `nomeArqProcDocBin` from
ISO-8859-1 at the byte level, never as UTF-8.

#### Scenario: Percent-encoded accented label decodes correctly
- GIVEN `nomeArqProcDocBin=Decis%E3o`
- WHEN the adapter decodes it
- THEN the result is `Decisão`, not mojibake

### Requirement: Stable Document Filename Derivation
Stored document filenames MUST derive from `ca` plus `idProcessoDocumento`, never from the
label alone, because multiple documents in one process can share the same label.

#### Scenario: Three same-labeled documents in one process
- GIVEN a process with three documents all labeled `Decisão` but distinct `idProcessoDocumento`
- WHEN the adapter stores all three
- THEN each has a distinct filename and none overwrites another

### Requirement: Full Field Inventory Extraction
The adapter MUST extract the complete detail-page field inventory: header (número, data
distribuição, classe+CNJ code, assunto as a hierarchical repeating list with CNJ codes,
jurisdição, órgãos, endereço, processo referência), parties (ativo/passivo/outros — each
with name, CPF, role, status, nested lawyers with OAB number+state+CPF), movements, and
documents.

#### Scenario: Party with nested lawyer is extracted
- GIVEN a detail page listing an `APELANTE` party with a nested `ADVOGADO` lawyer entry
- WHEN the adapter parses the page
- THEN the extracted party includes name, CPF, role, status, and a nested lawyer record with name, OAB number, OAB state, and CPF

#### Scenario: Assunto hierarchy retains CNJ codes
- GIVEN a detail page with a multi-level `Assunto` list
- WHEN the adapter parses it
- THEN each level's label and CNJ code are both retained in the output structure

### Requirement: Content-Based Validity Chain
The adapter MUST judge response validity by content through an ordered zod `.safeParse()`
chain — session-expired, then host-defect, then invalid-token shell, then valid data —
where the first successful match wins.

#### Scenario: Invalid ca token produces a shell page
- GIVEN a 200 response for an invalid `ca` whose body carries no detail header block and no parties block
- WHEN the validity chain evaluates it
- THEN it matches the invalid-token-shell schema, not the valid-data schema
- AND the item is skipped and logged, not written as data

#### Scenario: Valid process with zero documents is not mistaken for a shell
- GIVEN a 200 response carrying a populated detail header and parties block but an empty document list
- WHEN the validity chain evaluates it
- THEN it matches the valid-data schema and the item is written
- AND absence of documents alone MUST NOT be used to classify a response as an invalid-token shell, nor MAY a response byte-size threshold be used for that classification

#### Scenario: Host defect page is distinguished from valid data
- GIVEN a 200 response redirecting to `errorUnexpected.seam` with a `PersistenceException` body
- WHEN the validity chain evaluates it
- THEN it matches the host-defect schema before falling through to valid-data

### Requirement: Declared Result-Page Cap and Item Identity Key
The TRF5 adapter MUST declare a result-page cap of 30 results per search and MUST declare
the CNJ process number as its item identity key, consumed by core coverage-accounting for
saturation judgment and deduplication. That value is parsed from the source page's
`numeroProcesso` field, emitted in the payload as `processNumber`, and carried unchanged in
the core output envelope's `itemId` field.

#### Scenario: Adapter declares a cap of 30
- GIVEN the TRF5 adapter's port implementation
- WHEN core coverage-accounting queries the declared result-page cap
- THEN it receives 30

#### Scenario: Adapter declares the process number as identity key
- GIVEN the TRF5 adapter's port implementation
- WHEN core coverage-accounting queries the declared item identity key
- THEN it receives the CNJ process number, emitted as `processNumber`

#### Scenario: Declared identity key populates the envelope itemId
- GIVEN a scraped item with a known CNJ process number
- WHEN the core output envelope is assembled for that item
- THEN the envelope's `itemId` field equals that process number, identical to the payload's `processNumber`

### Requirement: Declared Partition Facet
The TRF5 adapter MUST declare `classeJudicial` (judicial class) as its partition facet,
consumed by core coverage-accounting for per-facet-value counting and bounded by the core's
`--max-facet-values` CLI flag.

#### Scenario: Adapter declares classeJudicial as the partition facet
- GIVEN the TRF5 adapter's port implementation
- WHEN core coverage-accounting queries the declared partition facet
- THEN it receives `classeJudicial`

### Requirement: Judicial Record Payload Contract
The adapter's output payload MUST retain both the CNJ code and the human-readable label for
the case class and for each level of the subject hierarchy, and MUST nest parties (with
their lawyers), movements, and documents within the payload, consumed by core
run-control-and-output as an opaque adapter-owned payload.

Payload property names MUST follow the core English camelCase naming convention. The source
page's own Portuguese field and query-parameter names are wire format used only for parsing
and MUST NOT appear as payload property names. The payload's top-level property names are
`processNumber`, `filingDate`, `caseClass`, `subjects`, `jurisdiction`, `judgingBody`,
`referenceProcessNumber`, `parties`, `movements`, and `documents`. `caseClass` and each
`subjects` entry carry `cnjCode` and `label`. `parties` groups the procedural poles as
`active`, `passive`, and `others`. Lawyer entries carry `oabNumber` and `oabState`, and
party and lawyer entries carry `cpf` — these three domain identifiers keep their acronyms
rather than being translated.

#### Scenario: Payload case class carries both code and label
- GIVEN a process classified as `APELAÇÃO CÍVEL` with a known CNJ code
- WHEN the adapter builds its output payload
- THEN `caseClass` contains both `cnjCode` and `label`

#### Scenario: Payload nests parties, movements, and documents
- GIVEN a fully extracted process detail
- WHEN the adapter builds its output payload
- THEN `parties` (with nested `lawyers`), `movements`, and `documents` appear nested within the payload, matching the extracted field inventory

#### Scenario: Portuguese source field names do not reach the output
- GIVEN a payload assembled from a parsed detail page
- WHEN its property names are inspected
- THEN none of the source page's Portuguese form field or query-parameter names appear as property names, while `cpf`, `oabNumber`, and `oabState` are present as preserved domain identifiers

### Requirement: Declared Seed Kinds and Ranking
The TRF5 adapter MUST declare two seed kinds — OAB registration number and exact full
party/lawyer name — harvested from detail pages, and MUST rank OAB above name because OAB
is unique, ASCII, and exact-match with no homonym or encoding risk.

#### Scenario: Adapter ranks OAB above name
- GIVEN both an OAB seed and a name seed available for the same lawyer
- WHEN the frontier crawl consults the TRF5 adapter's declared seed-kind ranking
- THEN the OAB seed ranks first
