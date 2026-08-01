// ─────────────────────────────────────────────
// VERCEL WEB ANALYTICS PROVIDER
//
// The provider half of the analytics seam. Kept separate from services/analytics.js so
// the rules — never content, always bucketed, off means off — are enforced in one place
// regardless of where the data ends up, and so swapping providers is one file.
//
// Vercel is the default because the app already deploys there and its Web Analytics is
// cookieless and needs no consent banner. It is loaded from the deployment's own
// `/_vercel/insights/script.js`, so there is no third-party origin involved and the
// service worker's precache is unaffected.
//
// Nothing here runs in development or on localhost: local traffic is not data, and it
// would pollute the numbers the whole exercise exists to produce.
// ─────────────────────────────────────────────

const SCRIPT = '/_vercel/insights/script.js';

let ready = false;

/** Queue events fired before the script has landed, then flush. Bounded — analytics
 *  must never grow without limit in a tab someone left open for a week. */
const pending = [];
const MAX_PENDING = 30;

function flush() {
  while (pending.length) {
    const [name, props] = pending.shift();
    try { window.va?.('event', { name, ...props }); } catch { /* ignore */ }
  }
}

/**
 * Load the Vercel script and return a send function for the seam.
 *
 * Returns a no-op sender when analytics has no business running — the caller does not
 * have to know why, only that calling it is safe.
 */
export function createVercelProvider() {
  if (typeof window === 'undefined') return () => {};

  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  if (isLocal || import.meta.env?.DEV) return () => {};

  // The queue stub Vercel's script expects to find already present.
  window.va = window.va || function (...args) { (window.vaq = window.vaq || []).push(args); };

  const el = document.createElement('script');
  el.src = SCRIPT;
  el.defer = true;
  el.onload = () => { ready = true; flush(); };
  // A blocked or failed script is a normal outcome, not an error worth surfacing: the
  // app works identically without it.
  el.onerror = () => { ready = false; pending.length = 0; };
  document.head.appendChild(el);

  return (name, props) => {
    if (ready) { window.va?.('event', { name, ...props }); return; }
    if (pending.length < MAX_PENDING) pending.push([name, props]);
  };
}
