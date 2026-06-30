import { useState, useEffect, useRef, useMemo } from 'react';
import { BeatScheduler } from './services/audio-clock';
import { getNextWords as getNextWordsService } from './services/wordbank';
import { fetchDictData as fetchDictDataService } from './services/dictionary';
import { haptic } from './services/haptic';
import {
  loadPrefs, savePrefs,
  loadVault, saveVault,
  loadHistory, saveHistory,
  loadSessionLimit, saveSessionLimit,
  loadCustomWords, saveCustomWords,
  hasSeenInfo, markSeenInfo,
  loadPracticeDays, recordPracticeDay,
  computeStreak,
  exportAllData, importAllData,
} from './services/storage';

  // ─────────────────────────────────────────────
  // RHYME SEARCH PANEL  (standalone tab)
  // ─────────────────────────────────────────────
  function RhymeSearch({ onClose, vault = [], toggleVault }) {
    const [query, setQuery]       = useState('');
    const [results, setResults]   = useState(null);
    const [loading, setLoading]   = useState(false);
    const [copied, setCopied]     = useState('');
    const inputRef                = useRef(null);
    const abortRef                = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const search = async (word) => {
      const w = word.trim().toLowerCase();
      if (!w) return;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      setLoading(true); setResults(null);
      try {
        const sig = abortRef.current.signal;
        const safe = (p) => fetch(p, { signal: sig }).then(r => r.ok ? r.json() : []).catch(() => []);
        const [perfect, near, broader] = await Promise.all([
          safe(`https://api.datamuse.com/words?rel_rhy=${w}&md=s&max=40`),
          safe(`https://api.datamuse.com/words?rel_nry=${w}&md=s&max=40`),
          safe(`https://api.datamuse.com/words?sl=${w}&md=s&max=20`),
        ]);
        // bucket by syllable count
        const bucket = (arr) => {
          const groups = {};
          arr.filter(x => x.word !== w).forEach(x => {
            const s = x.numSyllables || '?';
            if (!groups[s]) groups[s] = [];
            groups[s].push(x.word);
          });
          return groups;
        };
        setResults({ perfect: bucket(perfect), near: bucket(near), broader: bucket(broader), word: w });
      } catch (e) {
        if (e.name !== 'AbortError') setResults({ error: true });
      } finally { setLoading(false); }
    };

    const copy = (w) => {
      navigator.clipboard?.writeText(w).catch(() => {});
      setCopied(w); setTimeout(() => setCopied(''), 1200);
      haptic(12);
    };

    const SyllableGroup = ({ label, groups, color }) => {
      if (!groups || !Object.keys(groups).length) return null;
      const sorted = Object.keys(groups).sort((a, b) => Number(a) - Number(b));
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
                    <div key={w} className="flex items-center">
                      <button onClick={() => copy(w)} className={`rhyme-chip px-3 py-1.5 rounded-l-full text-sm font-bold border border-white/8 border-r-0 ${copied === w ? 'bg-white text-black' : 'bg-white/5 text-gray-200'}`}>
                        {w}
                      </button>
                      <button onClick={() => { toggleVault?.(w); haptic(12); }} className={`rhyme-chip px-2 py-1.5 rounded-r-full text-xs border border-white/8 border-l-0 transition-colors ${inVault ? 'bg-white/5 text-yellow-400' : 'bg-white/5 text-gray-600 hover:text-yellow-400'}`}>
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
      <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 pt-14 pb-4 border-b border-white/5">
          <button onClick={onClose} className="w-9 h-9 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/10 transition-all text-lg">←</button>
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search(query)}
              placeholder="Enter any word…"
              className="w-full bg-[#111] border border-white/10 rounded-2xl px-5 py-3.5 text-white font-bold text-base placeholder-gray-600 focus:border-white/30 transition-colors"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-lg">✕</button>
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

  // ─────────────────────────────────────────────
  // DICTIONARY MODAL  (with inline bar notepad + syllable count)
  // ─────────────────────────────────────────────
  function DictionaryModal({ word, dictData, isLoading, onClose, isVaultMode, onSaveNote, savedNote }) {
    const [note, setNote]         = useState(savedNote || '');
    const [noteSaved, setNoteSaved] = useState(false);
    const noteRef = useRef(null);
    const autosaveTimerRef = useRef(null);
    const noteLiveRef = useRef(savedNote || '');

    const getModalFontSize = (w) => {
      const len = Math.max(w?.length || 1, 4);
      return `clamp(22px, min(9vw, ${380/len}px), 52px)`;
    };

    const handleSaveNote = () => {
      onSaveNote?.(word, note);
      setNoteSaved(true);
      haptic(15);
      setTimeout(() => setNoteSaved(false), 1500);
    };

    // Debounced autosave: saves 600ms after the user stops typing, silently.
    useEffect(() => {
      noteLiveRef.current = note;
      if (isVaultMode) return; // vault mode has no notepad
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => { onSaveNote?.(word, note); }, 600);
      return () => clearTimeout(autosaveTimerRef.current);
    }, [note, word, isVaultMode]);

    // Flush-on-close: guarantees the latest text is saved even if the user
    // closes the modal before the debounce timer or a manual Save fires.
    const closeAndFlush = () => {
      clearTimeout(autosaveTimerRef.current);
      if (!isVaultMode) onSaveNote?.(word, noteLiveRef.current);
      onClose();
    };

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/92 backdrop-blur-xl animate-in fade-in duration-150" onClick={closeAndFlush}>
        <div className="bg-[#0a0a0a] w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>

          {/* Word header */}
          <div className="px-6 pt-6 pb-4 border-b border-white/5 flex justify-between items-start bg-gradient-to-br from-white/4 to-transparent">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest mb-1 block text-gray-500">Locked</span>
              <h2 className="font-black uppercase tracking-tighter text-white whitespace-nowrap leading-none drop-shadow-md" style={{ fontSize: getModalFontSize(word) }}>{word}</h2>
              {/* Syllable count badge */}
              {dictData?.syllables && (
                <span className="mt-2 inline-flex items-center gap-1 bg-white/8 border border-white/8 rounded-full px-2.5 py-0.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {dictData.syllables} {dictData.syllables === 1 ? 'syllable' : 'syllables'}
                </span>
              )}
            </div>
            <button onClick={closeAndFlush} className="w-10 h-10 shrink-0 bg-white/5 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/15 transition-all border border-white/8 ml-4">✕</button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto custom-scrollbar flex-1 p-6 space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-16"><div className="w-12 h-12 border-4 border-white/15 border-t-white rounded-full animate-spin" /></div>
            ) : (
              <>
                {/* Rhymes */}
                <div className="bg-white/4 p-4 rounded-2xl border border-white/5">
                  <h3 className="text-green-400 text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> {dictData?.rhymeLabel || 'Top Rhymes'}
                  </h3>
                  <p className="text-white font-bold text-sm leading-relaxed">
                    {dictData?.rhymes?.length > 0 ? dictData.rhymes.join(', ') : 'No rhymes found'}
                  </p>
                </div>

                {/* Synonyms + Antonyms */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/4 p-4 rounded-2xl border border-white/5">
                    <h3 className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-2">Synonyms</h3>
                    <p className="text-gray-300 text-xs leading-relaxed">{dictData?.synonyms?.length > 0 ? dictData.synonyms.slice(0, 8).join(', ') : '—'}</p>
                  </div>
                  <div className="bg-white/4 p-4 rounded-2xl border border-white/5">
                    <h3 className="text-purple-400 text-[10px] font-black uppercase tracking-widest mb-2">Antonyms</h3>
                    <p className="text-gray-300 text-xs leading-relaxed">{dictData?.antonyms?.length > 0 ? dictData.antonyms.slice(0, 8).join(', ') : '—'}</p>
                  </div>
                </div>

                {/* Definition */}
                {dictData?.definitions?.length > 0 && (
                  <div className="bg-white/4 p-4 rounded-2xl border border-white/5 space-y-2">
                    <h3 className="text-yellow-400 text-[10px] font-black uppercase tracking-widest">Definition</h3>
                    {dictData.definitions.map((d, i) => (
                      <div key={i}>
                        {d.pos && <span className="text-gray-600 text-[10px] uppercase tracking-widest italic">{d.pos} </span>}
                        <p className="text-gray-300 text-xs leading-relaxed inline">{d.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── BAR NOTEPAD ── */}
                {!isVaultMode && (
                  <div className="bg-white/4 rounded-2xl border border-white/8 overflow-hidden">
                    <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Bar Pad</h3>
                      {note.trim() && (
                        <button
                          onClick={handleSaveNote}
                          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all ${noteSaved ? 'bg-green-500/20 text-green-400' : 'bg-white/8 text-gray-400 hover:text-white hover:bg-white/15'}`}
                        >
                          {noteSaved ? '✓ Saved' : 'Save'}
                        </button>
                      )}
                    </div>
                    <textarea
                      ref={noteRef}
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder={`Write a bar with "${word}"…`}
                      rows={3}
                      className="w-full bg-transparent px-4 py-3 text-gray-200 text-sm leading-relaxed placeholder-gray-700 font-medium"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-3 border-t border-white/5">
            <button onClick={closeAndFlush} className="w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest bg-white/8 hover:bg-white/15 text-gray-300 transition-all active:scale-95 border border-white/8">
              {isVaultMode ? 'Close' : 'Resume Session'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // MAIN APP
  // ─────────────────────────────────────────────
  function App() {
    const _prefs = useMemo(() => loadPrefs(), []);

    const [showSplash,      setShowSplash]      = useState(true);
    const [appState,        setAppState]        = useState('idle');
    const [currentWords,    setCurrentWords]    = useState(['TAP START']);
    const [wordCount,       setWordCount]       = useState(_prefs.wordCount || 1);
    const [isPausedForDict, setIsPausedForDict] = useState(false);
    const [activeDictWord,  setActiveDictWord]  = useState(null);
    const [flashKey,        setFlashKey]        = useState(0);

    const [selectedTier,   setSelectedTier]   = useState(_prefs.tier     || 1);
    const [intervalMs,     setIntervalMs]     = useState(_prefs.interval || 3500);
    const [beatAudioSrc,   setBeatAudioSrc]   = useState(null);
    const [beatFileName,   setBeatFileName]   = useState('');
    const [isMetronomeOn,  setIsMetronomeOn]  = useState(false); // not persisted intentionally
    const [showInfo,       setShowInfo]       = useState(false);
    const [showRhymeSearch,setShowRhymeSearch]= useState(false);

    // BPM
    const [bpm,         setBpm]         = useState(_prefs.bpm || 90);
    const [bpmMode,     setBpmMode]     = useState(_prefs.bpmMode || false);
    const [currentBeat, setCurrentBeat] = useState(0);
    const [barCount,    setBarCount]    = useState(0);
    const [barsPerWord, setBarsPerWord] = useState(_prefs.barsPerWord || 2);
    const [isCountingIn, setIsCountingIn] = useState(false);

    // Session countdown
    const [sessionLimit,      setSessionLimit]      = useState(() => loadSessionLimit());
    const [timeRemaining,     setTimeRemaining]     = useState(0);
    const countdownRef = useRef(null);

    const timerRef     = useRef(null);
    const metronomeRef = useRef(null);
    const audioPlayerRef     = useRef(null);
    const audioCtxRef        = useRef(null);
    const fileInputRef       = useRef(null);
    const lastWordRef        = useRef(null);
    const fetchAbortRef      = useRef(null);
    const wakeLockRef        = useRef(null);
    const mediaRecorderRef   = useRef(null);
    const recordedChunksRef  = useRef([]);
    const beatCountRef       = useRef(0);

    const [sessionStartTime, setSessionStartTime] = useState(null);
    const [totalWordsSeen,   setTotalWordsSeen]   = useState(0);
    const [frozenWords,      setFrozenWords]      = useState(new Set());
    const [sessionDuration,  setSessionDuration]  = useState(0);

    const [isRecording,       setIsRecording]       = useState(false);
    const [recordingAvailable,setRecordingAvailable]= useState(false);
    const [recordingBlob,     setRecordingBlob]     = useState(null);

    // Custom word injection
    const [customWords, setCustomWords] = useState(() => {
      try { return loadCustomWords(); } catch { return []; }
    });
    const [customWordInput, setCustomWordInput] = useState('');

    // Vault
    const [vault, setVault] = useState(() => loadVault());
    const [vaultSortMode,   setVaultSortMode]   = useState('Newest');
    const [vaultDrillQueue, setVaultDrillQueue] = useState([]);
    const [vaultDrillIndex, setVaultDrillIndex] = useState(0);

    // Session history
    const [sessionHistory, setSessionHistory] = useState(() => loadHistory());

    // Streak — read from independent practice-day storage, NOT from
    // sessionHistory, which is capped at 20 entries. A writer doing several
    // sessions a day should never see their streak collapse because old
    // history rolled off.
    const [practiceDays, setPracticeDays] = useState(() => loadPracticeDays());
    const streak = computeStreak(practiceDays);

    // Dict + notes
    const [dictData,          setDictData]          = useState(null);
    const [isLoadingDict,     setIsLoadingDict]      = useState(false);
    const [summaryActiveWord, setSummaryActiveWord]  = useState(null);

    // Notes: { [word]: "bar text" }, persisted, scoped to session
    const [sessionNotes, setSessionNotes] = useState({});

    // Live refs mirroring volatile session state, so stopSession (even when
    // called from a stale interval closure) always reads current values.
    const totalWordsSeenRef = useRef(0);
    const frozenWordsRef    = useRef(new Set());
    const sessionNotesRef   = useRef({});
    useEffect(() => { totalWordsSeenRef.current = totalWordsSeen; }, [totalWordsSeen]);
    useEffect(() => { frozenWordsRef.current = frozenWords; }, [frozenWords]);
    useEffect(() => { sessionNotesRef.current = sessionNotes; }, [sessionNotes]);

    // ── Splash ──
    useEffect(() => {
      const t = setTimeout(() => {
        setShowSplash(false);
        if (!hasSeenInfo()) { setShowInfo(true); markSeenInfo(); }
      }, 2200);
      return () => clearTimeout(t);
    }, []);

    useEffect(() => { saveVault(vault); }, [vault]);
    useEffect(() => { saveHistory(sessionHistory); }, [sessionHistory]);
    useEffect(() => { saveSessionLimit(sessionLimit); }, [sessionLimit]);
    useEffect(() => { saveCustomWords(customWords); }, [customWords]);

    // Persist user preferences
    useEffect(() => {
      savePrefs({ tier: selectedTier, interval: intervalMs, bpm, bpmMode, barsPerWord, wordCount });
    }, [selectedTier, intervalMs, bpm, bpmMode, barsPerWord, wordCount]);

    useEffect(() => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
      return () => audioCtxRef.current?.close();
    }, []);

    useEffect(() => () => { if (beatAudioSrc) URL.revokeObjectURL(beatAudioSrc); fetchAbortRef.current?.abort(); releaseWakeLock(); }, [beatAudioSrc]);

    // ── Audio ──
    const playTick = (freq = 800, vol = 0.45, dur = 0.08) => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(); osc.stop(ctx.currentTime + dur);
    };

    const handleFileUpload = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (beatAudioSrc) URL.revokeObjectURL(beatAudioSrc);
      setBeatFileName(f.name); setBeatAudioSrc(URL.createObjectURL(f));
      setIsMetronomeOn(false); setBpmMode(false);
    };
    const removeBeat = () => { setBeatFileName(''); if (beatAudioSrc) URL.revokeObjectURL(beatAudioSrc); setBeatAudioSrc(null); if (fileInputRef.current) fileInputRef.current.value = ''; };
    const requestWakeLock = async () => { try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch {} };
    const releaseWakeLock = () => { wakeLockRef.current?.release().then(() => { wakeLockRef.current = null; }); };

    // ── Font sizing ──
    const getDynamicFontSize = (word, count) => {
      const len = Math.max(word.length || 1, 4);
      const ls = window.innerWidth > window.innerHeight;
      if (count === 4) return ls ? `calc(min(6vh,${50/len}vw))`   : `calc(min(7vw,${60/len}vw))`;
      if (count === 3) return ls ? `calc(min(8vh,${70/len}vw))`   : `calc(min(9vw,${80/len}vw))`;
      if (count === 2) return ls ? `calc(min(10vh,${90/len}vw))`  : `calc(min(12vw,${100/len}vw))`;
      return ls ? `calc(min(14vh,${120/len}vw))` : `calc(min(18vw,${135/len}vw))`;
    };

    // ── Word engine ──
    // Selection logic itself lives in services/wordbank.js — this is just a
    // thin wrapper that supplies this component's current settings and
    // tracks the "last shown" words to avoid immediate repeats.
    const getNextWords = (count) => {
      const sel = getNextWordsService(selectedTier, count, customWords, 0.20, lastWordRef.current || []);
      lastWordRef.current = sel;
      return sel;
    };

    // ── BPM ──
    const beatsPerWord = barsPerWord * 4;

    // Precise look-ahead scheduler refs. setInterval drifts under load, tab
    // backgrounding, and render contention — but AudioContext.currentTime is
    // a hardware clock that doesn't. We use a cheap, frequent setInterval
    // purely as a "wake up and check" poll, while all actual beat timing is
    // computed against audioCtx.currentTime so the grid can't drift.
    // The scheduling math itself lives in services/audio-clock.js
    // (BeatScheduler) — this just wires its callbacks into component state.
    const beatSchedulerRef = useRef(null);

    // ── Session loop ──
    useEffect(() => {
      const active = appState === 'active' || appState === 'vault-drill';
      if (!active || isPausedForDict) {
        clearInterval(timerRef.current); clearInterval(metronomeRef.current);
        beatSchedulerRef.current?.stop();
        return;
      }
      const nextWord = () => {
        haptic(20);
        setFlashKey(k => k + 1);
        if (appState === 'vault-drill') { setVaultDrillIndex(p => (p+1) % vaultDrillQueue.length); setTotalWordsSeen(p => p + 1); }
        else { const w = getNextWords(wordCount); setCurrentWords(w); setTotalWordsSeen(p => p + wordCount); }
      };

      if (bpmMode) {
        const ctx = audioCtxRef.current;
        if (!ctx) return; // no audio context available — bail safely

        beatCountRef.current = 0;
        setCurrentBeat(0); setBarCount(0); setIsCountingIn(true);

        if (!beatSchedulerRef.current) beatSchedulerRef.current = new BeatScheduler(ctx, {});
        beatSchedulerRef.current.callbacks = {
          onBeat: ({ beatIndexInBar }) => {
            setCurrentBeat(beatIndexInBar);
            haptic(beatIndexInBar === 0 ? 25 : 10);
          },
          onCountInEnd: () => setIsCountingIn(false),
          onWord: () => { beatCountRef.current += 1; nextWord(); setBarCount(p => p + barsPerWord); },
        };
        beatSchedulerRef.current.start(bpm, beatsPerWord);
        return () => beatSchedulerRef.current?.stop();
      } else {
        timerRef.current = setInterval(nextWord, intervalMs);
        if (isMetronomeOn) { playTick(); metronomeRef.current = setInterval(playTick, intervalMs/4); }
        return () => { clearInterval(timerRef.current); clearInterval(metronomeRef.current); };
      }
    }, [appState, isPausedForDict, selectedTier, intervalMs, isMetronomeOn, wordCount, bpmMode, bpm, barsPerWord]);

    // ── Countdown timer ──
    useEffect(() => {
      if (appState !== 'active' || sessionLimit === 0 || isPausedForDict) {
        clearInterval(countdownRef.current); return;
      }
      countdownRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) { clearInterval(countdownRef.current); stopSession(); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(countdownRef.current);
    }, [appState, sessionLimit, isPausedForDict]);

    // ── Recording ──
    const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

    const startRecording = async () => {
      if (!canRecord) return;
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        // Pick best available mimeType
        const mimeType = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4']
          .find(t => MediaRecorder.isTypeSupported(t)) || '';
        const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        recordedChunksRef.current = [];
        rec.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        rec.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType.startsWith('video/mp4') ? 'video/mp4' : 'video/webm' });
          setRecordingBlob(blob); setRecordingAvailable(true);
          stream.getTracks().forEach(t => t.stop());
        };
        rec.start(); mediaRecorderRef.current = rec; setIsRecording(true);
      } catch(e) {
        console.log('Recording unavailable:', e.message);
      }
    };
    const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } };
    const downloadRecording = () => {
      if (!recordingBlob) return;
      const url = URL.createObjectURL(recordingBlob), a = document.createElement('a');
      a.href = url; a.download = `barsmith-${Date.now()}.webm`; a.click(); URL.revokeObjectURL(url);
    };

    // ── Session start / stop ──
    const startSession = () => {
      audioCtxRef.current?.state === 'suspended' && audioCtxRef.current.resume();
      if (beatAudioSrc && audioPlayerRef.current) { audioPlayerRef.current.currentTime = 0; audioPlayerRef.current.play().catch(()=>{}); }
      requestWakeLock();
      beatCountRef.current = 0; setCurrentBeat(0); setBarCount(0); setFlashKey(0);
      setSessionStartTime(Date.now()); setTotalWordsSeen(wordCount); setFrozenWords(new Set());
      setSessionNotes({});
      if (sessionLimit > 0) setTimeRemaining(sessionLimit * 60);
      setCurrentWords(getNextWords(wordCount)); setAppState('active'); setIsPausedForDict(false);
      setRecordingAvailable(false); setRecordingBlob(null);
    };

    const stopSession = (source = 'global') => {
      audioPlayerRef.current?.pause();
      if (isRecording) stopRecording();
      releaseWakeLock();
      setIsCountingIn(false);
      const dur = Math.floor((Date.now() - sessionStartTime) / 1000);
      setSessionDuration(dur);
      const liveWordsSeen = totalWordsSeenRef.current;
      const liveFrozen    = frozenWordsRef.current;
      const liveNotes     = sessionNotesRef.current;
      const rec = {
        id: Date.now(), date: new Date().toISOString(), duration: dur,
        wordsSeen: liveWordsSeen, tier: selectedTier, wordCount,
        pace: bpmMode ? `${bpm} BPM` : `${(intervalMs/1000).toFixed(1)}s`,
        frozenWords: [...liveFrozen], notes: { ...liveNotes },
        source,
      };
      setSessionHistory(prev => [rec, ...prev].slice(0, 20));
      // Streak is tracked from this independent, uncapped store — never
      // from sessionHistory, which rolls off after 20 entries.
      const todayKey = new Date().toDateString();
      recordPracticeDay(todayKey);
      setPracticeDays(loadPracticeDays());
      // Keep visible summary stats in sync with what was actually saved.
      setTotalWordsSeen(liveWordsSeen);
      setAppState('summary'); setIsPausedForDict(false);
    };

    // ── Vault drill ──
    const startVaultDrill = () => {
      if (!vault.length) return;
      audioCtxRef.current?.state === 'suspended' && audioCtxRef.current.resume();
      const q = [...vault].sort(() => Math.random()-.5).map(v => v.word);
      setVaultDrillQueue(q); setVaultDrillIndex(0); setFrozenWords(new Set());
      setSessionStartTime(Date.now()); setTotalWordsSeen(1);
      setSessionNotes({});
      setRecordingAvailable(false); setRecordingBlob(null);
      setAppState('vault-drill'); setIsPausedForDict(false); requestWakeLock();
    };
    const stopVaultDrill = () => stopSession('vault');

    // ── Dictionary fetch ──
    // All lookup logic (rhymes, synonyms, antonyms, definitions, syllables,
    // phrase short-circuiting) lives in services/dictionary.js — this just
    // owns the abort-controller lifecycle and loading state for this screen.
    const fetchDictData = async (rawWord) => {
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      const w = rawWord.trim().toLowerCase();

      if (/\s/.test(w)) {
        setIsLoadingDict(false);
        setDictData(await fetchDictDataService(rawWord, null));
        return;
      }

      fetchAbortRef.current = new AbortController();
      setIsLoadingDict(true); setDictData(null);
      try {
        const result = await fetchDictDataService(rawWord, fetchAbortRef.current.signal);
        setDictData(result);
      } catch (e) {
        if (e.name === 'AbortError') return;
        setDictData({ definitions: [{ text: 'Network error.' }], rhymes: [], synonyms: [], antonyms: [], syllables: null });
      } finally {
        setIsLoadingDict(false);
      }
    };

    const pauseForDict = (word) => {
      if ((appState !== 'active' && appState !== 'vault-drill') || isPausedForDict) return;
      haptic(25);
      setIsPausedForDict(true); setActiveDictWord(word);
      setFrozenWords(prev => new Set(prev).add(word));
      fetchDictData(word);
      audioPlayerRef.current?.pause();
    };
    const resumeFromDict = () => {
      setIsPausedForDict(false); setActiveDictWord(null); setDictData(null);
      if (beatAudioSrc) audioPlayerRef.current?.play();
    };

    const handleSaveNote = (word, text) => {
      setSessionNotes(prev => ({ ...prev, [word]: text }));
    };

    const resetToIdle = () => { setAppState('idle'); setCurrentWords(['READY…']); setSummaryActiveWord(null); setDictData(null); };
    const toggleVault = (word) => { setVault(prev => prev.some(v=>v.word===word) ? prev.filter(v=>v.word!==word) : [...prev,{word,addedAt:Date.now()}]); haptic(12); };

    // ── Data export / import (backup & restore) ──
    const importFileRef = useRef(null);
    const [importMsg, setImportMsg] = useState('');
    const handleExportData = () => {
      const json = exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `barsmith-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
      haptic(12);
    };
    const handleImportFile = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = importAllData(reader.result);
        if (result.ok) {
          setVault(loadVault());
          setSessionHistory(loadHistory());
          setCustomWords(loadCustomWords());
          setPracticeDays(loadPracticeDays());
          setImportMsg('Backup restored.');
          haptic(20);
        } else {
          setImportMsg('Import failed — invalid file.');
        }
        setTimeout(() => setImportMsg(''), 2500);
      };
      reader.readAsText(f);
      e.target.value = '';
    };

    const sortedVault = useMemo(() => [...vault].sort((a,b) =>
      vaultSortMode==='A-Z'    ? a.word.localeCompare(b.word) :
      vaultSortMode==='Z-A'    ? b.word.localeCompare(a.word) :
      vaultSortMode==='Newest' ? b.addedAt-a.addedAt : a.addedAt-b.addedAt
    ), [vault, vaultSortMode]);

    const fmtDate = (iso) => { const d=new Date(iso); return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' · '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); };
    const fmtDur  = (s)   => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
    const fmtCountdown = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

    const activeWords    = appState === 'vault-drill' ? [vaultDrillQueue[vaultDrillIndex] || '—'] : currentWords;
    const sessionIsActive = appState === 'active' || appState === 'vault-drill';

    // ═══════════════════════════════════════════
    // SPLASH
    // ═══════════════════════════════════════════
    if (showSplash) return (
      <div className="fixed inset-0 bg-[#050505] flex items-center justify-center z-[100]">
        <img src="/icon-512.png" className="w-40 h-40 object-contain opacity-90" />
      </div>
    );

    return (
      <div className="min-h-[100dvh] w-full bg-[#050505] text-white flex flex-col font-sans select-none relative overflow-x-hidden">
        {beatAudioSrc && <audio ref={audioPlayerRef} src={beatAudioSrc} loop />}

        {/* ── Rhyme Search overlay ── */}
        {showRhymeSearch && <RhymeSearch onClose={() => setShowRhymeSearch(false)} vault={vault} toggleVault={toggleVault} />}

        {/* ── How to Smith ── */}
        {showInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/92 backdrop-blur-md" onClick={() => setShowInfo(false)}>
            <div className="bg-[#0f0f0f] border border-white/10 rounded-3xl overflow-hidden max-w-md w-full shadow-2xl" onClick={e=>e.stopPropagation()}>
              <div className="p-8 pb-0">
                <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-1">How to</p>
                <h3 className="text-3xl font-black uppercase tracking-tighter mb-6">Smith</h3>
              </div>
              <div className="overflow-y-auto custom-scrollbar max-h-[58vh] px-8 pb-2">
                <ul className="space-y-5">
                  {[
                    ['01','Session',     'Words rotate at your tempo. Rap over them. Build bars, find internal rhymes, discover new angles on familiar sounds.'],
                    ['02','Tap to Lock', 'Tap any word to freeze and pull its full rhyme family, syllable count, synonyms, and definition. Write a bar directly in the panel.'],
                    ['03','Scheme Mode', 'Set word count to 2–4 to run multiple words at once. Bridge unrelated concepts into a punchline. This is where the craft lives.'],
                    ['04','BPM Grid',    'Lock word changes to a real bar grid. Set BPM and bars-per-word — practice to the actual time signature, not a vague timer.'],
                    ['05','Session Timer','Set a 5–20 minute block. Session ends automatically with a summary. Serious writers work in timed sprints — this is that.'],
                    ['06','Rhyme Search','Type any word and get a full rhyme map bucketed by syllable count. Perfect, near, and phonetic matches. Tap to copy.'],
                    ['07','Your Words',  'Add personal vocabulary in the Vault — names, slang, places. They surface in your sessions. The tool becomes yours.'],
                    ['08', 'Vault Drill', "Your saved words become a custom session. Drill vocabulary you've claimed — words you know are yours."],                    ['09','Record',      'Capture the session on screen. Review what landed, clip the best moments, study your own flow.'],
                  ].map(([n,title,desc]) => (
                    <li key={n} className="flex gap-4">
                      <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest pt-0.5 w-4 shrink-0">{n}</span>
                      <div>
                        <p className="text-white font-black text-sm uppercase tracking-wide mb-0.5">{title}</p>
                        <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-8 pt-6">
                <button onClick={() => setShowInfo(false)} className="w-full py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-colors active:scale-95">Let's Work</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* IDLE                                        */}
        {/* ═══════════════════════════════════════════ */}
        {appState === 'idle' && (
          <div className="flex-1 flex flex-col items-center w-full px-6 py-10 md:py-14 max-w-4xl mx-auto pb-36">
            {/* Header */}
            <div className="flex justify-between w-full items-center mb-10">
              <div className="flex items-center gap-3">
                <button onClick={() => setShowInfo(true)} className="w-8 h-8 rounded-full border border-white/15 text-white/40 text-xs font-bold hover:bg-white/8 hover:text-white transition-all flex items-center justify-center">?</button>
                <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase">
                  <span className="text-white">BAR</span><span className="text-slate-600">SMITH</span>
                </h1>
              </div>
              <div className="flex items-center gap-2">
                {streak > 0 && (
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/8 px-3 py-2 rounded-full" title={`${streak}-day streak`}>
                    <span className="text-orange-400 text-xs">🔥</span>
                    <span className="text-xs font-black text-white tabular-nums">{streak}</span>
                  </div>
                )}
                <button onClick={() => setShowRhymeSearch(true)} className="bg-white/5 border border-white/8 px-4 py-2.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-all active:scale-95">
                  <span className="text-green-400">◎</span> Rhymes
                </button>
                <button onClick={() => setAppState('history')} className="bg-white/5 border border-white/8 px-4 py-2.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-all active:scale-95">
                  <span className="text-gray-500">◷</span> History
                </button>
                <button onClick={() => setAppState('vault')} className="bg-white/5 border border-white/8 px-4 py-2.5 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-all active:scale-95">
                  <span className="text-yellow-500">★</span> {vault.length}
                </button>
              </div>
            </div>

            <div className="w-full space-y-5">
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
                        <button onClick={removeBeat} className="text-gray-600 hover:text-white transition-colors ml-2 shrink-0">✕</button>
                      </div>
                      <p className="text-[10px] text-gray-600 font-normal normal-case">Free-play mode — plays alongside your timer, not locked to its grid.</p>
                    </div>
                  )}
                  <input type="file" accept="audio/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                  {canRecord ? (
                    <button onClick={isRecording ? stopRecording : startRecording} className={`w-full py-3.5 px-4 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${isRecording ? 'border-red-500/40 bg-red-500/8 text-red-400' : 'border-white/8 bg-white/4 text-gray-500 hover:text-gray-200 hover:bg-white/8'}`}>
                      <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-700'}`} />
                      {isRecording ? 'Recording…' : 'Record Session'}
                    </button>
                  ) : (
                    <div className="w-full py-3.5 px-4 rounded-xl border border-white/4 text-sm font-bold flex items-center justify-center gap-2 text-gray-700 cursor-not-allowed select-none">
                      <span className="w-2 h-2 rounded-full bg-gray-800" />
                      Record (desktop only)
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Timing */}
              <div className="bg-[#0f0f0f] border border-white/5 p-6 rounded-3xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[10px] text-gray-600 font-black uppercase tracking-widest">2. Timing</h2>
                  <div className="flex items-center bg-[#0a0a0a] rounded-full p-0.5 border border-white/5">
                    <button onClick={() => setBpmMode(false)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${!bpmMode ? 'bg-white text-black' : 'text-gray-600'}`}>Timer</button>
                    <button onClick={() => setBpmMode(true)}  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${bpmMode  ? 'bg-white text-black' : 'text-gray-600'}`}>BPM</button>
                  </div>
                </div>
                {!bpmMode ? (
                  <div className="flex items-center gap-3 bg-[#0a0a0a] border border-white/5 rounded-xl p-3 px-4">
                    <button onClick={() => { if(!beatAudioSrc) setIsMetronomeOn(p=>!p); }} className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${isMetronomeOn?'bg-white text-black':'text-gray-600 hover:text-white'} ${beatAudioSrc?'opacity-20 cursor-not-allowed':''}`} disabled={!!beatAudioSrc}>Metro</button>
                    <div className="flex-1"><input type="range" min="1" max="10" step="0.5" value={intervalMs/1000} onChange={e=>setIntervalMs(parseFloat(e.target.value)*1000)} className="w-full appearance-none bg-transparent focus:outline-none" /></div>
                    <span className="text-xs font-bold text-white w-8 text-right">{(intervalMs/1000).toFixed(1)}s</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 bg-[#0a0a0a] border border-white/5 rounded-xl p-3 px-4">
                      <span className="text-gray-600 text-xs font-black uppercase tracking-widest w-8">BPM</span>
                      <div className="flex-1"><input type="range" min="60" max="200" step="1" value={bpm} onChange={e=>setBpm(parseInt(e.target.value))} className="w-full appearance-none bg-transparent focus:outline-none" /></div>
                      <span className="text-xs font-bold text-white w-8 text-right">{bpm}</span>
                    </div>
                    <div className="flex items-center gap-3 bg-[#0a0a0a] border border-white/5 rounded-xl p-3 px-4">
                      <span className="text-gray-600 text-xs font-black uppercase tracking-widest shrink-0">Every</span>
                      <div className="flex gap-2 flex-1 justify-end">
                        {[1,2,4,8].map(n=>(
                          <button key={n} onClick={()=>setBarsPerWord(n)} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${barsPerWord===n?'bg-white text-black':'bg-white/8 text-gray-500 hover:text-white'}`}>{n}{n===1?' bar':' bars'}</button>
                        ))}
                      </div>
                    </div>
                    <p className="text-gray-700 text-[10px] px-1">≈ {(barsPerWord*4/bpm*60).toFixed(1)}s per word at {bpm} BPM</p>
                  </div>
                )}
              </div>

              {/* 3+4. Complexity + Scheme Mode */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0f0f0f] border border-white/5 p-5 rounded-3xl">
                  <h2 className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-4">3. Level</h2>
                  <div className="flex gap-2">
                    {[1,2,3].map(t=>(
                      <button key={t} onClick={()=>setSelectedTier(t)} className={`flex-1 py-4 rounded-2xl font-black text-sm transition-all border ${selectedTier===t?'bg-white border-white text-black shadow-[0_0_18px_rgba(255,255,255,0.18)]':'bg-[#0a0a0a] border-white/5 text-gray-600 hover:text-gray-300 hover:bg-[#151515]'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="bg-[#0f0f0f] border border-white/5 p-5 rounded-3xl">
                  <h2 className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-4">4. Scheme</h2>
                  <div className="flex gap-2">
                    {[1,2,3,4].map(n=>(
                      <button key={n} onClick={()=>setWordCount(n)} className={`flex-1 py-4 rounded-2xl font-black text-sm transition-all border ${wordCount===n?'bg-white border-white text-black shadow-[0_0_18px_rgba(255,255,255,0.18)]':'bg-[#0a0a0a] border-white/5 text-gray-600 hover:text-gray-300 hover:bg-[#151515]'}`}>{n}</button>
                    ))}
                  </div>
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
                    <button key={m} onClick={()=>setSessionLimit(m)} className={`flex-1 py-3 rounded-2xl font-black text-xs transition-all border ${sessionLimit===m?'bg-white border-white text-black shadow-[0_0_18px_rgba(255,255,255,0.18)]':'bg-[#0a0a0a] border-white/5 text-gray-600 hover:text-gray-300 hover:bg-[#151515]'}`}>{m===0?'Off':`${m}m`}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* ACTIVE SESSION                              */}
        {/* ═══════════════════════════════════════════ */}
        {sessionIsActive && (
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
              <div className="absolute top-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20">
                {isCountingIn && <span className="text-[10px] font-black uppercase tracking-widest text-white/50 animate-pulse">Count-in…</span>}
                <div className="flex items-center gap-3">
                  {[0,1,2,3].map(b=>(
                    <div key={b} className={`rounded-full transition-all duration-100 ${currentBeat===b?(isCountingIn?'w-3 h-3 bg-white/40':'w-3 h-3 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]'):'w-2 h-2 bg-white/12'}`} />
                  ))}
                </div>
              </div>
            )}

            {/* Info label */}
            <div className="absolute top-6 left-6 right-6 flex justify-between items-center opacity-35 pointer-events-none z-10">
              <span className="text-[10px] font-black uppercase tracking-widest">
                {appState==='vault-drill' ? `Vault Drill · ${vaultDrillIndex+1}/${vaultDrillQueue.length}`
                  : bpmMode ? `${bpm} BPM · Lvl ${selectedTier} · Bar ${barCount}`
                  : wordCount===1 ? `Level ${selectedTier}` : `Scheme · Lvl ${selectedTier} · ${wordCount}w`}
              </span>
              <div className="flex items-center gap-3">
                {sessionLimit > 0 && appState === 'active' && (
                  <span className={`text-[10px] font-black uppercase tracking-widest tabular-nums ${timeRemaining <= 60 ? 'text-red-400 opacity-100' : ''}`}>
                    ⏱ {fmtCountdown(timeRemaining)}
                  </span>
                )}
                {isRecording && <span className="text-red-400 text-[10px] font-black uppercase tracking-widest animate-pulse">● REC</span>}
              </div>
            </div>

            {/* Words */}
            <div className={`relative w-full h-full flex flex-wrap justify-center items-center px-4 z-10 ${activeWords.length>=3?'landscape:grid landscape:grid-cols-2 landscape:gap-4':'flex-col gap-12 landscape:gap-8 md:gap-36'}`}>
              {activeWords.map((word, idx) => (
                <h2
                  key={`${totalWordsSeen}-${vaultDrillIndex}-${idx}`}
                  onClick={e => { e.stopPropagation(); pauseForDict(word); }}
                  className={`font-black text-center uppercase tracking-tighter flex justify-center items-center w-full cursor-pointer transition-all duration-200 ${activeWords.length>=3?'landscape:w-full':''} ${isPausedForDict && activeDictWord!==word ? 'text-white/8 scale-[0.85] blur-sm pointer-events-none' : 'text-white hover:scale-[1.03]'}`}
                  style={{ fontSize: getDynamicFontSize(word, activeWords.length), lineHeight: '0.82' }}
                >
                  <span className="block animate-word-strike drop-shadow-2xl whitespace-nowrap">{word}</span>
                </h2>
              ))}
            </div>

            {!isPausedForDict && <p className="absolute bottom-24 text-gray-700 text-[10px] font-black uppercase tracking-widest animate-pulse z-10 pointer-events-none">Tap to lock</p>}
            {isPausedForDict && activeDictWord && (
              <DictionaryModal
                word={activeDictWord} dictData={dictData} isLoading={isLoadingDict}
                onClose={resumeFromDict} isVaultMode={false}
                onSaveNote={handleSaveNote}
                savedNote={sessionNotes[activeDictWord] || ''}
              />
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* SUMMARY                                     */}
        {/* ═══════════════════════════════════════════ */}
        {appState === 'summary' && (() => {
          const latestSession = sessionHistory[0];
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
                    {Object.entries(latestSession.notes).map(([word, text]) => text.trim() ? (
                      <div key={word} className="mb-4 last:mb-0">
                        <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">{word}</p>
                        <p className="text-gray-200 text-sm leading-relaxed font-medium whitespace-pre-wrap">{text}</p>
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
                      <button onClick={() => { setSummaryActiveWord(word); fetchDictData(word); }} className="text-base font-black text-gray-300 flex-1 text-left uppercase hover:text-white transition-colors">{word}</button>
                      <button onClick={() => toggleVault(word)} className={`text-2xl transition-transform hover:scale-110 ${vault.some(v=>v.word===word)?'text-yellow-500':'text-gray-700'}`}>{vault.some(v=>v.word===word)?'★':'☆'}</button>
                    </div>
                  ))}
                </div>
              </div>
              {summaryActiveWord && <DictionaryModal word={summaryActiveWord} dictData={dictData} isLoading={isLoadingDict} onClose={()=>setSummaryActiveWord(null)} isVaultMode={true} />}
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════ */}
        {/* VAULT                                       */}
        {/* ═══════════════════════════════════════════ */}
        {appState === 'vault' && (
          <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto w-full custom-scrollbar pb-36">
            <div className="w-full mt-6 max-w-2xl">
              <div className="flex items-center gap-4 mb-6">
                <button onClick={resetToIdle} className="w-10 h-10 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/10 transition-all">←</button>
                <h2 className="text-3xl font-black tracking-tighter uppercase">Vault</h2>
              </div>
              {vault.length > 0 && (
                <button onClick={startVaultDrill} className="w-full mb-5 py-4 rounded-2xl bg-white/4 border border-white/8 text-white text-sm font-black uppercase tracking-widest hover:bg-white/8 transition-all active:scale-95 flex items-center justify-center gap-2">
                  <span className="text-yellow-400">▶</span> Drill Vault ({vault.length} words)
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
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const w = customWordInput.trim().toLowerCase();
                        if (w && !customWords.includes(w)) { setCustomWords(prev => [...prev, w]); }
                        setCustomWordInput('');
                      }
                    }}
                    placeholder="Add a word or phrase…"
                    className="flex-1 bg-[#0a0a0a] border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 font-bold focus:outline-none focus:border-white/20"
                  />
                  <button
                    onClick={() => {
                      const w = customWordInput.trim().toLowerCase();
                      if (w && !customWords.includes(w)) { setCustomWords(prev => [...prev, w]); }
                      setCustomWordInput('');
                    }}
                    className="px-5 py-3 bg-white text-black text-xs font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-all active:scale-95"
                  >Add</button>
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
                    <button key={m} onClick={()=>setVaultSortMode(m)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${vaultSortMode===m?'bg-white text-black':'bg-white/5 text-gray-600 border border-white/5'}`}>{m}</button>
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
                    <button onClick={()=>{setSummaryActiveWord(item.word);fetchDictData(item.word);}} className="flex-1 text-left hover:text-white transition-colors">
                      <span className="text-base font-black text-gray-200 uppercase">{item.word}</span>
                    </button>
                    <button onClick={()=>toggleVault(item.word)} className="text-2xl text-yellow-500 hover:scale-110 transition-transform">★</button>
                  </div>
                ))}
              </div>
            </div>
            {summaryActiveWord && <DictionaryModal word={summaryActiveWord} dictData={dictData} isLoading={isLoadingDict} onClose={()=>setSummaryActiveWord(null)} isVaultMode={true} />}
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* HISTORY                                     */}
        {/* ═══════════════════════════════════════════ */}
        {appState === 'history' && (
          <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto w-full custom-scrollbar pb-36">
            <div className="w-full mt-6 max-w-2xl">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <button onClick={resetToIdle} className="w-10 h-10 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/10 transition-all">←</button>
                  <h2 className="text-3xl font-black tracking-tighter uppercase">History</h2>
                </div>
                {sessionHistory.length > 0 && <button onClick={()=>{if(confirm('Clear history?'))setSessionHistory([]);}} className="text-gray-700 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors">Clear</button>}
              </div>
              {sessionHistory.length === 0 && (
                <div className="text-center py-16 text-gray-700">
                  <p className="text-4xl mb-4 opacity-30">◷</p>
                  <p className="font-black uppercase tracking-widest text-sm">No sessions yet</p>
                </div>
              )}
              <div className="flex flex-col gap-3">
                {sessionHistory.map(s=>(
                  <div key={s.id} className="bg-[#0f0f0f] border border-white/5 rounded-2xl p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">{fmtDate(s.date)}</p>
                        <p className="text-white font-black text-lg">{fmtDur(s.duration)} <span className="text-gray-600 text-sm font-bold">session</span></p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">Lvl {s.tier} · {s.wordCount}w</p>
                        <p className="text-gray-400 text-sm font-bold">{s.pace}</p>
                      </div>
                    </div>
                    {s.notes && Object.keys(s.notes).length > 0 && (
                      <div className="border-t border-white/5 pt-3 mb-3">
                        <p className="text-[10px] text-gray-700 font-black uppercase tracking-widest mb-2">Bar Pad</p>
                        {Object.entries(s.notes).map(([w,t])=>t.trim()?(
                          <div key={w} className="mb-2">
                            <span className="text-[10px] text-gray-600 uppercase tracking-widest font-black">{w}: </span>
                            <span className="text-gray-400 text-xs">{t}</span>
                          </div>
                        ):null)}
                      </div>
                    )}
                    {s.frozenWords?.length > 0 && (
                      <div className="border-t border-white/5 pt-3">
                        <p className="text-[10px] text-gray-700 font-black uppercase tracking-widest mb-2">Frozen</p>
                        <div className="flex flex-wrap gap-1.5">
                          {s.frozenWords.map(w=>(
                            <span key={w} className="bg-white/4 border border-white/5 px-2.5 py-1 rounded-full text-xs font-black text-gray-400 uppercase">{w}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* FLOATING ACTION BAR                         */}
        {/* ═══════════════════════════════════════════ */}
        <div className="fixed bottom-6 left-0 w-full flex justify-center px-6 z-40 pointer-events-none">
          {appState==='idle' && (
            <button className="pointer-events-auto w-full max-w-md py-5 rounded-2xl text-sm font-black tracking-widest uppercase bg-white text-black shadow-xl hover:bg-gray-100 active:scale-95 transition-all" onClick={startSession}>Start Session</button>
          )}
          {appState==='active' && (
            <button className="pointer-events-auto py-3 px-8 rounded-full text-[10px] font-black tracking-widest uppercase bg-[#0f0f0f] border border-white/10 text-gray-500 hover:text-white hover:bg-white/8 transition-all active:scale-95" onClick={()=>stopSession('global')}>End Session</button>
          )}
          {appState==='vault-drill' && (
            <button className="pointer-events-auto py-3 px-8 rounded-full text-[10px] font-black tracking-widest uppercase bg-[#0f0f0f] border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/8 transition-all active:scale-95" onClick={stopVaultDrill}>End Drill</button>
          )}
          {appState==='summary' && (
            <button className="pointer-events-auto w-full max-w-md py-5 rounded-2xl text-sm font-black tracking-widest uppercase bg-[#151515] border border-white/8 hover:bg-white/8 transition-all active:scale-95" onClick={resetToIdle}>New Session</button>
          )}
        </div>

        <div className="fixed bottom-0 left-0 w-full h-28 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none z-30" />
      </div>
    );
  }

export default App;
