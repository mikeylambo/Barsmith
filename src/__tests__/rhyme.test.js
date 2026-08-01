// @vitest-environment node
//
// The rhyme engine is the reference half of "a writing gym, rhyme reference, and
// idea-capture tool", and it is the one feature where being subtly wrong is worse than
// being absent: a writer can tell a missing rhyme list from a broken one, but not a
// plausible-looking wrong rhyme from a right one. So these assert against the real
// payload rather than a fixture, and most of them pin a specific judgement the engine
// gets right only because of a specific fix.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { _setIndexFromText, _resetIndex, findRhymes, findPhraseRhymes, hasPronunciation, syllableCount } from '../services/rhyme.js';
import { _setDefinitionsFromText, _resetDefinitions, lookupDefinition } from '../services/definitions.js';

const DATA = join(process.cwd(), 'src', 'data');
const has = (result, group, word) => result[group].some(r => r.word === word);
const groupOf = (result, word) =>
  ['perfect', 'multi', 'slant', 'assonance', 'homophones'].find(g => has(result, g, word)) || null;

beforeAll(() => {
  _setIndexFromText(readFileSync(join(DATA, 'pronunciations.txt'), 'utf8'));
});

describe('perfect rhymes', () => {
  it('finds the obvious ones', () => {
    const r = findRhymes('nation');
    expect(has(r, 'perfect', 'station')).toBe(true);
    expect(has(r, 'perfect', 'education')).toBe(true);
  });

  it('matches a word against the END of a longer one, not against its stress', () => {
    // Keying each candidate by where its own primary stress falls meant `time` and
    // `lifetime` got different keys and never met — but a rhyme is the query's stressed
    // tail reappearing at the end of another word, and where that word carries its main
    // stress is not the query's business.
    const r = findRhymes('time');
    expect(has(r, 'perfect', 'lifetime')).toBe(true);
    expect(has(r, 'perfect', 'anytime')).toBe(true);
    expect(has(r, 'perfect', 'crime')).toBe(true);
  });

  it("treats CMU's secondary stress as a wildcard rather than picking a side", () => {
    // `company` is K AH1 M P AH0 N IY2 and `lifetime` is L AY1 F T AY2 M. Both carry a
    // secondary stress on the final syllable, but company's is the reduced "-y" nobody
    // stresses and lifetime's is a full diphthong. Demanding an answer breaks one to fix
    // the other, so secondary agrees with everything.
    expect(has(findRhymes('money'), 'perfect', 'company')).toBe(true);
    expect(has(findRhymes('time'), 'perfect', 'lifetime')).toBe(true);
  });

  it('demotes a match whose stress lands somewhere else', () => {
    // BAL-ance does not rhyme with MONTH however close the final consonants are, and
    // without this a one-syllable query drags in every -ance/-ence word in the language.
    const r = findRhymes('month');
    expect(has(r, 'perfect', 'balance')).toBe(false);
    expect(groupOf(r, 'balance')).toBe(null);
  });

  it('reports honestly that some words have no perfect rhyme', () => {
    for (const word of ['month', 'orange', 'silver', 'purple']) {
      const r = findRhymes(word);
      expect(r.found).toBe(true);
      // `silver` has exactly one, and it is a compound of itself.
      const real = r.perfect.filter(x => !x.word.endsWith(word));
      expect(real, `${word} should have no free-standing perfect rhyme`).toHaveLength(0);
    }
  });

  it('still offers the near misses those words are famous for', () => {
    expect(has(findRhymes('month'), 'slant', 'seventh')).toBe(true);
    expect(has(findRhymes('orange'), 'slant', 'lozenge')).toBe(true);
    expect(has(findRhymes('silver'), 'slant', 'pilfer')).toBe(true);
  });
});

describe('multis', () => {
  it('finds agreement two or more syllables deep', () => {
    const r = findRhymes('sacrament');
    expect(has(r, 'multi', 'adamant')).toBe(true);
    expect(has(r, 'multi', 'detriment')).toBe(true);
    expect(r.multi.every(x => x.depth >= 2)).toBe(true);
  });

  it('handles four-syllable words, where perfect rhymes run out', () => {
    const r = findRhymes('laboratory');
    expect(r.perfect).toHaveLength(0);
    expect(has(r, 'multi', 'lavatory')).toBe(true);
    expect(has(r, 'multi', 'mandatory')).toBe(true);
  });

  it('ranks deeper agreement first', () => {
    const depths = findRhymes('weaponize').multi.map(x => x.depth);
    expect(depths).toEqual([...depths].sort((a, b) => b - a));
  });
});

describe('slant and assonance', () => {
  it('files a strong consonant near-miss as slant, not assonance', () => {
    // `pilfer` reaches `silver` through the two-vowel spine, but it agrees on the final
    // syllable outright and the remaining coda differs only by voicing. Bucketing by
    // which index found a candidate rather than by how good it is buried the one real
    // answer for a word with no perfect rhyme.
    expect(groupOf(findRhymes('silver'), 'pilfer')).toBe('slant');
  });

  it('weights the final consonant hardest, so a shared N is not enough', () => {
    // `orange` and `government` both end vowel + N + one consonant. Averaging positions
    // evenly scored that as a rhyme on the strength of the N, even though JH and T have
    // nothing in common.
    expect(groupOf(findRhymes('orange'), 'government')).toBe(null);
    expect(groupOf(findRhymes('time'), 'line')).toBe('slant');   // M/N, both nasals
    expect(groupOf(findRhymes('time'), 'life')).toBe(null);      // M/F, unrelated
  });

  it('does not call a run of unstressed schwas assonance', () => {
    // Schwa is the most common vowel in English, so matching two of them means nothing.
    // Before the stress test, `cinema` returned `above`, `london` and `services`.
    const r = findRhymes('cinema');
    for (const noise of ['above', 'london', 'services', 'available']) {
      expect(groupOf(r, noise), `${noise} should not be assonance`).toBe(null);
    }
  });

  it('requires the stress to fall in the same place across a vowel run', () => {
    // MUN-ey and puh-LEECE share the vowels AH-IY in that order and do not rhyme.
    expect(groupOf(findRhymes('money'), 'police')).toBe(null);
  });
});

describe('result shape', () => {
  it('never puts the same word in two groups', () => {
    for (const word of ['nation', 'money', 'time', 'silver', 'cinema', 'orange']) {
      const r = findRhymes(word);
      const all = [...r.perfect, ...r.multi, ...r.slant, ...r.assonance, ...r.homophones].map(x => x.word);
      expect(new Set(all).size, `${word} repeated a result across groups`).toBe(all.length);
    }
  });

  it('never returns the query word as its own rhyme', () => {
    for (const word of ['nation', 'time', 'flow', 'money']) {
      const r = findRhymes(word);
      const all = [...r.perfect, ...r.multi, ...r.slant, ...r.assonance, ...r.homophones];
      expect(all.some(x => x.word === word)).toBe(false);
    }
  });

  it('separates homophones from rhymes', () => {
    const r = findRhymes('flow');
    expect(has(r, 'homophones', 'floe')).toBe(true);
    expect(has(r, 'perfect', 'floe')).toBe(false);
    expect(has(findRhymes('hostile'), 'homophones', 'hostel')).toBe(true);
  });

  it('reports the pronunciation it actually used', () => {
    // When a result looks wrong this is what tells a writer whether the engine misheard
    // the word or they simply say it differently than CMU transcribed it.
    expect(findRhymes('orange').phonemes).toBe('AO1 R AH0 N JH');
    expect(findRhymes('cinema').syllables).toBe(3);
    expect(findRhymes('wasabi').stressedSyllablesFromEnd).toBe(2);
  });

  it('handles unknown and malformed input without throwing', () => {
    for (const bad of ['', '   ', 'zzzqqxvy', 'two words', '123', null, undefined]) {
      const r = findRhymes(bad);
      expect(r.found).toBe(false);
      expect(r.perfect).toEqual([]);
    }
  });
});

describe('coverage', () => {
  it('can pronounce every word Barsmith prompts with', () => {
    // Tap-to-Lock sends the prompt straight to the engine, so a bank word the payload
    // cannot pronounce is a dead panel on a word the app itself chose. 151 of them are
    // absent from CMU — compounds like `cashback`, Latinate forms like `weaponization`,
    // loanwords like `wasabi` — so the build derives or hand-authors every one.
    const missing = [];
    for (const tier of ['tier-1', 'tier-2', 'tier-3']) {
      for (const w of JSON.parse(readFileSync(join(DATA, `${tier}.json`), 'utf8'))) {
        if (!hasPronunciation(w)) missing.push(w);
      }
    }
    expect(missing, `no pronunciation for: ${missing.slice(0, 20).join(', ')}`).toEqual([]);
  });

  it('agrees with itself about syllable counts', () => {
    expect(syllableCount('cinema')).toBe(3);
    expect(syllableCount('time')).toBe(1);
    expect(syllableCount('zzzqqxvy')).toBe(null);
  });

  it('returns something usable for the great majority of bank words', () => {
    // Not every word rhymes, but a reference that comes back empty most of the time is
    // not a reference. Sampled across all three tiers.
    const bank = [];
    for (const tier of ['tier-1', 'tier-2', 'tier-3']) {
      bank.push(...JSON.parse(readFileSync(join(DATA, `${tier}.json`), 'utf8')));
    }
    const sample = bank.filter((_, i) => i % 37 === 0);
    const empty = sample.filter(w => {
      const r = findRhymes(w);
      return !r.perfect.length && !r.multi.length && !r.slant.length && !r.assonance.length;
    });
    expect(empty.length / sample.length, `empty for: ${empty.join(', ')}`).toBeLessThan(0.05);
  });
});

describe('index lifecycle', () => {
  it('throws a clear error rather than silently returning nothing when unloaded', () => {
    _resetIndex();
    expect(() => findRhymes('nation')).toThrow(/not loaded/);
    expect(hasPronunciation('nation')).toBe(false);
    _setIndexFromText(readFileSync(join(DATA, 'pronunciations.txt'), 'utf8'));
    expect(findRhymes('nation').found).toBe(true);
  });
});

// Phrase rhymes are the reason "nothing rhymes with orange" is a punchline rather than a
// fact, and they are generated rather than looked up — which makes them the one part of
// the engine that can invent something embarrassing. Most of these pin a filter that
// exists because the unfiltered output was bad.
describe('phrase rhymes', () => {
  const phrases = (w) => findPhraseRhymes(w).map(p => p.phrase);

  it('splits a multi-syllable tail across two words', () => {
    const p = phrases('orange');
    expect(p.length).toBeGreaterThan(0);
    // Every phrase is exactly two words, and the second carries the rhyme.
    expect(p.every(x => x.split(' ').length === 2)).toBe(true);
    expect(p.some(x => /\b(plunge|sponge|lunge)$/.test(x))).toBe(true);
  });

  it('finds the long ones, which is where it earns its keep', () => {
    expect(phrases('laboratory')).toContain('elaborate story');
  });

  it('will not put a function word where the rhyme lands', () => {
    // Unfiltered, `wasabi` returned "job be / job he / job me" and `cinema` returned
    // "aluminium a / aluminium the" — phrases only in that they contain a space.
    for (const word of ['wasabi', 'cinema', 'orange', 'purple', 'hostile']) {
      for (const phrase of phrases(word)) {
        const last = phrase.split(' ')[1];
        expect(['a', 'the', 'be', 'he', 'me', 'we', 'of', 'to', 'de', 'la', 'el'],
          `${word} -> "${phrase}"`).not.toContain(last);
      }
    }
  });

  it('keeps both halves the size of the slot they fill', () => {
    // Matching on word endings alone let a four-syllable word answer a one-syllable
    // front: `cinema` came back as "aluminium a" and "molybdenum the".
    for (const word of ['cinema', 'wasabi', 'purple']) {
      for (const p of findPhraseRhymes(word)) {
        expect(syllableCount(p.head), `${word} -> ${p.phrase}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('does not repeat one front word down the whole list', () => {
    // "burp hull, burp skull, burp dull, burp null" is one idea, not four.
    for (const word of ['purple', 'hostile', 'wasabi']) {
      const heads = findPhraseRhymes(word).map(p => p.head);
      const worst = Math.max(0, ...Object.values(heads.reduce((a, h) => ({ ...a, [h]: (a[h] || 0) + 1 }), {})));
      expect(worst, `${word} leaned on one front word`).toBeLessThanOrEqual(3);
    }
  });

  it('never suggests a phrase containing the query itself', () => {
    for (const word of ['orange', 'cinema', 'purple', 'laboratory']) {
      expect(findPhraseRhymes(word).some(p => p.head === word || p.tail === word)).toBe(false);
    }
  });

  it('returns nothing rather than nonsense when the tail will not split', () => {
    // A one-syllable stressed tail cannot be shared between two words.
    expect(findPhraseRhymes('month')).toEqual([]);
    expect(findPhraseRhymes('time')).toEqual([]);
    expect(findPhraseRhymes('zzzqqxvy')).toEqual([]);
  });
});

describe('offline definitions', () => {
  beforeAll(() => {
    _setDefinitionsFromText(readFileSync(join(DATA, 'definitions.txt'), 'utf8'));
  });

  it('defines the words the panel actually opens on', () => {
    const bank = [];
    for (const tier of ['tier-1', 'tier-2', 'tier-3']) {
      bank.push(...JSON.parse(readFileSync(join(DATA, `${tier}.json`), 'utf8')));
    }
    const undefined_ = bank.filter(w => !lookupDefinition(w));
    // Not every word is in WordNet — coined compounds like `cashback` are not — but a
    // panel that mostly says "no definition" offline is not worth the payload.
    expect(undefined_.length / bank.length).toBeLessThan(0.02);
  });

  it('carries a second sense wherever one exists, which is the whole point', () => {
    // A punchline turns on a word's other meaning; a panel showing only the first sense
    // hides the half that makes the bar.
    const two = ['clip', 'charge', 'iron', 'pitch'].filter(w => (lookupDefinition(w) || []).length > 1);
    expect(two.length).toBeGreaterThanOrEqual(3);
  });

  it('returns a shape the panel can render without knowing the source', () => {
    const d = lookupDefinition('hammer');
    expect(Array.isArray(d)).toBe(true);
    expect(typeof d[0].pos).toBe('string');
    expect(d[0].text.length).toBeGreaterThan(5);
  });

  it('is scoped to the banks, and says nothing rather than guessing outside them', () => {
    // `anvil` has a perfectly good WordNet entry and is deliberately absent: the payload
    // covers the words the panel opens on, and quintupling it to cover the rest would
    // serve a case that does not arise. Outside the banks the network still answers.
    expect(lookupDefinition('anvil')).toBe(null);
    expect(lookupDefinition('zzzqqxvy')).toBe(null);
    expect(lookupDefinition('')).toBe(null);
    _resetDefinitions();
    expect(lookupDefinition('hammer')).toBe(null);
    _setDefinitionsFromText(readFileSync(join(DATA, 'definitions.txt'), 'utf8'));
  });
});
