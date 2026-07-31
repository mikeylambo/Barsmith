#!/usr/bin/env node
// ─────────────────────────────────────────────
// WORD BANK AUDIT  (run via `npm run audit-wordbank`)
//
// Diagnostic only — this script never edits the banks. `validate-wordbank.js` is the
// build gate that says a bank is *well-formed*; this says whether it is *good*.
//
// What it looks for, and why:
//
//   Rhyme-family concentration.  The defect that motivated this audit is not that
//   tier 3 contains abstract words — it is that 175 of them end in `-ation`, and those
//   all rhyme with each other perfectly. On the hardest level, roughly one prompt in
//   nine hands the writer a free rhyme, which is the tier failing at its own job. The
//   family tables below are the measurement of that.
//
//   Derivational duplication.  `apartment` next to `apart`, `argument` next to `argue`.
//   Same root drilled twice. It inflates the count without widening the vocabulary,
//   which is the signature of a list padded from a frequency dump rather than curated.
//
//   Syllable-band drift.  The tiers are a difficulty ramp by syllabic weight. A word
//   in the wrong tier quietly breaks that promise.
//
// Writes docs/wordbank-audit.md, which is the reviewable artifact — the point is to
// approve a dozen family-level decisions rather than read six hundred words.
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

// ── Derivational duplication ──
// A word is padding if stripping its suffix leaves something already in the banks.
function derivations(words) {
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
say('| Tier | Words | In syllable band | Abstraction suffixes | Largest rhyme family |');
say('| --- | --- | --- | --- | --- |');
for (const t of [1, 2, 3]) {
  const bank = tiers[t];
  const inBand = bank.filter(w => BAND[t](syllables(w))).length;
  const abstract = bank.filter(familyOf).length;
  const top = tally(bank, familyOf)[0];
  const topCell = top ? `\`-${top[0]}\` ${top[1].length} (${pct(top[1].length, bank.length)})` : 'none';
  say(`| ${t} | ${bank.length} | ${pct(inBand, bank.length)} | ${abstract} (${pct(abstract, bank.length)}) | ${topCell} |`);
}
say();

// ── What it costs to fix the worst concentration ──
// Reported for the largest family in the worst tier, because that is the number that
// decides the strategy. Growing the bank dilutes a family's share without removing any
// word; cutting shrinks the family directly. The arithmetic is unforgiving in one
// direction, which is worth seeing before committing to it.
{
  const bank = tiers[3];
  const [name, words] = tally(bank, clusterOf)[0];
  say('## Fixing the worst family');
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
  say('The affordable path is a hybrid: remove the derivational duplicates listed below,');
  say('which narrow no vocabulary because the root is already in the bank, then grow with');
  say('rhyme-diverse words. Every word added anywhere else in the tier also lowers this');
  say('share, so growth still helps — it just cannot carry the whole distance.');
  say();
}

for (const t of [1, 2, 3]) {
  const bank = tiers[t];
  const families = tally(bank, familyOf);
  const tails = tally(bank, tailOf);
  const derived = derivations(bank);
  const strays = bank.filter(w => !BAND[t](syllables(w)));

  say(`## Tier ${t} — ${bank.length} words (${BAND_LABEL[t]})`);
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

  say('### Derivational duplication');
  say();
  if (derived.length) {
    say(`**${derived.length}** words are a suffixed form of a word already in the banks —`);
    say('the same root drilled twice. Removing these narrows no vocabulary.');
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

writeFileSync(join(root, 'docs', 'wordbank-audit.md'), `${lines.join('\n')}\n`, 'utf-8');

// ── Terminal summary ──
console.log('Word bank audit\n');
for (const t of [1, 2, 3]) {
  const bank = tiers[t];
  const abstract = bank.filter(familyOf).length;
  const top = tally(bank, familyOf)[0];
  const derived = derivations(bank).length;
  const strays = bank.filter(w => !BAND[t](syllables(w))).length;
  console.log(`  tier ${t}: ${bank.length} words`);
  console.log(`     abstraction suffixes : ${abstract} (${pct(abstract, bank.length)})`);
  console.log(`     largest rhyme family : ${top ? `-${top[0]} ${top[1].length} (${pct(top[1].length, bank.length)})` : 'none'}`);
  console.log(`     derivational dupes   : ${derived}`);
  console.log(`     out of syllable band : ${strays}`);
}
console.log('\nWrote docs/wordbank-audit.md');
