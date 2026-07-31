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

/**
 * Draw one word from a pool, avoiding anything `blocked` rejects.
 *
 * Two paths on purpose. Probing at random is the right thing while most of the pool is
 * still eligible, which is nearly always. But a fixed try budget fails by luck as the
 * pool thins — with 90% of a tier already drawn, twelve probes miss more often than not,
 * and the caller would silently hand back a repeat it was asked to avoid. So when
 * probing runs out, scan for what is genuinely left instead of guessing harder. Two
 * thousand string comparisons is nothing against the two-second floor between draws, and
 * unlike a bigger budget it cannot fail by luck.
 *
 * @returns {string|null} null only when the pool holds nothing eligible at all.
 */
function pickFrom(pool, blocked) {
  for (let i = 0; i < 12; i++) {
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (!blocked(w)) return w;
  }
  const eligible = pool.filter(w => !blocked(w));
  return eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : null;
}

/**
 * Pick the next prompt word(s).
 *
 * `lastWords` blocks the previous draw. `seen` — a Set the caller owns and clears at
 * session start — blocks everything drawn so far this session.
 *
 * That second one is the difference between "usually feels fresh" and "is fresh".
 * Blocking only the previous draw leaves repeats governed by the birthday problem, and
 * at tier 1's 1,223 words that means the first repeat lands about 44 draws in — under
 * three minutes — with roughly 11 repeats across a ten-minute session. Growing the bank
 * barely helps, because the curve is a square root: eight times the words still repeats
 * inside one session. Remembering the session does not just help, it settles the
 * question. The longest prescribable session is 20 minutes at 3.5s, or 342 draws,
 * against a smallest tier of 1,223 words — 3.6x headroom, so the exclusion never has to
 * give way in practice. It is still written to degrade rather than assume that.
 */
export function getNextWords(tier, count, customWords = [], customChance = 0.2, lastWords = [], seen = null) {
  const sel = [];
  const dist = getTierDist(tier, count).sort(() => Math.random() - 0.5);

  const customSlot = customWords.length > 0 && Math.random() < customChance
    ? Math.floor(Math.random() * count)
    : -1;

  for (let i = 0; i < count; i++) {
    if (i === customSlot) {
      // Custom words are deliberately exempt from the session-scoped exclusion. A writer
      // who added three personal words wants all three, repeatedly — that is why they
      // added them. Scoping them to the session would spend the pool in three draws and
      // then quietly stop honouring the custom chance for the rest of it.
      //
      // Still only accepted if genuinely fresh against the previous draw: with a pool of
      // one, the alternative is showing the same word twice in a row, so fall through to
      // the tier bank instead.
      const w = pickFrom(customWords, x => sel.includes(x) || lastWords.includes(x));
      if (w) { sel.push(w); continue; }
    }

    const bank = globalWordBanks[dist[i]];
    if (!bank?.length) continue;

    let w = pickFrom(bank, x => sel.includes(x) || lastWords.includes(x) || !!seen?.has(x));
    if (!w && seen) {
      // This tier is spent. Start a fresh cycle rather than dropping the exclusion for
      // the remainder of the session: forget this bank's history and draw again under
      // the previous-draw rule alone. Other tiers keep theirs, which matters for a
      // Scheme round drawing across all three.
      for (const word of bank) seen.delete(word);
      w = pickFrom(bank, x => sel.includes(x) || lastWords.includes(x));
    }
    if (w) { sel.push(w); seen?.add(w); }
  }
  return sel;
}
