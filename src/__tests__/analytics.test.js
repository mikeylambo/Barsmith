/* @vitest-environment jsdom */
//
// Analytics is the one place in Barsmith where a bug is a broken promise rather than a
// broken feature. The app tells writers their work never leaves the device; these are
// what make that a property of the code instead of an intention.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EVENTS, BUCKETS, bucket, track, setAnalyticsProvider, analyticsEnabled, _sanitize,
} from '../services/analytics.js';
import { saveAnalyticsOptOut, firstOpenDay, STORAGE_KEYS } from '../services/storage.js';

let sent;
beforeEach(() => {
  localStorage.clear();
  sent = [];
  setAnalyticsProvider((name, props) => sent.push([name, props]));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('nothing a writer typed can get out', () => {
  it('drops any property value that is not a bucket, enum, flag or small number', () => {
    // The guarantee is structural: there is no shape of call that carries free text.
    const out = _sanitize({
      bars: '6-15',
      wrote: true,
      tier: 3,
      bar: 'I turn the block into a ledger, every corner owes me',
      word: 'sacrament',
      note: 'a phrase with spaces',
      long: 'x'.repeat(40),
      punctuation: "don't",
    });
    expect(out).toEqual({ bars: '6-15', wrote: true, tier: 3, word: 'sacrament' });
    expect(JSON.stringify(out)).not.toContain('ledger');
  });

  it('refuses an unknown event name outright', () => {
    expect(track('bar_written', { text: 'anything' })).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('sends no free text for any event the app actually fires', () => {
    // Walk every event with a deliberately hostile payload and assert nothing survives.
    for (const name of Object.values(EVENTS)) {
      track(name, { leak: 'a whole bar of lyrics right here', ok: '1-5' });
    }
    for (const [, props] of sent) {
      expect(props.leak).toBeUndefined();
      expect(Object.values(props).every(v =>
        typeof v === 'boolean' || typeof v === 'number' || /^[a-z0-9+_-]{1,24}$/.test(v))).toBe(true);
    }
  });
});

describe('counts are bucketed, never exact', () => {
  it('turns a number into a range', () => {
    expect(bucket(0, [0, 2, 5])).toBe('0-0');
    expect(bucket(4, [0, 2, 5])).toBe('3-5');
    expect(bucket(99, [0, 2, 5])).toBe('6+');
  });

  it('describes a session without describing a person', () => {
    // 12 bars and 14 bars are the same fact about a population and different facts about
    // an individual. Only the first is anyone's business.
    expect(BUCKETS.bars(12)).toBe(BUCKETS.bars(14));
    expect(BUCKETS.minutes(7)).toBe(BUCKETS.minutes(9));
    expect(BUCKETS.days(45)).toBe(BUCKETS.days(80));
  });

  it('handles rubbish input without producing rubbish output', () => {
    for (const v of [null, undefined, NaN, -5, 'abc']) {
      expect(typeof BUCKETS.bars(v)).toBe('string');
    }
  });
});

describe('off means off', () => {
  it('sends nothing once opted out', () => {
    saveAnalyticsOptOut(true);
    expect(analyticsEnabled()).toBe(false);
    expect(track(EVENTS.APP_OPEN, { streak: '0-0' })).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('takes effect on the very next event, not the next reload', () => {
    // The opt-out is read at call time on purpose. A switch that needs a restart to mean
    // anything is not really a switch.
    track(EVENTS.APP_OPEN, {});
    expect(sent).toHaveLength(1);
    saveAnalyticsOptOut(true);
    track(EVENTS.APP_OPEN, {});
    expect(sent).toHaveLength(1);
    saveAnalyticsOptOut(false);
    track(EVENTS.APP_OPEN, {});
    expect(sent).toHaveLength(2);
  });

  it('honours Do Not Track without being asked', () => {
    vi.stubGlobal('navigator', { ...navigator, doNotTrack: '1' });
    expect(analyticsEnabled()).toBe(false);
    expect(track(EVENTS.SESSION_START, {})).toBe(false);
  });

  it('never lets a failing provider surface to the writer', () => {
    setAnalyticsProvider(() => { throw new Error('network on fire'); });
    expect(() => track(EVENTS.SESSION_END, { bars: '0-0' })).not.toThrow();
    expect(track(EVENTS.SESSION_END, { bars: '0-0' })).toBe(false);
  });
});

describe('the provider itself asks permission before loading', () => {
  it('injects no script at all when opted out', async () => {
    // Vercel's script records a pageview the moment it loads, so gating only the
    // per-event send would still count someone who opted out — injection is itself an
    // act of tracking. Found by noticing the script tag was unconditional.
    saveAnalyticsOptOut(true);
    const before = document.querySelectorAll('script[src*="insights"]').length;
    const { createVercelProvider } = await import('../services/analytics-vercel.js');
    const send = createVercelProvider();
    send('app_open', {});
    expect(document.querySelectorAll('script[src*="insights"]').length).toBe(before);
  });

  it('injects nothing on localhost either, opted in or not', async () => {
    saveAnalyticsOptOut(false);
    const before = document.querySelectorAll('script[src*="insights"]').length;
    const { createVercelProvider } = await import('../services/analytics-vercel.js');
    createVercelProvider()('app_open', {});
    // jsdom serves from localhost, which is the same guard real local dev relies on.
    expect(document.querySelectorAll('script[src*="insights"]').length).toBe(before);
  });
});

describe('install date', () => {
  it('is recorded once and then held steady', () => {
    const first = firstOpenDay();
    expect(localStorage.getItem(STORAGE_KEYS.firstOpen)).toBeTruthy();
    expect(firstOpenDay()).toBe(first);
  });

  it('stays on the device — only its bucketed age is ever sendable', () => {
    // The date itself is the one genuinely identifying thing here, so it must never be a
    // value `track` would accept.
    const day = firstOpenDay();                       // e.g. "Fri Aug 01 2026"
    expect(_sanitize({ first: day }).first).toBeUndefined();
    expect(_sanitize({ first: BUCKETS.days(30) }).first).toBe('8-30');
  });
});
