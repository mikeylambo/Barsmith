// @vitest-environment node
//
// The training log makes claims about a writer's history, so the arithmetic behind it
// has to be right in ways that are easy to get subtly wrong: calendar days across DST,
// accumulation that must never double-count, and — the one that matters most — totals
// that keep climbing after History starts discarding sessions at its 100-entry cap.
//
// Every function here takes "today" as an argument so the calendar cases are pinned to
// fixed dates instead of whatever the clock says when CI runs.

import { describe, it, expect } from 'vitest';
import {
  barsInSession, addSessionToTotals, seedTotals, longestStreak,
  consistencyGrid, computeProgress,
} from '../services/progress.js';
import { EMPTY_TOTALS } from '../services/storage.js';

const session = (over = {}) => ({
  id: 1,
  date: '2026-07-30T12:00:00.000Z',
  duration: 600,
  notes: { fracture: { a: 'first bar', b: 'second bar' }, lantern: { a: 'third bar' } },
  ...over,
});

const days = (...strings) => strings.map(s => new Date(s).toDateString());

describe('barsInSession', () => {
  it('counts only entries with real text', () => {
    expect(barsInSession(session())).toBe(3);
    expect(barsInSession(session({ notes: { a: { x: '  ' }, b: { y: 'real' } } }))).toBe(1);
    expect(barsInSession(session({ notes: {} }))).toBe(0);
    expect(barsInSession(null)).toBe(0);
  });
});

describe('addSessionToTotals', () => {
  it('accumulates bars, sessions, and time', () => {
    const t = addSessionToTotals(EMPTY_TOTALS, session());
    expect(t).toMatchObject({ bars: 3, sessions: 1, seconds: 600 });
  });

  it('keeps distinct words rather than a running count, so re-drilling a word does not inflate breadth', () => {
    let t = addSessionToTotals(EMPTY_TOTALS, session());
    t = addSessionToTotals(t, session({ notes: { fracture: { a: 'again on the same word' } } }));
    expect(t.words.sort()).toEqual(['fracture', 'lantern']);
    expect(t.bars).toBe(4); // the bar still counts, the word does not recount
  });

  it('is case-insensitive about words', () => {
    let t = addSessionToTotals(EMPTY_TOTALS, session({ notes: { Fracture: { a: 'one' } } }));
    t = addSessionToTotals(t, session({ notes: { fracture: { a: 'two' } } }));
    expect(t.words).toEqual(['fracture']);
  });

  it('tracks personal bests as maxima, not last-seen values', () => {
    let t = addSessionToTotals(EMPTY_TOTALS, session({ duration: 900 }));      // 3 bars, 900s
    t = addSessionToTotals(t, session({ duration: 60, notes: { a: { x: 'one' } } })); // 1 bar, 60s
    expect(t.bestBars).toBe(3);
    expect(t.bestSeconds).toBe(900);
  });

  it('does not go backwards on a session with a missing duration', () => {
    const t = addSessionToTotals({ ...EMPTY_TOTALS, seconds: 500 }, session({ duration: undefined }));
    expect(t.seconds).toBe(500);
  });
});

describe('seedTotals', () => {
  const history = [session({ id: 1 }), session({ id: 2, notes: { verdict: { a: 'another' } } })];

  it('folds an existing history in so upgrading writers do not start from zero', () => {
    const t = seedTotals(history, null);
    expect(t.sessions).toBe(2);
    expect(t.bars).toBe(4);
    expect(t.seeded).toBe(true);
  });

  it('is idempotent — a second launch must not re-add the same sessions', () => {
    const once = seedTotals(history, null);
    const twice = seedTotals(history, once);
    expect(twice).toEqual(once);
  });

  it('does not claim to be seeded when there was nothing to seed from', () => {
    // Marking a fresh install as seeded would permanently lock in zeroes: history
    // arriving later could never be folded in.
    const t = seedTotals([], null);
    expect(t.seeded).toBe(false);
    expect(t.bars).toBe(0);
    // ...and the next launch, once history exists, still catches up.
    expect(seedTotals(history, t).bars).toBe(4);
  });

  it('rebuilds from scratch when forced, for a backup restore that replaced history', () => {
    const stale = { ...EMPTY_TOTALS, seeded: true, bars: 999, sessions: 99 };
    const t = seedTotals(history, stale, { force: true });
    expect(t.bars).toBe(4);
    expect(t.sessions).toBe(2);
  });

  it('survives a missing history array', () => {
    expect(seedTotals(undefined, null).bars).toBe(0);
  });
});

describe('longestStreak', () => {
  it('finds the longest consecutive run, not the most recent one', () => {
    expect(longestStreak(days(
      '2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', // run of 4
      '2026-03-10',
      '2026-03-20', '2026-03-21',                              // run of 2
    ))).toBe(4);
  });

  it('counts a single day as a streak of one', () => {
    expect(longestStreak(days('2026-03-01'))).toBe(1);
  });

  it('is zero with no practice recorded', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(undefined)).toBe(0);
  });

  it('ignores duplicates and unparseable entries', () => {
    const d = days('2026-03-01', '2026-03-02');
    expect(longestStreak([...d, ...d, 'not a date'])).toBe(2);
  });

  it('counts across a month boundary', () => {
    expect(longestStreak(days('2026-01-30', '2026-01-31', '2026-02-01'))).toBe(3);
  });

  it('counts across a DST transition, where a day is not 24 hours', () => {
    // US DST began 2026-03-08; a 24-hour-subtraction implementation drops this run.
    expect(longestStreak(days('2026-03-07', '2026-03-08', '2026-03-09'))).toBe(3);
  });
});

describe('consistencyGrid', () => {
  const today = new Date(2026, 6, 30); // Thu 30 Jul 2026

  it('returns whole weeks so the grid ends on a complete column', () => {
    const grid = consistencyGrid([], { today, weeks: 52 });
    expect(grid).toHaveLength(52 * 7);
    expect(grid.length % 7).toBe(0);
  });

  it('marks practised days and leaves the rest empty', () => {
    const grid = consistencyGrid(days('2026-07-29'), { today });
    const marked = grid.filter(d => d.practiced);
    expect(marked).toHaveLength(1);
    expect(marked[0].date.getDate()).toBe(29);
  });

  it('flags days after today so the trailing week is not drawn as missed', () => {
    const grid = consistencyGrid([], { today });
    expect(grid.filter(d => d.future).length).toBeGreaterThan(0);
    expect(grid.every(d => !d.future || d.date > today)).toBe(true);
  });

  it('ends on the current week and runs in chronological order', () => {
    const grid = consistencyGrid([], { today, weeks: 4 });
    expect(grid[0].date < grid[grid.length - 1].date).toBe(true);
    expect(grid[grid.length - 1].date >= today).toBe(true);
  });
});

describe('computeProgress', () => {
  const today = new Date(2026, 6, 30);

  it('reports lifetime figures from totals, not from the capped history', () => {
    // The scenario that motivates the separate totals record: a writer well past the
    // 100-session cap, whose History no longer describes their whole training life.
    const totals = { ...EMPTY_TOTALS, bars: 4200, sessions: 900, seconds: 360000, words: ['a', 'b'] };
    const p = computeProgress({ totals, history: [], practiceDays: [], vault: [], today });
    expect(p.bars).toBe(4200);
    expect(p.sessions).toBe(900);
    expect(p.minutes).toBe(6000);
  });

  it('derives vocabulary breadth against the real word-bank size', () => {
    const totals = { ...EMPTY_TOTALS, words: ['a', 'b', 'c'] };
    const p = computeProgress({ totals, history: [], practiceDays: [], vault: [{ word: 'x' }], today });
    expect(p.vocabulary.written).toBe(3);
    expect(p.vocabulary.bankSize).toBeGreaterThan(3000); // tiers 1-3 combined
    expect(p.vocabulary.claimed).toBe(1);
  });

  it('clamps vocabulary percent, since personal words can push past the built-in bank', () => {
    const totals = { ...EMPTY_TOTALS, words: Array.from({ length: 99999 }, (_, i) => `w${i}`) };
    const p = computeProgress({ totals, history: [], practiceDays: [], vault: [], today });
    expect(p.vocabulary.percent).toBe(100);
  });

  it('handles a completely empty install without throwing', () => {
    const p = computeProgress({ totals: null, history: null, practiceDays: null, vault: null, today });
    expect(p.bars).toBe(0);
    expect(p.longestStreak).toBe(0);
    expect(p.grid.length).toBe(52 * 7);
  });
});
