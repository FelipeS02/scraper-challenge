/**
 * Percent-encoded document-label decoder for `nomeArqProcDocBin` query values
 * (trf5-adapter spec, "Document Byte-Level ISO-8859-1 Decoding"; docs/RESEARCH.md §2
 * Step 4, trap #1). Each `%XX` escape carries one raw ISO-8859-1 byte, not a UTF-8
 * code unit: `%E3` is the single byte 0xE3, which is `ã` in ISO-8859-1 (giving
 * `Decisão`) but is an incomplete UTF-8 lead byte — a UTF-8-aware decoder like
 * `decodeURIComponent` throws or produces mojibake on the exact same input.
 */
/**
 * Exactly the safe set `application/x-www-form-urlencoded` serialization uses,
 * so the only difference from the `URLSearchParams` bodies this replaces is the
 * charset of the escapes themselves — never which characters get escaped.
 */
const UNRESERVED = /[A-Za-z0-9*\-._]/;

function encodeComponentLatin1(value: string): string {
  let encoded = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (UNRESERVED.test(char)) encoded += char;
    else if (char === ' ') encoded += '+';
    else if (code <= 0xff) encoded += `%${code.toString(16).toUpperCase().padStart(2, '0')}`;
    // ISO-8859-1 has no byte for this character. A browser posting a form
    // declared in a non-UTF-8 charset substitutes the HTML numeric reference
    // rather than an arbitrary byte, so the value stays recoverable instead of
    // silently becoming the wrong character — exactly the failure this whole
    // function exists to stop.
    else encoded += encodeComponentLatin1(`&#${code};`);
  }
  return encoded;
}

/**
 * Builds an `application/x-www-form-urlencoded` body whose escapes are single
 * ISO-8859-1 bytes — the exact inverse of {@link decodePercentEncodedLatin1},
 * and the request-side half of the contract `decodeLatin1` already keeps on
 * responses.
 *
 * `URLSearchParams` cannot be used here: it always percent-encodes UTF-8, so
 * `Ç` goes out as `%C3%87` while the host reads ISO-8859-1 and sees two
 * characters of mojibake. The host then substring-matches on the
 * accent-stripped form, so the request does not fail — it silently matches
 * nothing and returns an empty result set that is indistinguishable from a
 * genuine "no such records" answer.
 *
 * Measured live on 2026-01-07 before this existed: `classeJudicial=APELAÇÃO
 * CÍVEL` returned 0 rows UTF-8-encoded and 30 latin-1-encoded, on a day whose
 * own result grid showed 27 of exactly that class. `Ã` alone appeared to work,
 * because UTF-8 `Ã` (C3 83) read as ISO-8859-1 begins with `Ã`, which strips
 * back to `A` — coincidentally the right letter. `Ç` (C3 87) and `Í` (C3 8D)
 * strip to `A` too, which is the wrong one.
 */
export function encodeFormBodyLatin1(pairs: Iterable<readonly [string, string]>): string {
  return [...pairs]
    .map(([name, value]) => `${encodeComponentLatin1(name)}=${encodeComponentLatin1(value)}`)
    .join('&');
}

export function decodePercentEncodedLatin1(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    if (char === '%' && i + 2 < value.length) {
      const byte = Number.parseInt(value.slice(i + 1, i + 3), 16);
      if (!Number.isNaN(byte)) {
        bytes.push(byte);
        i += 2;
        continue;
      }
    }
    bytes.push(char === '+' ? 0x20 : char.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('latin1');
}
