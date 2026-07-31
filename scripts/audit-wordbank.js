#!/usr/bin/env node
// ─────────────────────────────────────────────
// WORD BANK AUDIT  (run via `npm run audit-wordbank`)
//
// Diagnostic only — this script never edits the banks. `validate-wordbank.js` is the
// build gate that says a bank is *well-formed*; this says whether it is *good*.
//
// What it measures, and why:
//
//   Rhyme-tail diversity.  The most useful number here. Tier 3 is the biggest bank and
//   can end the fewest different ways — fewer even than tier 1, which has half again
//   fewer words. A tier that ends the same way over and over hands out free rhymes on
//   the level that is supposed to be hardest.
//
//   Composition by word class.  This explains the above. Tier 1 is ~96% bare concrete
//   roots, each ending its own way; tier 3 inverted that into ~40% abstract nouns, and
//   abstract nouns all end alike. The tiers were designed as a ramp in word *length*
//   and quietly became a ramp in *abstraction* too, which nothing asked for.
//
//   Rhyme-family and cluster concentration.  Where that abstraction piles up, grouped
//   by sound rather than spelling — `-ation`, `-ization` and `-tion` are one rhyme.
//
//   Shared roots and syllable-band drift.  Both reported with their error modes stated;
//   neither is precise enough to act on without a human reading the list.
//
// Writes docs/wordbank-audit.md. The point is to make the shape of each tier legible so
// additions can be aimed at what is actually missing.
// ─────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(root, 'src', 'data');

const tiers = {
  1: JSON.parse(readFileSync(join(dataDir, 'tier-1.json'), 'utf-8')),
  2: JSON.parse(readFileSync(join(dataDir, 'tier-2.json'), 'utf-8')),
  3: JSON.parse(readFileSync(join(dataDir, 'tier-3.json'), 'utf-8')),
};
const everyWord = new Set([...tiers[1], ...tiers[2], ...tiers[3]]);

// ── Syllables ──
// Vowel groups, minus a trailing silent `e`.
//
// This is an estimate, and the band-drift section below says so. Two known failure
// modes remain, both of which inflate the count:
//
//   * internal silent `e` before a suffix — `safety`, `useful`, `something` all read
//     as three and are two;
//   * vowel hiatus — `stoic` reads as one and is two.
//
// A vowel-group counter cannot fix those without pronunciation data, which this
// container cannot fetch. So band drift is reported as a list to review by eye rather
// than a number to act on directly. Spot-checking suggests roughly one in five of the
// listed words is a false positive; the rest are real.
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;
  let n = (w.match(/[aeiouy]+/g) || []).length;
  // A trailing `e` is silent unless it forms its own syllable. That happens when a
  // CONSONANT precedes `-le` (`ta-ble`, `hus-tle`) — not when a vowel does, where the
  // `e` is silent as usual (`scale`, `rule`, both one syllable).
  const syllabicLe = /[^aeiouy]le$/.test(w);
  if (/e$/.test(w) && !syllabicLe && !/(ee|ye)$/.test(w) && n > 1) n -= 1;
  return Math.max(1, n);
}
const BAND = { 1: n => n === 1, 2: n => n === 2, 3: n => n >= 3 };
const BAND_LABEL = { 1: 'one syllable', 2: 'two syllables', 3: 'three or more' };

// ── Rhyme families ──
// Named suffixes are the readable grouping: they map to a decision a human can make
// ("cut two thirds of the -ation words"). Longest match wins so `-ization` is not
// swallowed by `-ation`.
const SUFFIXES = [
  'ization', 'isation', 'ification', 'ication', 'ability', 'ibility', 'ational',
  'ousness', 'iveness', 'ation', 'ition', 'ution', 'ement', 'ional', 'ivity',
  'ality', 'ility', 'ancy', 'ency', 'ment', 'tion', 'sion', 'ness', 'ance',
  'ence', 'ship', 'hood', 'ism', 'ist', 'ity', 'ive', 'ual', 'ical', 'ally',
];
const familyOf = (w) =>
  SUFFIXES.find(s => w.endsWith(s) && w.length > s.length + 2) || null;

// Spelling families understate the problem, because several of them rhyme with each
// other. `-ation`, `-ization`, `-ification`, `-ition` and plain `-tion` are all /ʃən/:
// to a writer looking for a rhyme they are one family, not five. Clustering by sound is
// what shows the true concentration.
const CLUSTERS = {
  'shun (-tion/-sion)': ['ization', 'isation', 'ification', 'ication', 'ational', 'ation', 'ition', 'ution', 'tion', 'sion'],
  'ity (-ity/-ality)': ['ability', 'ibility', 'ality', 'ility', 'ivity', 'ity'],
  'iv (-ive)': ['iveness', 'ive'],
  'ment (-ment)': ['ement', 'ment'],
  'ness (-ness)': ['ousness', 'ness'],
  'ance (-ance/-ence)': ['ancy', 'ency', 'ance', 'ence'],
  'ism/ist': ['ism', 'ist'],
  'ical/ally': ['ically', 'ical', 'ally'],
};
const clusterOf = (w) => {
  for (const [name, suffixes] of Object.entries(CLUSTERS)) {
    if (suffixes.some(s => w.endsWith(s) && w.length > s.length + 2)) return name;
  }
  return null;
};

// A blunt catch-all for families the named list misses: the terminal four letters.
// Crude, but it surfaces concentration that has no tidy morphological name.
const tailOf = (w) => (w.length >= 5 ? w.slice(-4) : null);

function tally(words, keyFn) {
  const map = new Map();
  for (const w of words) {
    const k = keyFn(w);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(w);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

// ── Shared roots ──
// Words whose stem, after stripping a suffix, is also in the banks.
//
// Reported as information, NOT as a cut list. An earlier version of this script called
// these "padding", which was wrong twice over: string-stripping cannot tell a real
// family (`improve` → `improvement`) from a coincidence (`apart` → `apartment`, which
// comes from Italian and shares nothing), and even a real family is not a defect —
// `improve` and `improvement` are different tools for a writer. What this number
// actually indicates is how much of a tier is morphology rather than new vocabulary.
function sharedRoots(words) {
  const out = [];
  for (const w of words) {
    const s = familyOf(w);
    if (!s) continue;
    const stem = w.slice(0, -s.length);
    const candidates = [stem, `${stem}e`, `${stem}y`, stem.replace(/i$/, ''), stem.replace(/at$/, 'ate')];
    const hit = candidates.find(c => c && c !== w && everyWord.has(c));
    if (hit) out.push([w, hit]);
  }
  return out;
}

// ── Word class ──
// Suffix-based approximation. It cannot tell a noun from a verb for a bare root, which
// is exactly why that bucket is left honestly named rather than guessed at. The useful
// signal is the ratio: a tier made mostly of bare concrete roots reads very differently
// to a writer than one made mostly of abstract nouns.
const ADJ = ['ous', 'ful', 'ive', 'able', 'ible', 'ical', 'ic', 'ish', 'less', 'ary', 'ory', 'al'];
const NOUN = ['tion', 'sion', 'ment', 'ness', 'ity', 'ance', 'ence', 'ism', 'ist', 'age', 'ship', 'hood', 'ure', 'ery'];
const VERB = ['ize', 'ise', 'ify', 'ate', 'en'];
const hasSuffix = (w, s) => w.endsWith(s) && w.length > s.length + 2;
function wordClass(w) {
  if (w.endsWith('ly')) return 'adverb';
  if (w.endsWith('ing') || w.endsWith('ed')) return 'inflected verb';
  if (VERB.some(s => hasSuffix(w, s))) return 'derived verb';
  if (NOUN.some(s => hasSuffix(w, s))) return 'abstract noun';
  if (ADJ.some(s => hasSuffix(w, s))) return 'adjective';
  return 'bare root';
}

// ── Rhyme-tail diversity ──
// The single most useful number in this report. Terminal three letters is a coarse
// stand-in for a rhyme, but it is consistent across tiers, so the comparison is fair:
// how many different ways can this tier end, and how much of it piles into the top few.
function endingStats(words) {
  const c = new Map();
  for (const w of words) {
    if (w.length < 4) continue;
    const k = w.slice(-3);
    c.set(k, (c.get(k) || 0) + 1);
  }
  const sorted = [...c.entries()].sort((a, b) => b[1] - a[1]);
  const top10 = sorted.slice(0, 10).reduce((n, [, v]) => n + v, 0);
  return {
    distinct: sorted.length,
    perThousand: Math.round((1000 * sorted.length) / words.length),
    top10Share: top10 / words.length,
    once: sorted.filter(([, v]) => v === 1).length,
    top: sorted.slice(0, 8),
  };
}

// ── How much work each path implies ──
// With N words in a family and a target share, you can either remove family members or
// dilute them by adding unrelated words. Both numbers are worth seeing before choosing.
const growthTo = (familySize, total, targetShare) =>
  Math.max(0, Math.ceil(familySize / targetShare) - total);
const cutTo = (familySize, total, targetShare) => {
  // Removing k members shrinks both the family and the tier.
  const k = Math.ceil((familySize - targetShare * total) / (1 - targetShare));
  return Math.max(0, k);
};

const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const lines = [];
const say = (s = '') => lines.push(s);

say('# Word bank audit');
say();
say('Generated by `npm run audit-wordbank`. Diagnostic only — no bank is modified.');
say('Re-run after any word pass to see the numbers move.');
say();

say('## Summary');
say();
say('| Tier | Words | Bare roots | Abstract nouns | Distinct endings | Top-10 endings cover |');
say('| --- | --- | --- | --- | --- | --- |');
for (const t of [1, 2, 3]) {
  const bank = tiers[t];
  const cls = tally(bank, wordClass);
  const roots = (cls.find(([k]) => k === 'bare root') || [, []])[1].length;
  const abstract = (cls.find(([k]) => k === 'abstract noun') || [, []])[1].length;
  const e = endingStats(bank);
  say(`| ${t} | ${bank.length} | ${pct(roots, bank.length)} | ${pct(abstract, bank.length)} | ${e.distinct} | ${pct(e.top10Share * bank.length, bank.length)} |`);
}
say();

// ── The headline ──
{
  const e1 = endingStats(tiers[1]);
  const e3 = endingStats(tiers[3]);
  const e2 = endingStats(tiers[2]);
  say('### What that table says');
  say();
  say(`Tier 3 holds ${tiers[3].length} words and can end **${e3.distinct}** different ways.`);
  say(`Tier 1 holds ${tiers[1].length} and can end **${e1.distinct}** ways; tier 2, **${e2.distinct}**.`);
  say();

  // The narrative is derived, not asserted. This audit was written while tier 3 was the
  // narrowest-rhyming bank despite being the biggest; additions have been closing that,
  // so the report has to be able to say when it is fixed rather than repeating a claim
  // that has stopped being true.
  const worst = [1, 2, 3].reduce((a, b) => (endingStats(tiers[a]).distinct <= endingStats(tiers[b]).distinct ? a : b));
  if (worst === 3) {
    say('**The hardest tier is the biggest and rhymes the narrowest.** Its top ten endings');
    say(`cover ${pct(e3.top10Share * tiers[3].length, tiers[3].length)} of it, against ${pct(e1.top10Share * tiers[1].length, tiers[1].length)} for tier 1.`);
    say();
    say('The composition column explains why. Tier 1 is almost entirely bare concrete roots —');
    say('Germanic monosyllables, each ending its own way. Tier 3 inverted that: it is mostly');
    say('Latinate abstractions, and Latinate abstractions all end alike. The tiers were meant');
    say('to be a ramp in *length*; they became a ramp in *abstraction* as well, which nothing');
    say('in the design asked for.');
    say();
    say('So the gap to fill is specific, and it is an addition rather than a subtraction:');
    say('**concrete multisyllabic roots** — three or more syllables, but a thing or an action');
    say('rather than a concept. `carburetor`, `alabaster`, `porcupine`, `metropolis`,');
    say('`kerosene`, `avalanche`, `jackhammer`. Each lands on an ending the tier is short of,');
    say('so they widen the rhyme surface and lower the `-tion` share at the same time.');
  } else {
    say('Tier 3 no longer rhymes narrower than the tiers below it — the condition this audit');
    say('was written to measure. It got there by addition rather than subtraction: concrete');
    say('multisyllabic roots, a thing or an action rather than a concept, each landing on an');
    say('ending the tier was short of.');
    say();
    say('The abstraction is still there — the tables below show where — but it is now diluted');
    say('rather than dominant. Keep placing new words by the same two tests: does it carry a');
    say('second meaning a punchline can turn on, and does it end somewhere the tier is thin?');
  }
  say();
}

// ── What it costs to fix the worst concentration ──
// Reported for the largest family in the worst tier, because that is the number that
// decides the strategy. Growing the bank dilutes a family's share without removing any
// word; cutting shrinks the family directly. The arithmetic is unforgiving in one
// direction, which is worth seeing before committing to it.
{
  const bank = tiers[3];
  const [name, words] = tally(bank, clusterOf)[0];
  say('## Where the concentration sits');
  say();
  say('### Rhyme clusters — tier 3');
  say();
  say('Grouped by sound rather than spelling, because `-ation`, `-ization`, `-ification`');
  say('and plain `-tion` are one rhyme, not four.');
  say();
  say('| Cluster | Count | Share of tier 3 |');
  say('| --- | --- | --- |');
  for (const [cluster, ws] of tally(bank, clusterOf)) {
    say(`| ${cluster} | ${ws.length} | ${pct(ws.length, bank.length)} |`);
  }
  say();
  say(`The **${name}** cluster alone is ${words.length} words — ${pct(words.length, bank.length)} of the tier.`);
  say('Every one rhymes with every other, so the hardest level hands out a free rhyme');
  say(`roughly one prompt in ${Math.round(bank.length / words.length)}.`);
  say();
  say('Two ways to bring that share down:');
  say();
  say('| Target share | Grow: add this many unrelated words | Cut: remove this many family members |');
  say('| --- | --- | --- |');
  for (const target of [0.03, 0.05, 0.07, 0.08]) {
    const add = growthTo(words.length, bank.length, target);
    const cut = cutTo(words.length, bank.length, target);
    say(`| ${(target * 100).toFixed(0)}% | +${add} (tier 3 → ${bank.length + add}) | −${cut} (tier 3 → ${bank.length - cut}) |`);
  }
  say();
  const growTo3 = bank.length + growthTo(words.length, bank.length, 0.03);
  say(`Growing alone cannot realistically fix this: diluting the cluster to 3% would mean a`);
  say(`tier of ${growTo3.toLocaleString('en-US')} words — more than twice the entire current bank.`);
  say('Growth still moves it: every word added anywhere else in the tier lowers this share,');
  say('and words chosen for ending-diversity raise the distinct-endings count at the same');
  say('time. The two problems have one fix. The table above is only saying that reaching a');
  say('3% target on growth alone is not realistic — 8% is, at roughly +2,350 words.');
  say();
}

for (const t of [1, 2, 3]) {
  const bank = tiers[t];
  const families = tally(bank, familyOf);
  const tails = tally(bank, tailOf);
  const derived = sharedRoots(bank);
  const strays = bank.filter(w => !BAND[t](syllables(w)));

  say(`## Tier ${t} — ${bank.length} words (${BAND_LABEL[t]})`);
  say();

  say('### Composition');
  say();
  say('| Word class | Count | Share |');
  say('| --- | --- | --- |');
  for (const [cls, ws] of tally(bank, wordClass)) {
    say(`| ${cls} | ${ws.length} | ${pct(ws.length, bank.length)} |`);
  }
  say();
  const e = endingStats(bank);
  say(`**Endings:** ${e.distinct} distinct (${e.perThousand} per 1,000 words) · top ten cover `
    + `${pct(e.top10Share * bank.length, bank.length)} · ${e.once} endings used exactly once.`);
  say();
  say(`Most crowded: ${e.top.map(([k, v]) => `\`-${k}\` ${v}`).join(' · ')}`);
  say();

  if (families.length) {
    say('### Rhyme families');
    say();
    say('Words within a family rhyme with each other, so a large family means the tier');
    say('repeatedly hands out the same ending.');
    say();
    say('| Family | Count | Share | Cut to reach 3% | Or add to reach 3% | Sample |');
    say('| --- | --- | --- | --- | --- | --- |');
    for (const [name, words] of families.slice(0, 12)) {
      const sample = words.slice(0, 4).join(', ');
      say(`| \`-${name}\` | ${words.length} | ${pct(words.length, bank.length)} | ${cutTo(words.length, bank.length, 0.03)} | +${growthTo(words.length, bank.length, 0.03)} | ${sample} |`);
    }
    say();
  }

  const bigTails = tails.filter(([, w]) => w.length >= Math.max(12, bank.length * 0.015));
  if (bigTails.length) {
    say('### Other shared endings');
    say();
    say('Terminal four letters, to catch concentration the named list above misses.');
    say();
    say(bigTails.slice(0, 12).map(([tail, w]) => `\`-${tail}\` ${w.length}`).join(' · '));
    say();
  }

  say('### Shared roots');
  say();
  if (derived.length) {
    say(`**${derived.length}** words have a stem that is also in the banks. This is *not* a`);
    say('cut list — it measures how much of the tier is morphology rather than new');
    say('vocabulary. Some pairs are genuine families a writer would use differently');
    say('(`improve` / `improvement`); others are string coincidences the check cannot');
    say('distinguish (`apart` / `apartment`, unrelated in origin). Read it as a texture');
    say('signal, not a verdict.');
    say();
    say(derived.slice(0, 40).map(([w, stem]) => `\`${w}\` ← \`${stem}\``).join(' · '));
    if (derived.length > 40) say(`\n…and ${derived.length - 40} more.`);
  } else {
    say('None.');
  }
  say();

  say('### Syllable-band drift');
  say();
  if (strays.length) {
    say(`**~${strays.length}** words look outside the ${BAND_LABEL[t]} band for this tier.`);
    say();
    say('Estimated, not counted — the syllable heuristic misreads internal silent `e`');
    say('(`safety`, `useful`) and vowel hiatus (`stoic`), so expect roughly one in five');
    say('of these to be a false positive. Review by eye before moving anything.');
    say();
    say(strays.slice(0, 40).map(w => `\`${w}\` (~${syllables(w)})`).join(' · '));
    if (strays.length > 40) say(`\n…and ${strays.length - 40} more.`);
  } else {
    say('None — every word is in band.');
  }
  say();
}

mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'wordbank-audit.md'), `${lines.join('\n')}\n`, 'utf-8');

// ── Terminal summary ──
console.log('Word bank audit\n');
for (const t of [1, 2, 3]) {
  const bank = tiers[t];
  const abstract = bank.filter(familyOf).length;
  const top = tally(bank, familyOf)[0];
  const derived = sharedRoots(bank).length;
  const strays = bank.filter(w => !BAND[t](syllables(w))).length;
  console.log(`  tier ${t}: ${bank.length} words`);
  console.log(`     abstraction suffixes : ${abstract} (${pct(abstract, bank.length)})`);
  console.log(`     largest rhyme family : ${top ? `-${top[0]} ${top[1].length} (${pct(top[1].length, bank.length)})` : 'none'}`);
  console.log(`     shared roots         : ${derived}`);
  console.log(`     out of syllable band : ${strays}`);
}
console.log('\nWrote docs/wordbank-audit.md');
