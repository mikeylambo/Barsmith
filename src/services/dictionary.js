// ─────────────────────────────────────────────
// DICTIONARY SERVICE
// Synonym, antonym and definition lookups against dictionaryapi.dev and Datamuse.
// Pulled out of the component tree so it's independently testable and so the
// URL-encoding/abort logic lives in exactly one place.
//
// Rhymes and syllable counts no longer come from here. They are computed on-device by
// services/rhyme.js, so the half of this panel a writer actually uses mid-session keeps
// working with no network — and gives multis and slants rather than one flat list.
// Definitions still need the network; when it is not there, the panel says so and the
// rhymes are still right.
// ─────────────────────────────────────────────

// Bounded LRU cache. A Map preserves insertion order; deleting-then-reinserting on a
// hit moves the entry to the back, so the oldest *least recently used* entry is always
// at the front. Cap at 300 — plenty for even a very long multi-hour session.
import { loadRhymeIndex, findRhymes } from './rhyme';
import { loadDefinitions, lookupDefinition } from './definitions';

let DICT_CACHE_MAX = 300;
const dictCache = new Map();
function cacheGet(key) {
  if (!dictCache.has(key)) return undefined;
  const value = dictCache.get(key);
  // Refresh recency: remove and re-add so this is the newest entry in insertion order.
  dictCache.delete(key);
  dictCache.set(key, value);
  return value;
}
function cacheSet(key, value) {
  if (dictCache.has(key)) dictCache.delete(key); // refresh position if key exists
  if (dictCache.size >= DICT_CACHE_MAX) dictCache.delete(dictCache.keys().next().value); // evict LRU
  dictCache.set(key, value);
}

async function fetchWithAbort(url, signal) {
  try {
    const r = await fetch(url, { signal });
    return r.ok ? r.json() : null;
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return null;
  }
}

/**
 * Fetch rhymes/synonyms/antonyms/definitions/syllables for a word.
 * Multi-word phrases are short-circuited — the underlying APIs have no
 * concept of phrase rhymes, and silently sending a phrase as a "word"
 * produces confusing 404s instead of useful data.
 */
export async function fetchDictData(rawWord, signal) {
  const w = rawWord.trim().toLowerCase();

  if (/\s/.test(w)) {
    return {
      definitions: [{ text: "Phrases don't have rhyme or dictionary data — write your bar below." }],
      rhymes: [], synonyms: [], antonyms: [], syllables: null, isPhrase: true,
    };
  }

  const hit = cacheGet(w);
  if (hit) return hit;

  const enc = encodeURIComponent(w);
  // Rhymes are local and synchronous once the index is warm, so they are resolved before
  // the network is even asked. A dictionary outage costs the definition, not the rhymes.
  let local = null;
  let localDefs = null;
  try {
    await loadRhymeIndex();
    local = findRhymes(w);
  } catch { /* payload unavailable; fall through with no local data */ }
  try {
    await loadDefinitions();
    localDefs = lookupDefinition(w);
  } catch { /* same */ }

  const [dictPayload, syns, ants, meansLike] = await Promise.all([
    fetchWithAbort(`https://api.dictionaryapi.dev/api/v2/entries/en/${enc}`, signal),
    fetchWithAbort(`https://api.datamuse.com/words?rel_syn=${enc}`, signal),
    fetchWithAbort(`https://api.datamuse.com/words?rel_ant=${enc}`, signal),
    fetchWithAbort(`https://api.datamuse.com/words?ml=${enc}`, signal),
  ]);

  // A total transport failure used to be fatal, because every field came from the
  // network. Now the rhymes survive it, so it only means "no definition" — and the
  // result is still worth caching and showing.
  const offline = [dictPayload, syns, ants, meansLike].every(v => v === null);
  if (offline && !local?.found && !localDefs) throw new Error('Network error');

  let defs = [], foundSyn = [], foundAnt = [];
  dictPayload?.[0]?.meanings?.forEach(m => {
    m.definitions?.slice(0, 2).forEach(d => defs.push({ pos: m.partOfSpeech, text: d.definition }));
    if (m.synonyms) foundSyn.push(...m.synonyms);
    if (m.antonyms) foundAnt.push(...m.antonyms);
  });

  const clean = (a) => [...new Set(a)].map(x => x.toLowerCase()).filter(x => /^[a-z]+$/.test(x) && x !== w);

  if (syns) foundSyn.push(...syns.map(s => s.word));
  if (!foundSyn.length && meansLike) foundSyn.push(...meansLike.map(s => s.word));
  if (ants) foundAnt.push(...ants.map(a => a.word));

  // Mid-session the panel has room for one short list, so it shows the strongest kind of
  // rhyme the word actually has and says which kind that is. A writer who wants the full
  // map opens Rhyme Search; here the point is to hand back something usable without
  // breaking the flow of the round.
  const best = !local?.found ? null
    : local.perfect.length ? { label: 'Perfect Rhymes', words: local.perfect }
    : local.multi.length ? { label: 'Multis', words: local.multi }
    : local.slant.length ? { label: 'Slant Rhymes', words: local.slant }
    : local.assonance.length ? { label: 'Assonance', words: local.assonance }
    : null;

  // The network entry wins when there is one — dictionaryapi.dev carries more senses and
  // fresher usage than a 2006 WordNet dump. The local copy is what makes the panel work
  // without it, not a preferred source.
  const definitions = defs.length ? defs.slice(0, 3) : (localDefs || []);

  const final = {
    definitions,
    rhymes: (best?.words || []).map(r => r.word).slice(0, 14),
    rhymeLabel: best?.label || 'Rhymes',
    synonyms: clean(foundSyn).slice(0, 12),
    antonyms: clean(foundAnt).slice(0, 10),
    syllables: local?.found ? local.syllables : null,
    phonemes: local?.found ? local.phonemes : null,
  };
  if (!final.definitions.length) {
    final.definitions = [{
      pos: '',
      text: offline
        ? 'No connection, and this word is outside the offline dictionary. Rhymes are still on-device.'
        : 'Definition not found.',
    }];
  }

  cacheSet(w, final);
  return final;
}

// ── Test-only exports ───────────────────────────────────────────────────────
// Prefixed with _ to signal non-application use. Expose the internal cache
// primitives so tests can verify actual LRU behaviour rather than re-implementing
// the algorithm in a private Map.
export function _cacheGet(key)      { return cacheGet(key); }
export function _cacheSet(key, val) { cacheSet(key, val); }
export function _cacheClear()       { dictCache.clear(); }
export function _cacheSize()        { return dictCache.size; }
export function _setCacheMax(n)     { DICT_CACHE_MAX = n; }
