// ─────────────────────────────────────────────
// CHANGELOG
// What's new, and the rule for when to show it.
//
// The v5.x work — the service worker, the accessibility pass, the LRU dictionary
// cache, the front-camera picker, the restore-you-can-take-back — all shipped
// invisibly. A writer got real quality improvements and never saw one of them, so
// the polish read as nothing changing. This surfaces it: a small "what's new" note
// after an update, dismissible, gone until the next version ships.
//
// The entries are the single source of truth for the current version too — the top
// entry's version IS this build's version, and a test pins it to package.json so the
// two can never drift.
// ─────────────────────────────────────────────

/**
 * Releases, newest first. Keep this in step with package.json — the top entry's
 * `version` is what the app reports as its current build. Each entry is a short,
 * writer-facing note, not the engineering detail that lives in RELEASE_NOTES.md.
 */
export const CHANGELOG = [
  {
    version: '5.20.0',
    title: 'Goals, recaps, and a faster way in',
    items: [
      'Set a session goal — a number of bars or minutes — and get a clear mark the moment you hit it.',
      'Share a session recap: your stats and a bar you choose, drawn as one image built for posting.',
      'Long-press the app icon to jump straight into today’s session, a freeform one, or the rhyme finder.',
      'A short walkthrough on first launch, and this “what’s new” note after every update.',
    ],
  },
];

/** The current build, taken from the newest entry so there is one source of truth. */
export const CURRENT_VERSION = CHANGELOG[0]?.version || '0.0.0';

/**
 * Compare two dotted version strings numerically.
 *
 * Returns a negative number when a < b, positive when a > b, 0 when equal. Missing
 * segments count as 0, so '5.20' and '5.20.0' compare equal. Non-numeric or absent
 * input sorts as the lowest possible version, which is what makes a first-ever run
 * (no version stored yet) read as "older than everything".
 */
export function compareVersions(a, b) {
  const parse = (v) => String(v ?? '').split('.').map(n => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** The entries newer than a given version — what a writer hasn't seen yet. */
export function entriesSince(lastSeen) {
  if (!lastSeen) return [];
  return CHANGELOG.filter(e => compareVersions(e.version, lastSeen) > 0);
}

/**
 * Should the changelog open, given a STORED last-seen version?
 *
 *  - `lastSeen < current` — a genuine update happened since the writer last looked. Show it.
 *  - `lastSeen >= current` — already current. Nothing to show.
 *  - `lastSeen == null` — false: there is no stored version to diff against. This function
 *    deliberately does not decide the null case, because the answer depends on context the
 *    caller holds: a brand-new install baselines silently (and sees the walkthrough
 *    instead), while an existing writer upgrading to the first changelog-capable build is
 *    introduced to it. App.jsx tells the two apart with hasSeenInfo.
 *
 * @param {string|null} lastSeen
 * @param {string} [current]
 */
export function shouldShowChangelog(lastSeen, current = CURRENT_VERSION) {
  if (!lastSeen) return false;
  return compareVersions(current, lastSeen) > 0;
}
