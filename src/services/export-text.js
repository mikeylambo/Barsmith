// ─────────────────────────────────────────────
// TEXT EXPORT SERVICE
// Turns session records into text a writer can actually use elsewhere.
//
// Until now, bars could leave Barsmith exactly two ways: one note at a time
// through a Copy button, or as a JSON backup that only Barsmith can read. That
// made the app a place bars went into rather than came out of — the opposite of
// what a capture tool is for. These helpers produce plain text (not Markdown)
// because the realistic destination is a notes app, a lyric doc, or a DAW
// comment field, none of which render Markdown.
// ─────────────────────────────────────────────

const RULE = '────────────────────────────────────';

/**
 * Notes are stored per-word as `{ [entryId]: text }`, so the same word locked
 * twice in one session keeps both bars instead of overwriting. Records written
 * before that change stored a single string per word; both shapes flatten to
 * `[word, entryKey, text][]`.
 *
 * This is the canonical implementation — App.jsx imports it and passes it down
 * so the screens and the exporters can never drift apart on note shape.
 */
export function flattenNotes(notesObj) {
  const out = [];
  Object.entries(notesObj || {}).forEach(([word, val]) => {
    if (val && typeof val === 'object') {
      Object.entries(val).forEach(([entryId, text]) => out.push([word, entryId, text]));
    } else if (typeof val === 'string') {
      out.push([word, 'legacy', val]);
    }
  });
  return out;
}

/** Written bars only — blank Bar Pad entries are noise in an export. */
const writtenBars = (session) =>
  flattenNotes(session?.notes).filter(([, , text]) => text?.trim());

/** True when a session has at least one written bar. */
export const hasBars = (session) => writtenBars(session).length > 0;

const fmtDuration = (secs) => `${Math.floor((secs || 0) / 60)}:${String((secs || 0) % 60).padStart(2, '0')}`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

/** The stat line under a session heading, e.g. `12:30 session · 24 words · Level 2 · 90 BPM`. */
function sessionMeta(session) {
  const parts = [`${fmtDuration(session.duration)} session`];
  if (session.wordsSeen) parts.push(plural(session.wordsSeen, 'word'));
  if (session.source === 'vault') parts.push('Saved words');
  else if (session.source === 'recovered') parts.push('Recovered draft');
  else if (session.tier) parts.push(`Level ${session.tier}`);
  if (session.pace) parts.push(session.pace);
  return parts.join(' · ');
}

/**
 * One session as plain text.
 *
 * @param {object} session          A history record.
 * @param {object} [opts]
 * @param {boolean} [opts.heading]  Include the date/stat header. Off when the
 *                                  caller is writing its own (archive export).
 */
export function sessionToText(session, { heading = true } = {}) {
  if (!session) return '';
  const lines = [];

  if (heading) {
    lines.push(`BARSMITH · ${fmtWhen(session.date)}`, sessionMeta(session), RULE, '');
  }

  const bars = writtenBars(session);
  if (bars.length) {
    bars.forEach(([word, , text], i) => {
      lines.push(word.toUpperCase(), text.trim());
      if (i < bars.length - 1) lines.push('');
    });
  } else {
    lines.push('(no bars written)');
  }

  if (session.frozenWords?.length) {
    lines.push('', 'FROZEN WORDS', session.frozenWords.join(' · '));
  }

  return lines.join('\n');
}

/**
 * Just the bar text of one session, one bar per paragraph, with no word labels
 * or metadata. This is the "give me only what I wrote" clipboard shape — the
 * form you paste straight into a verse you're building.
 */
export function sessionBarsOnly(session) {
  return writtenBars(session)
    .map(([, , text]) => text.trim())
    .join('\n\n');
}

/**
 * The whole archive as one text file, newest session first.
 *
 * Sessions with nothing written are skipped rather than padded with `(no bars
 * written)` — in a 100-session archive those are pure noise. The counts in the
 * header describe what was actually written out, so a writer can tell at a
 * glance whether the file holds everything they expected.
 */
export function historyToText(sessions) {
  const withBars = (sessions || []).filter(hasBars);
  const barCount = withBars.reduce((n, s) => n + writtenBars(s).length, 0);

  const header = [
    'BARSMITH — BAR ARCHIVE',
    `Exported ${fmtWhen(new Date().toISOString())}`,
    `${plural(barCount, 'bar')} across ${plural(withBars.length, 'session')}`,
  ];

  if (!withBars.length) {
    return [...header, '', 'No written bars found in your session history.'].join('\n');
  }

  const body = withBars.map(s => [
    RULE,
    fmtWhen(s.date),
    sessionMeta(s),
    '',
    sessionToText(s, { heading: false }),
  ].join('\n'));

  return [...header, '', ...body, '', RULE].join('\n');
}
