// ─────────────────────────────────────────────
// STORAGE SERVICE
// All localStorage access for the app goes through here. Centralizing this
// means a single audit point for what's persisted, easier migration if we
// ever move to IndexedDB or cloud sync, and no risk of a key typo causing
// silent data loss in a random component.
// ─────────────────────────────────────────────

export const STORAGE_KEYS = {
  vault:        'barsmithVault',
  history:      'barsmithHistory',
  seen:         'barsmithHasSeenInfo',
  prefs:        'barsmithPrefs',
  sessionLimit: 'barsmithSessionLimit',
  customWords:  'barsmithCustomWords',
  practiceDays: 'barsmithPracticeDays', // independent of history retention
};

function safeGet(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    return s !== null ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadPrefs = () => safeGet(STORAGE_KEYS.prefs, {});
export const savePrefs = (prefs) => safeSet(STORAGE_KEYS.prefs, prefs);

export const loadVault = () => {
  // Backward-compat with the old flowForgeVault key from earlier builds.
  try {
    const s = localStorage.getItem(STORAGE_KEYS.vault) || localStorage.getItem('flowForgeVault');
    if (!s) return [];
    return JSON.parse(s).map(i =>
      typeof i === 'string' ? { word: i, addedAt: Date.now() } : { word: i.word, addedAt: i.addedAt || Date.now() }
    );
  } catch { return []; }
};
export const saveVault = (vault) => safeSet(STORAGE_KEYS.vault, vault);

export const loadHistory = () => safeGet(STORAGE_KEYS.history, []);
export const saveHistory = (history) => safeSet(STORAGE_KEYS.history, history);

export const loadSessionLimit = () => {
  try { return parseInt(localStorage.getItem(STORAGE_KEYS.sessionLimit) || '0') || 0; }
  catch { return 0; }
};
export const saveSessionLimit = (limit) => {
  try { localStorage.setItem(STORAGE_KEYS.sessionLimit, String(limit)); } catch {}
};

export const loadCustomWords = () => safeGet(STORAGE_KEYS.customWords, []);
export const saveCustomWords = (words) => safeSet(STORAGE_KEYS.customWords, words);

export const hasSeenInfo = () => !!localStorage.getItem(STORAGE_KEYS.seen);
export const markSeenInfo = () => { try { localStorage.setItem(STORAGE_KEYS.seen, '1'); } catch {} };

// ── Practice-day streak storage ──
// Stored independently of sessionHistory (which is capped at 20 entries) so
// a writer doing 4+ sessions/day never loses streak data to history rollover.
export const loadPracticeDays = () => safeGet(STORAGE_KEYS.practiceDays, []);
export const recordPracticeDay = (dateString) => {
  const days = new Set(loadPracticeDays());
  days.add(dateString);
  // Cap at 400 days of history — generous, but bounded so storage can't grow forever.
  const sorted = [...days].sort().slice(-400);
  safeSet(STORAGE_KEYS.practiceDays, sorted);
};

export function computeStreak(practiceDays) {
  if (!practiceDays.length) return 0;
  const days = new Set(practiceDays);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (!days.has(today) && !days.has(yesterday)) return 0;
  let streak = 0;
  let d = days.has(today) ? new Date() : new Date(Date.now() - 86400000);
  while (days.has(d.toDateString())) {
    streak++;
    d = new Date(d - 86400000);
  }
  return streak;
}

// ── Export / import (data portability) ──
export function exportAllData() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    vault: loadVault(),
    history: loadHistory(),
    prefs: loadPrefs(),
    customWords: loadCustomWords(),
    practiceDays: loadPracticeDays(),
  }, null, 2);
}

export function importAllData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (data.vault) saveVault(data.vault);
    if (data.history) saveHistory(data.history);
    if (data.prefs) savePrefs(data.prefs);
    if (data.customWords) saveCustomWords(data.customWords);
    if (data.practiceDays) safeSet(STORAGE_KEYS.practiceDays, data.practiceDays);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
