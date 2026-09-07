# pje-trf5-scraper

An HTTP-only scraper for the TRF5 PJe public process-consultation portal (JSF 1.2 +
JBoss Seam + RichFaces): it discovers processes by date range, extracts the full case
payload, downloads referenced PDFs, and resumes cleanly after a crash — with 429
backoff and no browser automation.

## What we are scraping

The target is the **TRF5 PJe public process-consultation portal**
(`pjett.trf5.jus.br/pjeconsulta`), the public case-lookup front end of a Brazilian
federal regional court. It is a **JSF 1.2 + JBoss Seam + RichFaces (Ajax4jsf)**
application, and that single fact drives every decision in this project:

- There are no REST endpoints and no stable URL for a result list. The list is produced
  by an **AJAX POST that mutates server-side session state** and answers with an HTML
  fragment.
- Every request depends on a `jsessionid` **and** a `javax.faces.ViewState`. Lose either
  and the server stops returning data — it answers `200` with a login redirect instead.
- DOM ids are server-generated (`j_id162`, …), so parsing is anchored on labels and
  component suffixes, never on raw ids.
- Failures mostly arrive as **HTTP 200 with a wrong body**. Validity is decided by
  inspecting content, not status codes (`docs/RESEARCH.md` §5).

Full reconnaissance — every request shape, token, and failure mode reproduced with
`curl` against the live host — lives in [`docs/RESEARCH.md`](docs/RESEARCH.md).

### What one process contains

A process (`processo`) is one judicial case. Search returns a thin row; the real payload
comes from the case's detail page, and is validated against a Zod schema
(`adapters/trf5/schemas/payload.ts`) before anything is written. Field names are English
camelCase — the page's Portuguese labels never reach the output.

| Group | Fields | Notes |
|---|---|---|
| Identity | `processNumber`, `filingDate`, `referenceProcessNumber` | `processNumber` is the CNJ-standard number and the item's identity key |
| Classification | `caseClass`, `subjects[]` | Each carries a `cnjCode` + human `label`; `caseClass` is also the partition facet |
| Venue | `jurisdiction`, `judgingBody{name, collegiateBody, address}` | |
| Parties | `parties.active[]`, `parties.passive[]`, `parties.others[]` | Each party: `name`, `cpf`, `cnpj`, `role` (`APELANTE`, `APELADO`, …), `status`, and nested `lawyers[]` with `name`, `oabNumber`, `oabState`, `cpf` |
| History | `movements[]` | `sequence`, `occurredAt`, `description`, `cnjCode`, plus `rawCells` — the source cells kept verbatim, because the site renders "date - description" as a single string |
| Documents | `documents[]` | `documentKind` (`legacy` \| `bornDigital`), `documentId`, `binId`, `label`, `documentType`, `downloadUrl`, and the fetch result: `fileName`, `contentType`, `byteLength`, `fetchStatus` |
| Reconciliation | `documentsGrid{declaredTotal, extractedCount, skippedCount, reportedGap}` | What the grid *claimed* vs. what was actually read — a gap is reported, never silently closed |

### One record, as written to `items.jsonl`

Each line of `output/items.jsonl` is a single JSON object: a thin envelope
(`OutputRecord`, `engine/ports.ts`) wrapping the adapter's opaque `payload`. The
envelope is the engine's — every adapter produces the same five fields — while
`payload` is whatever that site's `SitePort` extracted. That split is what lets a second
portal reuse the sink unchanged.

Pretty-printed here for reading; on disk it is **one line**. **Every value below is
synthetic** — no real CPF, party name, or OAB number appears anywhere in this
repository.

```jsonc
{
  "schemaVersion": 1,
  "itemId": "0800000-00.2026.4.05.8300",
  "scrapedAt": "2026-09-03T14:22:07.481Z",
  "sourceUrl": "https://pjett.trf5.jus.br/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam?ca=EXEMPLO_CA_TOKEN",
  "runId": "3f1c9a54-8b2e-4d77-9c10-a6e2f0d51b93",
  "payload": {
    "processNumber": "0800000-00.2026.4.05.8300",
    "filingDate": "03/09/2026",
    "caseClass": { "cnjCode": "198", "label": "APELAÇÃO CÍVEL" },
    "subjects": [{ "cnjCode": "6094", "label": "Benefício Assistencial (Art. 203, V CF/88)" }],
    "jurisdiction": "SEÇÃO JUDICIÁRIA DE EXEMPLO",
    "judgingBody": {
      "name": "GABINETE EXEMPLO",
      "collegiateBody": "PRIMEIRA TURMA",
      "address": null
    },
    "referenceProcessNumber": null,
    "parties": {
      "active": [
        {
          "name": "PARTE ATIVA DE EXEMPLO",
          "cpf": "000.000.000-00",
          "cnpj": null,
          "role": "APELANTE",
          "status": null,
          "lawyers": [
            {
              "name": "ADVOGADO DE EXEMPLO",
              "oabNumber": "000000",
              "oabState": "PE",
              "cpf": null
            }
          ]
        }
      ],
      "passive": [
        {
          "name": "ORGAO PUBLICO DE EXEMPLO",
          "cpf": null,
          "cnpj": "00.000.000/0001-00",
          "role": "APELADO",
          "status": null,
          "lawyers": []
        }
      ],
      "others": []
    },
    "movements": [
      {
        "sequence": 1,
        "occurredAt": "2026-09-03T17:20:07.000Z",
        "rawDate": "03/09/2026 14:20:07",
        "description": "Distribuído por sorteio",
        "cnjCode": null,
        "rawCells": ["03/09/2026 14:20:07 - Distribuído por sorteio", "Distribuído por sorteio"]
      }
    ],
    "documents": [
      {
        "documentKind": "legacy",
        "documentId": "12452664",
        "binId": "12196564",
        "documentHash": null,
        "label": "Despacho",
        "documentType": "Despacho",
        "downloadUrl": "https://pjett.trf5.jus.br/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/documentoSemLoginHTML.seam?idProcessoDocumento=12452664&idBin=12196564",
        "fileName": "12452664.pdf",
        "contentType": "application/pdf",
        "byteLength": 19931,
        "fetchStatus": "fetched"
      },
      {
        "documentKind": "bornDigital",
        "documentId": "12452668",
        "binId": null,
        "documentHash": "EXEMPLO_HASH",
        "label": "Decisão",
        "documentType": "Decisão",
        "downloadUrl": null,
        "fileName": null,
        "contentType": null,
        "byteLength": null,
        "fetchStatus": "skipped"
      }
    ],
    "documentsGrid": {
      "declaredTotal": 3,
      "extractedCount": 2,
      "skippedCount": 1,
      "reportedGap": 1
    },
    "sourceUrl": "https://pjett.trf5.jus.br/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam?ca=EXEMPLO_CA_TOKEN"
  }
}
```

Four details in that record are deliberate, not incidental:

- **`fetchStatus` is per document, and `skipped` is a real state.** A document not
  fetched because a bound was hit (`--max-documents`, `--documents-per-item`) is
  recorded as skipped, not omitted — the item tells the truth about what was attempted.
- **`documentsGrid.reportedGap: 1` is a disclosed gap, not a bug.** The grid declared 3
  documents, 2 were read. The discrepancy is written into the record instead of being
  silently reconciled away.
- **`rawCells` keeps the source string.** The site renders a movement as one
  `"date - description"` cell; parsing it into fields is useful, and throwing away the
  original would make a parser regression undetectable after the fact.
- **A movement's `cnjCode` is always `null`, and the field stays anyway.** This page
  simply does not expose the CNJ movement code — unlike `caseClass` and `subjects`,
  where it is parsed out of the label. The field is kept so the payload shape does not
  change if a future tribunal's markup does carry it.

**Parties and lawyers carry CPFs and OAB numbers — this is personal data.** See
"Personal-data handling" below; it is not a formality here.

The documents grid mixes two unrelated delivery mechanisms: `legacy` documents are
fetched by `idProcessoDocumento`/`idBin` pair, `bornDigital` ones by a hash-signed URL.
Both end up as PDFs under `output/documents/`.

## Quick path

1. Install dependencies: `pnpm install`.
2. Forecast a run before spending any request:
   `pnpm scrape --dry-run --from 2026-01-01 --to 2026-01-07`.
3. Run it for real: `pnpm scrape --from 2026-01-01 --to 2026-01-07`.
4. Inspect the output: `output/items.jsonl` (one JSON record per process),
   `output/coverage.jsonl` (per-cell coverage), `output/documents/` (downloaded PDFs).
5. Retry only the documents that failed, without re-discovering anything:
   `pnpm retry-failed`.

Both commands run through `tsx` (`pnpm scrape` → `tsx src/main.ts scrape`), not a
compiled `dist/` build — see "Running from source" below for why.

## CLI bounds

Every bound stops its own axis without erroring the rest of the run
(`core-run-control-and-output`, "CLI Bound Enforcement").

| Flag | Default | What it bounds |
|---|---|---|
| `--from <YYYY-MM-DD>` | required | Start of the date range (inclusive) |
| `--to <YYYY-MM-DD>` | required | End of the date range (inclusive) |
| `--max-days <n>` | unbounded | Clamps the requested range to at most `n` days |
| `--max-facet-values <n>` | 20 | Caps per-day judicial-class expansion when a day saturates |
| `--max-items <n>` | unbounded | Stops collecting new items once reached; already-open cells still finish |
| `--max-documents <n>` | 10 | Stops fetching further documents once reached, across the whole run |
| `--documents-per-item <n>` | unbounded | Caps documents fetched for any one item |
| `--max-requests <n> \| unbounded` | 500 | Stops the whole run once reached; `unbounded` is the only way to disable it |
| `--log-level <debug\|info\|warn\|error>` | `info` | Minimum level emitted |
| `--log-format <console\|jsonl>` | `console` | `console` writes to stderr; `jsonl` appends to `logs/run-<runId>.jsonl` |
| `--dry-run` | off | Forecasts the request count and duration; issues zero requests |
| `--frontier` | off | Runs the phase-2 frontier crawl instead of the phase-1 sweep — see "Frontier" below |

## Running from source

`pnpm scrape` / `pnpm retry-failed` run `tsx src/main.ts` directly (`package.json`)
rather than a compiled `dist/` build: the project runs on Node's native ESM +
TypeScript via `tsx`'s esbuild transform, the same toolchain the test suite already
uses (`vitest`), instead of a separate `tsc` build step before every run.

## Personal-data handling

- `output/`, `data/`, `pdfs/`, and `logs/` are all git-ignored (`.gitignore`) —
  nothing scraped, downloaded, or logged is ever committed.
- Log events are redacted **by field name**, never by sniffing values: `cpf`,
  `partyName`, `jsessionid`, `viewState`, and `ca` are replaced with `[REDACTED]`
  before reaching any logging destination (`infra/logging/redacting-logger.ts`).
- No fixture, test, comment, or committed file may contain a real CPF, a real party
  name, or a real OAB registration number — synthetic values only.

## Observing a run

Every lifecycle transition is emitted as one structured event through the `Logger`
port — a stable machine-readable key and typed fields, never a formatted sentence,
and no module outside `infra/logging/` writes to the console directly. Filter by
`event`:

| Event key | Fired when |
|---|---|
| `unit.started` / `unit.completed` | A work unit (date window × facet) starts / finishes |
| `unit.saturated` | A cell hit the declared result-page cap and is being split |
| `fetch.retry` | A transient failure is retried after a computed backoff delay |
| `session.reprimed` | The session expired and was re-primed |
| `cooldown.triggered` | A 429 tripped the global rate-limit cooldown |
| `document.persisted` / `document.failed` | A document was written to disk, or its fetch failed |
| `jsonl.tornLineDropped` | A killed run's torn final line was dropped on read-back |

With `--log-format jsonl`, filter the file directly, e.g.
`jq 'select(.event == "document.failed")' logs/run-<runId>.jsonl`.

## Coverage is measured, never certified

`output/coverage.jsonl` and the printed run summary report exactly what the run
observed — cell state, result counts, the partition invariant — never a claim of
completeness the site itself cannot back. A `--dry-run` forecast is a disclosed
heuristic (one search request per day, the optimistic non-saturated case), not a
certified prediction: a saturated day always issues more requests than forecast.

## Frontier

`--frontier` runs a second, separate, off-by-default pass over seeds a prior `scrape`
run already harvested — never as part of a plain `scrape`, and never automatically:

1. Every `scrape` run — whether or not `--frontier` is set — harvests exact-match
   identifiers (CPFs, in the current TRF5 adapter) from each extracted item's parties
   and lawyers, and persists them to `output/state/seeds.jsonl`, tagged by whether the
   cell they came from was `truncated` or `complete`. Harvesting issues no request of
   its own.
2. `scrape --frontier` — run separately, any time later, even in a new process — reads
   that file, orders the seed queue (`truncated`-cell seeds first, then by the
   adapter's declared kind ranking), and searches each seed by the same date-bounded,
   saturation-bisecting mechanism phase 1 already uses.
3. The crawl stops on whichever of two independent conditions comes first: a rolling
   window of seed searches that stop finding new items (yield decay), or the
   `--max-requests` ceiling.

**Frontier-crawl coverage gains are UNMEASURED and self-reinforcing.** A seed is only
ever harvested from an item the sweep already found, so every frontier search is
biased toward data already connected to what is known — it can never discover a
process with no link to anything the sweep already saw. Coverage can grow (more items
in `items.jsonl`) without the unknown portion of the site shrinking measurably, and no
number this project reports should be read as narrowing that unknown portion. This
statement is repeated verbatim in the frontier run's own printed summary
(`cli/summary.ts`), never softened.

## Manual smoke only — never automated

The 429/backoff path and session-recovery (re-priming after an expired session) are
proven exclusively against a stubbed transport and a fake clock in the test suite
(`core-resilience-policy`, "Stubbed-Transport Test Isolation") — this project never
reproduces them against the live TRF5 host. The only sanctioned live-host check is a
narrow manual smoke test — one `pnpm scrape --dry-run` (zero requests) and, at the
owner's discretion, one small real run against a single day — recorded in
`openspec/changes/scraper-core/apply-progress.md` rather than added to the suite.

## Layout

```
src/
  engine/      payload-generic core: ports, backoff, retry policy, rate limiter, pool
  adapters/    site adapters (trf5/ is the only one)
  infra/       driven adapters: HTTP transport, JSONL storage, logging, clock
  cli/         argument parsing, dry-run forecast, run summary
  main.ts      composition root
```

The seam between `engine/` and everything else is enforced by an ESLint
`no-restricted-imports` rule (see `eslint.config.js`), not by convention alone.

## Why the architecture looks like this

### The problem is not "one site". It is a family of sites.

PJe is not a TRF5 product. It is the **CNJ's national judicial system**, deployed across
dozens of Brazilian courts — each tribunal running its own instance, on its own host,
with its own version, its own theme, and its own quirks. The search form, the saturation
cap, the document delivery mechanism and the error pages differ per deployment; the
*shape of the problem* does not. Every one of them is: search under a bounded filter,
hit a result cap, subdivide the filter, extract a case, fetch its documents, resume
after a crash.

So the expensive thing to get right is not the TRF5 HTML. It is the traversal, the
saturation accounting, the retry policy and the resume logic. Writing those inside the
TRF5 parser would mean rewriting them for TRF1, TJSP, or any other portal.

**`engine/` is that reusable part, and it is payload-generic**: it never imports an
adapter, never knows what a "process" is, and treats every item as an opaque `TItem`.
Even the *shape of a work unit* is opaque — the engine never assumes a date range;
`RunBounds.dateFrom`/`dateTo` are adapter-interpreted strings, and the proof is
`engine/__fixtures__/portability-non-date.test.ts`, which drives the same engine with a
non-date traversal.

### Hexagonal, and what each side actually buys

The engine defines **ports** (`engine/ports.ts`); everything concrete is a driving or
driven **adapter**.

| Port | Driven adapter today | What swapping it would mean |
|---|---|---|
| `SitePort<TItem, TDoc>` | `adapters/trf5/site.ts` | A second portal: implement `discover`, `fetchDocument`, `reprimeSession` and you inherit the whole engine |
| `TraversalPort<TCursor>` | `adapters/trf5/traversal.ts` | A different partition strategy (date × class × name-substring here) |
| `ItemSink<TItem>` | `infra/storage/jsonl-item-sink.ts` | Where extracted items go — see below |
| `DocumentSink`, `CoverageSink`, `CheckpointStore`, `FailureLedger`, `AdapterStateStore` | JSONL / filesystem under `infra/` | Storage backend |
| `Transport` | `infra/http/` | The HTTP client, and the reason the 429 and session-expiry paths are testable at all |
| `Clock` | `infra/clock.ts` | Fake time in tests: backoff is proven without ever sleeping |
| `Logger` | `infra/logging/` | Redaction happens at this boundary, so no call site can leak a CPF by forgetting |

The payoff is concrete, not decorative:

- **The engine is tested without the network.** The resilience suite drives `SitePort`
  and `Transport` stubs with a fake `Clock` — 429 backoff, session re-priming, and
  torn-line recovery are proven deterministically, in milliseconds, against a host we
  are not allowed to hammer.
- **Personal-data redaction is structural.** Because logging is a port, redaction by
  field name lives in one adapter (`infra/logging/redacting-logger.ts`) instead of being
  a rule every developer must remember.
- **The seam is enforced by tooling.** `no-restricted-imports` fails the build if
  `engine/` imports an adapter. An architecture that depends on discipline decays; one
  that depends on a linter does not.

### Patterns, and where each one earns its place

| Pattern | Where | Why it is there |
|---|---|---|
| **Ports & Adapters** | `engine/ports.ts` | The dependency direction: adapters depend on the engine, never the reverse |
| **Strategy** | `ItemSink`, `TraversalPort`, `CoverageSink`, `DocumentSink` | Behavior chosen at composition time, not at call time |
| **Composition root** | `main.ts` | The one place that knows both sides. Every wiring decision is a constructor argument, so there is no service locator and no global container |
| **Template method (inverted)** | `Scraper` | The engine owns the discover → fetch → persist algorithm; the adapter supplies the steps |
| **Chain of responsibility** | `adapters/trf5/schemas/validity-chain.ts` | A `200` response is classified through ordered content checks: session-expired, host-defect, valid data |
| **Result/outcome type** | `FetchOutcome<T>` | Failures are values, not exceptions, so the retry policy is a pure function over them |

**`ItemSink` is the clearest plug-and-play case.** It is one method:

```ts
export interface ItemSink<TItem> {
  write(record: OutputRecord<TItem>): Promise<void>;
}
```

Today it is JSONL on disk. A Postgres sink, an S3 sink, a Kafka producer, or a fan-out
that writes both is a new class implementing one method plus a line in `main.ts` — no
engine change, and the existing engine tests stay valid because they were never written
against JSONL in the first place. That is the whole point of the strategy seam: the
storage decision is deferred to the composition root, where changing your mind is cheap.

### Why not Redis (or any external service)

Short version: **the state this project keeps is small, append-only, per-run, and needs
to survive a crash on a laptop — that is a file, not a server.**

Longer version, per candidate use:

- **Resume after a crash.** Redis's role would be to hold checkpoints. But checkpoints
  are written once per work unit, read once at startup, and never queried. An
  append-only JSONL file gives exactly that, plus something Redis does not: the state is
  *inspectable with `jq`* and diffable in a bug report. We even handle the crash case
  explicitly — a killed run's torn final line is detected and dropped on read-back
  (`jsonl.tornLineDropped`).
- **The work queue.** A distributed queue only pays off with distributed workers, and
  **we deliberately do not have them.** The bottleneck here is not our CPU, it is the
  court's tolerance: a single global rate limiter and a run-wide request ceiling are the
  design. Parallel workers behind Redis would make it *easier* to abuse a public
  judicial service — the opposite of the goal.
- **Deduplication.** Item identity is `processNumber`. Within a run, an in-memory `Set`
  is enough; across runs, the JSONL output is the record.
- **Caching.** There is nothing to cache. Every request is a distinct filter cell, and
  the site's data moves between searches (two searches minutes apart returned different
  set hashes — `docs/RESEARCH.md` §3). A cache would serve stale case data while
  claiming freshness.

And the cost side is real: Redis adds a service to install, a connection to fail, a
persistence mode to configure, and a container to the reviewer's setup — in exchange for
nothing this workload needs. **If the workload changes, the port does not.**
`CheckpointStore` and `AdapterStateStore` are already interfaces; a Redis-backed
implementation would be a new class in `infra/`, wired in `main.ts`, with no engine
change. Not using Redis today is a decision the architecture keeps reversible.

## Measured results

These come from live `curl` reconnaissance against `03/09/2026`, a saturated day. Counts
are unique `ca` tokens after deduplication (`docs/RESEARCH.md` §3, "Measured partition
yield").

| Strategy | Requests | Unique processes |
|---|---|---|
| Base search, no filter | 1 | 30 (capped) |
| Date × judicial class (union of 132 classes) | ~132 | 128 |
| Date × class × name-substring (residual saturated classes only) | +~50 | 191 |

What the numbers say:

- **The result cap is 30 per search and it cannot be paged past.** No datascroller, sort
  columns are inert, time-of-day is silently discarded by the date converter, and
  partial process numbers are exact-match, not prefix. Every escape hatch was tested and
  each one is documented as tested (`docs/RESEARCH.md` §3).
- **The class axis does most of the work: 30 → 128 on one day.** Only 19 of 132 classes
  had results, and only 2 still saturated (`APELAÇÃO CÍVEL`, `AGRAVO DE INSTRUMENTO`).
- **A third axis finishes the job.** `nomeParte`/`nomeAdv` are literal case-insensitive
  *substring* filters that compose with date and class. On the two residual classes a
  substring sweep fully desaturated them — `APELAÇÃO CÍVEL` 30 → 85, `AGRAVO DE
  INSTRUMENTO` 30 → 38, with 0 of 28 probes still hitting the cap.
- **Adaptive probes beat a static dictionary.** Ranking substring probes by the party
  names already visible in returned rows, and stopping on yield decay, reached 95 unique
  in 22 requests versus 85 in 29 for a fixed PT-BR surname dictionary — **−24% requests,
  +12% coverage**. The filter's own output seeds the next probe, at no extra fetch,
  because result rows already carry the parties column.

**Caveats, stated rather than buried.** ~6.4× recovery on one saturated day is a
measurement, not a guarantee: it is one date on one instance. Live saturation-driven
subdivision has been observed to finish `truncated` rather than `subdivided` when the
class-catalogue fetch degrades under an aged session (`docs/RESEARCH.md` §9.9) — the
reporting stays honest when that happens, which is the contract. And frontier-crawl
gains remain unmeasured by construction; see "Frontier" above.

## What would change in a real production deployment

The challenge asks for one repo runnable from a terminal. A production deployment of the
same engine would keep the core and change the edges — which is precisely what the ports
are for.

| Concern | Here (challenge) | Production |
|---|---|---|
| **Storage** | `ItemSink` → JSONL on disk | `ItemSink` → Postgres (or S3 + a warehouse). One class, one line in `main.ts` |
| **Scheduling** | Manual `pnpm scrape --from --to` | A daily job scraping yesterday's window, with the date range derived from the last checkpoint |
| **State** | JSONL checkpoints in `output/state/` | The same `CheckpointStore` port over a durable store, so a restarted container resumes |
| **Concurrency** | Single process, global rate limiter | Still deliberately conservative. Scale by *tribunal*, not by threads: N instances, one per PJe host, each with its own limiter — never N workers against one court |
| **Secrets/config** | CLI flags | Environment-driven config; the CLI parser stays as one driving adapter among several |
| **Observability** | Structured JSONL logs (`--log-format jsonl`) | The same `Logger` port shipped to an aggregator; the event keys are already stable and machine-readable, which is why they were never formatted sentences |
| **Alerting** | Run summary read by a human | Alert on the events that already exist: `cooldown.triggered` rate, `document.failed` rate, and coverage cells landing `truncated` |
| **Failure handling** | `pnpm retry-failed` by hand | The same `FailureLedger`, drained by a scheduled retry job |
| **Schema evolution** | `schemaVersion` on every record | Same field, now doing real work: consumers migrate on it when the court's markup changes |
| **Personal data** | Git-ignored output, field-name redaction | The hard part. Access control, retention limits, and a lawful basis for holding CPFs — a legal requirement, not an engineering preference (`docs/RESEARCH.md` §6) |

Two things would **not** change, and that is the argument for the design: the engine, and
the test suite that proves it. Adding a second tribunal is a new `SitePort` +
`TraversalPort` under `adapters/`, and the portability test fixture already demonstrates
the engine running against a site that is not TRF5 and does not even partition by date.

## Testing

Test runner: [vitest](https://vitest.dev).

```
pnpm test           # vitest run
pnpm test:watch     # vitest
pnpm test:coverage  # vitest run --coverage
```

**No real personal data.** This repository is public. No fixture, test, comment, or
committed file may contain a real CPF, a real party name, or a real OAB registration
number. Use synthetic values only.
