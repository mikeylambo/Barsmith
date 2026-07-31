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
  dateSeed, dailySession, describeSession, isCompletedToday, markCompleted, dayKey, programmeWeek,
} from '../services/daily.js';
import { globalWordBanks, getNextWords, normalizeTier } from '../services/wordbank.js';

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
    // Two Fridays a month apart are both Sprint day; the specifics may differ.
    const a = dailySession(new Date(2026, 6, 3));   // Friday
    const b = dailySession(new Date(2026, 7, 7));   // Friday
    expect(a.key).toBe('sprint');
    expect(b.key).toBe('sprint');
  });

  it('makes Sprint day actually fast, since speed is the thing it trains', () => {
    const fridays = Array.from({ length: 20 }, (_, i) => dailySession(new Date(2026, 0, 2 + i * 7)));
    expect(fridays.every(p => p.key === 'sprint')).toBe(true);
    expect(fridays.every(p => p.intervalMs <= 2500)).toBe(true);
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

  it('only ever prescribes one of the three real tiers', () => {
    expect(new Set(YEAR.map(d => dailySession(d).tier))).toEqual(new Set([1, 2, 3]));
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

});

describe('completion tracking', () => {
  const today = new Date(2026, 6, 30);

  it('is not complete before anything is recorded', () => {
    expect(isCompletedToday(null, today)).toBe(false);
    expect(isCompletedToday({ completed: [], count: 0 }, today)).toBe(false);
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

  it('counts again the next day, and keeps the earlier day marked', () => {
    // Completion is a set of days rather than a single "last" marker, which is what
    // lets the week strip show Monday as done while standing on Wednesday.
    const tomorrow = new Date(2026, 6, 31);
    const rec = markCompleted(markCompleted(null, today), tomorrow);
    expect(rec.count).toBe(2);
    expect(isCompletedToday(rec, today)).toBe(true);
    expect(isCompletedToday(rec, tomorrow)).toBe(true);
  });

  it('keys on the calendar day, matching how practice days are stored', () => {
    expect(dayKey(today)).toBe(today.toDateString());
  });

  it('caps the completed list while leaving the lifetime count intact', () => {
    let rec = null;
    for (let i = 0; i < 200; i++) rec = markCompleted(rec, new Date(2026, 0, 1 + i));
    expect(rec.count).toBe(200);
    expect(rec.completed.length).toBeLessThanOrEqual(120);
    // The cap must drop the OLDEST days, not the recent ones the week view needs.
    expect(rec.completed).toContain(new Date(2026, 0, 200).toDateString());
  });
});

describe('programmeWeek', () => {
  const wednesday = new Date(2026, 6, 29); // Wed 29 Jul 2026

  it('returns Sunday through Saturday of the current week', () => {
    const week = programmeWeek(null, wednesday);
    expect(week).toHaveLength(7);
    expect(week[0].date.getDay()).toBe(0);
    expect(week[6].date.getDay()).toBe(6);
    expect(week.map(d => d.name)).toEqual([
      'Reset', 'Foundations', 'Tempo', 'Scheme', 'Heavy', 'Sprint', 'Endurance',
    ]);
  });

  it('marks completed days and flags today', () => {
    const rec = markCompleted(markCompleted(null, new Date(2026, 6, 27)), wednesday);
    const week = programmeWeek(rec, wednesday);
    expect(week[1].done).toBe(true);   // Monday
    expect(week[3].done).toBe(true);   // Wednesday
    expect(week[2].done).toBe(false);  // Tuesday missed
    expect(week[3].isToday).toBe(true);
  });

  it('marks later days as future so they do not read as missed', () => {
    const week = programmeWeek(null, wednesday);
    expect(week.slice(0, 4).every(d => !d.future)).toBe(true);
    expect(week.slice(4).every(d => d.future)).toBe(true);
  });

  it('does not treat today as future even before the day is over', () => {
    const week = programmeWeek(null, new Date(2026, 6, 29, 9, 0));
    expect(week[3].future).toBe(false);
  });

  it('handles a week that spans a month boundary', () => {
    const week = programmeWeek(null, new Date(2026, 6, 30)); // Thu 30 Jul; week ends 1 Aug
    expect(week).toHaveLength(7);
    expect(new Set(week.map(d => d.date.getMonth())).size).toBe(2);
  });
});

// The former wildcard tier was folded back into 1-3. These guard the properties that
// had to survive that merge: every prompt is a single token the dictionary can resolve,
// and the tiers stay a clean syllabic ramp so a redistributed word landed where it
// belongs rather than wherever was convenient.
describe('word banks', () => {
  const SYLLABLES = (word) => {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    let n = (w.match(/[aeiouy]+/g) || []).length;
    if (/e$/.test(w) && !/(le|ee|ye)$/.test(w) && n > 1) n -= 1;
    return Math.max(1, n);
  };

  it('exposes exactly the three tiers', () => {
    expect(Object.keys(globalWordBanks)).toEqual(['1', '2', '3']);
  });

  it('holds only single tokens, because Tap-to-Lock resolves the prompt as one word', () => {
    for (const [tier, bank] of Object.entries(globalWordBanks)) {
      const phrases = bank.filter(w => /\s/.test(w));
      expect(phrases, `tier ${tier} contains phrases: ${phrases}`).toEqual([]);
    }
  });

  it('keeps each tier on its syllabic band after the wildcard merge', () => {
    const share = (tier, predicate) => {
      const bank = globalWordBanks[tier];
      return bank.filter(w => predicate(SYLLABLES(w))).length / bank.length;
    };
    expect(share(1, n => n === 1)).toBeGreaterThan(0.9);
    expect(share(2, n => n === 2)).toBeGreaterThan(0.8);
    expect(share(3, n => n >= 3)).toBeGreaterThan(0.8);
  });

  it('never returns an empty prompt list for a tier that no longer exists', () => {
    // Preferences persist. A writer who selected the short-lived WILD tier still has
    // `tier: 4` in localStorage, and with that bank gone every slot resolved to nothing
    // — no crash, no error, just a session that started with a blank where the prompt
    // should be. The failure is silent, which is what makes it worth a test.
    for (const stale of [4, 0, -1, 99, null, undefined, 'wild']) {
      for (let count = 1; count <= 4; count++) {
        const words = getNextWords(stale, count, [], 0, []);
        expect(words.length, `tier ${stale} x${count} returned nothing`).toBeGreaterThan(0);
      }
    }
  });

  it('normalizes an unknown tier to a real one', () => {
    expect(normalizeTier(4)).toBe(1);
    expect(normalizeTier(undefined)).toBe(1);
    expect(normalizeTier(2)).toBe(2);
    expect(normalizeTier('3')).toBe(3);
  });

  it('blends tiers for a Scheme round so a writer bridges registers', () => {
    const t1 = new Set(globalWordBanks[1]);
    const drawn = Array.from({ length: 60 }, () => getNextWords(1, 3, [], 0, [])).flat();
    expect(drawn.some(w => !t1.has(w))).toBe(true);
  });
});
