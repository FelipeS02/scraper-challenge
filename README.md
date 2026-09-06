# pje-trf5-scraper

An HTTP-only scraper for the TRF5 PJe public process-consultation portal (JSF 1.2 +
JBoss Seam + RichFaces): it discovers processes by date range, extracts the full case
payload, downloads referenced PDFs, and resumes cleanly after a crash — with 429
backoff and no browser automation.

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
