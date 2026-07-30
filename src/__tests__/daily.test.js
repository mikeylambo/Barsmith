// @vitest-environment node
//
// The daily prescription is the retention mechanic, so two properties matter more than
// any individual value it produces:
//
//  1. **Stable within a day, different across days.** A writer who opens the app twice
//     before lunch must see the same session both times, or the prescription is not a
//     prescription. Derived from the local calendar date, not a timestamp, so it turns
//     over at the writer's midnight rather than UTC's.
//  2. **Every output is a legal setting.** These values are written straight into the
//     session engine's state, so an out-of-range tier or word count would not be a
//     cosmetic bug — it would start a broken session.

import { describe, it, expect } from 'vitest';
import {
  dateSeed, dailySession, describeSession, isCompletedToday, markCompleted, dayKey,
} from '../services/daily.js';
import { WILDCARD_TIER, globalWordBanks, getNextWords, tierLabel } from '../services/wordbank.js';

/** Every day across a full year, to assert properties rather than spot-check. */
const YEAR = Array.from({ length: 365 }, (_, i) => new Date(2026, 0, 1 + i));

describe('dateSeed', () => {
  it('is stable for the same calendar day regardless of time', () => {
    expect(dateSeed(new Date(2026, 6, 30, 0, 1))).toBe(dateSeed(new Date(2026, 6, 30, 23, 59)));
  });

  it('differs between consecutive days', () => {
    expect(dateSeed(new Date(2026, 6, 30))).not.toBe(dateSeed(new Date(2026, 6, 31)));
  });

  it('is well distributed rather than collapsing onto a few values', () => {
    const seeds = new Set(YEAR.map(dateSeed));
    expect(seeds.size).toBe(365);
  });
});

describe('dailySession', () => {
  it('gives the same prescription all day', () => {
    const morning = dailySession(new Date(2026, 6, 30, 6, 0));
    const night = dailySession(new Date(2026, 6, 30, 22, 30));
    expect(morning).toEqual(night);
  });

  it('follows the weekday programme, so a given day always trains the same thing', () => {
    // Two Fridays a month apart are both Wildcard day; the specifics may differ.
    const a = dailySession(new Date(2026, 6, 3));   // Friday
    const b = dailySession(new Date(2026, 7, 7));   // Friday
    expect(a.key).toBe('wild');
    expect(b.key).toBe('wild');
    expect(a.tier).toBe(WILDCARD_TIER);
  });

  it('covers every shape in the programme across a week', () => {
    const week = Array.from({ length: 7 }, (_, i) => dailySession(new Date(2026, 6, 26 + i)).key);
    expect(new Set(week).size).toBe(7);
  });

  it('varies the specifics across weeks so the same day does not go stale', () => {
    // Twelve consecutive Tempo days should not all be the identical prescription.
    const tempos = Array.from({ length: 12 }, (_, i) => dailySession(new Date(2026, 6, 1 + i * 7)));
    const shapes = new Set(tempos.map(t => JSON.stringify([t.tier, t.bpm, t.barsPerWord, t.intervalMs])));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('only ever emits settings the session engine accepts', () => {
    for (const day of YEAR) {
      const p = dailySession(day);
      expect(globalWordBanks[p.tier], `tier ${p.tier} has no word bank`).toBeTruthy();
      expect(p.wordCount).toBeGreaterThanOrEqual(1);
      expect(p.wordCount).toBeLessThanOrEqual(4);
      expect(p.intervalMs).toBeGreaterThanOrEqual(2000);
      expect(p.intervalMs).toBeLessThanOrEqual(8000);
      expect(p.bpm).toBeGreaterThanOrEqual(60);
      expect(p.bpm).toBeLessThanOrEqual(120);
      expect([1, 2, 4]).toContain(p.barsPerWord);
      expect(p.limitMinutes).toBeGreaterThan(0);
      expect(p.limitMinutes).toBeLessThanOrEqual(20);
      expect(typeof p.name).toBe('string');
      expect(p.focus.length).toBeGreaterThan(10);
    }
  });

  it('reserves wildcards for Wildcard day, so the category stays a distinct session', () => {
    const wildDays = YEAR.map(dailySession).filter(p => p.tier === WILDCARD_TIER);
    expect(wildDays.length).toBeGreaterThan(0);
    expect(wildDays.every(p => p.key === 'wild')).toBe(true);
  });
});

describe('describeSession', () => {
  it('summarises an interval-paced session', () => {
    const s = describeSession({ tier: 2, wordCount: 1, intervalMs: 4500, bpmMode: false, limitMinutes: 10 });
    expect(s).toBe('Level 2 · 1 word · 4.5s · 10 min');
  });

  it('summarises a tempo session with its grid', () => {
    const s = describeSession({ tier: 1, wordCount: 2, bpmMode: true, bpm: 88, barsPerWord: 4, limitMinutes: 10 });
    expect(s).toBe('Level 1 · 2 words · 88 BPM · 4 bars/word · 10 min');
  });

  it('names the wildcard tier rather than showing a bare 4', () => {
    expect(describeSession({ tier: WILDCARD_TIER, wordCount: 1, intervalMs: 5000, limitMinutes: 10 }))
      .toContain('Wild');
  });
});

describe('completion tracking', () => {
  const today = new Date(2026, 6, 30);

  it('is not complete before anything is recorded', () => {
    expect(isCompletedToday(null, today)).toBe(false);
    expect(isCompletedToday({ lastCompleted: null, count: 0 }, today)).toBe(false);
  });

  it('marks today done and counts it', () => {
    const rec = markCompleted(null, today);
    expect(isCompletedToday(rec, today)).toBe(true);
    expect(rec.count).toBe(1);
  });

  it('does not double-count a second session on the same day', () => {
    const once = markCompleted(null, today);
    const twice = markCompleted(once, today);
    expect(twice.count).toBe(1);
    expect(twice).toBe(once); // unchanged, so no pointless write
  });

  it('counts again the next day', () => {
    const tomorrow = new Date(2026, 6, 31);
    const rec = markCompleted(markCompleted(null, today), tomorrow);
    expect(rec.count).toBe(2);
    expect(isCompletedToday(rec, today)).toBe(false);
    expect(isCompletedToday(rec, tomorrow)).toBe(true);
  });

  it('keys on the calendar day, matching how practice days are stored', () => {
    expect(dayKey(today)).toBe(today.toDateString());
  });
});

describe('wildcard bank', () => {
  it('is registered as a tier the engine can draw from', () => {
    expect(Array.isArray(globalWordBanks[WILDCARD_TIER])).toBe(true);
    expect(globalWordBanks[WILDCARD_TIER].length).toBeGreaterThan(100);
  });

  it('shares no words with the ordinary tiers — a word in tier 2 is not a wildcard', () => {
    const ordinary = new Set([...globalWordBanks[1], ...globalWordBanks[2], ...globalWordBanks[3]]);
    const overlap = globalWordBanks[WILDCARD_TIER].filter(w => ordinary.has(w));
    expect(overlap).toEqual([]);
  });

  it('never dilutes a Scheme-mode wildcard round with ordinary words', () => {
    // Tiers 1-3 deliberately blend in Scheme mode so a writer bridges registers. Doing
    // that to wildcards would hand back an easy word to rhyme on and remove the point.
    const wild = new Set(globalWordBanks[WILDCARD_TIER]);
    for (let count = 1; count <= 4; count++) {
      for (let trial = 0; trial < 40; trial++) {
        const words = getNextWords(WILDCARD_TIER, count, [], 0, []);
        expect(words.every(w => wild.has(w)), `leaked a non-wildcard: ${words}`).toBe(true);
      }
    }
  });

  it('still blends tiers for an ordinary Scheme round', () => {
    const t1 = new Set(globalWordBanks[1]);
    const drawn = Array.from({ length: 60 }, () => getNextWords(1, 3, [], 0, [])).flat();
    expect(drawn.some(w => !t1.has(w))).toBe(true);
  });

  it('labels the wildcard tier by name and the rest by number', () => {
    expect(tierLabel(WILDCARD_TIER)).toBe('Wild');
    expect(tierLabel(2)).toBe('2');
  });
});
