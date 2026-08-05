/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNextWords } from '../services/wordbank.js';
import { computeStreak, importAllData } from '../services/storage.js';
import { shareImage, shareFile } from '../services/share.js';
import { fetchDictData, _cacheGet, _cacheSet, _cacheClear, _cacheSize, _setCacheMax } from '../services/dictionary.js';
import { BeatScheduler } from '../services/audio-clock.js';

describe('the share sheet gets files and nothing else', () => {
  // iOS decides which actions to promote from what the payload contains. Files alone
  // reads as "share this image" and puts Save Image near the front; adding a text
  // caption makes it a generic share and promotes Save to Files instead. Barsmith was
  // attaching the bar's own words, which is why saving a card opened the file browser
  // first. Found on a real phone, so it is pinned here.
  const payloads = [];
  beforeEach(() => {
    payloads.length = 0;
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: (p) => { payloads.push(Object.keys(p).sort().join(',')); return Promise.resolve(); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shares an image with no caption', async () => {
    expect(await shareImage(new Blob(['x'], { type: 'image/png' }), 'card.png')).toBe('shared');
    expect(payloads).toEqual(['files']);
  });

  it('shares a recording the same way, so it can reach the camera roll', async () => {
    // A download link puts video in Files on iOS. The share sheet is the only route to
    // Photos, which is where a writer expects to find a take they just filmed.
    expect(await shareFile(new Blob(['x'], { type: 'video/mp4' }), 'take.mp4', 'video/mp4')).toBe('shared');
    expect(payloads).toEqual(['files']);
  });
});

describe('release services', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('falls back to the tier bank when the only personal word would repeat', () => {
    const words = getNextWords(1, 1, ['personal-only'], 1, ['personal-only']);
    expect(words).toHaveLength(1);
    expect(words[0]).not.toBe('personal-only');
  });

  it('computes consecutive calendar days without relying on 24-hour subtraction', () => {
    const d0 = new Date();
    const d1 = new Date(d0); d1.setDate(d1.getDate() - 1);
    const d2 = new Date(d0); d2.setDate(d2.getDate() - 2);
    expect(computeStreak([d0.toDateString(), d1.toDateString(), d2.toDateString()])).toBe(3);
  });

  it('rejects malformed backup shapes before writing', () => {
    const result = importAllData(JSON.stringify({ version: 1, vault: 'not-an-array' }));
    expect(result.ok).toBe(false);
    expect(localStorage.getItem('barsmithVault')).toBeNull();
  });

  it('surfaces a total dictionary network outage instead of caching an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(fetchDictData('unreachableword', null)).rejects.toThrow('Network error');
    vi.unstubAllGlobals();
  });

  it('invalidates already-scheduled beat callbacks after stop', () => {
    vi.useFakeTimers();
    const osc = () => ({ connect(){}, frequency:{setValueAtTime(){}}, start(){}, stop(){}, onended:null });
    const ctx = {
      state:'running', currentTime:0, destination:{}, resume(){},
      createOscillator: osc,
      createGain: () => ({ connect(){}, gain:{setValueAtTime(){}, exponentialRampToValueAtTime(){}} }),
    };
    const onBeat = vi.fn();
    const scheduler = new BeatScheduler(ctx, { onBeat });
    scheduler.start(120, 4);
    scheduler.stop();
    vi.advanceTimersByTime(500);
    expect(onBeat).not.toHaveBeenCalled();
  });

  // The setting is only real if it reaches the gain node. Asserted on the value actually
  // handed to the audio graph rather than on the property, because everything between the
  // slider and the oscillator is where a volume control usually dies.
  it('scales every click by the metronome volume, and silences at zero', () => {
    vi.useFakeTimers();
    const gains = [];
    const ctx = {
      state:'running', currentTime:0, destination:{}, resume(){},
      createOscillator: () => ({ connect(){}, frequency:{setValueAtTime(){}}, start(){}, stop(){}, onended:null }),
      createGain: () => ({ connect(){}, gain:{ setValueAtTime(v){ gains.push(v); }, exponentialRampToValueAtTime(){} } }),
    };
    const scheduler = new BeatScheduler(ctx, {});

    scheduler.volume = 1;
    scheduler.playTickAt(0, 1000, 0.65);
    expect(gains).toEqual([0.65]);

    // Mid-session change lands on the very next click, not the next session.
    gains.length = 0;
    scheduler.volume = 0.5;
    scheduler.playTickAt(0, 1000, 0.65);
    expect(gains).toEqual([0.325]);

    gains.length = 0;
    scheduler.volume = 0;
    scheduler.playTickAt(0, 1000, 0.65);
    expect(gains).toEqual([]);
  });

  it('defaults to full volume when nothing has set it', () => {
    const gains = [];
    const ctx = {
      state:'running', currentTime:0, destination:{}, resume(){},
      createOscillator: () => ({ connect(){}, frequency:{setValueAtTime(){}}, start(){}, stop(){}, onended:null }),
      createGain: () => ({ connect(){}, gain:{ setValueAtTime(v){ gains.push(v); }, exponentialRampToValueAtTime(){} } }),
    };
    new BeatScheduler(ctx, {}).playTickAt(0, 1000, 0.28);
    expect(gains).toEqual([0.28]);
  });
});

describe('v1 real implementation tests', () => {
  afterEach(() => { vi.restoreAllMocks(); _cacheClear(); _setCacheMax(300); });

  // Exercises the actual dictionary.js LRU cache via exported test primitives.
  // The key LRU property: a cache hit refreshes recency, so the touched entry
  // survives the next eviction even if it was the oldest entry by insertion order.
  it('dictionary cache evicts least-recently-used entry, not oldest-inserted', () => {
    _setCacheMax(3);
    _cacheSet('a', 1);
    _cacheSet('b', 2);
    _cacheSet('c', 3); // cache is now full: a(oldest) b c(newest)

    _cacheGet('a'); // touch 'a' — it moves to newest; 'b' is now LRU

    _cacheSet('d', 4); // must evict LRU = 'b', not the touched 'a'

    expect(_cacheGet('a')).toBe(1);   // survived — was touched
    expect(_cacheGet('b')).toBeUndefined(); // evicted — was LRU
    expect(_cacheGet('c')).toBe(3);   // survived
    expect(_cacheGet('d')).toBe(4);   // newly inserted
    expect(_cacheSize()).toBe(3);
  });
});
