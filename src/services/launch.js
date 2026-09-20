// ─────────────────────────────────────────────
// LAUNCH ACTION
// The seam between a home-screen quick action and the running app.
//
// Installed as a PWA, Barsmith's icon supports long-press shortcuts (see the
// `shortcuts` field in public/manifest.json). Each one opens the app at `/?do=…`,
// and this reads that intent so App can act on it the moment the app is up —
// dropping the writer straight into a session instead of the idle screen, which
// is the whole point of a shortcut for a tool used in short, frequent bursts.
//
// Pure and string-in/string-out so the parsing rules can be tested without a real
// Location. App owns clearing the URL afterward (history.replaceState) so a reload
// or a share of the address never re-fires the action.
// ─────────────────────────────────────────────

/** The intents a quick action may carry. Anything else is ignored. */
export const LAUNCH_ACTIONS = {
  DAILY: 'daily',      // start today's prescribed session
  SESSION: 'session',  // start a freeform session with the writer's saved settings
  RHYMES: 'rhymes',    // open the rhyme reference
};

const KNOWN = new Set(Object.values(LAUNCH_ACTIONS));

/**
 * Read the launch intent from a URL query string (e.g. `?do=daily`).
 *
 * @param {string} search  location.search, with or without the leading '?'.
 * @returns {string|null}  One of LAUNCH_ACTIONS, or null when there is none.
 */
export function parseLaunchAction(search) {
  if (!search || typeof search !== 'string') return null;
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const action = params.get('do');
    return action && KNOWN.has(action) ? action : null;
  } catch {
    return null;
  }
}
