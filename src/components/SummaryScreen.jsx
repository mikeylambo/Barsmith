import { useState, useEffect } from 'react';
import DictionaryModal from './DictionaryModal.jsx';
import BarCardModal from './BarCardModal.jsx';
import RecapCardModal from './RecapCardModal.jsx';
import { sessionToText, sessionBarsOnly, hasBars } from '../services/export-text';
import { downloadText, dateStamp } from '../services/download';
import { goalIsActive, goalStatus, describeGoal, GOAL_BARS } from '../services/goal';

export default function SummaryScreen({
  latestSession, sessionDuration, totalWordsSeen, bpmMode, bpm, intervalMs,
  recordingAvailable, recordingBlob, downloadRecording, frozenWords, vault, toggleVault,
  fetchDictData, dictData, isLoadingDict, fmtDur, flattenNotes, copyNoteText, copiedNoteKey,
  goal,
}) {
  const [activeWord, setActiveWord] = useState(null);
  const [saveState, setSaveState] = useState('');
  const [showRecap, setShowRecap] = useState(false);

  // The recap draws the session's stats beside a bar the WRITER chooses to feature. Barsmith
  // does not judge which line is best — length has almost nothing to do with whether a bar
  // lands, and a six-word punchline can bury a twenty-five-word one. The modal offers the
  // session's bars (and "no featured bar") and renders the writer's pick.
  const writtenBars = flattenNotes(latestSession?.notes)
    .filter(([, , t]) => t?.trim())
    .map(([word, , text]) => ({ word, text }));
  const barsCount = writtenBars.length;
  const recapStats = { bars: barsCount, time: fmtDur(sessionDuration), words: totalWordsSeen };
  const goalOutcome = goalIsActive(goal)
    ? goalStatus(goal, { bars: barsCount, seconds: sessionDuration })
    : null;

  // Watch it back before deciding whether to keep it. Without this the only way to see a
  // take was to export it, which on a phone means leaving the app — so nobody checked
  // whether the framing or the audio were any good until after the session was over.
  const [recordingUrl, setRecordingUrl] = useState(null);
  useEffect(() => {
    if (!recordingBlob) { setRecordingUrl(null); return; }
    const url = URL.createObjectURL(recordingBlob);
    setRecordingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recordingBlob]);
  // { bar, word } for the card being previewed, or null.
  const [cardBar, setCardBar] = useState(null);
  const hasNotes = latestSession?.notes && Object.keys(latestSession.notes).length > 0;

  // Bars are only worth exporting if some were actually written. `hasNotes` can be true
  // for a session where every Bar Pad entry was opened and left blank.
  const sessionHasBars = hasBars(latestSession);
  // 'idle' | 'copied' | 'failed'. Unlike the per-note Copy buttons, this one moves a
  // whole session, so a silent failure that still shows a checkmark could cost real
  // work — the clipboard is unavailable outright in some in-app browsers.
  const [copyState, setCopyState] = useState('idle');
  const copyAllBars = () => {
    const done = (state) => { setCopyState(state); setTimeout(() => setCopyState('idle'), 1800); };
    const write = navigator.clipboard?.writeText(sessionBarsOnly(latestSession));
    if (!write) return done('failed');
    write.then(() => done('copied')).catch(() => done('failed'));
  };
  const exportSession = () =>
    downloadText(`barsmith-session-${dateStamp(new Date(latestSession.date))}.txt`, sessionToText(latestSession));

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

        {/* Goal outcome — closes the loop the idle-screen goal opened. */}
        {goalOutcome && (
          <div className={`mb-5 flex items-center justify-center gap-2 py-3.5 rounded-2xl border text-[11px] font-black uppercase tracking-widest ${goalOutcome.met ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-gray-400'}`}>
            <span>{goalOutcome.met ? '✓ Goal reached' : 'Goal missed'}</span>
            <span className="opacity-60">· {describeGoal(goal)}</span>
            {!goalOutcome.met && goalOutcome.type === GOAL_BARS && (
              <span className="opacity-60 tabular-nums">({goalOutcome.current}/{goalOutcome.target})</span>
            )}
          </div>
        )}

        {/* Share Recap — the session's stats and best bar as one postable image. The
            growth loop: no backend, just an image that carries the wordmark. */}
        {barsCount > 0 && (
          <button
            onClick={() => setShowRecap(true)}
            className="w-full py-4 rounded-2xl bg-white text-black text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-all mb-5"
          >
            Share Recap
          </button>
        )}

        {recordingAvailable && (
          <div className="mb-5">
            {recordingUrl && (
              <video
                src={recordingUrl}
                controls
                playsInline
                className="w-full rounded-2xl border border-white/8 bg-black mb-3"
              />
            )}
            <button
              onClick={async () => {
                // No await before the call inside downloadRecording — it hands straight
                // to the share sheet, and Safari drops the gesture otherwise.
                const result = await downloadRecording();
                setSaveState(result === 'shared' ? 'saved' : result === 'cancelled' ? '' : result === 'downloaded' ? 'downloaded' : 'failed');
                setTimeout(() => setSaveState(''), 2500);
              }}
              className="w-full py-4 rounded-2xl bg-red-500/8 border border-red-500/25 text-red-400 text-sm font-black uppercase tracking-widest hover:bg-red-500/15 transition-all flex items-center justify-center gap-2"
            >
              {saveState === 'saved' ? '✓ Saved' : saveState === 'downloaded' ? '✓ Downloaded' : saveState === 'failed' ? 'Could not save' : 'Save Recording'}
            </button>
          </div>
        )}

        {/* Take the work with you. This sits above the Bar Pad because at the end of a
            session getting the bars out is the point — the per-note Copy buttons below
            are for cherry-picking one line, not for moving a whole session. */}
        {sessionHasBars && (
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button
              onClick={copyAllBars}
              className={`py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all ${
                copyState === 'copied' ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                : copyState === 'failed' ? 'bg-red-500/15 border border-red-500/30 text-red-400'
                : 'bg-white text-black hover:bg-gray-200'
              }`}
            >
              {copyState === 'copied' ? '✓ Copied' : copyState === 'failed' ? 'Copy Failed — Use Export' : 'Copy All Bars'}
            </button>
            <button
              onClick={exportSession}
              className="py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-black uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              Export .txt
            </button>
          </div>
        )}

        {/* Bar Pad notes from session */}
        {hasNotes && (
          <div className="bg-[#0f0f0f] p-6 rounded-3xl border border-white/5 mb-5">
            <h3 className="text-gray-500 text-xs font-black uppercase tracking-widest mb-5 border-b border-white/5 pb-4">Bar Pad</h3>
            {flattenNotes(latestSession.notes).map(([word, entryId, text]) => text?.trim() ? (
              <div key={word + entryId} className="mb-4 last:mb-0">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{word}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* A bar card is the one thing here anyone would actually post. */}
                    <button onClick={() => setCardBar({ bar: text, word })} aria-label={`Share the bar written on ${word} as an image`} className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/8 text-gray-500 hover:text-white transition-all">
                      Share
                    </button>
                    <button onClick={() => copyNoteText(`s-${word}-${entryId}`, text)} className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full transition-all ${copiedNoteKey===`s-${word}-${entryId}` ? 'bg-green-500/20 text-green-400' : 'bg-white/8 text-gray-500 hover:text-white'}`}>
                      {copiedNoteKey===`s-${word}-${entryId}` ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
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
      {cardBar && <BarCardModal bar={cardBar.bar} word={cardBar.word} onClose={()=>setCardBar(null)} />}
      {showRecap && (
        <RecapCardModal
          stats={recapStats}
          bars={writtenBars}
          date={latestSession?.date ? new Date(latestSession.date) : new Date()}
          onClose={() => setShowRecap(false)}
        />
      )}
    </div>
  );
}
