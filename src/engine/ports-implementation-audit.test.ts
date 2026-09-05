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
 * `implements` clause in this codebase (verified: every `implements X` match
 * in `src/` names one of the interfaces below) — pure-data port shapes
 * (`WorkUnit`, `HttpRequest`, `RunBounds`, `CheckpointRecord`, ...) are
 * constructed as object literals, never implemented by a class, so scanning
 * every `ports.ts` export for `implements` would produce false positives.
 * This list is therefore hand-maintained, exactly like `REQUIREMENT_MAP` in
 * the sibling audit, and is sanity-checked the same way below.
 */
const BEHAVIORAL_PORTS = [
  'HttpTransport',
  'SitePort',
  'DocumentSink',
  'TraversalPort',
  'FrontierCapable',
  'CheckpointStore',
  'FailureLedger',
  'ItemSink',
  'CoverageSink',
  'AdapterStateStore',
  'Clock',
  'Logger',
] as const;

/**
 * Interfaces this repository has already decided to leave without a
 * production implementation for the DURATION of this slice, each tracked by
 * a real, named follow-up task rather than silently ignored:
 *
 * - `HttpTransport` — the real implementation is `infra/http/axios-transport.ts`,
 *   S5e task 9.1 (`tasks.md`). Only `StubTransport` (`__fixtures__/`) exists today.
 * - `Clock` — wired inline in `main.ts`'s composition root, S5e task 9.2.
 *   Only `FakeClock` (test files) exists today.
 * - `FrontierCapable` — phase-2 only (design.md D3), S6, entirely unstarted.
 *   No implementation exists anywhere yet, fixture or production.
 *
 * A symbol here is a disclosed, tracked gap, not a silently invented pass.
 */
const KNOWN_DEFERRED_GAPS = ['HttpTransport', 'Clock', 'FrontierCapable'] as const;

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

describe('engine/ports.ts implementation audit — every behavioral port has a real implementation', () => {
  // `new URL('..', import.meta.url)` always resolves to a directory URL (trailing
  // slash) since the base includes a filename component; strip it so `walkTsFiles`'s
  // `slice(root.length + 1)` cuts exactly the path separator, not the next character.
  const srcRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, ''); // .../src
  const files = walkTsFiles(srcRoot, srcRoot, []);
  const implementations = findImplementations(srcRoot, files);

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
    const untraced = findPortsWithNoProductionImplementation(BEHAVIORAL_PORTS, implementations);
    expect([...untraced].sort()).toEqual([...KNOWN_DEFERRED_GAPS].sort());
  });
});
