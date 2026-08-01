// ─────────────────────────────────────────────
// RHYME ENGINE
//
// Barsmith called itself a rhyme reference while getting its rhymes from Datamuse over
// the network — the one feature a writer reaches for most was the one that died in
// airplane mode, inside an app that is otherwise offline-first. This replaces that.
//
// It also does something Datamuse does not. A perfect-rhyme list is a beginner's tool;
// the writers this is for — technical, multisyllabic, punchline-driven — work in
// *multis*: runs where the vowels line up across two, three, four syllables and the
// consonants are free to drift. So results are grouped by what kind of rhyme they are:
//
//   perfect    identical from the last stressed vowel on      nation / station
//   multi      2+ syllables of vowel AND consonant agreement  laboratory / lavatory
//   slant      the last vowel holds, the coda bends           time / line
//   assonance  the vowel run matches, consonants are free     hostile / offshore
//
// The unit of comparison is the **rime**: a vowel plus every consonant up to the next
// vowel. Not linguistically perfect syllabification — `astray` splits as a-stray rather
// than as-tray — but rhyme cares about a vowel and what follows it, which is exactly
// what a rime is. Comparing rime-by-rime from the end also sidesteps the alignment
// problem a raw phoneme walk has, where `cat` and `cast` fall out of step on the coda
// and score as unrelated.
//
// Pronunciations come from the CMU Pronouncing Dictionary (BSD-2-clause), built into a
// compact payload by scripts/build-rhyme-data.py. See src/data/PRONUNCIATION-LICENSE.
// ─────────────────────────────────────────────

import payloadUrl from '../data/pronunciations.txt?url';

// Must match ALPHABET in scripts/build-rhyme-data.py exactly, index for index.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM';
const PHONEMES = [
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'B', 'CH', 'D', 'DH', 'EH', 'ER', 'EY', 'F',
  'G', 'HH', 'IH', 'IY', 'JH', 'K', 'L', 'M', 'N', 'NG', 'OW', 'OY', 'P', 'R', 'S',
  'SH', 'T', 'TH', 'UH', 'UW', 'V', 'W', 'Y', 'Z', 'ZH',
];
/** ARPAbet name -> its encoded character. */
const CH_OF = Object.fromEntries(PHONEMES.map((p, i) => [p, ALPHABET[i]]));
const VOWEL_CHARS = new Set(PHONEMES.filter(p => 'AEIOU'.includes(p[0])).map(p => CH_OF[p]));
const isVowel = (ch) => VOWEL_CHARS.has(ch);

// ── Phonetic similarity ──────────────────────────────────────────────────────
// A slant rhyme is not "any mismatch". `time`/`line` works because /m/ and /n/ are both
// nasals; `time`/`life` does not. These groups are what let the engine tell those apart
// instead of treating every non-identical coda as equally distant.
//
// Written in ARPAbet names rather than encoded characters on purpose: the encoding is an
// implementation detail of the payload, and a hand-transcribed group like `['p','t','k']`
// silently means HH/K/EH instead of P/T/K. Mapped through CH_OF, a typo is a crash.

const GROUPS = [
  ['P', 'T', 'K'],                    // voiceless stops
  ['B', 'D', 'G'],                    // voiced stops
  ['CH', 'JH'],                       // affricates
  ['F', 'TH', 'S', 'SH', 'HH'],       // voiceless fricatives
  ['V', 'DH', 'Z', 'ZH'],             // voiced fricatives
  ['M', 'N', 'NG'],                   // nasals
  ['L', 'R'],                         // liquids
  ['W', 'Y'],                         // glides
  ['IY', 'IH', 'EY', 'EH', 'AE'],     // front vowels
  ['AH', 'ER'],                       // central vowels
  ['UW', 'UH', 'OW', 'AO', 'AA'],     // back vowels
  ['AY', 'AW', 'OY'],                 // diphthongs
];
// Voicing pairs — a nearer miss than a shared manner class alone. `bed`/`bet` lands
// closer than `bed`/`beg`.
const VOICING_PAIRS = [
  ['P', 'B'], ['T', 'D'], ['K', 'G'], ['CH', 'JH'],
  ['F', 'V'], ['TH', 'DH'], ['S', 'Z'], ['SH', 'ZH'],
];

const SIMILARITY = (() => {
  const sim = new Map();
  const key = (a, b) => (a < b ? a + b : b + a);
  const set = (an, bn, v) => {
    const a = CH_OF[an], b = CH_OF[bn];
    if (!a || !b) throw new Error(`unknown phoneme in similarity table: ${an}/${bn}`);
    if (a !== b && (sim.get(key(a, b)) ?? 0) < v) sim.set(key(a, b), v);
  };
  for (const group of GROUPS) for (const a of group) for (const b of group) set(a, b, 0.5);
  for (const [a, b] of VOICING_PAIRS) set(a, b, 0.75);
  return sim;
})();

/** 1 for identical, 0.75/0.5 for a near miss, 0 for unrelated. */
function phoneSim(a, b) {
  if (a === b) return 1;
  return SIMILARITY.get(a < b ? a + b : b + a) ?? 0;
}

/**
 * Compare two coda strings (0+ consonants) as a whole.
 *
 * Weighted from the end, steeply. The last consonant is the one the ear is waiting for,
 * and averaging it evenly against everything before it produces false matches: `orange`
 * and `government` both end in a vowel plus N plus one more consonant, and score as a
 * rhyme on the strength of the shared N even though JH and T have nothing in common.
 * Weighting the final position twice as heavily as the one before it settles that.
 */
function codaSim(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0.15; // one ends open, the other closed
  const n = Math.min(a.length, b.length);
  let total = 0;
  let weightSum = 0;
  for (let i = 1; i <= n; i++) {
    const w = 1 / i;
    total += phoneSim(a[a.length - i], b[b.length - i]) * w;
    weightSum += w;
  }
  const lengthPenalty = n / Math.max(a.length, b.length);
  return (total / weightSum) * lengthPenalty;
}

// ── Decoding ─────────────────────────────────────────────────────────────────

/**
 * Split an encoded pronunciation into rimes, from the front.
 * Returns `{ rimes: [{ v, stress, coda }], onset }` — `onset` is any consonant run
 * before the first vowel, kept because a perfect rhyme requires the onset to *differ*.
 */
function toRimes(enc) {
  const rimes = [];
  let onset = '';
  let i = 0;
  while (i < enc.length) {
    const ch = enc[i];
    if (isVowel(ch)) {
      rimes.push({ v: ch, stress: enc[i + 1], coda: '' });
      i += 2;
    } else {
      if (rimes.length === 0) onset += ch;
      else rimes[rimes.length - 1].coda += ch;
      i += 1;
    }
  }
  return { rimes, onset };
}

/** Human-readable ARPAbet, for showing a writer what the engine actually heard. */
function toArpabet(enc) {
  const out = [];
  for (let i = 0; i < enc.length; i++) {
    const idx = ALPHABET.indexOf(enc[i]);
    if (idx < 0) continue;
    const p = PHONEMES[idx];
    if (isVowel(enc[i])) { out.push(p + enc[i + 1]); i++; }
    else out.push(p);
  }
  return out.join(' ');
}

/**
 * Index of the rime carrying primary stress, counted from the end.
 * Everything from there on is what a perfect rhyme has to reproduce, which is why
 * `banana`/`bandana` rhyme on two syllables and `nation`/`station` on two as well,
 * while `orange` has almost nothing to rhyme with.
 */
function stressedFromEnd(rimes) {
  for (let i = rimes.length - 1; i >= 0; i--) if (rimes[i].stress === '1') return rimes.length - i;
  return 1;
}

/**
 * The last `n` rimes, exactly — the key a perfect rhyme is looked up on.
 *
 * Deliberately *not* anchored to the candidate's own stress. Keying each word by where
 * its own primary stress falls means `time` and `lifetime` get different keys and never
 * meet, which is wrong: a rhyme is the query's stressed tail reappearing at the end of
 * another word, and where that other word carries its main stress is not the query's
 * business. So every word is indexed at depths 1-4 and the query looks up at its own.
 */
const MAX_TAIL = 4;
const tailKey = (rimes, n) => rimes.slice(rimes.length - n).map(r => r.v + r.coda).join('|');

/** Last n vowels, ignoring consonants entirely — the assonance spine. */
const spineKey = (rimes, n) => rimes.slice(-n).map(r => r.v).join('');

/**
 * Does a matching vowel run actually sound like a rhyme?
 *
 * Two tests, both learned from the output. A run of unstressed schwas is not a rhyme
 * feature — schwa is the most common vowel in English, so `cinema` matching `above`,
 * `london` and `services` on "AH-AH" is noise, not assonance. And a run only rhymes
 * when the stress lands in the same place: `money` and `police` share the vowels AH-IY
 * in that order, but one is MUN-ey and the other puh-LEECE, so they do not rhyme.
 *
 * Primary and secondary stress count as the same thing here — the ear hears stressed
 * or not, and holding out for an exact 1-vs-2 match would drop `laboratory`/`stories`.
 */
/**
 * Does the rhyme land on the beat in both words?
 *
 * `month` and `once` rhyme — both stressed, MUNTH and WUNCE. `month` and `balance` do
 * not, even though the final segments are just as close, because balance's last syllable
 * is unstressed: BAL-ance. Without this, a one-syllable query pulls in every
 * `-ance`/`-ence` word in the language and buries the rhymes that actually work.
 *
 * Only the final syllable is tested, and no stress is required of either — `cinema` and
 * `helena` both end unstressed and rhyme on the syllable before, which is a real result
 * that a "must be stressed" rule would throw away.
 */
/**
 * Two stress marks are incompatible only when one is primary and the other is none.
 *
 * Secondary stress is a wildcard because CMU uses it for two different things. In
 * `lifetime` (L AY1 F T AY2 M) the AY2 is a genuinely stressed full diphthong, and it
 * must rhyme with `time`. In `company` (K AH1 M P AH0 N IY2) the IY2 is the reduced
 * word-final "-y", which nobody stresses, and it must rhyme with `money`. Nothing in the
 * annotation separates them, so insisting on an answer would break one case to fix the
 * other.
 */
const stressAgrees = (x, y) => x === '2' || y === '2' || (x !== '0') === (y !== '0');

const finalStressAgrees = (a, b) =>
  stressAgrees(a[a.length - 1].stress, b[b.length - 1].stress);

function stressRunMatches(a, b, n) {
  let anyStressed = false;
  for (let i = 1; i <= n; i++) {
    const sa = a[a.length - i].stress;
    const sb = b[b.length - i].stress;
    if (!stressAgrees(sa, sb)) return false;
    if (sa !== '0' && sb !== '0') anyStressed = true;
  }
  return anyStressed;
}

// ── Index ────────────────────────────────────────────────────────────────────

let index = null;
let loading = null;

function buildIndex(text) {
  const words = [];
  const encs = [];
  const freqs = [];
  const rimesOf = [];
  const byTail = [null, new Map(), new Map(), new Map(), new Map()]; // exact tail, depth 1..4
  const bySpine = [null, new Map(), new Map(), new Map()];           // vowel run, length 1..3
  const byWord = new Map();

  for (const line of text.split('\n')) {
    if (!line) continue;
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const word = line.slice(0, sp);
    const rest = line.slice(sp + 1);
    const enc = rest.slice(0, -1);
    const freq = +rest[rest.length - 1];
    const { rimes, onset } = toRimes(enc);
    if (!rimes.length) continue;

    const id = words.length;
    words.push(word); encs.push(enc); freqs.push(freq);
    rimesOf.push({ rimes, onset });
    byWord.set(word, id);

    for (let n = 1; n <= MAX_TAIL && n <= rimes.length; n++) {
      const k = tailKey(rimes, n);
      let b = byTail[n].get(k);
      if (!b) byTail[n].set(k, (b = []));
      b.push(id);
    }
    for (let n = 1; n <= 3 && n <= rimes.length; n++) {
      const k = spineKey(rimes, n);
      let b = bySpine[n].get(k);
      if (!b) bySpine[n].set(k, (b = []));
      b.push(id);
    }
  }
  return { words, encs, freqs, rimesOf, byTail, bySpine, byWord };
}

/**
 * Load the pronunciation payload. Kept out of the main bundle deliberately: it is
 * ~290KB gzipped against the app's ~97KB, and nothing on the idle screen needs it, so
 * paying for it at first paint would slow the one thing the app is supposed to be fast
 * at. The service worker precaches it, so it is there offline from the second visit on.
 */
export function loadRhymeIndex() {
  if (index) return Promise.resolve(index);
  if (!loading) {
    loading = fetch(payloadUrl)
      .then(r => { if (!r.ok) throw new Error(`rhyme payload ${r.status}`); return r.text(); })
      .then(text => { index = buildIndex(text); return index; })
      .catch(err => { loading = null; throw err; });
  }
  return loading;
}

/** Test seam: build an index from a literal payload rather than fetching. */
export function _setIndexFromText(text) {
  index = buildIndex(text);
  loading = Promise.resolve(index);
  return index;
}
export function _resetIndex() { index = null; loading = null; }

// ── Query ────────────────────────────────────────────────────────────────────

/**
 * How many trailing rimes agree exactly, and how well the deepest disagreement holds up.
 * Returns { depth, score } where depth counts fully-matching trailing syllables.
 */
function compareRimes(a, b) {
  let depth = 0;
  let score = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 1; i <= n; i++) {
    const ra = a[a.length - i];
    const rb = b[b.length - i];
    const vs = phoneSim(ra.v, rb.v);
    if (vs === 0) break;
    const cs = codaSim(ra.coda, rb.coda);
    // A syllable only counts toward depth when it is a real match, not a near one —
    // otherwise "depth 3" would promise more than it delivers.
    if (vs === 1 && cs === 1) depth++;
    else { score += (vs * 0.6 + cs * 0.4) / i; break; }
    score += 1 / i;
  }
  return { depth, score };
}

export const RESULT_CAP = 60;

// A depth-1 match — the final syllable reproduced exactly — always scores above 1.0,
// so this threshold's real job is deciding which *depth-0* candidates are close enough
// to call slant. `time`/`line` clears it (both nasal codas); `time`/`life` does not.
const SLANT_FLOOR = 0.75;

/**
 * Everything the engine knows about how a word rhymes.
 *
 * Groups are exclusive and ordered by usefulness — a word appears in the strongest
 * group it qualifies for and nowhere else, so scanning four short lists beats scanning
 * one long list four times.
 */
export function findRhymes(rawWord) {
  const word = String(rawWord || '').trim().toLowerCase();
  if (!index) throw new Error('rhyme index not loaded — await loadRhymeIndex() first');

  const empty = {
    word, found: false, phonemes: null, syllables: 0,
    perfect: [], multi: [], slant: [], assonance: [], homophones: [],
  };
  if (!word || /[^a-z'-]/.test(word)) return empty;

  const id = index.byWord.get(word);
  if (id === undefined) return empty;

  const self = index.rimesOf[id];
  const selfRimes = self.rimes;
  // How many trailing syllables a perfect rhyme has to reproduce: everything from this
  // word's own primary stress onward.
  const depthNeeded = Math.min(stressedFromEnd(selfRimes), MAX_TAIL, selfRimes.length);

  const seen = new Set([id]);
  const perfect = [], multi = [], slant = [], assonance = [], homophones = [];

  const entry = (cid, extra) => ({
    word: index.words[cid],
    syllables: index.rimesOf[cid].rimes.length,
    freq: index.freqs[cid],
    ...extra,
  });

  // 1. Perfect — the whole stressed tail reappears at the end of the candidate. An
  //    identical pronunciation is a homophone rather than a rhyme; so is a word that
  //    matches on the onset too, which is the same sound twice over.
  for (const cid of index.byTail[depthNeeded].get(tailKey(selfRimes, depthNeeded)) || []) {
    if (seen.has(cid)) continue;
    seen.add(cid);
    const cand = index.rimesOf[cid];
    if (index.encs[cid] === index.encs[id]) homophones.push(entry(cid, {}));
    else if (cand.onset === self.onset && cand.rimes.length === selfRimes.length) homophones.push(entry(cid, {}));
    else if (finalStressAgrees(selfRimes, cand.rimes)) perfect.push(entry(cid, { depth: depthNeeded }));
    // Segments line up but the stress does not — `see` against `coffee`. Real, and
    // usable, but not a perfect rhyme; demoted rather than dropped.
    else slant.push(entry(cid, { depth: 0, ...compareRimes(selfRimes, cand.rimes) }));
  }

  // 2/3/4. Everything else comes off the vowel spine, deepest first, so a word agreeing
  //        on three syllables is considered before one agreeing on one.
  //
  //        Bucketed by how good the match actually is, not by which index found it.
  //        `pilfer` reaches `silver` through the two-vowel spine, but it agrees on the
  //        final syllable outright and its remaining coda differs only by voicing — that
  //        is the textbook slant rhyme for a word with no perfect one, and filing it
  //        under assonance because of the index it came from would bury it.
  for (let n = 3; n >= 1; n--) {
    if (selfRimes.length < n) continue;
    for (const cid of index.bySpine[n].get(spineKey(selfRimes, n)) || []) {
      if (seen.has(cid)) continue;
      seen.add(cid);
      const candRimes = index.rimesOf[cid].rimes;
      const { depth, score } = compareRimes(selfRimes, candRimes);
      if (depth >= 2) multi.push(entry(cid, { depth, score }));
      else if (score >= SLANT_FLOOR && finalStressAgrees(selfRimes, candRimes)) {
        slant.push(entry(cid, { depth, score }));
      }
      // A matching vowel *run* is a real tool even with the consonants free. A single
      // matching vowel with an unrelated coda is not — for a one-syllable query that
      // would return every word sharing a vowel, which is thousands of them. And the run
      // only counts if the stress falls the same way; see stressRunMatches.
      else if (n >= 2 && stressRunMatches(selfRimes, candRimes, n)) {
        assonance.push(entry(cid, { depth, score }));
      }
    }
  }

  // Rank: how good the rhyme is first, then how usable the word is. A writer scanning a
  // list wants the strong, familiar options at the top and the obscure ones available
  // rather than absent.
  const byScore = (a, b) => (b.depth - a.depth) || (b.score - a.score) || (b.freq - a.freq)
    || a.word.localeCompare(b.word);
  const byUse = (a, b) => (b.freq - a.freq) || (a.syllables - b.syllables) || a.word.localeCompare(b.word);

  return {
    word,
    found: true,
    phonemes: toArpabet(index.encs[id]),
    syllables: selfRimes.length,
    stressedSyllablesFromEnd: stressedFromEnd(selfRimes),
    homophones: homophones.sort(byUse).slice(0, 12),
    perfect: perfect.sort(byUse).slice(0, RESULT_CAP),
    multi: multi.sort(byScore).slice(0, RESULT_CAP),
    slant: slant.sort(byScore).slice(0, RESULT_CAP),
    assonance: assonance.sort(byScore).slice(0, RESULT_CAP),
  };
}

// ── Phrase rhymes ────────────────────────────────────────────────────────────
//
// `orange` / `door hinge`. This is the move the writers Barsmith is for actually make,
// and the reason "nothing rhymes with orange" is a punchline rather than a fact. No
// rhyme API offers it, because it is not a lookup — it is a search over pairs.
//
// The construction: take the query's stressed tail, cut it at every syllable boundary,
// and look for a word ending in the back half and a word ending in the front half. Both
// halves are matched on their *ends* rather than whole, so `door hinge` works even
// though `door` is not literally "AO R" — it ends that way, and in a bar the front word
// carries whatever precedes it.

/** Phonemes from the primary-stressed vowel to the end, stress stripped. */
function stressedTail(rimes) {
  const depth = stressedFromEnd(rimes);
  return rimes.slice(rimes.length - depth);
}

/**
 * Words that cannot carry the back half of a phrase rhyme.
 *
 * The back word is where the rhyme lands, so it has to be something a listener registers.
 * Without this, `wasabi` returns "job be / job he / job me" and `cinema` returns
 * "aluminium a / aluminium the" — grammatically phrases, rhythmically nothing. They stay
 * allowed at the *front*, where they are doing the job function words do: "for plunge"
 * is a perfectly good half of a bar.
 */
const FUNCTION_WORDS = new Set(('a an the of to and in is it be he we me she they you i at on or for as but by do so no '
  + 'my up if us am are was were has had have will can its his her him them then than that this these those with from '
  + 'not all any may more most such some what when which who why how there here into out off over under been being does '
  + 'did would could should shall must our your their who whom whose about after before '
  // Prefixes and foreign articles CMU carries as headwords. They clear any frequency
  // floor because they are common inside names, and read as typos in a bar.
  + 'de la le el et al da na ka pre re un bi ex non pro co sub anti semi').split(' '));

/** Frequency bucket a word must clear to appear in a generated phrase (0-9 scale). */
const PHRASE_FREQ_FLOOR = 3;

/** Phrases sharing a front word, past this many, stop adding anything. */
const PER_FRONT_CAP = 3;

/**
 * Two-word phrases whose combined ending reproduces the query's stressed tail.
 *
 * Cheap because both halves are index lookups, not scans: the back half is an exact tail
 * key, and the front half is matched against the same index at a shallower depth.
 *
 * @returns {Array<{phrase: string, head: string, tail: string, score: number}>}
 */
export function findPhraseRhymes(rawWord, limit = 40) {
  const word = String(rawWord || '').trim().toLowerCase();
  if (!index) throw new Error('rhyme index not loaded — await loadRhymeIndex() first');
  const id = index.byWord.get(word);
  if (id === undefined) return [];

  const tail = stressedTail(index.rimesOf[id].rimes);
  // A one-syllable tail cannot be split across two words, and past four the phrase stops
  // reading as a phrase.
  if (tail.length < 2 || tail.length > 4) return [];

  const out = [];
  const seen = new Set();

  for (let cut = 1; cut < tail.length; cut++) {
    const front = tail.slice(0, cut);
    const back = tail.slice(cut);

    const backIds = index.byTail[back.length]?.get(tailKey(back, back.length)) || [];
    const frontIds = index.byTail[front.length]?.get(tailKey(front, front.length)) || [];
    if (!backIds.length || !frontIds.length) continue;

    // Both halves have to be roughly the size of the slot they fill. Matching purely on
    // word endings otherwise lets a four-syllable word answer a one-syllable front:
    // `cinema` came back as "aluminium a" and "molybdenum the", which are phrases only
    // in the sense that they contain a space.
    const fits = (wid, slot) => index.rimesOf[wid].rimes.length <= slot.length + 1;
    const bySize = (a, b) => (index.rimesOf[a].rimes.length - index.rimesOf[b].rimes.length)
      || (index.freqs[b] - index.freqs[a]);

    // A generated phrase is held to a higher bar than a looked-up word: nobody sees an
    // obscure entry unless they type it, but a phrase puts two of them side by side and
    // presents the result as a suggestion. `gul`, `de` and `pre` are in the payload
    // legitimately and have no business in a bar.
    const common = (wid) => index.freqs[wid] >= PHRASE_FREQ_FLOOR;

    const fronts = frontIds
      .filter(fid => fid !== id && fits(fid, front) && common(fid))
      .sort(bySize).slice(0, 8);
    const backs = backIds
      .filter(bid => bid !== id && fits(bid, back) && common(bid) && !FUNCTION_WORDS.has(index.words[bid]))
      .sort(bySize).slice(0, 8);

    for (const fid of fronts) {
      for (const bid of backs) {
        const phrase = `${index.words[fid]} ${index.words[bid]}`;
        if (seen.has(phrase)) continue;
        seen.add(phrase);
        // Rank by how ordinary both words are and how cleanly each is its own half —
        // a phrase built from two common, exactly-sized words reads as language.
        const tightness = (index.rimesOf[fid].rimes.length === front.length ? 1 : 0)
          + (index.rimesOf[bid].rimes.length === back.length ? 1 : 0);
        out.push({
          phrase,
          head: index.words[fid],
          tail: index.words[bid],
          score: tightness * 10 + index.freqs[fid] + index.freqs[bid],
        });
      }
    }
  }

  // Without a cap the list is one front word conjugated — "burp hull, burp skull, burp
  // dull, burp null" — which reads as one idea, not twelve.
  const perFront = new Map();
  return out
    .sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase))
    .filter(p => {
      const n = (perFront.get(p.head) || 0) + 1;
      perFront.set(p.head, n);
      return n <= PER_FRONT_CAP;
    })
    .slice(0, limit);
}

/** Is this word in the payload at all? Used to decide whether to offer a lookup. */
export const hasPronunciation = (word) =>
  !!index && index.byWord.has(String(word || '').trim().toLowerCase());

/** Syllable count without a full rhyme query. */
export function syllableCount(word) {
  if (!index) return null;
  const id = index.byWord.get(String(word || '').trim().toLowerCase());
  return id === undefined ? null : index.rimesOf[id].rimes.length;
}
