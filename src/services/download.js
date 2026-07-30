// ─────────────────────────────────────────────
// DOWNLOAD SERVICE
// One place for "turn this data into a file the user actually receives".
// Previously this logic was inlined in App.jsx's backup handler; the text
// exporters, the bar-card share fallback, and the crash-recovery screen all need
// the same behaviour, and the mobile-Safari timing quirk below is easy to get
// wrong more than once.
// ─────────────────────────────────────────────

/**
 * Trigger a browser download for a blob. The single implementation — everything
 * else here funnels through it.
 *
 * @param {string} filename  Suggested name, extension included.
 * @param {Blob}   blob      File body.
 */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Firefox requires the anchor to be in the document for programmatic clicks
  // on an object URL to be honoured.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Mobile Safari can need a moment to actually start the download before the
  // object URL is revoked — revoking synchronously right after click() risks
  // the download silently failing there.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Trigger a browser download for in-memory text.
 *
 * @param {string} filename  Suggested name, extension included.
 * @param {string} text      File body.
 * @param {string} mime      Content type; defaults to plain text.
 */
export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

/**
 * `2026-07-30` — used to stamp export filenames. Falls back to today rather than
 * throwing: callers derive this from a stored session date, and `toISOString()`
 * raises on an Invalid Date, which would turn one malformed record into a dead
 * export button.
 */
export const dateStamp = (d = new Date()) => {
  const date = Number.isNaN(d?.getTime?.()) ? new Date() : (d ?? new Date());
  return date.toISOString().slice(0, 10);
};
