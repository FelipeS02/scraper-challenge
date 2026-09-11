import { describe, expect, it } from 'vitest';
import {
  extractPartyNames,
  mergeRanked,
  NameHarvester,
  STATIC_SURNAME_BIGRAMS,
} from '../../name-probes.js';

describe('STATIC_SURNAME_BIGRAMS — the guaranteed probe floor (trf5-adapter spec, "Static Name-Probe Dictionary Floor")', () => {
  it('is non-empty and every declared entry has at least two space-separated tokens', () => {
    expect(STATIC_SURNAME_BIGRAMS.length).toBeGreaterThan(0);
    for (const bigram of STATIC_SURNAME_BIGRAMS) {
      expect(bigram.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('mergeRanked — one frequency-ranked queue: static dictionary + adaptive harvest (design.md D2)', () => {
  it('returns the dictionary in declared order when nothing has been harvested', () => {
    expect(mergeRanked(STATIC_SURNAME_BIGRAMS, [])).toEqual(STATIC_SURNAME_BIGRAMS);
  });

  it('puts harvested probes ahead of unused dictionary entries, deduplicating overlap', () => {
    const dictionary = ['DA SILVA', 'DOS SANTOS', 'DE OLIVEIRA'];
    const harvested = ['SEGURO SOCIAL', 'DA SILVA'];

    const queue = mergeRanked(dictionary, harvested);

    // Harvested entries lead; "DA SILVA" is not duplicated even though it also
    // appears, unused, in the static dictionary.
    expect(queue).toEqual(['SEGURO SOCIAL', 'DA SILVA', 'DOS SANTOS', 'DE OLIVEIRA']);
  });

  it('rejects a single-token probe value before it becomes a work unit (Name-Substring Partition Level)', () => {
    expect(() => mergeRanked(['DA SILVA'], ['SOLO'])).toThrow();
    expect(() => mergeRanked(['SOLO'], [])).toThrow();
  });
});

describe('extractPartyNames — reads the already-parsed parties column (no extra request)', () => {
  it('splits an "A e outros (N) X B" parties string into both party names', () => {
    const names = extractPartyNames(
      'INSTITUTO NACIONAL DE SEGURO SOCIAL e outros (2) X MARIA DA SILVA',
    );
    expect(names).toEqual(['INSTITUTO NACIONAL DE SEGURO SOCIAL', 'MARIA DA SILVA']);
  });

  it('splits a plain "A X B" parties string with no "e outros" suffix', () => {
    expect(extractPartyNames('PARTE SINTETICA UM X PARTE SINTETICA DOIS')).toEqual([
      'PARTE SINTETICA UM',
      'PARTE SINTETICA DOIS',
    ]);
  });

  it('returns an empty list for blank parties text', () => {
    expect(extractPartyNames('')).toEqual([]);
    expect(extractPartyNames('   ')).toEqual([]);
  });
});

describe('NameHarvester — adaptive extension ranked ahead of unused dictionary entries (trf5-adapter spec, "Adaptive Name-Probe Extension")', () => {
  it('starts empty: ranked() returns nothing before any party name is observed', () => {
    const harvester = new NameHarvester();
    expect(harvester.ranked()).toEqual([]);
  });

  it('orders bigrams by descending frequency across harvested party names', () => {
    const harvester = new NameHarvester();
    harvester.observe(['REGIONAL DE SEGURO']); // bigrams: REGIONAL DE, DE SEGURO
    harvester.observe(['REGIONAL DE PREVIDENCIA']); // bigrams: REGIONAL DE, DE PREVIDENCIA
    harvester.observe(['MARIA DA SILVA']); // bigrams: MARIA DA, DA SILVA

    const ranked = harvester.ranked();

    // "REGIONAL DE" occurs twice — every other bigram occurs once.
    expect(ranked[0]).toBe('REGIONAL DE');
    expect(ranked).toContain('DE SEGURO');
    expect(ranked).toContain('DE PREVIDENCIA');
    expect(ranked).toContain('MARIA DA');
    expect(ranked).toContain('DA SILVA');
  });

  it('excludes name probes already emitted for the same cell', () => {
    const harvester = new NameHarvester();
    harvester.observe(['REGIONAL DE SEGURO']);

    const ranked = harvester.ranked(new Set(['REGIONAL DE']));

    expect(ranked).not.toContain('REGIONAL DE');
    expect(ranked).toContain('DE SEGURO');
  });

  it('merges its ranked output ahead of unused dictionary entries via mergeRanked', () => {
    const harvester = new NameHarvester();
    harvester.observe(['REGIONAL DE SEGURO', 'REGIONAL DE SEGURO']); // reinforced twice

    const queue = mergeRanked(['DA SILVA', 'DOS SANTOS'], harvester.ranked());

    expect(queue).toEqual(['REGIONAL DE', 'DE SEGURO', 'DA SILVA', 'DOS SANTOS']);
  });
});
