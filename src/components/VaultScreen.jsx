import { useState } from 'react';
import DictionaryModal from './DictionaryModal.jsx';

export default function VaultScreen({
  resetToIdle, vault, startVaultDrill, startBlocked, vaultSortMode, setVaultSortMode, sortedVault, toggleVault,
  fetchDictData, dictData, isLoadingDict,
  customWords, setCustomWords, customWordInput, setCustomWordInput,
  handleExportData, importFileRef, handleImportFile, importMsg,
  rescue, handleUndoRestore, handleDismissRescue,
}) {
  const [activeWord, setActiveWord] = useState(null);

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
          <h2 className="text-3xl font-black tracking-tighter uppercase">Saved Words</h2>
        </div>
        {vault.length > 0 && (
          <button disabled={startBlocked} onClick={startVaultDrill} className={`w-full mb-5 py-4 rounded-2xl border text-sm font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${startBlocked ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-400 cursor-not-allowed' : 'bg-white/4 border-white/8 text-white hover:bg-white/8 active:scale-95'}`}>
            <span className="text-yellow-400">▶</span> {startBlocked ? 'Resolve Recovered Bars First' : `Practice ${vault.length} Saved Words`}
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
          <p className="text-[10px] text-gray-700 mt-3">Saves your saved words, history, own words, and streak to a file you control.</p>
        </div>

        {/* Undo — only after a restore has actually replaced something. Deliberately loud:
            a writer who has just realised they restored the wrong file is looking for a
            way out, and it needs to be the thing they see. */}
        {rescue && (
          <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-2xl p-5 mb-5">
            <p className="text-[10px] text-yellow-400/80 font-black uppercase tracking-widest mb-2">Undo available</p>
            <p className="text-sm text-gray-300 leading-relaxed mb-1">
              Before the last restore, this device had{' '}
              <span className="text-white font-bold">{rescue.sessions} session{rescue.sessions === 1 ? '' : 's'}</span>
              {typeof rescue.bars === 'number' && <> and <span className="text-white font-bold">{rescue.bars} bar{rescue.bars === 1 ? '' : 's'}</span></>}.
            </p>
            <p className="text-[10px] text-gray-600 mb-4">
              Kept in case that restore was the wrong file. Nothing else can bring it back.
            </p>
            <div className="flex gap-2">
              <button onClick={handleUndoRestore} className="flex-1 py-3 rounded-xl bg-yellow-400 text-black text-xs font-black uppercase tracking-widest hover:bg-yellow-300 transition-all active:scale-95">
                Undo Restore
              </button>
              <button onClick={handleDismissRescue} className="px-4 py-3 rounded-xl bg-white/5 border border-white/8 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all active:scale-95">
                Discard
              </button>
            </div>
          </div>
        )}


        {vault.length === 0 && (
          <div className="text-center py-16 text-gray-700">
            <p className="text-4xl mb-4 opacity-40">☆</p>
            <p className="font-black uppercase tracking-widest text-sm">Nothing saved yet</p>
            <p className="text-xs mt-2 text-gray-700">Star a word during a session to keep it here.</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {sortedVault.map(item=>(
            <div key={item.word} className="flex justify-between items-center bg-[#0f0f0f] border border-white/5 px-5 py-4 rounded-xl">
              <button onClick={()=>{setActiveWord(item.word);fetchDictData(item.word);}} className="flex-1 min-w-0 text-left hover:text-white transition-colors">
                <span className="text-base font-black text-gray-200 uppercase">{item.word}</span>
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
