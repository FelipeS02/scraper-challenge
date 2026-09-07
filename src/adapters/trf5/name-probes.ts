/**
 * Adapter-owned machinery for the name-substring partition level (design.md
 * D2, trf5-adapter spec "Static Name-Probe Dictionary Floor" and "Adaptive
 * Name-Probe Extension"). Nothing here is engine-generic — the substring
 * semantics of `nomeParte` are TRF5-specific.
 */

const MIN_PROBE_TOKENS = 2;

function tokens(value: string): readonly string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * A name-probe value MUST be a substring of at least two space-separated
 * tokens, matching the server's own validation (docs/RESEARCH.md §3:
 * "requiring at least two space-separated tokens"). Guards both the static
 * dictionary and the adaptive harvest before either ever becomes a work
 * unit (trf5-adapter spec, "Name-Substring Partition Level").
 */
function assertTwoTokens(value: string): void {
  if (tokens(value).length < MIN_PROBE_TOKENS) {
    throw new Error(`name-probe value must have at least two space-separated tokens: "${value}"`);
  }
}

/**
 * A static, deterministic dictionary of common PT-BR surname bigrams and
 * institutional-litigant name fragments (trf5-adapter spec, "Static
 * Name-Probe Dictionary Floor"). This is the guaranteed floor: with an empty
 * harvester the probe queue equals this dictionary, in this declared order.
 * No real party name or CPF appears here — every entry is a generic,
 * common-language fragment (design.md D6, repo PII rule).
 */
export const STATIC_SURNAME_BIGRAMS: readonly string[] = [
  'DA SILVA',
  'DOS SANTOS',
  'DE OLIVEIRA',
  'DA COSTA',
  'DE SOUZA',
  'DOS REIS',
  'DA CRUZ',
  'DE ALMEIDA',
  'DO NASCIMENTO',
  'DE ARAUJO',
  'DE LIMA',
  'DA ROCHA',
  'INSTITUTO NACIONAL',
  'CAIXA ECONOMICA',
  'UNIAO FEDERAL',
  'FAZENDA NACIONAL',
  'MINISTERIO PUBLICO',
  'MUNICIPIO DE',
];

/**
 * One frequency-ranked probe queue (design.md D2): harvested (data-driven)
 * probes first, ranked by whatever order the caller already ranked them in,
 * followed by dictionary entries not already present in the harvested list.
 * Throws if any candidate (dictionary or harvested) is not a valid two-token
 * name-probe value — the guard the trf5-adapter spec's "Name-Substring
 * Partition Level" requires, enforced here rather than left to a caller.
 */
export function mergeRanked(
  dictionary: readonly string[],
  harvested: readonly string[],
): readonly string[] {
  for (const value of dictionary) assertTwoTokens(value);
  for (const value of harvested) assertTwoTokens(value);

  const used = new Set(harvested);
  const unusedDictionary = dictionary.filter((value) => !used.has(value));
  return [...harvested, ...unusedDictionary];
}

const OUTROS_SUFFIX = /\s+e\s+outros\s*\(\d+\)\s*$/i;

/**
 * Splits a raw parties-column string — `<PARTE A> e outros (N) X <PARTE B>`
 * (docs/RESEARCH.md §3) — into its individual party names, stripping the
 * "e outros (N)" ("and N others") suffix that names no one in particular.
 * Reads only text already captured by `parseResultFragment` — no request of
 * its own (trf5-adapter spec, "Adaptive Name-Probe Extension").
 */
export function extractPartyNames(partiesText: string): readonly string[] {
  const trimmed = partiesText.trim();
  if (trimmed.length === 0) return [];
  return trimmed
    .split(/\s+X\s+/)
    .map((segment) => segment.replace(OUTROS_SUFFIX, '').trim())
    .filter((name) => name.length > 0);
}

/**
 * Bumps 2-token sliding-window bigram counts across every harvested party
 * name (design.md D2). Adapter-owned, shared between `TRF5Site` (which
 * writes during `discover()`) and `TRF5Traversal` (which reads during
 * `split()`) — the one new coupling this change introduces.
 */
export class NameHarvester {
  private readonly freq = new Map<string, number>();

  observe(partyNames: readonly string[]): void {
    for (const name of partyNames) {
      const words = tokens(name);
      for (let index = 0; index + 1 < words.length; index += 1) {
        const bigram = `${words[index]} ${words[index + 1]}`;
        this.freq.set(bigram, (this.freq.get(bigram) ?? 0) + 1);
      }
    }
  }

  /**
   * Bigrams ranked by descending observed frequency, excluding any already
   * emitted for the cell being probed (trf5-adapter spec, "MUST NOT emit a
   * name probe it has already emitted for the same cell"). Ties keep
   * first-observed order — `Array.prototype.sort` is a stable sort — so the
   * result is deterministic for a given sequence of `observe()` calls.
   */
  ranked(exclude: ReadonlySet<string> = new Set()): readonly string[] {
    return [...this.freq.entries()]
      .filter(([bigram]) => !exclude.has(bigram))
      .sort((a, b) => b[1] - a[1])
      .map(([bigram]) => bigram);
  }
}
