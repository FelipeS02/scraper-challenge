/**
 * Percent-encoded document-label decoder for `nomeArqProcDocBin` query values
 * (trf5-adapter spec, "Document Byte-Level ISO-8859-1 Decoding"; docs/RESEARCH.md §2
 * Step 4, trap #1). Each `%XX` escape carries one raw ISO-8859-1 byte, not a UTF-8
 * code unit: `%E3` is the single byte 0xE3, which is `ã` in ISO-8859-1 (giving
 * `Decisão`) but is an incomplete UTF-8 lead byte — a UTF-8-aware decoder like
 * `decodeURIComponent` throws or produces mojibake on the exact same input.
 */
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
