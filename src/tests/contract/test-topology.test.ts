import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { testProjectNames, testProjects } from '../../../test-topology.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC_ROOT = join(REPOSITORY_ROOT, 'src');
const isTestHome = (path: string): boolean =>
  path.startsWith('src/') &&
  ['unit', 'integration', 'contract'].some((scope) => path.includes('/tests/' + scope + '/')) &&
  path.endsWith('.test.ts');
function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
function normalize(path: string): string {
  return path.split(sep).join('/');
}
function projectMatches(path: string): string[] {
  const normalized = normalize(relative(REPOSITORY_ROOT, path));
  return testProjects.flatMap((project) => {
    const scope = project.test.name;
    return normalized.includes('/tests/' + scope + '/') ? [project.test.name] : [];
  });
}
function imports(file: string): string[] {
  return Array.from(readFileSync(file, 'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g)).map(
    (match) => resolve(dirname(file), match[1]!.replace(/\.js$/, '.ts')),
  );
}
describe('test topology inventory', () => {
  const suites = walk(SRC_ROOT).filter((file) => file.endsWith('.test.ts'));
  it('exposes exactly the three exclusive project names', () => {
    expect(testProjectNames).toEqual(['unit', 'integration', 'contract']);
    expect(new Set(testProjectNames).size).toBe(3);
  });
  it('classifies every suite exactly once and rejects fixture/support suites', () => {
    expect(suites).not.toHaveLength(0);
    for (const suite of suites) {
      const relativePath = normalize(relative(REPOSITORY_ROOT, suite));
      expect(isTestHome(relativePath)).toBe(true);
      expect(relativePath).not.toContain('/tests/fixtures/');
      expect(relativePath).not.toContain('/tests/support/');
      expect(projectMatches(suite)).toHaveLength(1);
    }
  });
  it('keeps package scripts mapped only to the named projects', () => {
    const pkg = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts['test:unit']).toBe('vitest run --project unit');
    expect(pkg.scripts['test:integration']).toBe('vitest run --project integration');
    expect(pkg.scripts['test:contract']).toBe('vitest run --project contract');
  });
  it('prevents unit suites from importing another component support home', () => {
    for (const suite of suites.filter((file) => normalize(file).includes('/tests/unit/'))) {
      const component = normalize(relative(SRC_ROOT, suite)).split('/tests/')[0];
      for (const imported of imports(suite)) {
        const target = normalize(relative(SRC_ROOT, imported));
        if (target.includes('/tests/support/'))
          expect(target.startsWith(component + '/tests/support/')).toBe(true);
      }
    }
  });
  it('uses only explicit component fixture homes', () => {
    const fixtures = walk(SRC_ROOT).filter((file) => normalize(file).includes('/fixtures/'));
    expect(fixtures.every((file) => normalize(file).includes('/tests/fixtures/'))).toBe(true);
    expect(
      existsSync(join(SRC_ROOT, 'adapters', 'trf5', 'tests', 'fixtures', 'document-sample.pdf')),
    ).toBe(true);
  });
});
