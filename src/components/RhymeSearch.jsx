import { useState, useEffect, useRef } from 'react';
import { haptic } from '../services/haptic';
import { useFocusTrap } from '../hooks/useFocusTrap';

// ─────────────────────────────────────────────
// RHYME SEARCH PANEL  (standalone tab)
// ─────────────────────────────────────────────
export default
  function RhymeSearch({ onClose, vault = [], toggleVault }) {
    const [query, setQuery]       = useState('');
    const [results, setResults]   = useState(null);
    const [loading, setLoading]   = useState(false);
    const [copied, setCopied]     = useState('');
    const inputRef                = useRef(null);
    const abortRef                = useRef(null);
    const requestIdRef            = useRef(0);
    const panelRef                = useRef(null);
    useFocusTrap(panelRef);

    useEffect(() => { inputRef.current?.focus(); return () => { requestIdRef.current += 1; abortRef.current?.abort(); }; }, []);

    // RC4 FIX 7: Escape closes the panel
    useEffect(() => {
      const handler = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const search = async (word) => {
      const w = word.trim().toLowerCase();
      const enc = encodeURIComponent(w);
      if (!w) return;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const myId = ++requestIdRef.current; // identifies this specific search
      setLoading(true); setResults(null);
      try {
        const sig = abortRef.current.signal;
        // Real network failures should surface as failures — only a literal AbortError
        // means "superseded by a newer search", and that case is discarded below via
        // the id check rather than masquerading as an empty result set.
        const safe = (p) => fetch(p, { signal: sig }).then(r => {
          if (!r.ok) throw new Error('http_' + r.status);
          return r.json();
        });
        const [perfect, near, broader] = await Promise.all([
          safe(`https://api.datamuse.com/words?rel_rhy=${enc}&md=s&max=40`),
          safe(`https://api.datamuse.com/words?rel_nry=${enc}&md=s&max=40`),
          safe(`https://api.datamuse.com/words?sl=${enc}&md=s&max=20`),
        ]);
        // A newer search may have started while this one was in flight — discard stale results.
        if (requestIdRef.current !== myId) return;
        // RC4 FIX 8: De-duplicate across tiers so the same word can't appear in
        // multiple sections. Priority: perfect > near > broader.
        const perfectSet = new Set(perfect.map(x => x.word));
        const nearDeduped = near.filter(x => !perfectSet.has(x.word));
        const nearSet = new Set(nearDeduped.map(x => x.word));
        const broaderDeduped = broader.filter(x => !perfectSet.has(x.word) && !nearSet.has(x.word));

        // bucket by syllable count
        const bucket = (arr) => {
          const groups = {};
          const seen = new Set();
          arr.filter(x => typeof x.word === 'string' && x.word !== w).forEach(x => {
            const normalized = x.word.trim().toLowerCase();
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            const s = x.numSyllables || '?';
            if (!groups[s]) groups[s] = [];
            groups[s].push(normalized);
          });
          return groups;
        };
        setResults({ perfect: bucket(perfect), near: bucket(nearDeduped), broader: bucket(broaderDeduped), word: w });
      } catch (e) {
        if (e.name === 'AbortError') return; // a newer search superseded this one and owns the UI
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

    const SyllableGroup = ({ label, groups, color }) => {
      if (!groups || !Object.keys(groups).length) return null;
      const sorted = Object.keys(groups).sort((a, b) => { const na = Number(a), nb = Number(b); return Number.isNaN(na) ? 1 : Number.isNaN(nb) ? -1 : na - nb; });
      return (
        <div className="mb-6">
          <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${color}`}>{label}</p>
          {sorted.map(s => (
            <div key={s} className="mb-3">
              <p className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1.5">{s} syl.</p>
              <div className="flex flex-wrap gap-1.5">
                {groups[s].map(w => {
                  const inVault = vault.some(v => v.word === w);
                  return (
                    <div key={w} className={`rhyme-chip flex items-stretch rounded-full border border-white/8 overflow-hidden ${copied === w ? 'bg-white' : 'bg-white/5'}`}>
                      <button onClick={() => copy(w)} className={`max-w-[70vw] break-words px-3 py-1.5 text-sm font-bold leading-tight ${copied === w ? 'text-black' : 'text-gray-200'}`}>
                        {w}
                      </button>
                      <span className="w-px self-stretch bg-white/8" />
                      <button onClick={() => toggleVault?.(w)} aria-label={inVault ? `Remove ${w} from Vault` : `Save ${w} to Vault`} className={`px-2 py-1.5 text-sm leading-none flex items-center transition-colors ${copied === w ? 'text-black' : inVault ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}>
                        {inVault ? '★' : '☆'}
                      </button>
                    </div>
                  );
                })}
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
              <p className="text-xs mt-2 text-gray-700">Results grouped by syllable count</p>
            </div>
          )}
          {loading && (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-white/10 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {results?.error && <p className="text-gray-500 text-center py-12">Network error. Check connection.</p>}
          {results && !results.error && (
            <>
              <div className="mb-2 flex items-center gap-3">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{results.word}</h2>
                <p className="text-gray-600 text-xs font-bold uppercase tracking-widest">rhyme map</p>
              </div>
              <p className="text-[10px] text-gray-600 mb-6 uppercase tracking-widest font-bold">Tap any word to copy</p>
              <SyllableGroup label="Perfect Rhymes"   groups={results.perfect}  color="text-green-400" />
              <SyllableGroup label="Near Rhymes"      groups={results.near}     color="text-blue-400" />
              <SyllableGroup label="Similar Sound"    groups={results.broader}  color="text-purple-400" />
              {!Object.keys(results.perfect).length && !Object.keys(results.near).length && !Object.keys(results.broader).length && (
                <p className="text-gray-600 text-center py-8">No rhymes found for "{results.word}"</p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
