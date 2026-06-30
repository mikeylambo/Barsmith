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
const wildcards = loadJSON('wildcards.json');

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
    else if (!/^[a-z' -]+$/.test(w)) warn(`Tier ${tierNum}[${i}] has unexpected characters: "${w}"`);
  });
}
ok(`Shape check complete (Tier 1: ${tiers[1].length}, Tier 2: ${tiers[2].length}, Tier 3: ${tiers[3].length}, Wildcards: ${wildcards.length})`);

// ── Duplicates within a tier ──
for (const [tierNum, words] of Object.entries(tiers)) {
  const seen = new Map();
  words.forEach((w, i) => {
    if (seen.has(w)) fail(`Tier ${tierNum} duplicate "${w}" at indices ${seen.get(w)} and ${i}`);
    else seen.set(w, i);
  });
}

// ── Duplicates across tiers ──
const t1 = new Set(tiers[1]);
const t2 = new Set(tiers[2]);
const t3 = new Set(tiers[3]);
const crossDupes = [
  ...[...t1].filter(w => t2.has(w)).map(w => `${w} (T1+T2)`),
  ...[...t1].filter(w => t3.has(w)).map(w => `${w} (T1+T3)`),
  ...[...t2].filter(w => t3.has(w)).map(w => `${w} (T2+T3)`),
];
if (crossDupes.length) {
  crossDupes.forEach(d => fail(`Cross-tier duplicate: ${d}`));
} else {
  ok('No cross-tier duplicates');
}

// ── Wildcard overlap with main tiers (not necessarily an error, but worth flagging) ──
const allMain = new Set([...t1, ...t2, ...t3]);
wildcards.forEach(w => {
  if (allMain.has(w)) warn(`Wildcard "${w}" also appears in a main tier`);
});

console.log(`\n${errors} error(s), ${warnings} warning(s).`);
if (errors > 0) {
  console.error('\nValidation failed.');
  process.exit(1);
} else {
  console.log('\nValidation passed.');
  process.exit(0);
}
