// ─────────────────────────────────────────────
// ANALYTICS
//
// Barsmith shipped its retention features — the training log, the daily prescription,
// the week strip — with no way to tell whether any of them work. This is that way.
//
// The design constraint is the app's own promise. Everything a writer produces stays on
// the device, and that stays exactly true: **no bar, no word, no vault entry, no search
// query is ever sent.** What goes out is counts of things happening, bucketed, with no
// identifier attached — enough to answer "do people who follow the daily prescription
// come back more than people who don't", and nothing else.
//
// Three rules the rest of this file exists to enforce:
//
//  1. **Never content.** `track()` accepts a fixed set of event names and numeric or
//     enumerated properties. There is no path through it that can carry a string a
//     writer typed. This is a structural guarantee, not a convention — see BUCKETS.
//  2. **Bucketed, never exact.** "12 bars in a session" is a fact about one person;
//     "6-15 bars" is a fact about a population. Exact counts plus a timestamp start to
//     look like a fingerprint, and nothing here needs the resolution.
//  3. **Off means off.** The toggle is checked at call time, not at load, so switching
//     it off stops the very next event. Do Not Track is honoured without asking.
//
// The provider is behind a seam, like services/share.js. Vercel Web Analytics is the
// default because the app already deploys there and it is cookieless, but swapping it
// is one function.
// ─────────────────────────────────────────────

import { loadAnalyticsOptOut } from './storage';

/** Every event the app is allowed to send. An unknown name is dropped, loudly in dev. */
export const EVENTS = {
  APP_OPEN: 'app_open',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  DAILY_COMPLETE: 'daily_complete',
  PROGRESS_OPEN: 'progress_open',
  RHYME_SEARCH: 'rhyme_search',
  WORD_LOCK: 'word_lock',
  BAR_SHARE: 'bar_share',
  EXPORT: 'export',
};
const KNOWN = new Set(Object.values(EVENTS));

/**
 * Bucket a count into a range label.
 *
 * The whole privacy argument rests on this: a population is described just as well by
 * "6-15 bars" as by "12", and only one of those two starts to identify anybody when
 * combined with a timestamp.
 */
export function bucket(n, edges) {
  const v = Number(n) || 0;
  for (let i = 0; i < edges.length; i++) if (v <= edges[i]) return i === 0 ? `0-${edges[0]}` : `${edges[i - 1] + 1}-${edges[i]}`;
  return `${edges[edges.length - 1] + 1}+`;
}

export const BUCKETS = {
  bars: (n) => bucket(n, [0, 2, 5, 15, 30]),
  minutes: (n) => bucket(n, [1, 5, 10, 20]),
  sessions: (n) => bucket(n, [1, 5, 20, 50, 200]),
  days: (n) => bucket(n, [0, 1, 7, 30, 90, 365]),
  streak: (n) => bucket(n, [0, 2, 6, 29]),
};

/**
 * Whether anything may be sent right now.
 *
 * Read on every call rather than cached, so the Settings toggle takes effect on the very
 * next event instead of the next reload — a switch that needs a restart to mean anything
 * is not really a switch.
 */
export function analyticsEnabled() {
  if (typeof window === 'undefined') return false;
  if (loadAnalyticsOptOut()) return false;
  // Do Not Track is a request, and honouring it costs nothing worth having.
  const dnt = navigator.doNotTrack ?? window.doNotTrack ?? navigator.msDoNotTrack;
  if (dnt === '1' || dnt === 'yes') return false;
  return true;
}

/**
 * Values a property is allowed to hold: a bucket label, a short enum, or a small integer.
 * Anything else is dropped rather than sent, because "anything else" is where a bar would
 * get in.
 */
const SAFE = /^[a-z0-9+_-]{1,24}$/;
function sanitize(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (!SAFE.test(k)) continue;
    if (typeof v === 'boolean') { out[k] = v; continue; }
    if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1000) { out[k] = Math.round(v); continue; }
    if (typeof v === 'string' && SAFE.test(v)) { out[k] = v; continue; }
    // Silently dropping is deliberate: a property that fails this test is a bug in the
    // call site, and the safe failure is to send less rather than to send it anyway.
  }
  return out;
}

/** Swappable provider. Set by initAnalytics; a no-op until then. */
let send = () => {};

/**
 * Point the seam at a provider. `fn` receives `(name, props)` and must not throw.
 * Called once at start-up; tests replace it directly.
 */
export function setAnalyticsProvider(fn) {
  send = typeof fn === 'function' ? fn : () => {};
}

/**
 * Record something that happened. Never throws, never blocks, never carries content.
 */
export function track(name, props) {
  if (!KNOWN.has(name)) {
    if (import.meta.env?.DEV) console.warn(`[analytics] unknown event "${name}" dropped`);
    return false;
  }
  if (!analyticsEnabled()) return false;
  try {
    send(name, sanitize(props));
    return true;
  } catch {
    // Analytics failing must never be visible to a writer mid-bar.
    return false;
  }
}

/** Test seam. */
export function _sanitize(props) { return sanitize(props); }
