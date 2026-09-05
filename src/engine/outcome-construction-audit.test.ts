import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Outcome-construction audit (S5g task 5g.7, sibling of `ports-implementation-
 * audit.test.ts` (S5d) and `__fixtures__/ports-coverage-audit.test.ts` (S5c)).
 * Those two catch a port DECLARED-but-never-implemented, and a port symbol
 * declared-but-never-wired-to-a-requirement. This one catches a THIRD shape
 * of the same class of gap: a `FetchOutcome` variant declared in
 * `engine/types.ts` with zero construction sites anywhere in production
 * code — exactly what let `{ kind: 'transient' }` sit in this codebase since
 * S1 as a type declaration nobody ever built, while `retry-policy.ts` and
 * `scraper.ts` both correctly handled it and every test still passed (the
 * full-change verify report's finding this slice exists to close).
 *
 * The variant list is DERIVED from `engine/types.ts`, never hand-listed — the
 * same discipline `ports-implementation-audit.test.ts` uses for its port
 * list, for the same reason: a hand-maintained list can silently omit a
 * newly added variant, reproducing the exact failure this audit exists to
 * prevent one level up.
 */

/** Every `readonly kind: '<literal>'` member in `FetchOutcome` (engine/types.ts). */
const KIND_LITERAL = /readonly kind:\s*'([A-Za-z]+)'/g;

function deriveFetchOutcomeKinds(source: string): readonly string[] {
  const kinds: string[] = [];
  for (const match of source.matchAll(KIND_LITERAL)) {
    const kind = match[1];
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}

// `new URL('..', import.meta.url)` always resolves to a directory URL (trailing
// slash) since the base includes a filename component — same normalization
// `ports-implementation-audit.test.ts` applies, for the same reason.
const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, ''); // .../src
const typesFilePath = join(SRC_ROOT, 'engine', 'types.ts');
const fetchOutcomeKinds = deriveFetchOutcomeKinds(readFileSync(typesFilePath, 'utf-8'));

interface KindMatch {
  readonly kind: string;
  readonly file: string;
}

/**
 * `engine/types.ts` itself is excluded: it is the DECLARATION site (every
 * member is written `readonly kind: '<literal>'`, a type annotation), never a
 * construction site (a real object literal never carries `readonly`). A test
 * file or a `__fixtures__/` file may construct any outcome to drive a unit
 * under test — that proves the type is exercisable, not that production code
 * ever produces it on a real request path, which is exactly what let
 * `transient` go unconstructed for this long.
 */
function isExcludedFile(relativePath: string): boolean {
  return (
    relativePath === 'engine/types.ts' ||
    relativePath.endsWith('.test.ts') ||
    relativePath.includes('__fixtures__')
  );
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

/** A real object-literal construction (`{ kind: 'transient', ... }`), never a type annotation. */
function findKindConstructions(
  srcRoot: string,
  files: readonly string[],
  kinds: readonly string[],
): readonly KindMatch[] {
  const matches: KindMatch[] = [];
  for (const file of files) {
    if (isExcludedFile(file)) continue;
    const source = readFileSync(join(srcRoot, file), 'utf-8');
    for (const kind of kinds) {
      const pattern = new RegExp(`(?<!readonly )kind:\\s*['"]${kind}['"]`);
      if (pattern.test(source)) matches.push({ kind, file });
    }
  }
  return matches;
}

function findKindsWithNoProductionConstruction(
  kinds: readonly string[],
  matches: readonly KindMatch[],
): readonly string[] {
  return kinds.filter((kind) => !matches.some((m) => m.kind === kind));
}

describe('FetchOutcome-variant derivation — the kind list is read from types.ts, never hand-listed', () => {
  it('extracted the real, non-trivial variant set from engine/types.ts (sanity: not silently empty)', () => {
    expect(fetchOutcomeKinds.length).toBeGreaterThanOrEqual(5);
    expect(fetchOutcomeKinds).toEqual([
      'ok',
      'transient',
      'sessionExpired',
      'hostDefect',
      'permanentError',
    ]);
  });
});

describe('engine/types.ts outcome-construction audit — every FetchOutcome variant is built somewhere in production code', () => {
  const files = walkTsFiles(SRC_ROOT, SRC_ROOT, []);
  const matches = findKindConstructions(SRC_ROOT, files, fetchOutcomeKinds);

  it('scanned a non-trivial file set and found real construction sites (sanity: not silently empty)', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(matches.length).toBeGreaterThan(5);
  });

  it("proves the audit is non-vacuous: transient had zero production construction sites before this slice's 429 wiring (RED proof)", () => {
    // Same discipline as the sibling audits' mutation proofs: recompute the
    // check with only the THREE `transient` matches this slice's 5g.5 wiring
    // added (site.ts's, detail.ts's, and documents.ts's own
    // `classifyHttpStatus` call sites) removed — never the whole file's other,
    // pre-existing matches (`ok`, `hostDefect`, `permanentError`), which
    // predate this slice and must stay to keep this proof honest. This
    // reproduces exactly the pre-5g.5 tree: `engine/http-status.ts` did not
    // exist and nothing constructed `transient` anywhere. Independently
    // confirmed by literally reverting those three files and re-running this
    // suite before landing 5g.7 (see apply-progress.md).
    const s5gWiredFiles = [
      'engine/http-status.ts',
      'adapters/trf5/site.ts',
      'adapters/trf5/detail.ts',
      'adapters/trf5/documents.ts',
    ];
    const withoutS5gWiring = matches.filter(
      (m) => !(m.kind === 'transient' && s5gWiredFiles.includes(m.file)),
    );
    const redResult = findKindsWithNoProductionConstruction(fetchOutcomeKinds, withoutS5gWiring);
    expect(redResult).toEqual(['transient']);
  });

  it('finds a real, non-test, non-fixture construction site for every FetchOutcome variant', () => {
    const unconstructed = findKindsWithNoProductionConstruction(fetchOutcomeKinds, matches);
    // A non-empty result here is a real finding, not a test bug to silence.
    expect(unconstructed).toEqual([]);
  });
});
