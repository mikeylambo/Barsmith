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

// Three tiers, graded by syllabic weight: tier 1 is ~97% single-syllable, tier 2 ~84%
// two-syllable, tier 3 predominantly three or more. New words are placed by that rule.
//
// A fourth "wildcard" tier was tried and removed. The words that justified it — the
// genuine unrhymables like `orange` and `month` — were too few to fill a mode, and the
// rest were ordinary polysyllables that belong on the existing ramp. Splitting them
// across tiers 1-3 keeps one difficulty axis and one mental model.
export const globalWordBanks = { 1: tier1, 2: tier2, 3: tier3 };

export const TIERS = [1, 2, 3];

/**
 * Coerce a tier to one that actually has a bank behind it.
 *
 * Preferences persist, so a writer who picked the short-lived WILD tier still has
 * `tier: 4` in localStorage. With that bank gone, every slot in getTierDist resolved to
 * nothing and a session started with an empty word list — no crash, no error, just a
 * blank screen where the prompt should be. Anything reading a stored tier goes through
 * here.
 */
export const normalizeTier = (tier) => (globalWordBanks[tier]?.length ? Number(tier) : 1);

function getTierDist(base, n) {
  const t = normalizeTier(base);
  if (n === 1) return [t];
  const others = TIERS.filter(x => x !== t);
  if (n === 2) return [t, others[Math.floor(Math.random() * others.length)]];
  if (n === 3) return [...TIERS];
  return [t, t, others[0], others[1]];
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
