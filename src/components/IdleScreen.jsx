import DailyCard from './DailyCard.jsx';

// Short enough to read at a glance while choosing, and phrased as what the setting does
// to the work rather than what it does to the data — "three or more syllables" is the
// mechanism, "you have to bend the phrase" is the reason to pick it. The full version
// lives in the How To.
const LEVEL_CAPTIONS = {
  1: 'One syllable. Short, concrete, fast — build speed.',
  2: 'Two syllables. More weight, still lands clean.',
  3: 'Three or more. Bend the phrase to make it fit.',
};

const SCHEME_CAPTIONS = {
  1: 'One word at a time. A straight prompt.',
  2: 'Two at once, drawn across levels. Bridge them.',
  3: 'Three at once. One punchline has to hold all of them.',
  4: 'Four at once. The hardest thing here.',
};

export default function IdleScreen({
  vault, streak, setShowInfo, setShowRhymeSearch, setAppState,
  dailyPlan, dailyDone, dailyWeek, startDaily,
  recoveredDraft, setRecoveredDraft, clearDraft, handleRestoreDraft, flattenNotes, copyNoteText, copiedNoteKey,
  beatFileName, fileInputRef, handleFileUpload, removeBeat,
  canRecord, isRecording, startRecording, stopRecording, cameraError,
  hapticsOn, setHapticsOn,
  bpmMode, setBpmMode,
  isMetronomeOn, setIsMetronomeOn, beatAudioSrc,
  intervalMs, setIntervalMs,
  bpm, setBpm, barsPerWord, setBarsPerWord,
  selectedTier, setSelectedTier,
  wordCount, setWordCount,
  sessionLimit, setSessionLimit,
}) {
  return (
    <div className="flex-1 flex flex-col items-center w-full px-6 py-10 md:py-14 max-w-4xl mx-auto pb-36">
      {/* Header */}
      <div className="w-full mb-8">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowInfo(true)} aria-label="How to Smith — help" className="w-8 h-8 rounded-full border border-white/15 text-white/40 text-xs font-bold hover:bg-white/8 hover:text-white transition-all flex items-center justify-center shrink-0">?</button>
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase">
              <span className="text-white">BAR</span><span className="text-slate-600">SMITH</span>
            </h1>
          </div>
          {/* The streak was display-only. It is now the shortcut into the training log,
              which is the thing a writer actually wants when they glance at it. */}
          {streak > 0 && (
            <button
              onClick={() => setAppState('progress')}
              aria-label={`${streak}-day streak — open Progress`}
              className="flex items-center gap-1.5 bg-white/5 border border-white/8 px-3 py-2 rounded-full shrink-0 hover:bg-white/10 transition-all active:scale-95"
            >
              <span className="text-orange-400 text-xs">🔥</span>
              <span className="text-xs font-black text-white tabular-nums">{streak}</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button onClick={() => setShowRhymeSearch(true)} className="bg-white/5 border border-white/8 px-3 py-2.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 flex items-center justify-center gap-1.5 transition-all active:scale-95">
            <span className="text-green-400">◎</span> Rhymes
          </button>
          <button onClick={() => setAppState('progress')} className="bg-white/5 border border-white/8 px-3 py-2.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 flex items-center justify-center gap-1.5 transition-all active:scale-95">
            <span className="text-orange-400">▲</span> Progress
          </button>
          <button onClick={() => setAppState('history')} className="bg-white/5 border border-white/8 px-3 py-2.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 flex items-center justify-center gap-1.5 transition-all active:scale-95">
            <span className="text-gray-500">◷</span> History
          </button>
          <button onClick={() => setAppState('vault')} className="bg-white/5 border border-white/8 px-3 py-2.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 flex items-center justify-center gap-1.5 transition-all active:scale-95">
            <span className="text-yellow-500">★</span> Vault {vault.length}
          </button>
        </div>
      </div>

      <div className="w-full space-y-5">
        {/* Recovered draft from an interrupted session */}
        {recoveredDraft && (
          <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-yellow-400 text-xs font-black uppercase tracking-widest">Recovered Bars</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRestoreDraft}
                  className="text-[10px] font-black uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors"
                >Save to History</button>
                <button
                  onClick={() => { clearDraft(); setRecoveredDraft(null); }}
                  className="text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
                >Discard</button>
              </div>
            </div>
            <p className="text-gray-500 text-xs mb-4">A session ended unexpectedly. Save to History to keep everything, or copy what you need and Discard.</p>
            <div className="space-y-3">
              {flattenNotes(recoveredDraft.notes).map(([word, entryId, text]) => text?.trim() ? (
                <div key={word + entryId} className="bg-[#0f0f0f] border border-white/5 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{word}</p>
                    <button onClick={() => copyNoteText(`draft-${word}-${entryId}`, text)} className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full transition-all ${copiedNoteKey===`draft-${word}-${entryId}` ? 'bg-green-500/20 text-green-400' : 'bg-white/8 text-gray-500 hover:text-white'}`}>
                      {copiedNoteKey===`draft-${word}-${entryId}` ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap select-text">{text}</p>
                </div>
              ) : null)}
            </div>
          </div>
        )}

        {/* Today's prescription, above the manual controls. It does not replace them —
            a writer who knows what they want to train keeps the full surface — but it
            answers "what am I doing today" before the five settings below can become a
            reason to close the app. */}
        {dailyPlan && (
          <DailyCard plan={dailyPlan} completed={dailyDone} week={dailyWeek} onStart={startDaily} disabled={!!recoveredDraft} />
        )}

        {/* 1. Environment */}
        <div className="bg-[#0f0f0f] border border-white/5 p-6 rounded-3xl">
          <h2 className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-4">1. Environment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {!beatFileName ? (
              <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 rounded-xl border border-dashed border-white/8 text-gray-500 text-sm font-bold hover:bg-white/5 hover:text-gray-300 transition-all">+ Load Beat</button>
            ) : (
              <div className="w-full py-4 px-5 rounded-xl bg-white/5 border border-white/8 text-sm font-bold flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="truncate pr-2 text-green-400">▶ {beatFileName}</span>
                  <button onClick={removeBeat} aria-label="Remove loaded beat" className="text-gray-600 hover:text-white transition-colors ml-2 shrink-0">✕</button>
                </div>
                <p className="text-[10px] text-gray-600 font-normal normal-case">Free-play mode — plays alongside your timer, not locked to its grid.</p>
              </div>
            )}
            <input type="file" accept="audio/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            {canRecord ? (
              <div className="w-full">
                <button onClick={isRecording ? stopRecording : startRecording} className={`w-full py-3.5 px-4 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${isRecording ? 'border-red-500/40 bg-red-500/8 text-red-400' : 'border-white/8 bg-white/4 text-gray-500 hover:text-gray-200 hover:bg-white/8'}`}>
                  <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-700'}`} />
                  {isRecording ? 'Recording…' : 'Record Yourself'}
                </button>
                {cameraError && <p className="text-[10px] text-red-400/80 mt-2 px-1">{cameraError}</p>}
              </div>
            ) : (
              <div className="w-full py-3.5 px-4 rounded-xl border border-white/4 text-sm font-bold flex items-center justify-center gap-2 text-gray-700 cursor-not-allowed select-none">
                <span className="w-2 h-2 rounded-full bg-gray-800" />
                Camera not supported
              </div>
            )}
            <button onClick={() => setHapticsOn(!hapticsOn)} aria-pressed={hapticsOn} className="w-full py-3 px-4 rounded-xl border border-white/8 bg-white/4 text-xs font-bold uppercase tracking-widest flex items-center justify-between text-gray-400 hover:text-gray-200 hover:bg-white/8 transition-all">
              <span>Haptics</span>
              <span className={hapticsOn ? 'text-white' : 'text-gray-700'}>{hapticsOn ? 'On' : 'Off'}</span>
            </button>
          </div>
        </div>

        {/* 2. Timing */}
        <div className="bg-[#0f0f0f] border border-white/5 p-6 rounded-3xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] text-gray-600 font-black uppercase tracking-widest">2. Timing</h2>
            <div className="flex items-center bg-[#0a0a0a] rounded-full p-0.5 border border-white/5">
              <button onClick={() => setBpmMode(false)} aria-pressed={!bpmMode} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${!bpmMode ? 'bg-white text-black' : 'text-gray-600'}`}>Timer</button>
              <button onClick={() => setBpmMode(true)} aria-pressed={bpmMode} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${bpmMode  ? 'bg-white text-black' : 'text-gray-600'}`}>BPM</button>
            </div>
          </div>
          {!bpmMode ? (
            <div className="flex items-center gap-3 bg-[#0a0a0a] border border-white/5 rounded-xl p-3 px-4">
              <button onClick={() => { if(!beatAudioSrc) setIsMetronomeOn(p=>!p); }} aria-pressed={isMetronomeOn} className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${isMetronomeOn?'bg-white text-black':'text-gray-600 hover:text-white'} ${beatAudioSrc?'opacity-20 cursor-not-allowed':''}`} disabled={!!beatAudioSrc}>Metro</button>
              <div className="flex-1"><input type="range" min="1" max="10" step="0.5" value={intervalMs/1000} onChange={e=>setIntervalMs(parseFloat(e.target.value)*1000)} aria-label="Word change interval in seconds" className="w-full appearance-none bg-transparent focus:outline-none" /></div>
              <span className="text-xs font-bold text-white w-8 text-right">{(intervalMs/1000).toFixed(1)}s</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-[#0a0a0a] border border-white/5 rounded-xl p-3 px-4">
                <span className="text-gray-600 text-xs font-black uppercase tracking-widest w-8">BPM</span>
                <div className="flex-1"><input type="range" min="60" max="200" step="1" value={bpm} onChange={e=>setBpm(parseInt(e.target.value))} aria-label="Beats per minute" className="w-full appearance-none bg-transparent focus:outline-none" /></div>
                <span className="text-xs font-bold text-white w-8 text-right">{bpm}</span>
              </div>
              <div className="flex items-center gap-3 bg-[#0a0a0a] border border-white/5 rounded-xl p-3 px-4">
                <span className="text-gray-600 text-xs font-black uppercase tracking-widest shrink-0">Every</span>
                <div className="flex gap-2 flex-1 justify-end">
                  {[1,2,4,8].map(n=>(
                    <button key={n} onClick={()=>setBarsPerWord(n)} aria-pressed={barsPerWord===n} aria-label={`${n} bar${n===1?'':'s'} per word`} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${barsPerWord===n?'bg-white text-black':'bg-white/8 text-gray-500 hover:text-white'}`}>{n}{n===1?' bar':' bars'}</button>
                  ))}
                </div>
              </div>
              <p className="text-gray-700 text-[10px] px-1">≈ {(barsPerWord*4/bpm*60).toFixed(1)}s per word at {bpm} BPM</p>
            </div>
          )}
        </div>

        {/* 3+4. Complexity + Scheme Mode
            These are the only two settings labelled with bare numbers, so they are the
            two nobody can read. The caption below each says what the number means and
            moves with the selection — cheaper than a tooltip nobody taps, and it keeps
            the row's shape rather than adding another control. */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#0f0f0f] border border-white/5 p-5 rounded-3xl">
            <h2 className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-4">3. Level</h2>
            <div className="flex gap-2">
              {[1,2,3].map(t=>(
                <button key={t} onClick={()=>setSelectedTier(t)} aria-pressed={selectedTier===t} aria-label={`Difficulty level ${t} — ${LEVEL_CAPTIONS[t]}`} className={`flex-1 py-4 rounded-2xl font-black text-sm transition-all border ${selectedTier===t?'bg-white border-white text-black shadow-[0_0_18px_rgba(255,255,255,0.18)]':'bg-[#0a0a0a] border-white/5 text-gray-600 hover:text-gray-300 hover:bg-[#151515]'}`}>{t}</button>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mt-3 leading-relaxed">{LEVEL_CAPTIONS[selectedTier] || LEVEL_CAPTIONS[1]}</p>
          </div>
          <div className="bg-[#0f0f0f] border border-white/5 p-5 rounded-3xl">
            <h2 className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-4">4. Scheme</h2>
            <div className="flex gap-2">
              {[1,2,3,4].map(n=>(
                <button key={n} onClick={()=>setWordCount(n)} aria-pressed={wordCount===n} aria-label={`${n} word${n===1?'':'s'} at once — ${SCHEME_CAPTIONS[n]}`} className={`flex-1 py-4 rounded-2xl font-black text-sm transition-all border ${wordCount===n?'bg-white border-white text-black shadow-[0_0_18px_rgba(255,255,255,0.18)]':'bg-[#0a0a0a] border-white/5 text-gray-600 hover:text-gray-300 hover:bg-[#151515]'}`}>{n}</button>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mt-3 leading-relaxed">{SCHEME_CAPTIONS[wordCount] || SCHEME_CAPTIONS[1]}</p>
          </div>
        </div>

        {/* 5. Session Timer */}
        <div className="bg-[#0f0f0f] border border-white/5 p-5 rounded-3xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] text-gray-600 font-black uppercase tracking-widest">5. Session Timer</h2>
            {sessionLimit > 0 && <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Ends automatically</span>}
          </div>
          <div className="flex gap-2">
            {[0,5,10,15,20].map(m=>(
              <button key={m} onClick={()=>setSessionLimit(m)} aria-pressed={sessionLimit===m} aria-label={m===0?'No session timer':`${m} minute session timer`} className={`flex-1 py-3 rounded-2xl font-black text-xs transition-all border ${sessionLimit===m?'bg-white border-white text-black shadow-[0_0_18px_rgba(255,255,255,0.18)]':'bg-[#0a0a0a] border-white/5 text-gray-600 hover:text-gray-300 hover:bg-[#151515]'}`}>{m===0?'Off':`${m}m`}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
