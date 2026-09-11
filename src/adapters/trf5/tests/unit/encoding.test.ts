import { describe, expect, it } from 'vitest';
import { decodePercentEncodedLatin1, encodeFormBodyLatin1 } from '../../encoding.js';

describe('encodeFormBodyLatin1 — the request side of the same ISO-8859-1 contract', () => {
  it('percent-encodes an accented value as single ISO-8859-1 bytes, never as UTF-8', () => {
    // Proven live 2026-01-07: this exact value returned 0 rows UTF-8-encoded
    // (`%C3%87%C3%83`) and 30 rows latin-1-encoded. The host reads the body as
    // ISO-8859-1 — the same charset `decodeLatin1` already reads responses in.
    const body = encodeFormBodyLatin1([['classeJudicial', 'APELAÇÃO CÍVEL']]);

    expect(body).toBe('classeJudicial=APELA%C7%C3O+C%CDVEL');
    expect(body).not.toContain('%C3%87'); // the UTF-8 spelling of 'Ç'
  });

  it('round-trips through the decoder this module already owns', () => {
    const value = 'AÇÃO CIVIL PÚBLICA CÍVEL';
    const encoded = encodeFormBodyLatin1([['classeJudicial', value]]);

    expect(decodePercentEncodedLatin1(encoded.split('=')[1] ?? '')).toBe(value);
  });

  it('leaves an ASCII-only value byte-identical, so nothing that already worked changes', () => {
    // The live control: 'HABEAS CORPUS CRIMINAL' returned 2 rows under both
    // encodings. A regression here would silently break working filters.
    expect(encodeFormBodyLatin1([['classeJudicial', 'AGRAVO DE INSTRUMENTO']])).toBe(
      'classeJudicial=AGRAVO+DE+INSTRUMENTO',
    );
  });

  it('escapes separators and slashes so a value can never forge another field', () => {
    expect(encodeFormBodyLatin1([['dataAutuacaoInicio', '07/01/2026']])).toBe(
      'dataAutuacaoInicio=07%2F01%2F2026',
    );
    expect(encodeFormBodyLatin1([['nomeParte', 'A&b=c+d']])).toBe('nomeParte=A%26b%3Dc%2Bd');
  });

  it('encodes the field name too, since the harvested JSF names carry colons', () => {
    expect(encodeFormBodyLatin1([['fPP:j_id178:classeJudicial', 'X']])).toBe(
      'fPP%3Aj_id178%3AclasseJudicial=X',
    );
  });

  it('joins every pair with &, preserving the given order', () => {
    expect(
      encodeFormBodyLatin1([
        ['a', '1'],
        ['b', '2'],
      ]),
    ).toBe('a=1&b=2');
  });

  it('emits a numeric character reference for a character ISO-8859-1 cannot carry', () => {
    // What a browser does when a form declares a non-UTF-8 charset: the byte
    // stream has no room for the character, so the value carries its HTML
    // numeric reference instead of a silently wrong byte.
    expect(encodeFormBodyLatin1([['nomeParte', '€']])).toBe('nomeParte=%26%238364%3B');
  });
});

describe('decodePercentEncodedLatin1 — Document Byte-Level ISO-8859-1 Decoding (trf5-adapter spec)', () => {
  it('decodes a percent-encoded ISO-8859-1 nomeArqProcDocBin value at the byte level', () => {
    expect(decodePercentEncodedLatin1('Decis%E3o')).toBe('Decisão');
  });

  it('decodes a second accented label, proving each %XX escape is read as its own ISO-8859-1 byte, not a fixed lookup', () => {
    expect(decodePercentEncodedLatin1('Ac%F3rd%E3o')).toBe('Acórdão');
  });

  it('leaves an already-plain label untouched', () => {
    expect(decodePercentEncodedLatin1('Despacho')).toBe('Despacho');
  });

  it('never decodes through UTF-8: the same raw escape sequence is not valid UTF-8', () => {
    // %E3 is a lone ISO-8859-1 byte (0xE3 = 'ã'); as a UTF-8 lead byte it demands two
    // continuation bytes that never follow, so a UTF-8-based decoder must reject it —
    // this is the exact failure mode docs/RESEARCH.md §2 Step 4 warns about.
    expect(() => decodeURIComponent('Decis%E3o')).toThrow(URIError);
  });
});
