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
  totals:       'barsmithTotals',       // likewise — see loadTotals
  daily:        'barsmithDaily',        // today's prescribed session — see services/daily.js
  draft:        'barsmithDraft',
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

// ── Active-session draft (crash/reload recovery) ──
// Bar Pad notes only become a permanent History record when a session ends
// normally. If the tab is closed, the browser crashes, or iOS purges the
// page mid-session, that text would otherwise vanish with nothing written
// to disk yet. This mirrors the in-progress notes continuously so a writer
// can never lose a bar to an unexpected close.
export const loadDraft = () => safeGet(STORAGE_KEYS.draft, null);
export const saveDraft = (draft) => safeSet(STORAGE_KEYS.draft, draft);
export const clearDraft = () => { try { localStorage.removeItem(STORAGE_KEYS.draft); } catch {} };

export const hasSeenInfo = () => { try { return !!localStorage.getItem(STORAGE_KEYS.seen); } catch { return false; } };
export const markSeenInfo = () => { try { localStorage.setItem(STORAGE_KEYS.seen, '1'); } catch {} };

// ── Practice-day streak storage ──
// Stored independently of sessionHistory (which is capped at 20 entries) so
// a writer doing 4+ sessions/day never loses streak data to history rollover.
export const loadPracticeDays = () => safeGet(STORAGE_KEYS.practiceDays, []);
export const recordPracticeDay = (dateString) => {
  const days = new Set(loadPracticeDays());
  days.add(dateString);
  // Date strings are human-readable (Date#toDateString), so sort by parsed date rather
  // than lexicographically before applying the bounded retention cap.
  const sorted = [...days].sort((a, b) => new Date(a) - new Date(b)).slice(-400);
  safeSet(STORAGE_KEYS.practiceDays, sorted);
};

// ── Lifetime training totals ──
// Stored independently of sessionHistory for the same reason practiceDays is: history
// keeps only the most recent 100 sessions, so anything cumulative derived from it would
// start SHRINKING once a writer passes that mark. On a progress screen whose whole
// purpose is showing accumulation, a total that goes down is worse than no total at all.
//
// This is dumb persistence only. The seeding and accumulation rules live in
// services/progress.js so they stay pure and testable.
export const EMPTY_TOTALS = {
  version: 1,
  seeded: false,      // set once existing history has been folded in — see seedTotals
  bars: 0,
  sessions: 0,
  seconds: 0,
  words: [],          // distinct prompt words the writer has actually written a bar on
  bestBars: 0,        // most bars in a single session
  bestSeconds: 0,     // longest single session
};

export const loadTotals = () => {
  const stored = safeGet(STORAGE_KEYS.totals, null);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { ...EMPTY_TOTALS };
  // Spread over the defaults so a record written by an older build gains new fields
  // rather than rendering as undefined.
  return { ...EMPTY_TOTALS, ...stored, words: Array.isArray(stored.words) ? stored.words : [] };
};
export const saveTotals = (totals) => safeSet(STORAGE_KEYS.totals, totals);

// ── Daily prescribed session ──
// `{ completed: ['Thu Jul 30 2026', ...], count: n }`. Tiny by design — the prescription
// itself is derived from the date, so nothing about it needs storing, only which days
// have been done. `count` is a lifetime tally that survives the list being capped.
export const loadDaily = () => {
  const stored = safeGet(STORAGE_KEYS.daily, null);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { completed: [], count: 0 };
  return {
    // Records written before the week view existed held a single `lastCompleted` string.
    // Promote it so an upgrading writer keeps credit for the day they already did.
    completed: Array.isArray(stored.completed)
      ? stored.completed.filter(d => typeof d === 'string')
      : (typeof stored.lastCompleted === 'string' ? [stored.lastCompleted] : []),
    count: Number.isFinite(stored.count) ? stored.count : 0,
  };
};
export const saveDaily = (daily) => safeSet(STORAGE_KEYS.daily, daily);

export function computeStreak(practiceDays) {
  if (!practiceDays.length) return 0;
  const days = new Set(practiceDays);
  const todayDate = new Date();
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const today = todayDate.toDateString();
  const yesterday = yesterdayDate.toDateString();
  if (!days.has(today) && !days.has(yesterday)) return 0;
  let streak = 0;
  const d = days.has(today) ? todayDate : yesterdayDate;
  while (days.has(d.toDateString())) {
    streak++;
    // Calendar-date arithmetic stays correct across 23/25-hour DST transition days.
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ── Export / import (data portability) ──
const BACKUP_VERSION = 1;

export function exportAllData() {
  return JSON.stringify({
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    vault: loadVault(),
    history: loadHistory(),
    prefs: loadPrefs(),
    customWords: loadCustomWords(),
    practiceDays: loadPracticeDays(),
    sessionLimit: loadSessionLimit(),
    // Included so a training log survives moving devices. Without it, a restore could
    // only rebuild totals from the 100 sessions History retains, silently erasing the
    // lifetime record of anyone past that mark.
    totals: loadTotals(),
  }, null, 2);
}

export function importAllData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') return { ok: false, error: 'Not a valid backup file.' };

    if (data.version !== undefined && data.version > BACKUP_VERSION) {
      return { ok: false, error: `This backup was made by a newer version of Barsmith (v${data.version}) and can't be safely restored here.` };
    }

    // Shape-check each field before writing anything — a partially-invalid
    // file should fail entirely rather than silently corrupt one store
    // while leaving others untouched.
    const isVaultArray = (v) => Array.isArray(v) && v.every(i => i && typeof i === 'object' && typeof i.word === 'string');
    const isHistoryArray = (v) => Array.isArray(v) && v.every(i => i && typeof i === 'object' && typeof i.id !== 'undefined');
    const isStringArray = (v) => Array.isArray(v) && v.every(i => typeof i === 'string');
    // typeof null === 'object' and typeof [] === 'object', so a plain typeof check alone
    // would wrongly accept both as valid prefs — guard against those explicitly.
    const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
    const isValidSessionLimit = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

    if (data.vault        !== undefined && !isVaultArray(data.vault))         return { ok: false, error: 'Vault data is malformed.' };
    if (data.history      !== undefined && !isHistoryArray(data.history))     return { ok: false, error: 'History data is malformed.' };
    if (data.customWords  !== undefined && !isStringArray(data.customWords))  return { ok: false, error: 'Custom words are malformed.' };
    if (data.practiceDays !== undefined && !isStringArray(data.practiceDays)) return { ok: false, error: 'Practice-day data is malformed.' };
    if (data.prefs        !== undefined && !isPlainObject(data.prefs))        return { ok: false, error: 'Preferences data is malformed.' };
    if (data.sessionLimit !== undefined && !isValidSessionLimit(data.sessionLimit)) return { ok: false, error: 'Session timer data is malformed.' };
    // Totals predate no backup version bump, so an older file simply omits them and the
    // caller rebuilds from history instead.
    const isTotals = (v) => isPlainObject(v)
      && ['bars', 'sessions', 'seconds'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))
      && (v.words === undefined || isStringArray(v.words));
    if (data.totals !== undefined && !isTotals(data.totals)) return { ok: false, error: 'Training totals are malformed.' };

    if (data.vault)        saveVault(data.vault);
    if (data.history)       saveHistory(data.history);
    if (data.prefs)         savePrefs(data.prefs);
    if (data.customWords)  saveCustomWords(data.customWords);
    if (data.practiceDays) safeSet(STORAGE_KEYS.practiceDays, data.practiceDays);
    if (data.sessionLimit !== undefined) saveSessionLimit(data.sessionLimit);
    if (data.totals) saveTotals({ ...EMPTY_TOTALS, ...data.totals, seeded: true });
    // Report whether the file carried totals so the caller knows to rebuild them from
    // the restored history — a backup written before this feature existed has none.
    return { ok: true, hadTotals: !!data.totals };
  } catch (e) {
    return { ok: false, error: 'File is not valid JSON.' };
  }
}
