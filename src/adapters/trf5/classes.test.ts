import { describe, expect, it } from 'vitest';
import { parseClassCatalogue } from './classes.js';
import { loadFixtureBytes } from './__fixtures__/stub-transport.js';

/**
 * `__fixtures__/classes-catalogue.xml` is the REAL captured suggestion
 * response (2026-09-06), ViewState values redacted, kept whole rather than
 * trimmed to the suggestion table — the surrounding page is exactly what lets
 * these tests prove the parser scopes to the suggestion box instead of
 * scanning the whole document (docs/RESEARCH.md §9.9's own critique).
 *
 * It replaces a synthetic `<ul><li>` fixture that had been authored to match
 * an assumed markup shape and never captured. `rich:suggestionbox` (RichFaces
 * 3.3.3) has always rendered a table; the previous parser matched nothing on
 * the live host, so the judicial-class axis — and the name-substring axis
 * below it — never fired on any run.
 */
const CONTENT_TYPE = 'text/xml;charset=UTF-8';

describe('parseClassCatalogue — the real rich:suggestionbox table', () => {
  it('extracts the whole 132-entry catalogue the endpoint returns', () => {
    const classes = parseClassCatalogue(loadFixtureBytes('classes-catalogue.xml'), CONTENT_TYPE);

    expect(classes).toHaveLength(132);
  });

  it('reads the CNJ code and the label out of their own cells', () => {
    const classes = parseClassCatalogue(loadFixtureBytes('classes-catalogue.xml'), CONTENT_TYPE);

    expect(classes[0]).toEqual({ label: 'AÇÃO CIVIL COLETIVA', cnjCode: '63' });
  });

  it('decodes by the declared charset, so Portuguese accents survive verbatim', () => {
    const classes = parseClassCatalogue(loadFixtureBytes('classes-catalogue.xml'), CONTENT_TYPE);

    // The endpoint declares UTF-8. Decoding it as Latin-1 (what this parser
    // did before) turned every accented class into mojibake — "AÇÃO" became
    // "AÃ‡ÃƒO". Note "Ã" alone proves nothing: it is a legitimate Portuguese
    // letter, present in "AÇÃO" itself. The mojibake signature is the pair.
    expect(classes.map((cls) => cls.label)).toContain('AÇÃO CIVIL PÚBLICA CÍVEL');
    expect(classes.every((cls) => !/Ã[-¿]/.test(cls.label))).toBe(true);
  });

  it('gives every entry a non-empty label and a numeric CNJ code', () => {
    const classes = parseClassCatalogue(loadFixtureBytes('classes-catalogue.xml'), CONTENT_TYPE);

    expect(classes.every((cls) => cls.label.length > 0)).toBe(true);
    expect(classes.every((cls) => cls.cnjCode !== null && /^\d+$/.test(cls.cnjCode))).toBe(true);
  });

  it('returns an empty catalogue rather than throwing when the response carries no suggestion box', () => {
    const body = new TextEncoder().encode(
      '<?xml version="1.0"?><html><body><ul><li>not a suggestion</li></ul></body></html>',
    );

    expect(parseClassCatalogue(body, CONTENT_TYPE)).toEqual([]);
  });
});
