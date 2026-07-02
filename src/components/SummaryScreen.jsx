import { useState } from 'react';
import DictionaryModal from './DictionaryModal.jsx';

export default function SummaryScreen({
  latestSession, sessionDuration, totalWordsSeen, bpmMode, bpm, intervalMs,
  recordingAvailable, downloadRecording, frozenWords, vault, toggleVault,
  fetchDictData, dictData, isLoadingDict, fmtDur, flattenNotes, copyNoteText, copiedNoteKey,
}) {
  const [activeWord, setActiveWord] = useState(null);
  const hasNotes = latestSession?.notes && Object.keys(latestSession.notes).length > 0;

  return (
    <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto custom-scrollbar pb-36">
      <div className="w-full mt-6 max-w-2xl">
        <div className="text-center mb-8"><h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase">Complete</h2></div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[['Time', fmtDur(sessionDuration)],['Words',totalWordsSeen],['Pace',bpmMode?`${bpm} BPM`:`${(intervalMs/1000).toFixed(1)}s`]].map(([l,v])=>(
            <div key={l} className="bg-[#0f0f0f] border border-white/5 py-6 rounded-2xl text-center">
              <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest mb-1">{l}</p>
              <p className="text-xl md:text-2xl font-black text-white">{v}</p>
            </div>
          ))}
        </div>

        {recordingAvailable && (
          <button onClick={downloadRecording} className="w-full mb-5 py-4 rounded-2xl bg-red-500/8 border border-red-500/25 text-red-400 text-sm font-black uppercase tracking-widest hover:bg-red-500/15 transition-all flex items-center justify-center gap-2">
            ⬇ Download Recording
          </button>
        )}

        {/* Bar Pad notes from session */}
        {hasNotes && (
          <div className="bg-[#0f0f0f] p-6 rounded-3xl border border-white/5 mb-5">
            <h3 className="text-gray-500 text-xs font-black uppercase tracking-widest mb-5 border-b border-white/5 pb-4">Bar Pad</h3>
            {flattenNotes(latestSession.notes).map(([word, entryId, text]) => text?.trim() ? (
              <div key={word + entryId} className="mb-4 last:mb-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{word}</p>
                  <button onClick={() => copyNoteText(`s-${word}-${entryId}`, text)} className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full transition-all ${copiedNoteKey===`s-${word}-${entryId}` ? 'bg-green-500/20 text-green-400' : 'bg-white/8 text-gray-500 hover:text-white'}`}>
                    {copiedNoteKey===`s-${word}-${entryId}` ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-gray-200 text-sm leading-relaxed font-medium whitespace-pre-wrap select-text">{text}</p>
              </div>
            ) : null)}
          </div>
        )}

        {/* Frozen words */}
        <div className="bg-[#0f0f0f] p-6 rounded-3xl border border-white/5">
          <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-4">
            <h3 className="text-gray-500 text-xs font-black uppercase tracking-widest">Frozen Words</h3>
            <span className="bg-white/8 px-3 py-1 rounded-full text-white text-xs font-bold">{frozenWords.size}</span>
          </div>
          {frozenWords.size === 0 && <p className="text-gray-700 text-sm text-center py-4">No words frozen this session.</p>}
          {[...frozenWords].map(word => (
            <div key={word} className="flex justify-between items-center bg-[#151515] px-5 py-4 rounded-xl mb-2">
              <button onClick={() => { setActiveWord(word); fetchDictData(word); }} className="text-base font-black text-gray-300 flex-1 text-left uppercase hover:text-white transition-colors">{word}</button>
              <button onClick={() => toggleVault(word)} aria-label={vault.some(v=>v.word===word) ? `Remove ${word} from Vault` : `Save ${word} to Vault`} className={`text-2xl transition-transform hover:scale-110 ${vault.some(v=>v.word===word)?'text-yellow-500':'text-gray-700'}`}>{vault.some(v=>v.word===word)?'★':'☆'}</button>
            </div>
          ))}
        </div>
      </div>
      {activeWord && <DictionaryModal word={activeWord} dictData={dictData} isLoading={isLoadingDict} onClose={()=>setActiveWord(null)} isVaultMode={true} />}
    </div>
  );
}
