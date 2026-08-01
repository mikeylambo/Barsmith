import { useState, useEffect } from 'react';
import DictionaryModal from './DictionaryModal.jsx';
import { loadRhymeIndex, findRhymes, RESULT_CAP } from '../services/rhyme';
import { loadAnalyticsOptOut, saveAnalyticsOptOut } from '../services/storage';

export default function VaultScreen({
  resetToIdle, vault, startVaultDrill, startBlocked, vaultSortMode, setVaultSortMode, sortedVault, toggleVault,
  fetchDictData, dictData, isLoadingDict,
  customWords, setCustomWords, customWordInput, setCustomWordInput,
  handleExportData, importFileRef, handleImportFile, importMsg,
}) {
  const [activeWord, setActiveWord] = useState(null);
  const [analyticsOff, setAnalyticsOff] = useState(() => loadAnalyticsOptOut());

  // Results are capped, so a bare "60" reads as an exact count of something that is
  // really "at least 60". `nation` has hundreds of perfect rhymes; saying 60 undersells
  // it and saying it precisely would be a lie either way.
  const count = (n) => (n >= RESULT_CAP ? `${RESULT_CAP}+` : `${n}`);

  // The vault was a list of words with nothing to say about them until you tapped one.
  // The rhyme engine is already on-device and answers in about 4ms, so every row can
  // carry its own shape: how many syllables, and how much there is to rhyme with. A
  // writer scanning for something to build on can see which of their saved words are
  // rich and which are dead ends without opening any of them.
  const [shape, setShape] = useState(null);
  useEffect(() => {
    let live = true;
    loadRhymeIndex().then(() => {
      if (!live) return;
      const out = {};
      for (const { word } of vault) {
        try {
          const r = findRhymes(word);
          if (r.found) out[word] = { syllables: r.syllables, perfect: r.perfect.length, multi: r.multi.length };
        } catch { /* leave the row bare rather than failing the screen */ }
      }
      setShape(out);
    }).catch(() => {});
    return () => { live = false; };
  }, [vault]);

  const addCustomWord = () => {
    const w = customWordInput.trim().toLowerCase();
    if (w && !customWords.includes(w)) setCustomWords(prev => [...prev, w]);
    setCustomWordInput('');
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto w-full custom-scrollbar pb-36">
      <div className="w-full mt-6 max-w-2xl">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={resetToIdle} aria-label="Back to home" className="w-10 h-10 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/10 transition-all">←</button>
          <h2 className="text-3xl font-black tracking-tighter uppercase">Vault</h2>
        </div>
        {vault.length > 0 && (
          <button disabled={startBlocked} onClick={startVaultDrill} className={`w-full mb-5 py-4 rounded-2xl border text-sm font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${startBlocked ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-400 cursor-not-allowed' : 'bg-white/4 border-white/8 text-white hover:bg-white/8 active:scale-95'}`}>
            <span className="text-yellow-400">▶</span> {startBlocked ? 'Resolve Recovered Bars First' : `Drill Vault (${vault.length} words)`}
          </button>
        )}

        {/* Custom Word Injection */}
        <div className="bg-[#0f0f0f] border border-white/5 rounded-2xl p-5 mb-5">
          <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3">Your Words — In Session Pool</p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={customWordInput}
              onChange={e => setCustomWordInput(e.target.value.replace(/[^a-zA-Z\s'-]/g,''))}
              onKeyDown={e => { if (e.key === 'Enter') addCustomWord(); }}
              placeholder="Add a word or phrase…"
              className="flex-1 bg-[#0a0a0a] border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 font-bold focus:outline-none focus:border-white/20"
            />
            <button onClick={addCustomWord} className="px-5 py-3 bg-white text-black text-xs font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-all active:scale-95">Add</button>
          </div>
          {customWords.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {customWords.map(w => (
                <button key={w} onClick={() => setCustomWords(prev => prev.filter(x => x !== w))} className="flex items-center gap-1.5 bg-white/6 border border-white/8 px-3 py-1.5 rounded-full text-xs font-black text-gray-300 uppercase hover:border-red-500/40 hover:text-red-400 transition-all group">
                  {w} <span className="text-gray-700 group-hover:text-red-400">✕</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-700">Words you add here surface randomly during sessions.</p>
          )}
        </div>
        {vault.length > 0 && (
          <div className="flex gap-2 mb-5">
            {['Newest','Oldest','A-Z','Z-A'].map(m=>(
              <button key={m} onClick={()=>setVaultSortMode(m)} aria-pressed={vaultSortMode===m} aria-label={`Sort vault ${m}`} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${vaultSortMode===m?'bg-white text-black':'bg-white/5 text-gray-600 border border-white/5'}`}>{m}</button>
            ))}
          </div>
        )}

        {/* Backup / Restore */}
        <div className="bg-[#0f0f0f] border border-white/5 rounded-2xl p-5 mb-5">
          <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3">Backup &amp; Restore</p>
          <div className="flex gap-2">
            <button onClick={handleExportData} className="flex-1 py-3 rounded-xl bg-white/6 border border-white/8 text-xs font-black uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/10 transition-all active:scale-95">Export Backup</button>
            <button onClick={() => importFileRef.current?.click()} className="flex-1 py-3 rounded-xl bg-white/6 border border-white/8 text-xs font-black uppercase tracking-widest text-gray-300 hover:text-white hover:bg-white/10 transition-all active:scale-95">Restore Backup</button>
            <input type="file" accept="application/json" ref={importFileRef} onChange={handleImportFile} className="hidden" />
          </div>
          {importMsg && <p className="text-[10px] text-gray-500 mt-3 uppercase tracking-widest font-bold">{importMsg}</p>}
          <p className="text-[10px] text-gray-700 mt-3">Saves your vault, history, custom words, and streak to a file you control.</p>
        </div>

        {/* Privacy. Placed next to Backup &amp; Restore on purpose: this is the screen where
            a writer is already thinking about where their work lives, and burying the
            switch somewhere else would make the disclosure technically true and
            practically useless. */}
        <div className="bg-[#0f0f0f] border border-white/5 rounded-2xl p-5 mb-5">
          <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3">Privacy</p>
          <p className="text-xs text-gray-400 leading-relaxed mb-4">
            <span className="text-white font-bold">Your bars never leave this device.</span>{' '}
            Rhymes, syllables and definitions are all worked out here, offline. Barsmith sends
            anonymous counts — that a session happened, roughly how long, roughly how many
            bars — so it can tell which parts are worth keeping. No account, no cookies,
            nothing that ties any of it back to you.
          </p>
          <p className="text-[10px] text-gray-600 leading-relaxed mb-4">
            One exception, so you know: tapping a word for its <em>synonyms</em> sends that
            single word to a public dictionary API. Just the word, never your writing — and
            only when you tap.
          </p>
          <button
            onClick={() => { const next = !analyticsOff; setAnalyticsOff(next); saveAnalyticsOptOut(next); }}
            aria-pressed={!analyticsOff}
            className={`w-full py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${analyticsOff ? 'bg-[#0a0a0a] border-white/8 text-gray-500 hover:text-gray-300' : 'bg-white/6 border-white/10 text-gray-200 hover:bg-white/10'}`}
          >
            {analyticsOff ? 'Anonymous counts: off' : 'Anonymous counts: on'}
          </button>
          <p className="text-[10px] text-gray-700 mt-3">
            {analyticsOff ? 'Nothing is being sent. Tap to help improve Barsmith.' : 'Tap to turn this off. Everything else works exactly the same.'}
          </p>
        </div>

        {vault.length === 0 && (
          <div className="text-center py-16 text-gray-700">
            <p className="text-4xl mb-4 opacity-40">☆</p>
            <p className="font-black uppercase tracking-widest text-sm">Vault is empty</p>
            <p className="text-xs mt-2 text-gray-700">Star words during sessions to save them here.</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {sortedVault.map(item=>(
            <div key={item.word} className="flex justify-between items-center bg-[#0f0f0f] border border-white/5 px-5 py-4 rounded-xl">
              <button onClick={()=>{setActiveWord(item.word);fetchDictData(item.word);}} className="flex-1 min-w-0 text-left hover:text-white transition-colors">
                <span className="text-base font-black text-gray-200 uppercase">{item.word}</span>
                {shape?.[item.word] && (
                  <span className="block text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">
                    {shape[item.word].syllables} syl
                    {shape[item.word].perfect > 0 && <> · {count(shape[item.word].perfect)} perfect</>}
                    {shape[item.word].multi > 0 && <> · {count(shape[item.word].multi)} multi</>}
                    {shape[item.word].perfect === 0 && shape[item.word].multi === 0 && <> · slant only</>}
                  </span>
                )}
              </button>
              <button onClick={()=>toggleVault(item.word)} aria-label={`Remove ${item.word} from Vault`} className="text-2xl text-yellow-500 hover:scale-110 transition-transform">★</button>
            </div>
          ))}
        </div>
      </div>
      {activeWord && <DictionaryModal word={activeWord} dictData={dictData} isLoading={isLoadingDict} onClose={()=>setActiveWord(null)} isVaultMode={true} />}
    </div>
  );
}
