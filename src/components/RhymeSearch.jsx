import { useState, useEffect, useRef } from 'react';
import { haptic } from '../services/haptic';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { loadRhymeIndex, findRhymes } from '../services/rhyme';

// ─────────────────────────────────────────────
// RHYME SEARCH PANEL  (standalone tab)
//
// Runs entirely on-device. This used to be three Datamuse calls, which meant the one
// feature a writer reaches for most was the only part of an offline-first app that
// needed a network — and it came back as a flat list of perfect and "near" rhymes.
//
// The local engine groups by what kind of rhyme a word actually is, because that is the
// distinction the writers this is for work in. Perfect rhymes are the beginner's tool;
// multis are the craft.
// ─────────────────────────────────────────────

const GROUPS = [
  ['perfect',   'Perfect',   'text-green-400',  'The stressed tail lands whole.'],
  ['multi',     'Multis',    'text-orange-400', 'Two or more syllables agree — the hardest to find, the best to use.'],
  ['slant',     'Slant',     'text-blue-400',   'The vowel holds, the consonants bend.'],
  ['assonance', 'Assonance', 'text-purple-400', 'The vowel run matches. Consonants are yours.'],
  ['homophones','Homophones','text-gray-400',   'Same sound, different word.'],
];
export default
  function RhymeSearch({ onClose, vault = [], toggleVault }) {
    const [query, setQuery]       = useState('');
    const [results, setResults]   = useState(null);
    const [loading, setLoading]   = useState(false);
    const [copied, setCopied]     = useState('');
    const [ready, setReady]       = useState(false);
    const [loadError, setLoadError] = useState(false);
    const inputRef                = useRef(null);
    const requestIdRef            = useRef(0);
    const panelRef                = useRef(null);
    useFocusTrap(panelRef);

    useEffect(() => { inputRef.current?.focus(); return () => { requestIdRef.current += 1; }; }, []);

    // RC4 FIX 7: Escape closes the panel
    useEffect(() => {
      const handler = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // The payload is ~290KB gzipped, so it is fetched the first time the panel opens
    // rather than at app start. Precached by the service worker, so this is a one-time
    // cost and every later search — online or off — is instant.
    useEffect(() => {
      let live = true;
      loadRhymeIndex().then(() => { if (live) setReady(true); })
        .catch(() => { if (live) setLoadError(true); });
      return () => { live = false; };
    }, []);

    const search = async (word) => {
      const w = word.trim().toLowerCase();
      if (!w) return;
      const myId = ++requestIdRef.current;
      setLoading(true); setResults(null);
      try {
        await loadRhymeIndex();
        if (requestIdRef.current !== myId) return;
        setResults(findRhymes(w));
      } catch {
        if (requestIdRef.current !== myId) return;
        setResults({ error: true });
      } finally {
        if (requestIdRef.current === myId) setLoading(false);
      }
    };

    const copy = (w) => {
      navigator.clipboard?.writeText(w).catch(() => {});
      setCopied(w); setTimeout(() => setCopied(''), 1200);
      haptic(12);
    };

    const Chip = ({ w }) => {
      const inVault = vault.some(v => v.word === w);
      return (
        <div className={`rhyme-chip flex items-stretch rounded-full border border-white/8 overflow-hidden ${copied === w ? 'bg-white' : 'bg-white/5'}`}>
          <button onClick={() => copy(w)} className={`max-w-[70vw] break-words px-3 py-1.5 text-sm font-bold leading-tight ${copied === w ? 'text-black' : 'text-gray-200'}`}>
            {w}
          </button>
          <span className="w-px self-stretch bg-white/8" />
          <button onClick={() => toggleVault?.(w)} aria-label={inVault ? `Remove ${w} from Vault` : `Save ${w} to Vault`} className={`px-2 py-1.5 text-sm leading-none flex items-center transition-colors ${copied === w ? 'text-black' : inVault ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}>
            {inVault ? '★' : '☆'}
          </button>
        </div>
      );
    };

    // Within a kind, words are still grouped by syllable count — a writer looking to
    // close a four-syllable line does not want to read past every one-syllable option.
    const RhymeGroup = ({ label, color, hint, words }) => {
      if (!words?.length) return null;
      const bySyllables = {};
      for (const r of words) (bySyllables[r.syllables] ||= []).push(r.word);
      const counts = Object.keys(bySyllables).sort((a, b) => Number(a) - Number(b));
      return (
        <div className="mb-7">
          <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${color}`}>{label} <span className="text-gray-700">{words.length}</span></p>
          <p className="text-[10px] text-gray-600 mb-3 leading-relaxed">{hint}</p>
          {counts.map(n => (
            <div key={n} className="mb-3">
              <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1.5">{n} syl.</p>
              <div className="flex flex-wrap gap-1.5">
                {bySyllables[n].map(w => <Chip key={w} w={w} />)}
              </div>
            </div>
          ))}
        </div>
      );
    };

    return (
      <div ref={panelRef} role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-[#050505] flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 pb-4 border-b border-white/5" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
          <button onClick={onClose} aria-label="Close Rhyme Search" className="w-9 h-9 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/10 transition-all text-lg">←</button>
          <div className="flex-1 min-w-0 relative">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search(query)}
              placeholder="Enter any word…"
              className="w-full bg-[#111] border border-white/10 rounded-2xl px-5 py-3.5 text-white font-bold text-base placeholder-gray-600 focus:border-white/30 transition-colors"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }} aria-label="Clear search" className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-lg">✕</button>
            )}
          </div>
          <button
            onClick={() => search(query)}
            disabled={!query.trim() || loading}
            className="shrink-0 px-5 py-3.5 rounded-2xl bg-white text-black font-black text-sm uppercase tracking-widest disabled:opacity-30 hover:bg-gray-100 active:scale-95 transition-all"
          >
            {loading ? '…' : 'Find'}
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
          {!results && !loading && (
            <div className="text-center py-20 text-gray-600">
              <p className="text-5xl mb-4 opacity-30">◎</p>
              <p className="font-black uppercase tracking-widest text-sm">Type any word</p>
              <p className="text-xs mt-2 text-gray-700">
                {loadError ? 'Rhyme data unavailable — reload to try again.'
                  : ready ? 'Perfect, multis, slant and assonance — all on-device'
                  : 'Loading the rhyme dictionary…'}
              </p>
            </div>
          )}
          {loading && (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-white/10 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {results?.error && <p className="text-gray-500 text-center py-12">Rhyme data failed to load. Reload the app to try again.</p>}
          {results && !results.error && !results.found && (
            <p className="text-gray-500 text-center py-12">
              No pronunciation for “{results.word}”. Try a different spelling — the dictionary covers single words only.
            </p>
          )}
          {results && !results.error && results.found && (
            <>
              <div className="mb-1 flex items-baseline gap-3 flex-wrap">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{results.word}</h2>
                <p className="text-gray-600 text-xs font-bold uppercase tracking-widest">
                  {results.syllables} syl · rhymes on the last {results.stressedSyllablesFromEnd}
                </p>
              </div>
              {/* Showing the pronunciation is not decoration: when a result looks wrong,
                  this is what tells a writer whether the engine misheard the word or
                  they are hearing a different accent than CMU transcribed. */}
              <p className="text-[10px] text-gray-700 font-mono mb-1">{results.phonemes}</p>
              <p className="text-[10px] text-gray-600 mb-6 uppercase tracking-widest font-bold">Tap to copy · ☆ to save</p>
              {GROUPS.map(([key, label, color, hint]) => (
                <RhymeGroup key={key} label={label} color={color} hint={hint} words={results[key]} />
              ))}
              {GROUPS.every(([key]) => !results[key]?.length) && (
                <p className="text-gray-600 text-center py-8">Nothing rhymes with “{results.word}”. That is rarer than it sounds — and worth a bar.</p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
