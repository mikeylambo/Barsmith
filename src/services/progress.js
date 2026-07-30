// ─────────────────────────────────────────────
// PROGRESS SERVICE
// The arithmetic behind the training log.
//
// Barsmith calls itself a writing gym but only ever showed attendance — a streak
// counter, and nothing else. A gym that cannot show you getting stronger has no
// answer to "why open this today", which is the whole retention question.
//
// Two rules shape everything here:
//
//  1. Cumulative numbers come from the independent totals record, never from
//     sessionHistory. History is capped at 100 sessions, so bars-written derived
//     from it would climb, plateau, then fall — the exact opposite of the story a
//     progress screen exists to tell.
//  2. Everything is pure. Dates come in as arguments (including "today") so the
//     calendar logic can be tested against fixed days instead of whatever the
//     clock happens to say during a test run.
// ─────────────────────────────────────────────

import { EMPTY_TOTALS } from './storage';
import { globalWordBanks } from './wordbank';
import { flattenNotes } from './export-text';

/** Bars with actual text in them. A Bar Pad opened and left blank is not a bar. */
export function barsInSession(session) {
  return flattenNotes(session?.notes).filter(([, , text]) => text?.trim()).length;
}

/** The distinct prompt words a session produced real writing on. */
function wordsWrittenOn(session) {
  return [...new Set(
    flattenNotes(session?.notes)
      .filter(([, , text]) => text?.trim())
      .map(([word]) => String(word).toLowerCase())
  )];
}

/**
 * Fold one finished session into the running totals.
 *
 * Pure — returns a new object. Callers persist the result. Called once per session
 * completion, and once per recovered draft that gets saved to History.
 */
export function addSessionToTotals(totals, session) {
  const base = { ...EMPTY_TOTALS, ...(totals || {}) };
  const bars = barsInSession(session);
  const seconds = Math.max(0, session?.duration || 0);
  return {
    ...base,
    bars: base.bars + bars,
    sessions: base.sessions + 1,
    seconds: base.seconds + seconds,
    words: [...new Set([...base.words, ...wordsWrittenOn(session)])],
    bestBars: Math.max(base.bestBars, bars),
    bestSeconds: Math.max(base.bestSeconds, seconds),
  };
}

/**
 * Build totals from an existing history array.
 *
 * Runs once, for writers who were using Barsmith before totals existed, so their
 * training log does not start from zero on a device that already holds a hundred
 * sessions. `seeded` makes it idempotent — without that flag, every launch would
 * re-add the same sessions and the numbers would inflate on every reload.
 *
 * Also used to force a rebuild after a backup restore, where the whole history is
 * replaced wholesale and the old counters no longer describe it.
 */
export function seedTotals(history, existing = null, { force = false } = {}) {
  const current = { ...EMPTY_TOTALS, ...(existing || {}) };
  if (current.seeded && !force) return current;

  // Claiming "seeded" against an empty history would permanently lock in zeroes: a
  // first launch on a fresh install writes the flag, and any history arriving later
  // could never be folded in. Staying unseeded is safe because seeding RECOMPUTES from
  // history rather than adding to what is there — so re-running it while History still
  // holds every session produces the same answer, and the flag only has to win before
  // History starts rolling over at 100.
  if (!history?.length) return current;

  const fresh = history.reduce(addSessionToTotals, { ...EMPTY_TOTALS });
  return { ...fresh, seeded: true };
}

/** Calendar-day arithmetic, DST-safe: adding 1 to the date, not 24h to the clock. */
const shiftDays = (date, delta) => {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
};

const dayKey = (date) => date.toDateString();

/**
 * The longest run of consecutive practice days ever recorded — a personal best that,
 * unlike the current streak, cannot be taken away by missing a day.
 */
export function longestStreak(practiceDays) {
  const days = [...new Set(practiceDays || [])]
    .map(s => new Date(s))
    .filter(d => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (!days.length) return 0;

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = dayKey(shiftDays(days[i - 1], 1)) === dayKey(days[i]) ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/**
 * A day-by-day grid of practice, most recent last — the consistency picture.
 *
 * Returned as flat days; the screen arranges them into weeks. `weeks` counts back
 * from the end of the current week so the grid ends on a whole column rather than
 * mid-week.
 */
export function consistencyGrid(practiceDays, { today = new Date(), weeks = 26 } = {}) {
  const practiced = new Set(practiceDays || []);
  // Pad forward to Saturday so the final column is a complete week.
  const end = shiftDays(today, 6 - today.getDay());
  const days = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const date = shiftDays(end, -i);
    days.push({
      key: dayKey(date),
      date,
      practiced: practiced.has(dayKey(date)),
      future: date > today,
    });
  }
  return days;
}

/**
 * Bars written per week over the recent past, oldest first.
 *
 * This one is necessarily drawn from sessionHistory rather than totals, since totals
 * hold no per-date detail. That is fine here: the window is short enough that the
 * 100-session cap will not reach back into it for any realistic writer, and unlike a
 * lifetime total, a rolling chart is expected to move.
 */
export function weeklyVolume(history, { today = new Date(), weeks = 12 } = {}) {
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const end = shiftDays(today, -7 * (weeks - 1 - i));
    return { start: shiftDays(end, -6), end, bars: 0, sessions: 0 };
  });
  const earliest = buckets[0].start;

  for (const session of history || []) {
    const date = new Date(session?.date);
    if (Number.isNaN(date.getTime()) || date < earliest) continue;
    // Walk from the newest bucket back; a session belongs to the first whose start
    // it is on or after.
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (date >= buckets[i].start) {
        buckets[i].bars += barsInSession(session);
        buckets[i].sessions += 1;
        break;
      }
    }
  }
  return buckets;
}

/** Total words across all tiers — the denominator for vocabulary breadth. */
export function wordBankSize(banks = globalWordBanks) {
  return Object.values(banks).reduce((n, bank) => n + (bank?.length || 0), 0);
}

/**
 * Everything the training log renders, in one call.
 *
 * @param {object} input
 * @param {object} input.totals        Lifetime counters from storage.
 * @param {Array}  input.history       Recent sessions, for the rolling chart.
 * @param {Array}  input.practiceDays  Date strings, up to 400 days.
 * @param {Array}  input.vault         Saved words.
 * @param {Date}   [input.today]       Injected for testability.
 */
export function computeProgress({ totals, history, practiceDays, vault, today = new Date() }) {
  const t = { ...EMPTY_TOTALS, ...(totals || {}) };
  const bankSize = wordBankSize();
  return {
    bars: t.bars,
    sessions: t.sessions,
    minutes: Math.round(t.seconds / 60),
    daysTrained: new Set(practiceDays || []).size,
    longestStreak: longestStreak(practiceDays),
    vocabulary: {
      written: t.words.length,
      bankSize,
      // Personal words push the count past the built-in bank, so this can exceed 100%
      // legitimately. Clamped so the bar never overflows its track.
      percent: bankSize ? Math.min(100, Math.round((t.words.length / bankSize) * 100)) : 0,
      claimed: (vault || []).length,
    },
    records: {
      bestBars: t.bestBars,
      bestSeconds: t.bestSeconds,
    },
    grid: consistencyGrid(practiceDays, { today }),
    weeks: weeklyVolume(history, { today }),
  };
}
