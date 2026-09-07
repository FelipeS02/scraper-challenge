import { describe, expect, it } from 'vitest';
import { decodePercentEncodedLatin1 } from './encoding.js';

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
