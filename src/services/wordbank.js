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

export const globalWordBanks = { 1: tier1, 2: tier2, 3: tier3 };
export const wildcardBank = wildcards;

function getTierDist(base, n) {
  if (n === 1) return [base];
  const others = [1, 2, 3].filter(t => t !== base);
  if (n === 2) return [base, others[Math.floor(Math.random() * others.length)]];
  if (n === 3) return [1, 2, 3];
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
      if (w) { sel.push(w); continue; }
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

export function getWildcardWord(lastWords = []) {
  if (!wildcardBank.length) return null;
  let w, tries = 0;
  do { w = wildcardBank[Math.floor(Math.random() * wildcardBank.length)]; tries++; }
  while (lastWords.includes(w) && tries < 10);
  return w;
}
