#!/usr/bin/env node
// ─────────────────────────────────────────────
// WORD BANK VALIDATOR
// Run via `npm run validate-wordbank`. Checks the data files for the kinds
// of silent corruption a 3,800-word hand-curated list can accumulate:
// duplicates within/across tiers, empty or malformed entries, stray
// whitespace, and basic shape problems. Exits non-zero on failure so it can
// gate CI or a pre-build hook.
// ─────────────────────────────────────────────

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');

function loadJSON(name) {
  return JSON.parse(readFileSync(join(dataDir, name), 'utf-8'));
}

const tiers = {
  1: loadJSON('tier-1.json'),
  2: loadJSON('tier-2.json'),
  3: loadJSON('tier-3.json'),
};

let errors = 0;
let warnings = 0;

function fail(msg) { console.error(`✗ ${msg}`); errors++; }
function warn(msg) { console.warn(`! ${msg}`); warnings++; }
function ok(msg) { console.log(`✓ ${msg}`); }

// ── Shape checks ──
for (const [tierNum, words] of Object.entries(tiers)) {
  if (!Array.isArray(words)) { fail(`Tier ${tierNum} is not an array`); continue; }
  words.forEach((w, i) => {
    if (typeof w !== 'string') fail(`Tier ${tierNum}[${i}] is not a string: ${JSON.stringify(w)}`);
    else if (w.trim() === '') fail(`Tier ${tierNum}[${i}] is empty`);
    else if (w !== w.trim()) fail(`Tier ${tierNum}[${i}] has leading/trailing whitespace: "${w}"`);
    else if (w !== w.toLowerCase()) warn(`Tier ${tierNum}[${i}] is not lowercase: "${w}"`);
    else if (!/^[a-z'-]+$/.test(w)) {
      // Multi-word prompts are rejected rather than warned about: Tap-to-Lock sends the
      // prompt straight to dictionaryapi.dev, which 404s on a phrase, so the writer
      // would get a broken dictionary panel rather than a definition.
      fail(`Tier ${tierNum}[${i}] is not a single word: "${w}"`);
    }
  });
}
ok(`Shape check complete (Tier 1: ${tiers[1].length}, Tier 2: ${tiers[2].length}, Tier 3: ${tiers[3].length})`);

// ── Duplicates within a tier ──
for (const [tierNum, words] of Object.entries(tiers)) {
  const seen = new Map();
  words.forEach((w, i) => {
    if (seen.has(w)) fail(`Tier ${tierNum} duplicate "${w}" at indices ${seen.get(w)} and ${i}`);
    else seen.set(w, i);
  });
}

// ── Duplicates across tiers ──
const NAMES = { 1: 'T1', 2: 'T2', 3: 'T3' };
const sets = Object.fromEntries(Object.entries(tiers).map(([n, w]) => [n, new Set(w)]));
const keys = Object.keys(tiers);
const crossDupes = [];
for (let i = 0; i < keys.length; i++) {
  for (let j = i + 1; j < keys.length; j++) {
    const [a, b] = [keys[i], keys[j]];
    [...sets[a]].filter(w => sets[b].has(w))
      .forEach(w => crossDupes.push(`${w} (${NAMES[a]}+${NAMES[b]})`));
  }
}
if (crossDupes.length) {
  crossDupes.forEach(d => fail(`Cross-tier duplicate: ${d}`));
} else {
  ok('No cross-tier duplicates');
}

console.log(`\n${errors} error(s), ${warnings} warning(s).`);
if (errors > 0) {
  console.error('\nValidation failed.');
  process.exit(1);
} else {
  console.log('\nValidation passed.');
  process.exit(0);
}
