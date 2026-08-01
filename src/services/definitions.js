// ─────────────────────────────────────────────
// OFFLINE DEFINITIONS
//
// The last piece of the reference that needed a network. Rhymes, syllable counts and
// stress went on-device with services/rhyme.js; this closes the hole, so locking a word
// in airplane mode gives the whole panel rather than three quarters of it.
//
// Scoped to the word banks, because that is the only place the panel ever opens from.
// A personal word a writer added still falls back to the network — and says so when
// there isn't one, rather than showing an empty box.
//
// Definitions are Princeton WordNet's; see src/data/DEFINITION-LICENSE.
// ─────────────────────────────────────────────

import payloadUrl from '../data/definitions.txt?url';

let index = null;
let loading = null;

function build(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    map.set(line.slice(0, sp), line.slice(sp + 1));
  }
  return map;
}

/** Fetch and parse the payload. Idempotent; concurrent callers share one request. */
export function loadDefinitions() {
  if (index) return Promise.resolve(index);
  if (!loading) {
    loading = fetch(payloadUrl)
      .then(r => { if (!r.ok) throw new Error(`definitions ${r.status}`); return r.text(); })
      .then(text => { index = build(text); return index; })
      .catch(err => { loading = null; throw err; });
  }
  return loading;
}

/**
 * Local definitions for a word, or null if it is outside the banks.
 *
 * Shaped to match what the panel already renders from the network, so neither the
 * component nor the caller has to know which source a definition came from.
 *
 * @returns {Array<{pos: string, text: string}>|null}
 */
export function lookupDefinition(word) {
  if (!index) return null;
  const row = index.get(String(word || '').trim().toLowerCase());
  if (!row) return null;
  return row.split('·').map(sense => {
    const bar = sense.indexOf('|');
    return bar < 0 ? { pos: '', text: sense } : { pos: sense.slice(0, bar), text: sense.slice(bar + 1) };
  });
}

/** Test seam: build from a literal payload rather than fetching. */
export function _setDefinitionsFromText(text) {
  index = build(text);
  loading = Promise.resolve(index);
  return index;
}
export function _resetDefinitions() { index = null; loading = null; }
