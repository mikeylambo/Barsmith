/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  snapshotForRescue, loadRescue, clearRescue, currentDataSummary,
  exportAllData, importAllData, saveVault, saveHistory, saveCustomWords,
  loadHistory, loadVault,
} from '../services/storage.js';

const session = (id, bars) => ({
  id, date: new Date('2026-08-01T10:00:00Z').toISOString(), duration: 300,
  notes: Object.fromEntries(bars.map((t, i) => [`w${i}`, { e1: t }])),
  frozenWords: [],
});

describe('a restore can be undone', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('the snapshot describes what was there, so the undo can be labelled', () => {
    saveHistory([session('a', ['one bar', 'two bar']), session('b', ['three bar'])]);
    saveVault([{ word: 'scorch', addedAt: 1 }]);

    expect(snapshotForRescue()).toBe(true);
    const snap = loadRescue();
    expect(snap.sessions).toBe(2);
    expect(snap.bars).toBe(3);        // counted across sessions, not sessions counted twice
    expect(snap.savedAt).toBeTruthy();
  });

  it("doesn't count empty bar-pad entries as bars", () => {
    saveHistory([session('a', ['a real bar', '   ', ''])]);
    snapshotForRescue();
    expect(loadRescue().bars).toBe(1);
  });

  // The scenario this whole feature exists for: back up Monday, write Wednesday,
  // then restore Monday's file by mistake.
  it('puts Wednesday back after Monday’s backup overwrote it', () => {
    saveHistory([session('mon', ['monday bar'])]);
    saveVault([{ word: 'anvil', addedAt: 1 }]);
    const mondayBackup = exportAllData();

    // Wednesday's work.
    saveHistory([session('mon', ['monday bar']), session('wed', ['wednesday bar'])]);
    saveCustomWords(['grime']);
    expect(currentDataSummary().sessions).toBe(2);

    // The mistake.
    expect(snapshotForRescue()).toBe(true);
    expect(importAllData(mondayBackup).ok).toBe(true);
    expect(loadHistory()).toHaveLength(1);          // Wednesday is gone from live storage

    // The undo.
    const snap = loadRescue();
    expect(importAllData(snap.data).ok).toBe(true);
    const back = loadHistory();
    expect(back).toHaveLength(2);
    expect(back.map(s => s.id)).toContain('wed');
    expect(JSON.stringify(back)).toContain('wednesday bar');
  });

  it('survives the app being closed and reopened — it lives in storage, not memory', () => {
    saveHistory([session('a', ['kept'])]);
    snapshotForRescue();
    // Nothing in-memory carries over between loads; loadRescue reads storage each time.
    expect(loadRescue()?.data).toContain('kept');
  });

  it('reports failure when storage refuses it, rather than promising an undo', () => {
    saveHistory([session('a', ['x'])]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    expect(snapshotForRescue()).toBe(false);
  });

  it('clears on request', () => {
    saveHistory([session('a', ['x'])]);
    snapshotForRescue();
    expect(loadRescue()).toBeTruthy();
    clearRescue();
    expect(loadRescue()).toBeNull();
  });

  it('summarises current data for the restore dialog', () => {
    saveHistory([session('a', ['x'])]);
    saveVault([{ word: 'one', addedAt: 1 }, { word: 'two', addedAt: 2 }]);
    saveCustomWords(['mine']);
    expect(currentDataSummary()).toEqual({ sessions: 1, vault: 2, customWords: 1 });
  });
});
