import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Payload-field-construction audit (S5i task 5i.8, the assertion-side sibling
 * of S5g's `outcome-construction-audit.test.ts` and S5d's
 * `ports-implementation-audit.test.ts`). Those two catch a declared-but-
 * never-implemented/constructed PORT SHAPE. This one catches a declared-but-
 * always-hardcoded PAYLOAD FIELD: a nullable field in `schemas/payload.ts`
 * whose every production construction site writes the literal `null` --
 * exactly the shape `occurredAt` was before task 5i.4, where a real captured
 * fixture's own test assertion (`detail-page.test.ts`, pre-5i.4) encoded the
 * hardcoded `null` as if it were a passing expectation rather than a defect
 * (design.md's amended `occurredAt` paragraph).
 *
 * The field list is DERIVED from `schemas/payload.ts`, never hand-listed --
 * the same discipline the two sibling audits use for their own lists, for
 * the same reason: a hand-maintained list can silently omit a newly added
 * nullable field, reproducing exactly the failure this audit exists to catch
 * one level up.
 *
 * Scope is intentionally `src/adapters/trf5/` only, not the whole `src/`
 * tree: payload fields are TRF5-specific data, and scanning the whole engine
 * (which uses unrelated same-named object-literal keys, e.g. `status` on an
 * `HttpResponse`) would produce false negatives from unrelated collisions.
 * This is a best-effort structural/textual audit, the same kind the two
 * sibling audits already are -- not full static analysis.
 */

/** Every `<name>: z.<...>.nullable()` field declaration in payload.ts, line-scanned
 * so it finds a field regardless of nesting depth (inline `judgingBody: z.object({...})`
 * included, same as a named schema constant). */
const NULLABLE_FIELD = /(\w+):\s*z\.[^\n,]*\.nullable\(\)/g;

function deriveNullableFields(source: string): readonly string[] {
  const fields: string[] = [];
  for (const match of source.matchAll(NULLABLE_FIELD)) {
    const name = match[1];
    if (name && !fields.includes(name)) fields.push(name);
  }
  return fields;
}

const SRC_ROOT = fileURLToPath(new URL('../../..', import.meta.url)).replace(/[\\/]+$/, ''); // .../src
const TRF5_ROOT = join(SRC_ROOT, 'adapters', 'trf5');
const payloadFilePath = join(TRF5_ROOT, 'schemas', 'payload.ts');
const nullableFields = deriveNullableFields(readFileSync(payloadFilePath, 'utf-8'));

/**
 * `cnjCode` is a legitimate, design-sanctioned exception, not a loosened
 * rule: design.md's amended `occurredAt` paragraph explicitly distinguishes
 * the two — `movements[].cnjCode` carries a real, disclosed deferral pending
 * the unmapped `processoEvento` row structure (RESEARCH.md §8), while
 * `occurredAt` never had one. It is exempted here BY NAME, with this
 * citation, per task 5i.8's own instruction -- never by loosening the
 * always-null detection rule itself. (The same field name is also used,
 * non-null, by `caseClass`/`subjects[]` via `parseLabeledCode`'s regex-
 * captured group, so a global by-name scan would not mechanically flag it
 * either way -- it is listed for the record the task requires.)
 */
const EXEMPT_FIELDS = ['cnjCode'] as const;

/**
 * `schemas/payload.ts` itself is excluded: it is the DECLARATION site (every
 * nullable field is written `z.<type>().nullable()`, a schema annotation),
 * never a construction site -- same exclusion `outcome-construction-audit`
 * applies to `engine/types.ts`, for the same reason: without it, every
 * nullable field would trivially count as having a "non-null occurrence"
 * (the schema line itself), making the audit vacuously never flag anything.
 */
function isExcludedFile(relativePath: string): boolean {
  return (
    relativePath === 'schemas/payload.ts' ||
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

interface FieldOccurrence {
  readonly field: string;
  readonly file: string;
  readonly isNullLiteral: boolean;
}

/**
 * A real object-literal property assignment (`field: <expr>`), never a type
 * annotation. Scanned line by line (rather than over the whole file) so an
 * interface/type member declaration (`readonly field: string | null;`) can
 * be excluded by its own, distinct syntax — every such declaration in this
 * codebase starts with `readonly `, which no object-literal construction
 * ever does. Without this exclusion, a field's OWN interface declaration
 * line (e.g. `Movement.occurredAt`, in the same file as its real
 * construction site) would count as a spurious "non-null occurrence" and
 * mask a genuinely always-null construction site.
 */
function findFieldOccurrences(
  root: string,
  files: readonly string[],
  fields: readonly string[],
): readonly FieldOccurrence[] {
  const occurrences: FieldOccurrence[] = [];
  for (const file of files) {
    if (isExcludedFile(file)) continue;
    const source = readFileSync(join(root, file), 'utf-8');
    for (const rawLine of source.split('\n')) {
      const line = rawLine.trim();
      if (line.startsWith('readonly ') || line.startsWith('* ') || line.startsWith('//')) continue;
      for (const field of fields) {
        const pattern = new RegExp(`(?<![.\\w])${field}:\\s*([^,}]+)`);
        const match = pattern.exec(line);
        const rawValue = match?.[1];
        if (rawValue === undefined) continue;
        occurrences.push({ field, file, isNullLiteral: rawValue.trim() === 'null' });
      }
    }
  }
  return occurrences;
}

/** A field with at least one occurrence, where EVERY occurrence is the literal `null`. */
function findAlwaysNullFields(
  fields: readonly string[],
  occurrences: readonly FieldOccurrence[],
): readonly string[] {
  return fields.filter((field) => {
    if ((EXEMPT_FIELDS as readonly string[]).includes(field)) return false;
    const forField = occurrences.filter((o) => o.field === field);
    return forField.length > 0 && forField.every((o) => o.isNullLiteral);
  });
}

describe('nullable-field derivation — the field list is read from schemas/payload.ts, never hand-listed', () => {
  it('extracted a non-trivial nullable-field set (sanity: not silently empty)', () => {
    expect(nullableFields.length).toBeGreaterThanOrEqual(10);
    expect(nullableFields).toContain('occurredAt');
    expect(nullableFields).toContain('cnjCode');
    expect(nullableFields).toContain('byteLength');
  });
});

describe('schemas/payload.ts construction audit — no nullable field is hardcoded null at every production construction site', () => {
  const files = walkTsFiles(TRF5_ROOT, TRF5_ROOT, []);
  const occurrences = findFieldOccurrences(TRF5_ROOT, files, nullableFields);

  it('scanned a non-trivial file set and found real construction sites (sanity: not silently empty)', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(occurrences.length).toBeGreaterThan(10);
  });

  it('proves the audit is non-vacuous: occurredAt had a single hardcoded-null construction site before task 5i.4 (RED proof)', () => {
    // Same discipline as the sibling audits' mutation proofs: recompute the
    // check as if `parsing/detail-page.ts`'s own occurredAt construction
    // site were still the literal `null` it was before task 5i.4 -- the
    // actual pre-fix state of this exact file (a single `occurredAt: null,`
    // line inside `extractMovements`, with no other production occurrence
    // anywhere in the adapter).
    const preSlice = occurrences.map((o) =>
      o.field === 'occurredAt' && o.file === 'parsing/detail-page.ts'
        ? { ...o, isNullLiteral: true }
        : o,
    );
    const redResult = findAlwaysNullFields(nullableFields, preSlice);
    expect(redResult).toContain('occurredAt');
  });

  it('finds a real, non-test, non-fixture, non-exempt field that is hardcoded null everywhere', () => {
    const alwaysNull = findAlwaysNullFields(nullableFields, occurrences);
    // A non-empty result here is a real finding, not a test bug to silence.
    expect(alwaysNull).toEqual([]);
  });
});
