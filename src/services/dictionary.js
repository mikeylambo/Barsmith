// ─────────────────────────────────────────────
// DICTIONARY SERVICE
// Handles rhyme, synonym, antonym, definition, and syllable lookups against
// the free dictionaryapi.dev and Datamuse APIs. Pulled out of the component
// tree so it's independently testable and so the URL-encoding/abort logic
// lives in exactly one place.
// ─────────────────────────────────────────────

const dictCache = {};

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

  if (dictCache[w]) return dictCache[w];

  const enc = encodeURIComponent(w);
  const [dictPayload, rhymes, nearRhymes, syns, ants, meansLike, sylData] = await Promise.all([
    fetchWithAbort(`https://api.dictionaryapi.dev/api/v2/entries/en/${enc}`, signal),
    fetchWithAbort(`https://api.datamuse.com/words?rel_rhy=${enc}`, signal),
    fetchWithAbort(`https://api.datamuse.com/words?rel_nry=${enc}`, signal),
    fetchWithAbort(`https://api.datamuse.com/words?rel_syn=${enc}`, signal),
    fetchWithAbort(`https://api.datamuse.com/words?rel_ant=${enc}`, signal),
    fetchWithAbort(`https://api.datamuse.com/words?ml=${enc}`, signal),
    fetchWithAbort(`https://api.datamuse.com/words?sp=${enc}&md=s&max=1`, signal),
  ]);

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

  const foundRhymes = (rhymes?.length ? rhymes : nearRhymes || []).map(r => r.word).filter(x => x !== w).slice(0, 14);
  const syllables = sylData?.[0]?.numSyllables || null;

  const final = {
    definitions: defs.slice(0, 3),
    rhymes: foundRhymes,
    rhymeLabel: rhymes?.length ? 'Top Rhymes' : 'Near Rhymes',
    synonyms: clean(foundSyn).slice(0, 12),
    antonyms: clean(foundAnt).slice(0, 10),
    syllables,
  };
  if (!final.definitions.length) final.definitions.push({ pos: '', text: 'Definition not found.' });

  dictCache[w] = final;
  return final;
}
