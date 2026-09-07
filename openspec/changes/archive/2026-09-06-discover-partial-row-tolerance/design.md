# Design: Partial-Row Tolerance in `discover()`

## Technical Approach

Keep `FetchOutcome` unchanged. The TRF5 adapter converts exhausted per-row `hostDefect` and
`permanentError` outcomes into sanitized `unresolved` data on a successful `DiscoverResult`.
The engine ledgers rows and records their count beside coverage state. Both runners use this
contract; saturation uses `DiscoverResult.count`.

## Architecture Decisions

| Decision | Alternatives considered | Rationale |
|---|---|---|
| Add optional `DiscoverResult.unresolved`; require `unresolvedItemCount` on new checkpoint/coverage records | Add `FetchOutcome.partial`; add a fifth cell state | Partiality belongs to the aggregate result; fetch success and saturation remain independent. Optional discovery input preserves existing adapters/fakes. |
| Retry a detail row inside `TRF5Site.discover()` with injected cap/backoff derived from `RETRY_POLICY.hostDefectCap` | Retry the whole discovery; move TRF5 classification into the engine | Only the adapter sees row sub-operations. Whole-call retry repeats the search and resolved rows. `sessionExpired` and `transient` still escape to existing engine recovery. |
| Apply the host-defect cap to both tolerated kinds | Keep `permanentError` at zero retries; retry forever | This intentionally deviates from the error catalog: the requirement gives an aggregate row a bounded recovery chance. The cap stays two. |
| Extract the existing outcome-to-ledger text conversion into `engine/failure-reason.ts` | Duplicate formatting in frontier; import `scraper.ts` from frontier | Sweep and frontier need identical site-agnostic failure text, while a frontier-to-scraper import would create a cycle. |
| Sanitize evidence before crossing the port | Store bodies, URLs, `ca`, or stack traces | The engine forwards reasons verbatim. Normalize control characters, cap length, and retain only classifications/details. Process number is the identity. |

`Budget` remains a logical discover-operation counter; correcting its existing internal-HTTP
undercount is out of scope. The retry cap still bounds rows.

## Data Flow

```text
Engine         TRF5Site        Session/Search       Detail/PDF Host       Sinks
  | discover()    |                   |                    |                |
  |-------------->|-- prime GET ----->|                    |                |
  |               |-- AJAX POST ----->|                    |                |
  |               |<-- parsed rows ---|                    |                |
  |               |-- detail GET(row) -------------------->|                |
  |               |<-- ok / classified failure ------------|                |
  |               |   host/permanent: bounded retry         |                |
  |<-- ok {items, count, unresolved} --|                    |                |
  |-- unresolved ledger entries ------------------------------------------->|
  |-- coverage + checkpoint count ----------------------------------------->|
  |-- fetchDocument(item, doc) ---------- viewer/PDF GET/302 ------------->|
  |<------------------------------------- bytes -----------------------------|
  |-- DocumentSink.write(bytes) ------------------------------------------->|
```

`sessionExpired`/`transient` abort discovery for engine recovery. Splitting uses `count`, never
`items.length`.

`engine/` knows adapter-declared identities/reasons; `adapters/trf5/` owns tolerance.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/engine/ports.ts` | Modify | Add unresolved-result and unresolved-count contracts; correct discovery-ledger identity documentation. |
| `src/engine/failure-reason.ts` | Create | Share bounded outcome formatting between runners. |
| `src/adapters/trf5/site.ts` | Modify | Add per-row retry/tolerance and sanitized evidence. |
| `src/engine/scraper.ts` | Modify | Ledger unresolved rows and persist their count without changing split logic. |
| `src/engine/frontier.ts` | Modify | Require a ledger; record failed searches and unresolved rows. |
| `src/engine/coverage.ts`, `src/cli/summary.ts` | Modify | Sum and print a separate unresolved tally. |
| `src/infra/storage/jsonl-checkpoint-store.ts`, `src/main.ts` | Modify | Normalize legacy missing counts to zero and wire retry/ledger dependencies. |
| Corresponding `*.test.ts` and `src/engine/__fixtures__/ports-coverage-audit.test.ts` | Modify | Add RED contract, flow, compatibility, and traceability tests. |

## Interfaces / Contracts

```ts
interface UnresolvedDiscoveryItem { readonly itemId: string; readonly reason: string }
interface DiscoverResult<TItem, TDoc> {
  readonly items: readonly TItem[];
  readonly documentsByItemId: ReadonlyMap<string, readonly TDoc[]>;
  readonly count: number;
  readonly unresolved?: readonly UnresolvedDiscoveryItem[];
}
```

Newly emitted `CheckpointRecord` and `CoverageRecord` values always contain numeric
`unresolvedItemCount`. Legacy JSONL records without it read as zero. Write ordering remains items,
then coverage, then checkpoint; therefore a completed partial cell resumes idempotently without
re-discovery. Failure-ledger entries stay append-only and `documentId: null`, so they remain
ineligible for `retry-failed`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Adapter | 29 resolved + one exhausted row; retries; tolerated/fatal kinds; bounded reason | Vitest with `StubTransport`, synthetic fixtures, and fake clock; RED first. |
| Engine | Per-row ledger identity/count; complete and subdivided cells; `count`-based saturation; legacy zero normalization; summary arithmetic | Vitest with scripted site and in-memory/JSONL stores. |
| Frontier/composition | Failed seed and unresolved-row ledgering; real ledger wiring; port-spec traceability | Stubbed ports plus `main.test.ts`; never use the live site. |
| E2E | N/A | Browser automation is forbidden; no live 429 or session-recovery tests. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary changes.

## Migration / Rollout

No migration or feature flag is required. This is additive JSONL under the existing schema:
old records normalize missing counts to zero, and old readers ignore added fields. Deliver as the
recorded `feature-branch-chain`: slice 1 covers sweep deliverables 1–5; slice 2 adds frontier
ledger parity (deliverables 6–7). Each slice is independently verifiable and revertible. Rollback
restores abort-on-first-row behavior without making existing checkpoints unreadable.

## Open Questions

None.
