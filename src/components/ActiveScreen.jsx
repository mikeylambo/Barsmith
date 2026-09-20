import { useState, useEffect, useMemo } from 'react';
import DictionaryModal from './DictionaryModal.jsx';
import { flattenNotes } from '../services/export-text';
import { goalStatus, goalMetLabel, GOAL_BARS, GOAL_TIME } from '../services/goal';
import { haptic } from '../services/haptic';

const getDynamicFontSize = (word, count) => {
  const len = Math.max(word.length || 1, 4);
  const ls = window.innerWidth > window.innerHeight;
  if (count === 4) return ls ? `calc(min(6vh,${50/len}vw))`   : `calc(min(7vw,${60/len}vw))`;
  if (count === 3) return ls ? `calc(min(8vh,${70/len}vw))`   : `calc(min(9vw,${80/len}vw))`;
  if (count === 2) return ls ? `calc(min(10vh,${90/len}vw))`  : `calc(min(12vw,${100/len}vw))`;
  return ls ? `calc(min(14vh,${120/len}vw))` : `calc(min(18vw,${135/len}vw))`;
};

export default function ActiveScreen({
  appState, sessionIsActive, isRecording, flashKey, bpmMode, isPausedForDict, intervalMs,
  currentBeat, isCountingIn, isResumeCountIn, vaultDrillIndex, vaultDrillQueue, bpm, selectedTier, barCount,
  wordCount, sessionLimit, timeRemaining, fmtCountdown,
  totalWordsSeen, activeWords, activeDictWord, pauseForDict,
  dictData, isLoadingDict, resumeFromDict, sessionNotes, handleSaveNote,
  cameraPreviewRef, stopRecording, registerActiveNoteFlush,
  goal, sessionStartTime,
}) {
  // ── Session goal (see services/goal.js) ──
  // Bars come from the live Bar Pad; time needs its own once-a-second tick so a stamina
  // goal advances even while nothing else on screen changes. Both feed the same pure
  // status so the "reached" moment fires exactly once, on the crossing.
  const barsWritten = useMemo(
    () => flattenNotes(sessionNotes).filter(([, , t]) => t?.trim()).length,
    [sessionNotes],
  );
  const [nowTs, setNowTs] = useState(() => Date.now());
  const timeGoal = goal?.type === GOAL_TIME;
  useEffect(() => {
    if (!timeGoal || !sessionIsActive) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timeGoal, sessionIsActive]);

  const elapsedSeconds = sessionStartTime ? Math.max(0, Math.floor((nowTs - sessionStartTime) / 1000)) : 0;
  const status = goalStatus(goal, { bars: barsWritten, seconds: elapsedSeconds });

  // Fire once per session. This screen remounts on each new session, so the flag resets
  // with it; a dictionary lock keeps it mounted, so resuming never re-triggers.
  const [celebrated, setCelebrated] = useState(false);
  const [showGoalBanner, setShowGoalBanner] = useState(false);
  useEffect(() => {
    if (!status.active || !status.met || celebrated) return;
    setCelebrated(true);
    setShowGoalBanner(true);
    haptic(28);
    const id = setTimeout(() => setShowGoalBanner(false), 4000);
    return () => clearTimeout(id);
  }, [status.active, status.met, celebrated]);

  const goalChip = status.active && (status.type === GOAL_BARS
    ? `${status.current}/${status.target}`
    : `${fmtCountdown(status.current)}/${fmtCountdown(status.target)}`);

  return (
    <div className={`flex-1 flex flex-col justify-center items-center p-6 relative overflow-hidden ${isRecording?'rec-ring':''}`}>
      {/* flash layer on word change */}
      <div key={flashKey} className="word-flash absolute inset-0 pointer-events-none z-0 rounded-none" />

      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black opacity-30 pointer-events-none" />

      {/* Timer progress bar */}
      {!bpmMode && !isPausedForDict && (
        <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
          <div key={totalWordsSeen} className="h-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.7)]" style={{ animation: `shrinkBar ${intervalMs/1000}s linear forwards` }} />
        </div>
      )}

      {/* BPM beat dots */}
      {bpmMode && !isPausedForDict && (
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20" style={{ top: 'calc(1.75rem + env(safe-area-inset-top, 0px))' }}>
          {isCountingIn && <span className="text-[10px] font-black uppercase tracking-widest text-white/50 animate-pulse">{isResumeCountIn ? 'Re-entering…' : 'Count-in…'}</span>}
          <div className="flex items-center gap-3">
            {[0,1,2,3].map(b=>(
              <div key={b} className={`rounded-full transition-all duration-100 ${currentBeat===b?(isCountingIn?'w-3 h-3 bg-white/40':'w-3 h-3 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]'):'w-2 h-2 bg-white/12'}`} />
            ))}
          </div>
        </div>
      )}

      {/* Info label */}
      <div className="absolute left-6 right-6 flex justify-between items-center z-10" style={{ top: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
        <span className="text-[10px] font-black uppercase tracking-widest opacity-35">
          {appState === 'vault-drill' ? `${vaultDrillIndex + 1}/${vaultDrillQueue.length}`
            : bpmMode ? `Bar ${barCount}` : ''}
        </span>
        <div className="flex items-center gap-3">
          {status.active && !isPausedForDict && (
            <span className={`text-[10px] font-black uppercase tracking-widest tabular-nums ${status.met ? 'text-green-400' : 'opacity-40'}`}>
              {status.met ? '✓ Goal' : `◎ ${goalChip}`}
            </span>
          )}
          {sessionLimit > 0 && sessionIsActive && (
            <span className={`text-[10px] font-black uppercase tracking-widest tabular-nums ${timeRemaining <= 60 ? 'text-red-400' : 'opacity-35'}`}>
              ⏱ {fmtCountdown(timeRemaining)}
            </span>
          )}
          {isRecording && <button onClick={stopRecording} aria-label="Stop recording" className="pointer-events-auto text-red-400 text-[10px] font-black uppercase tracking-widest animate-pulse hover:text-red-300">● REC · Stop</button>}
        </div>
      </div>

      {/* Goal reached — a clear, brief confirmation the moment the target is crossed.
          Transient by design: the reward is the mark, not a modal that interrupts the flow. */}
      {showGoalBanner && (
        <div
          role="status"
          className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none"
          style={{ top: 'calc(4.5rem + env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex items-center gap-2 bg-green-500/15 border border-green-500/40 text-green-300 px-5 py-3 rounded-full backdrop-blur-sm shadow-[0_0_30px_rgba(34,197,94,0.25)] animate-word-strike">
            <span className="text-sm">✓</span>
            <span className="text-[11px] font-black uppercase tracking-widest">Goal reached — {goalMetLabel(goal)}</span>
          </div>
        </div>
      )}

      {/* Words */}
      <div className={`relative w-full h-full flex flex-wrap justify-center items-center px-4 z-10 ${activeWords.length>=3?'flex-col gap-8 landscape:grid landscape:grid-cols-2 landscape:gap-4':'flex-col gap-12 landscape:gap-8 md:gap-36'}`}>
        {activeWords.map((word, idx) => (
          <h2
            key={`${totalWordsSeen}-${vaultDrillIndex}-${idx}`}
            onClick={e => { e.stopPropagation(); pauseForDict(word); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pauseForDict(word); } }}
            role="button"
            tabIndex={isPausedForDict && activeDictWord !== word ? -1 : 0}
            aria-label={`Lock "${word}" to look up rhymes and write a bar`}
            className={`font-black text-center uppercase tracking-tighter flex justify-center items-center w-full cursor-pointer transition-all duration-200 ${activeWords.length>=3?'landscape:w-full':''} ${isPausedForDict && activeDictWord!==word ? 'text-white/8 scale-[0.85] blur-sm pointer-events-none' : 'text-white hover:scale-[1.03]'}`}
            style={{ fontSize: getDynamicFontSize(word, activeWords.length), lineHeight: '0.82' }}
          >
            <span className="block animate-word-strike drop-shadow-2xl whitespace-normal break-words">{word}</span>
          </h2>
        ))}
      </div>

      {/* Camera preview — always front-facing, muted, and mirrored so the writer sees
          themselves the way a mirror would rather than reversed. */}
      {isRecording && (
        <div className="absolute right-5 w-20 h-28 rounded-2xl overflow-hidden border-2 border-red-500/50 shadow-[0_0_20px_rgba(0,0,0,0.6)] z-20 bg-black" style={{ bottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}>
          <video ref={cameraPreviewRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
        </div>
      )}

      {!isPausedForDict && <p className="absolute text-gray-700 text-[10px] font-black uppercase tracking-widest animate-pulse z-10 pointer-events-none" style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>Tap to lock</p>}
      {isPausedForDict && activeDictWord && (
        <DictionaryModal
          word={activeDictWord} dictData={dictData} isLoading={isLoadingDict}
          onClose={resumeFromDict} isVaultMode={false}
          onSaveNote={handleSaveNote}
          savedEntries={sessionNotes[activeDictWord] || {}}
          registerActiveNoteFlush={registerActiveNoteFlush}
        />
      )}
    </div>
  );
}
