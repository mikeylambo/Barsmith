/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNextWords } from '../services/wordbank.js';
import { computeStreak, importAllData } from '../services/storage.js';
import { fetchDictData } from '../services/dictionary.js';
import { BeatScheduler } from '../services/audio-clock.js';

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
});
