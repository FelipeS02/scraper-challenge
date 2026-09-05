import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Ports-implementation audit (trf5-adapter spec, sibling of the reverse-coverage
 * audit added in commit `43c4bdf` / `engine/__fixtures__/ports-coverage-audit.test.ts`).
 * That audit catches a port symbol declared-but-never-WIRED to a requirement.
 * This one catches a port interface declared-but-never-IMPLEMENTED by real
 * production code — the exact shape of gap that let `SitePort` reach S5b's
 * apply with only `FakeSite`/`ScriptedSite`/`FakeNonDateSite` (all under
 * `__fixtures__/` or inside a `.test.ts` file) ever satisfying it. Neither
 * audit catches the other.
 *
 * Only interfaces with at least one method are ever the target of a class's
 * `implements` clause in this codebase — pure-data port shapes (`HttpRequest`,
 * `RunBounds`, `CheckpointRecord`, ...) are constructed as object literals,
 * never implemented by a class, so auditing every `ports.ts` export would
 * produce false positives.
 *
 * That distinction is DERIVED from `ports.ts` rather than hand-listed. S5d
 * originally kept the 12 behavioral names in a literal here, mirroring
 * `REQUIREMENT_MAP` in the sibling audit — which reproduced, one level down,
 * the exact failure this audit exists to prevent: a hand-maintained list that
 * silently omits what nobody remembered to add. A 13th port added to
 * `ports.ts` now enters this audit with no edit to this file.
 */

interface PortInterface {
  readonly name: string;
  readonly body: string;
}

/** Strips block and line comments so prose parentheses cannot look like a method. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const INTERFACE_HEADER = /export\s+interface\s+([A-Za-z0-9_]+)[^{]*\{/g;

/** Every `export interface` in `source`, with its body delimited by brace matching. */
function parseExportedInterfaces(source: string): readonly PortInterface[] {
  const parsed: PortInterface[] = [];
  for (const header of source.matchAll(INTERFACE_HEADER)) {
    const name = header[1];
    if (name === undefined || header.index === undefined) continue;
    const bodyStart = header.index + header[0].length;
    let depth = 1;
    let cursor = bodyStart;
    while (cursor < source.length && depth > 0) {
      const char = source[cursor];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      cursor += 1;
    }
    parsed.push({ name, body: source.slice(bodyStart, cursor - 1) });
  }
  return parsed;
}

/** A member written as `name(...)` — the only shape a class can `implements`. */
const METHOD_MEMBER = /(?:^|[;{}\n])\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:<[^>]*>)?\s*\(/;

function declaresMethod(port: PortInterface): boolean {
  return METHOD_MEMBER.test(port.body);
}

function deriveBehavioralPorts(portsSource: string): readonly string[] {
  return parseExportedInterfaces(stripComments(portsSource))
    .filter(declaresMethod)
    .map((port) => port.name);
}

// `new URL('..', import.meta.url)` always resolves to a directory URL (trailing
// slash) since the base includes a filename component; strip it so `walkTsFiles`'s
// `slice(root.length + 1)` cuts exactly the path separator, not the next character.
const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, ''); // .../src
const portsFilePath = join(SRC_ROOT, 'engine', 'ports.ts');
const behavioralPorts = deriveBehavioralPorts(readFileSync(portsFilePath, 'utf-8'));

/**
 * Interfaces this repository has already decided to leave without a
 * production implementation for the DURATION of this slice, each tracked by
 * a real, named follow-up task rather than silently ignored:
 *
 * - `FrontierCapable` — phase-2 only (design.md D3), S6, entirely unstarted.
 *   No implementation exists anywhere yet, fixture or production.
 *
 * `HttpTransport` (`infra/http/axios-transport.ts`) and `Clock`
 * (`infra/clock.ts`) closed in S5e (tasks 9.1/9.2) and were removed from
 * this list — it is designed to only ever get smaller, never to grow back
 * once a gap is closed.
 *
 * A symbol here is a disclosed, tracked gap, not a silently invented pass.
 */
const KNOWN_DEFERRED_GAPS = ['FrontierCapable'] as const;

interface ImplementationMatch {
  readonly port: string;
  readonly file: string;
}

function isFixtureOrTestFile(relativePath: string): boolean {
  return relativePath.includes('__fixtures__') || relativePath.endsWith('.test.ts');
}

function walkTsFiles(dir: string, root: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(fullPath, root, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(fullPath.slice(root.length + 1).replace(/\\/g, '/'));
    }
  }
  return out;
}

const IMPLEMENTS_PATTERN = /\bimplements\s+([A-Za-z0-9_]+)/g;

function findImplementations(
  srcRoot: string,
  files: readonly string[],
): readonly ImplementationMatch[] {
  const matches: ImplementationMatch[] = [];
  for (const file of files) {
    const source = readFileSync(join(srcRoot, file), 'utf-8');
    for (const match of source.matchAll(IMPLEMENTS_PATTERN)) {
      const port = match[1];
      if (port) matches.push({ port, file });
    }
  }
  return matches;
}

/** Ports named in `BEHAVIORAL_PORTS` with zero implementation outside `__fixtures__/`/`.test.ts`. */
function findPortsWithNoProductionImplementation(
  ports: readonly string[],
  implementations: readonly ImplementationMatch[],
): readonly string[] {
  return ports.filter((port) => {
    const forPort = implementations.filter((m) => m.port === port);
    return !forPort.some((m) => !isFixtureOrTestFile(m.file));
  });
}

describe('behavioral-port derivation — the port list is read from ports.ts, never hand-listed', () => {
  it('classifies an interface with a method as behavioral and a pure-data shape as not', () => {
    const source = `
      export interface DataOnly {
        readonly url: string;
        readonly headers?: Readonly<Record<string, string>> | undefined;
      }
      export interface HasMethod {
        readonly label: string;
        doThing(input: string): Promise<void>;
      }
    `;
    const parsed = parseExportedInterfaces(stripComments(source));
    expect(parsed.map((i) => i.name)).toEqual(['DataOnly', 'HasMethod']);
    expect(parsed.filter(declaresMethod).map((i) => i.name)).toEqual(['HasMethod']);
  });

  it('is not fooled by parentheses inside comments, or by a multi-line method signature', () => {
    const source = `
      export interface CommentTrap {
        /** persisted by the engine (design.md D10), never the adapter */
        readonly state: 'complete' | 'failed';
      }
      export interface MultiLine {
        split(
          unit: string,
          saturated: number,
        ): Promise<readonly string[] | null>;
      }
    `;
    const parsed = parseExportedInterfaces(stripComments(source));
    expect(parsed.filter(declaresMethod).map((i) => i.name)).toEqual(['MultiLine']);
  });

  it('puts a newly added port on the radar with no list to edit — the point of deriving', () => {
    const withNewPort = `${readFileSync(portsFilePath, 'utf-8')}
      export interface NewlyAddedPort {
        doSomething(): Promise<void>;
      }
    `;
    expect(deriveBehavioralPorts(withNewPort)).toContain('NewlyAddedPort');
  });

  it('still recognises every port the hand-maintained list named, and no pure-data shape', () => {
    // Asserted as containment in BOTH directions, never as exact equality: a
    // 13th port added to `ports.ts` must NOT require an edit here, or this
    // anchor would quietly become the hand-maintained list it replaced.
    // Dropping a name still fails (first block); classifying a data shape as a
    // port still fails (second block); so it cannot pass vacuously either way.
    const KNOWN_BEHAVIORAL_AT_S5D = [
      'AdapterStateStore',
      'CheckpointStore',
      'Clock',
      'CoverageSink',
      'DocumentSink',
      'FailureLedger',
      'FrontierCapable',
      'HttpTransport',
      'ItemSink',
      'Logger',
      'SitePort',
      'TraversalPort',
    ];
    const KNOWN_DATA_SHAPES_AT_S5D = [
      'CheckpointRecord',
      'CoverageRecord',
      'DiscoverResult',
      'HttpRequest',
      'HttpResponse',
      'LedgerEntry',
      'LogEvent',
      'OutputRecord',
      'RunBounds',
      'SaturationInfo',
      'Seed',
      'StoredDocument',
    ];
    for (const port of KNOWN_BEHAVIORAL_AT_S5D) expect(behavioralPorts).toContain(port);
    for (const shape of KNOWN_DATA_SHAPES_AT_S5D) expect(behavioralPorts).not.toContain(shape);
  });
});

describe('engine/ports.ts implementation audit — every behavioral port has a real implementation', () => {
  const files = walkTsFiles(SRC_ROOT, SRC_ROOT, []);
  const implementations = findImplementations(SRC_ROOT, files);

  it('scanned a non-trivial file set and found real implements clauses (sanity: not silently empty)', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(implementations.length).toBeGreaterThan(10);
    expect(implementations.some((m) => m.port === 'SitePort')).toBe(true);
  });

  it('proves the audit is non-vacuous: SitePort was fixture/test-only before TRF5Site existed (RED proof)', () => {
    // Same discipline as the sibling audit's mutation proof: recompute the
    // check against a copy of the implementation list with TRF5Site's own
    // match removed, standing in for "before `adapters/trf5/site.ts` declared
    // the class" — this is exactly the state S5b's apply left the repo in.
    const withoutTrf5Site = implementations.filter(
      (m) => !(m.port === 'SitePort' && m.file === 'adapters/trf5/site.ts'),
    );
    const redResult = findPortsWithNoProductionImplementation(['SitePort'], withoutTrf5Site);
    expect(redResult).toEqual(['SitePort']);
  });

  it('finds a non-fixture, non-test implementation for every behavioral port except the disclosed, tracked gaps', () => {
    const untraced = findPortsWithNoProductionImplementation(behavioralPorts, implementations);
    expect([...untraced].sort()).toEqual([...KNOWN_DEFERRED_GAPS].sort());
  });
});
