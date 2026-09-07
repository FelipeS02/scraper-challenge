import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Reverse-coverage audit (core-scraping-engine slice S5c, tasks 7.28-7.29):
 * every symbol the engine EXPORTS across the port seam must trace to at
 * least one requirement that actually names or requires it. This is the
 * opposite direction from the Requirement Coverage Map in `tasks.md`, which
 * maps requirement -> slice; this test maps port symbol -> requirement, and
 * exists precisely because that first map has already missed a component
 * three times in this project (S4c's DocumentSink, S5a's Logger, and the
 * saturation/subdivision gap this very slice closes) — each was declared on
 * a port and satisfied by zero tasks until someone found the gap by hand.
 *
 * The map below is HAND-MAINTAINED, not derived from the spec text by any
 * mechanical process: it is a claim, made by a person, that a symbol is
 * actually required somewhere. A missing or wrong claim is exactly the kind
 * of defect this test exists to catch, so its own correctness is proven by
 * mutation (see the second `it` below) rather than assumed.
 */

/** Every symbol `export`ed as an `interface` or `type` from `engine/ports.ts`. */
function extractExportedPortSymbols(source: string): readonly string[] {
  const names: string[] = [];
  const pattern = /export (?:interface|type)\s+([A-Za-z0-9_]+)/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (name) names.push(name);
  }
  return names;
}

/** Symbols present in `symbols` with no entry (or an empty entry) in `requirementMap`. */
function findUntracedSymbols(
  symbols: readonly string[],
  requirementMap: Readonly<Record<string, readonly string[]>>,
): readonly string[] {
  return symbols.filter((symbol) => {
    const requirements = requirementMap[symbol];
    return !requirements || requirements.length === 0;
  });
}

/**
 * Hand-maintained symbol -> requirement map. Each requirement string is
 * `<spec-domain>: <Requirement heading>`, exactly as it appears under
 * `openspec/changes/scraper-core/specs/<spec-domain>/spec.md`. A symbol may
 * map to more than one requirement; it must map to at least one.
 */
const REQUIREMENT_MAP: Readonly<Record<string, readonly string[]>> = {
  HttpRequest: [
    'core-resilience-policy: Stubbed-Transport Test Isolation',
    'trf5-adapter: Complete Search Form Field Set',
  ],
  HttpResponse: [
    'core-resilience-policy: Stubbed-Transport Test Isolation',
    'trf5-adapter: Document Byte-Level ISO-8859-1 Decoding',
  ],
  HttpTransport: ['core-resilience-policy: Stubbed-Transport Test Isolation'],
  DiscoverResult: ['core-scraping-engine: Two-Stage Discover-Then-Fetch Execution'],
  UnresolvedDiscoveryItem: [
    'core-scraping-engine: Partial Discovery Travels as Result Data, Never a New Outcome Kind',
  ],
  StoredDocument: ['trf5-adapter: Document Persistence to Disk'],
  DocumentSink: ['trf5-adapter: Document Persistence to Disk'],
  SitePort: ['core-scraping-engine: Payload-Generic Port Contracts'],
  RunBounds: [
    'core-run-control-and-output: CLI Bound Enforcement',
    'core-frontier-crawl: Mandatory Date Range on Seed Searches',
  ],
  SaturationInfo: ['core-scraping-engine: Saturation-Driven Subdivision'],
  TraversalPort: [
    'core-scraping-engine: Payload-Generic Port Contracts',
    'core-scraping-engine: Saturation-Driven Subdivision',
  ],
  Seed: ['core-frontier-crawl: Seed Harvesting and Prioritization'],
  FrontierCapable: [
    'core-frontier-crawl: Deferred Phase-2 Invocation',
    'core-frontier-crawl: Seed Harvesting and Prioritization',
  ],
  CheckpointRecord: [
    'core-scraping-engine: Opaque Checkpoint Persistence',
    'core-scraping-engine: Saturation-Driven Subdivision',
  ],
  CheckpointStore: ['core-scraping-engine: Opaque Checkpoint Persistence'],
  LedgerEntry: ['core-coverage-accounting: Separate Checkpoint and Failure Ledger Concerns'],
  FailureLedger: ['core-coverage-accounting: Separate Checkpoint and Failure Ledger Concerns'],
  OutputRecord: ['core-run-control-and-output: Mandatory Envelope Fields'],
  ItemSink: [
    'core-run-control-and-output: JSONL Append-Only Output',
    'core-coverage-accounting: Deduplication by Adapter-Declared Identity Key',
  ],
  CoverageRecord: ['core-coverage-accounting: Cell State Ledger'],
  CoverageSink: ['core-run-control-and-output: Separate Coverage Ledger File'],
  AdapterStateStore: ['core-frontier-crawl: Deferred Phase-2 Invocation'],
  Clock: ['core-resilience-policy: Stubbed-Transport Test Isolation'],
  LogLevel: ['core-run-control-and-output: Structured Run Observability'],
  LogEvent: [
    'core-run-control-and-output: Structured Run Observability',
    'core-run-control-and-output: Personal Data Handling Rules',
  ],
  Logger: ['core-run-control-and-output: Structured Run Observability'],
  DocumentFetchOutcome: [
    'core-run-control-and-output: Document Fetch Outcome Written Back to the Payload',
  ],
};

describe('engine/ports.ts reverse requirement-coverage audit', () => {
  const portsSourcePath = fileURLToPath(new URL('../ports.ts', import.meta.url));
  const portsSource = readFileSync(portsSourcePath, 'utf-8');
  const exportedSymbols = extractExportedPortSymbols(portsSource);

  it('extracted a non-trivial symbol list from the real ports.ts file (sanity: not silently empty)', () => {
    // Guards against the extractor itself regressing into a no-op that would
    // make the audit below vacuously pass with zero symbols checked.
    expect(exportedSymbols.length).toBeGreaterThanOrEqual(20);
    expect(exportedSymbols).toContain('SitePort');
    expect(exportedSymbols).toContain('TraversalPort');
    expect(exportedSymbols).toContain('Logger');
  });

  it('maps every symbol actually exported from ports.ts to at least one named requirement', () => {
    const untraced = findUntracedSymbols(exportedSymbols, REQUIREMENT_MAP);
    // A non-empty result here is not a test bug to silence — it is a real
    // finding. Per this task's own instruction: do not invent a requirement
    // to close it; record it in apply-progress.md instead.
    expect(untraced).toEqual([]);
  });

  it('proves the audit is non-vacuous: deleting a real mapping is caught by name, and restoring it passes again', () => {
    // Mutation-testing style, same discipline S4d used for defect detection:
    // one targeted removal, on a COPY of the map (never the module-level
    // constant), so this proof never leaves the map it mutates behind.
    const mutatedMap: Record<string, readonly string[]> = { ...REQUIREMENT_MAP };
    delete mutatedMap.CoverageSink;

    const mutatedResult = findUntracedSymbols(exportedSymbols, mutatedMap);
    expect(mutatedResult).toEqual(['CoverageSink']);

    // Restored: the original, unmutated map traces every symbol again.
    const restoredResult = findUntracedSymbols(exportedSymbols, REQUIREMENT_MAP);
    expect(restoredResult).toEqual([]);
  });
});
