// ─────────────────────────────────────────────
// WORD BANK SERVICE
// Loads the tiered word data and provides the selection logic the session
// engine uses to pick the next word(s). Validation lives in
// scripts/validate-wordbank.js and runs at build/dev time, not here — this
// module assumes the data it's given is already clean.
// ─────────────────────────────────────────────

import tier1 from '../data/tier-1.json';
import tier2 from '../data/tier-2.json';
import tier3 from '../data/tier-3.json';
import wildcards from '../data/wildcards.json';

// Tiers 1-3 are a difficulty ramp by syllabic weight. WILD is not a fourth step on that
// ramp — it is a different axis: words with no clean perfect rhyme, awkward stress, or a
// shape that resists landing on a beat. Its training value is that autopilot fails and
// the writer is forced into slant rhyme and multisyllabic construction.
export const WILDCARD_TIER = 4;

export const globalWordBanks = { 1: tier1, 2: tier2, 3: tier3, [WILDCARD_TIER]: wildcards };

/** Display label for a tier — WILD reads as a mode, not a number. */
export const tierLabel = (tier) => (Number(tier) === WILDCARD_TIER ? 'Wild' : String(tier));

/** The tiers that form the ordinary difficulty ramp, for mixing in Scheme mode. */
const RAMP = [1, 2, 3];

function getTierDist(base, n) {
  // Scheme mode normally blends tiers so a writer bridges registers. Wildcards are
  // exempt: diluting them with ordinary words removes the only thing the mode is for.
  if (Number(base) === WILDCARD_TIER) return Array(n).fill(WILDCARD_TIER);
  if (n === 1) return [base];
  const others = RAMP.filter(t => t !== base);
  if (n === 2) return [base, others[Math.floor(Math.random() * others.length)]];
  if (n === 3) return [...RAMP];
  return [base, base, others[0], others[1]];
}

export function getNextWords(tier, count, customWords = [], customChance = 0.2, lastWords = []) {
  const sel = [];
  const dist = getTierDist(tier, count).sort(() => Math.random() - 0.5);

  const customSlot = customWords.length > 0 && Math.random() < customChance
    ? Math.floor(Math.random() * count)
    : -1;

  for (let i = 0; i < count; i++) {
    if (i === customSlot) {
      let w, tries = 0;
      do { w = customWords[Math.floor(Math.random() * customWords.length)]; tries++; }
      while ((sel.includes(w) || lastWords.includes(w)) && tries < 10);
      // Only accept the custom word if it's actually fresh — if the pool is too small to
      // avoid a repeat (e.g. just one word, and it's the one just shown), fall through to
      // the normal tier bank below instead of pushing the same word again.
      if (w && !sel.includes(w) && !lastWords.includes(w)) { sel.push(w); continue; }
    }
    const bank = globalWordBanks[dist[i]];
    if (!bank?.length) continue;
    let w, tries = 0;
    do { w = bank[Math.floor(Math.random() * bank.length)]; tries++; }
    while ((sel.includes(w) || lastWords.includes(w)) && tries < 15);
    if (w) sel.push(w);
  }
  return sel;
}
