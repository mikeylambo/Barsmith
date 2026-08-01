import { useState, useEffect, useRef, useMemo } from 'react';
import { haptic, setHapticsEnabled } from './services/haptic';
import {
  loadPrefs, savePrefs,
  loadVault, saveVault,
  loadHistory, saveHistory,
  loadSessionLimit, saveSessionLimit,
  loadCustomWords, saveCustomWords,
  hasSeenInfo, markSeenInfo,
  loadPracticeDays, computeStreak,
  loadTotals, saveTotals,
  loadDaily, saveDaily,
  exportAllData, importAllData,
  loadDraft, clearDraft,
  firstOpenDay,
} from './services/storage';
import { seedTotals, addSessionToTotals } from './services/progress';
import { dailySession, isCompletedToday, markCompleted, programmeWeek } from './services/daily';
import { downloadText, dateStamp } from './services/download';
// flattenNotes lives with the exporters so the on-screen Bar Pad and the text
// export can never disagree about note shape.
import { flattenNotes, historyToText } from './services/export-text';
import { normalizeTier } from './services/wordbank';
import { EVENTS, BUCKETS, track, setAnalyticsProvider } from './services/analytics';
import { createVercelProvider } from './services/analytics-vercel';
import { useSessionEngine } from './hooks/useSessionEngine';

import Splash from './components/Splash.jsx';
import InfoModal from './components/InfoModal.jsx';
import RhymeSearch from './components/RhymeSearch.jsx';
import IdleScreen from './components/IdleScreen.jsx';
import ActiveScreen from './components/ActiveScreen.jsx';
import SummaryScreen from './components/SummaryScreen.jsx';
import VaultScreen from './components/VaultScreen.jsx';
import HistoryScreen from './components/HistoryScreen.jsx';
import ProgressScreen from './components/ProgressScreen.jsx';
import ActionBar from './components/ActionBar.jsx';

function App() {
  const _prefs = useMemo(() => loadPrefs(), []);

  const [showSplash, setShowSplash] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showRhymeSearch, setShowRhymeSearch] = useState(false);

  // ── Idle-screen settings (persisted prefs) ──
  const [wordCount, setWordCount] = useState(_prefs.wordCount || 1);
  // Normalized, not trusted: a stored tier can point at a bank that no longer exists.
  const [selectedTier, setSelectedTier] = useState(normalizeTier(_prefs.tier));
  const [intervalMs, setIntervalMs] = useState(_prefs.interval || 3500);
  const [beatAudioSrc, setBeatAudioSrc] = useState(null);
  const [beatFileName, setBeatFileName] = useState('');
  const [isMetronomeOn, setIsMetronomeOn] = useState(false); // not persisted intentionally
  const [hapticsOn, setHapticsOnState] = useState(_prefs.hapticsOn !== false);
  const setHapticsOn = (on) => { setHapticsOnState(on); setHapticsEnabled(on); };
  useEffect(() => { setHapticsEnabled(hapticsOn); }, [hapticsOn]);

  const [bpm, setBpm] = useState(_prefs.bpm || 90);
  const [bpmMode, setBpmMode] = useState(_prefs.bpmMode || false);
  const [barsPerWord, setBarsPerWord] = useState(_prefs.barsPerWord || 2);
  const [sessionLimit, setSessionLimit] = useState(() => loadSessionLimit());

  const fileInputRef = useRef(null);
  const audioPlayerRef = useRef(null);

  // Custom word injection
  const [customWords, setCustomWords] = useState(() => {
    try { return loadCustomWords(); } catch { return []; }
  });
  const [customWordInput, setCustomWordInput] = useState('');

  // Vault
  const [vault, setVault] = useState(() => loadVault());
  const [vaultSortMode, setVaultSortMode] = useState('Newest');

  // Session history
  const [sessionHistory, setSessionHistory] = useState(() => loadHistory());

  // Streak — read from independent practice-day storage, NOT from sessionHistory, which is
  // capped at 100 entries (warns at 95). Text-only records are tiny; a serious writer
  // doing multiple sessions a day should have months of archive before needing to export.
  const [practiceDays, setPracticeDays] = useState(() => loadPracticeDays());
  const streak = computeStreak(practiceDays);

  // Lifetime training totals, kept outside History for the same reason as practiceDays:
  // History holds only 100 sessions, so cumulative figures read off it would start
  // falling once a writer passed that mark. Seeded once from whatever history already
  // exists, so anyone who has been using Barsmith does not open the training log to
  // zeroes; `seeded` makes that fold-in idempotent across reloads.
  const [totals, setTotals] = useState(() => {
    const seeded = seedTotals(loadHistory(), loadTotals());
    saveTotals(seeded);
    return seeded;
  });
  const recordTotals = (rec) => setTotals(prev => {
    const next = addSessionToTotals(prev, rec);
    saveTotals(next);
    return next;
  });

  // ── Today's prescribed session ──
  // Derived from the date, so it needs no backend and is identical for everyone on a
  // given day. Computed once per mount; a session that spans local midnight keeps the
  // prescription it started under rather than swapping out mid-write.
  const [daily, setDaily] = useState(() => loadDaily());
  const todaysPlan = useMemo(() => dailySession(), []);
  const dailyDone = isCompletedToday(daily);
  const week = useMemo(() => programmeWeek(daily), [daily]);
  // Only a session actually started from the card counts as completing the
  // prescription — a freeform session is training, but it is not the programme.
  const fromDailyRef = useRef(false);

  // Recovered draft from an interrupted session (crash/close/reload) — shown as a
  // dismissible banner on the idle screen so nothing written mid-session is silently lost.
  const [recoveredDraft, setRecoveredDraft] = useState(() => {
    const d = loadDraft();
    const hasText = d?.notes && Object.values(d.notes).some(v =>
      v && typeof v === 'object' ? Object.values(v).some(t => t?.trim()) : v?.trim()
    );
    return hasText ? d : null;
  });

  const [copiedNoteKey, setCopiedNoteKey] = useState('');
  const copyNoteText = (key, text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedNoteKey(key); haptic(12);
    setTimeout(() => setCopiedNoteKey(''), 1200);
  };

  // RC4: Restore a recovered draft directly into History so the writer never loses bars
  // even if they didn't explicitly copy them. Creates a synthetic session record from the
  // draft metadata, appends it to History, then dismisses the banner and clears storage.
  const handleRestoreDraft = () => {
    if (!recoveredDraft) return;
    const rec = {
      id: recoveredDraft.savedAt || Date.now(),
      date: new Date(recoveredDraft.savedAt || Date.now()).toISOString(),
      duration: 0,
      wordsSeen: recoveredDraft.frozenWords?.length || 0,
      tier: selectedTier, wordCount,
      pace: bpmMode ? `${bpm} BPM` : `${(intervalMs / 1000).toFixed(1)}s`,
      frozenWords: recoveredDraft.frozenWords || [],
      notes: recoveredDraft.notes || {},
      source: 'recovered',
    };
    setSessionHistory(prev => [rec, ...prev].slice(0, 100));
    recordTotals(rec);
    clearDraft();
    setRecoveredDraft(null);
    haptic(20);
  };

  // ── Splash ──
  // Was a hard 2.2s block with no way past it. Nothing is actually loading during it —
  // word banks are bundled and prefs are a synchronous localStorage read — so it was
  // pure delay in front of a tool whose entire job is catching an idea before it goes.
  // Now: a brief brand beat that a tap can cut short.
  const splashDismissedRef = useRef(false);
  const dismissSplash = () => {
    if (splashDismissedRef.current) return; // tap and timer can both fire
    splashDismissedRef.current = true;
    setShowSplash(false);
    if (!hasSeenInfo()) { setShowInfo(true); markSeenInfo(); }
  };
  useEffect(() => {
    const t = setTimeout(dismissSplash, 900);
    return () => clearTimeout(t);
  }, []);

  // ── Analytics ──
  // The retention features shipped with no way to tell whether they work. This is that
  // way, and it is deliberately the narrowest version of it: counts of things happening,
  // bucketed, with nothing a writer typed ever leaving the device.
  //
  // `app_open` carries the two numbers the whole question turns on — how long this
  // device has had Barsmith, and how much it has been used — because "did they come
  // back" is unanswerable without both.
  useEffect(() => {
    setAnalyticsProvider(createVercelProvider());
    const first = new Date(firstOpenDay());
    const days = Math.max(0, Math.round((Date.now() - first.getTime()) / 86_400_000));
    track(EVENTS.APP_OPEN, {
      days_since_first: BUCKETS.days(days),
      lifetime_sessions: BUCKETS.sessions(totals?.sessions || 0),
      streak: BUCKETS.streak(streak),
      installed: window.matchMedia?.('(display-mode: standalone)')?.matches || false,
    });
  }, []);

  // ── Warm the reference payloads while nobody is waiting ──
  // Together they are about half a megabyte, deliberately kept out of the main bundle so
  // the idle screen paints fast. But the moment they are actually needed — a writer taps
  // a word mid-round to see what it rhymes with — is the worst possible moment to start
  // a download. So fetch them once the app is up and idle. The service worker caches
  // them, making this a first-visit cost only, and failure is silent because both call
  // sites already handle an unloaded payload.
  useEffect(() => {
    const warm = () => {
      import('./services/rhyme').then(m => m.loadRhymeIndex()).catch(() => {});
      import('./services/definitions').then(m => m.loadDefinitions()).catch(() => {});
    };
    const idle = window.requestIdleCallback;
    if (idle) { const h = idle(warm, { timeout: 4000 }); return () => window.cancelIdleCallback?.(h); }
    const t = setTimeout(warm, 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { saveVault(vault); }, [vault]);
  useEffect(() => { saveHistory(sessionHistory); }, [sessionHistory]);
  useEffect(() => { saveSessionLimit(sessionLimit); }, [sessionLimit]);
  useEffect(() => { saveCustomWords(customWords); }, [customWords]);
  useEffect(() => {
    savePrefs({ tier: selectedTier, interval: intervalMs, bpm, bpmMode, barsPerWord, wordCount, hapticsOn });
  }, [selectedTier, intervalMs, bpm, bpmMode, barsPerWord, wordCount, hapticsOn]);

  // Beat-URL cleanup runs whenever the beat changes (load/remove), NOT on unmount — the
  // engine owns its own true-unmount cleanup separately (see useSessionEngine), since
  // combining the two was the original source of the App.jsx:456 recording bug.
  useEffect(() => () => { if (beatAudioSrc) URL.revokeObjectURL(beatAudioSrc); }, [beatAudioSrc]);

  const handleFileUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (beatAudioSrc) URL.revokeObjectURL(beatAudioSrc);
    setBeatFileName(f.name); setBeatAudioSrc(URL.createObjectURL(f));
    setIsMetronomeOn(false); setBpmMode(false);
  };
  const removeBeat = () => { setBeatFileName(''); if (beatAudioSrc) URL.revokeObjectURL(beatAudioSrc); setBeatAudioSrc(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const engine = useSessionEngine({
    selectedTier, wordCount, intervalMs, isMetronomeOn,
    bpmMode, bpm, barsPerWord, customWords, sessionLimit,
    beatAudioSrc, audioPlayerRef, vault, recoveredDraft,
    onSessionComplete: (rec) => {
      setSessionHistory(prev => [rec, ...prev].slice(0, 100));
      setPracticeDays(loadPracticeDays());
      recordTotals(rec);
      const wasDaily = fromDailyRef.current;
      if (wasDaily) {
        fromDailyRef.current = false;
        setDaily(prev => { const next = markCompleted(prev); saveDaily(next); return next; });
      }
      // How much got written is the only measure of whether a session was any good, and
      // it is the number the daily prescription has to justify itself against. Bucketed:
      // "6-15 bars" says everything about a population that "12" does, without saying
      // anything about a person.
      const bars = flattenNotes(rec.notes).filter(([, , t]) => t?.trim()).length;
      track(EVENTS.SESSION_END, {
        source: wasDaily ? 'daily' : rec.source === 'recovered' ? 'recovered' : 'freeform',
        bars: BUCKETS.bars(bars),
        minutes: BUCKETS.minutes(Math.round((rec.duration || 0) / 60)),
        tier: rec.tier || 0,
        words: rec.wordCount || 1,
        wrote: bars > 0,
      });
      if (wasDaily) track(EVENTS.DAILY_COMPLETE, { day: todaysPlan.key, tier: todaysPlan.tier });
    },
  });

  const toggleVault = (word) => { setVault(prev => prev.some(v=>v.word===word) ? prev.filter(v=>v.word!==word) : [...prev,{word,addedAt:Date.now()}]); haptic(12); };

  // ── Data export / import (backup & restore) ──
  const importFileRef = useRef(null);
  const [importMsg, setImportMsg] = useState('');
  const handleExportData = () => {
    downloadText(`barsmith-backup-${dateStamp()}.json`, exportAllData(), 'application/json');
    track(EVENTS.EXPORT, { kind: 'backup' });
    haptic(12);
  };
  // The JSON backup above is for restoring Barsmith; this one is for actually using the
  // work somewhere else. Both matter, and conflating them is why bars used to be stuck
  // in the app.
  const handleExportBars = () => {
    downloadText(`barsmith-bars-${dateStamp()}.txt`, historyToText(sessionHistory));
    track(EVENTS.EXPORT, { kind: 'bars' });
    haptic(12);
  };
  const handleImportFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = JSON.parse(reader.result); } catch {}
      // This is the last thing a writer reads before their work is overwritten, so the
      // counts have to agree with themselves — "Restore 1 sessions" reads as a bug in
      // the very dialog asking to be trusted with everything they have written.
      const count = (n, word) => `${n ?? 0} ${word}${(n ?? 0) === 1 ? '' : 's'}`;
      const summary = parsed
        ? `Restore ${count(parsed.history?.length, 'session')}, ${count(parsed.vault?.length, 'vault word')}, and ${count(parsed.customWords?.length, 'personal word')}? Existing local data will be replaced.`
        : 'Restore this backup? Existing local data will be replaced.';
      if (!confirm(summary)) { e.target.value = ''; return; }

      const result = importAllData(reader.result);
      if (result.ok) {
        const restoredHistory = loadHistory();
        setVault(loadVault());
        setSessionHistory(restoredHistory);
        setCustomWords(loadCustomWords());
        setPracticeDays(loadPracticeDays());
        // A backup written before training totals existed carries none, so rebuild from
        // the restored history. Forced, because whatever counters are in storage describe
        // the data this restore just replaced.
        if (!result.hadTotals) saveTotals(seedTotals(restoredHistory, null, { force: true }));
        setTotals(loadTotals());
        // Reapply restored preferences to live state — previously these were written to
        // storage but the running app kept its old in-memory values until reload.
        const restoredPrefs = loadPrefs();
        setSelectedTier(normalizeTier(restoredPrefs.tier));
        setIntervalMs(restoredPrefs.interval || 3500);
        setBpm(restoredPrefs.bpm || 90);
        setBpmMode(restoredPrefs.bpmMode || false);
        setBarsPerWord(restoredPrefs.barsPerWord || 2);
        setWordCount(restoredPrefs.wordCount || 1);
        setHapticsOn(restoredPrefs.hapticsOn !== false);
        setSessionLimit(loadSessionLimit());
        setImportMsg('Backup restored.');
        haptic(20);
      } else {
        setImportMsg(result.error || 'Import failed — invalid file.');
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

  // ── Navigation ──
  // The session engine only models idle|active|vault-drill|summary. Vault and History are
  // separate idle-adjacent screens layered on top, tracked here so they're independent of
  // the engine's own state machine.
  const [navScreen, setNavScreen] = useState('idle'); // idle | vault | history | progress
  const navState = engine.appState === 'idle' ? navScreen : engine.appState;
  const goTo = (screen) => {
    if (screen === 'idle' || screen === 'vault' || screen === 'history' || screen === 'progress') {
      setNavScreen(screen); engine.setAppState('idle');
    } else {
      engine.setAppState(screen);
    }
  };
  const resetToIdle = () => { engine.resetToIdle(); setNavScreen('idle'); };
  const startSession = () => {
    if (recoveredDraft) return;
    // The counterpart to the daily event, and the comparison the whole exercise exists
    // to make: does a writer who takes the prescription come back more than one who sets
    // their own dials?
    track(EVENTS.SESSION_START, { source: 'freeform', tier: selectedTier, words: wordCount });
    engine.startSession();
  };
  const startVaultDrill = () => { if (!recoveredDraft) engine.startVaultDrill(); };

  // Starting the prescription writes seven pieces of settings state. React batches
  // those, so calling engine.startSession() in the same handler would start the session
  // against the PREVIOUS settings — the engine reads them from props. The flag defers
  // the start by one render, at which point the engine closure holds the new values.
  const [pendingDailyStart, setPendingDailyStart] = useState(false);
  const startDaily = () => {
    if (recoveredDraft) return;
    const p = todaysPlan;
    setSelectedTier(p.tier);
    setWordCount(p.wordCount);
    setIntervalMs(p.intervalMs);
    // A writer who loaded their own beat gets to keep it; BPM mode would fight it, and
    // handleFileUpload already treats the two as mutually exclusive.
    setBpmMode(p.bpmMode && !beatAudioSrc);
    setBpm(p.bpm);
    setBarsPerWord(p.barsPerWord);
    setSessionLimit(p.limitMinutes);
    setIsMetronomeOn(false);
    setPendingDailyStart(true);
    track(EVENTS.SESSION_START, { source: 'daily', day: p.key, tier: p.tier });
  };
  useEffect(() => {
    if (!pendingDailyStart) return;
    setPendingDailyStart(false);
    fromDailyRef.current = true;
    engine.startSession();
  }, [pendingDailyStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const latestSession = sessionHistory[0];

  if (showSplash) return <Splash onDismiss={dismissSplash} />;

  return (
    <div className="min-h-[100dvh] w-full bg-[#050505] text-white flex flex-col font-sans select-none relative overflow-x-hidden">
      {beatAudioSrc && <audio ref={audioPlayerRef} src={beatAudioSrc} loop />}

      {showRhymeSearch && <RhymeSearch onClose={() => setShowRhymeSearch(false)} vault={vault} toggleVault={toggleVault} />}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      {navState === 'idle' && (
        <IdleScreen
          vault={vault} streak={streak} setShowInfo={setShowInfo} setShowRhymeSearch={setShowRhymeSearch} setAppState={goTo}
          dailyPlan={todaysPlan} dailyDone={dailyDone} dailyWeek={week} startDaily={startDaily}
          recoveredDraft={recoveredDraft} setRecoveredDraft={setRecoveredDraft} clearDraft={clearDraft} handleRestoreDraft={handleRestoreDraft}
          flattenNotes={flattenNotes} copyNoteText={copyNoteText} copiedNoteKey={copiedNoteKey}
          beatFileName={beatFileName} fileInputRef={fileInputRef} handleFileUpload={handleFileUpload} removeBeat={removeBeat}
          canRecord={engine.canRecord} isRecording={engine.isRecording} startRecording={engine.startRecording} stopRecording={engine.stopRecording} cameraError={engine.cameraError}
          hapticsOn={hapticsOn} setHapticsOn={setHapticsOn}
          bpmMode={bpmMode} setBpmMode={setBpmMode}
          isMetronomeOn={isMetronomeOn} setIsMetronomeOn={setIsMetronomeOn} beatAudioSrc={beatAudioSrc}
          intervalMs={intervalMs} setIntervalMs={setIntervalMs}
          bpm={bpm} setBpm={setBpm} barsPerWord={barsPerWord} setBarsPerWord={setBarsPerWord}
          selectedTier={selectedTier} setSelectedTier={setSelectedTier}
          wordCount={wordCount} setWordCount={setWordCount}
          sessionLimit={sessionLimit} setSessionLimit={setSessionLimit}
        />
      )}

      {engine.sessionIsActive && (
        <ActiveScreen
          appState={navState} sessionIsActive={engine.sessionIsActive} isRecording={engine.isRecording} flashKey={engine.flashKey}
          bpmMode={bpmMode} isPausedForDict={engine.isPausedForDict} intervalMs={intervalMs}
          currentBeat={engine.currentBeat} isCountingIn={engine.isCountingIn} isResumeCountIn={engine.isResumeCountIn}
          vaultDrillIndex={engine.vaultDrillIndex} vaultDrillQueue={engine.vaultDrillQueue}
          bpm={bpm} selectedTier={selectedTier} barCount={engine.barCount} wordCount={wordCount}
          sessionLimit={sessionLimit} timeRemaining={engine.timeRemaining} fmtCountdown={fmtCountdown}
          totalWordsSeen={engine.totalWordsSeen} activeWords={engine.activeWords} activeDictWord={engine.activeDictWord}
          pauseForDict={engine.pauseForDict} dictData={engine.dictData} isLoadingDict={engine.isLoadingDict}
          resumeFromDict={engine.resumeFromDict} sessionNotes={engine.sessionNotes} handleSaveNote={engine.handleSaveNote}
          cameraPreviewRef={engine.cameraPreviewRef} stopRecording={engine.stopRecording}
          registerActiveNoteFlush={engine.registerActiveNoteFlush}
        />
      )}

      {navState === 'summary' && (
        <SummaryScreen
          latestSession={latestSession} sessionDuration={engine.sessionDuration} totalWordsSeen={engine.totalWordsSeen}
          bpmMode={bpmMode} bpm={bpm} intervalMs={intervalMs}
          recordingAvailable={engine.recordingAvailable} downloadRecording={engine.downloadRecording}
          frozenWords={engine.frozenWords} vault={vault} toggleVault={toggleVault}
          fetchDictData={engine.fetchDictData} dictData={engine.dictData} isLoadingDict={engine.isLoadingDict}
          fmtDur={fmtDur} flattenNotes={flattenNotes} copyNoteText={copyNoteText} copiedNoteKey={copiedNoteKey}
        />
      )}

      {navState === 'vault' && (
        <VaultScreen
          resetToIdle={resetToIdle} vault={vault} startVaultDrill={startVaultDrill} startBlocked={!!recoveredDraft}
          vaultSortMode={vaultSortMode} setVaultSortMode={setVaultSortMode} sortedVault={sortedVault}
          toggleVault={toggleVault} fetchDictData={engine.fetchDictData} dictData={engine.dictData} isLoadingDict={engine.isLoadingDict}
          customWords={customWords} setCustomWords={setCustomWords} customWordInput={customWordInput} setCustomWordInput={setCustomWordInput}
          handleExportData={handleExportData} importFileRef={importFileRef} handleImportFile={handleImportFile} importMsg={importMsg}
        />
      )}

      {navState === 'history' && (
        <HistoryScreen
          resetToIdle={resetToIdle} sessionHistory={sessionHistory} setSessionHistory={setSessionHistory}
          fmtDate={fmtDate} fmtDur={fmtDur} flattenNotes={flattenNotes} copyNoteText={copyNoteText} copiedNoteKey={copiedNoteKey}
          historyAtCap={sessionHistory.length >= 95} historyCount={sessionHistory.length}
          handleExportData={handleExportData} handleExportBars={handleExportBars}
        />
      )}

      {navState === 'progress' && (
        <ProgressScreen
          resetToIdle={resetToIdle} totals={totals} sessionHistory={sessionHistory}
          practiceDays={practiceDays} vault={vault} streak={streak} dailyCount={daily.count}
        />
      )}

      {/* RC4 FIX 5: Global recording indicator — always visible regardless of current screen.
           Camera + mic stays running when navigating to History/Vault/RhymeSearch, so the
           user needs a persistent stop control. The active screen has its own inline REC
           badge; this bar covers every other state. */}
      {engine.isRecording && !engine.sessionIsActive && (
        <div className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-5 pb-2.5 bg-red-600/95 backdrop-blur-sm" style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top, 0px))' }}>
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
            <span className="text-white text-[11px] font-black uppercase tracking-widest">Recording — Camera &amp; Mic</span>
          </div>
          <button
            onClick={engine.stopRecording}
            aria-label="Stop recording"
            className="text-white/90 text-[11px] font-black uppercase tracking-widest hover:text-white transition-colors"
          >Stop</button>
        </div>
      )}

      <ActionBar
        appState={navState}
        startSession={startSession}
        startBlocked={!!recoveredDraft}
        stopSession={engine.stopSession}
        stopVaultDrill={engine.stopVaultDrill}
        resetToIdle={resetToIdle}
      />

      <div className="fixed bottom-0 left-0 w-full h-28 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none z-30" />
    </div>
  );
}

export default App;
