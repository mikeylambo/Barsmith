import { useState, useRef, useEffect } from 'react';
import { BeatScheduler } from '../services/audio-clock';
import { getNextWords as getNextWordsService } from '../services/wordbank';
import { fetchDictData as fetchDictDataService } from '../services/dictionary';
import { haptic } from '../services/haptic';
import { saveDraft, clearDraft, recordPracticeDay } from '../services/storage';

/**
 * Owns the entire writing-session lifecycle:
 *   idle → active/vault-drill → (locked for dictionary lookup) → summary
 *
 * Deliberately does NOT own: idle-screen settings (tier/interval/bpm/etc — those are
 * inputs, owned by App so they survive across sessions), vault contents, session
 * history persistence (the caller decides what to do with the finished record via
 * onSessionComplete), beat-file upload, or backup/restore.
 */
export function useSessionEngine({
  selectedTier, wordCount, intervalMs, isMetronomeOn,
  bpmMode, bpm, barsPerWord, customWords, sessionLimit,
  beatAudioSrc, audioPlayerRef, vault, recoveredDraft,
  onSessionComplete,
}) {
  const [appState, setAppState] = useState('idle'); // idle | active | vault-drill | summary
  const [currentWords, setCurrentWords] = useState(['TAP START']);
  const [isPausedForDict, setIsPausedForDict] = useState(false);
  const [activeDictWord, setActiveDictWord] = useState(null);
  const [flashKey, setFlashKey] = useState(0);

  const [currentBeat, setCurrentBeat] = useState(0);
  const [barCount, setBarCount] = useState(0);
  const [isCountingIn, setIsCountingIn] = useState(false);
  // Distinguishes a re-entry count-in (after unlocking a word) from a fresh session
  // count-in so the UI can display "Re-entering…" instead of the generic count-in label.
  const [isResumeCountIn, setIsResumeCountIn] = useState(false);

  const [timeRemaining, setTimeRemaining] = useState(0);
  const countdownRef = useRef(null);

  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [totalWordsSeen, setTotalWordsSeen] = useState(0);
  const [frozenWords, setFrozenWords] = useState(new Set());
  const [sessionDuration, setSessionDuration] = useState(0);
  const [sessionNotes, setSessionNotes] = useState({}); // { [word]: { [entryId]: text } }

  const [vaultDrillQueue, setVaultDrillQueue] = useState([]);
  const [vaultDrillIndex, setVaultDrillIndex] = useState(0);

  const [dictData, setDictData] = useState(null);
  const [isLoadingDict, setIsLoadingDict] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingAvailable, setRecordingAvailable] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [cameraError, setCameraError] = useState('');

  const timerRef = useRef(null);
  const metronomeRef = useRef(null);
  const audioCtxRef = useRef(null);
  const lastWordRef = useRef(null);
  const fetchAbortRef = useRef(null);
  const wakeLockRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordedMimeRef = useRef('video/webm');
  const beatCountRef = useRef(0);
  const beatSchedulerRef = useRef(null);
  const isEndingRef = useRef(false);
  const cameraStreamRef = useRef(null);
  const cameraPreviewRef = useRef(null);
  const sessionStartTimeRef = useRef(null);
  const sessionEndTimeRef = useRef(null);
  const activeNoteFlushRef = useRef(null);
  const dictRequestIdRef = useRef(0);

  // RC4: track whether the next BPM session restart is a resume (after dict unlock) so
  // we can preserve the running bar count and show "Re-entering…" instead of resetting.
  const isResumingFromDictRef = useRef(false);

  // RC4: mirror recoveredDraft into a ref so stopSession (a stale closure) always reads
  // the current value rather than the one captured when the function was created.
  const recoveredDraftRef = useRef(recoveredDraft);
  useEffect(() => { recoveredDraftRef.current = recoveredDraft; }, [recoveredDraft]);

  // Live refs mirroring volatile session state, so stopSession (even when called from a
  // stale interval/timeout closure) always reads current values rather than whatever was
  // captured at the time that closure was created.
  const totalWordsSeenRef = useRef(0);
  const frozenWordsRef = useRef(new Set());
  const sessionNotesRef = useRef({});

  // Keep the live refs and React state in sync in the same operation. This matters when
  // a timer expires in the same turn as a word change, lock, or Bar Pad flush: stopSession
  // must be able to build the final record immediately, without waiting for an effect.
  const updateWordsSeen = (valueOrUpdater) => {
    const prev = totalWordsSeenRef.current;
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
    totalWordsSeenRef.current = next;
    setTotalWordsSeen(next);
  };
  const updateFrozenWords = (valueOrUpdater) => {
    const prev = frozenWordsRef.current;
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
    frozenWordsRef.current = next;
    setFrozenWords(next);
  };
  const replaceSessionNotes = (next) => {
    sessionNotesRef.current = next;
    setSessionNotes(next);
  };

  useEffect(() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtxRef.current = new AC();
    return () => audioCtxRef.current?.close();
  }, []);

  // True unmount-only cleanup. Kept separate from any beat-file-related effect (that one
  // lives in App, scoped to beatAudioSrc) — combining the two was the original source of
  // the App.jsx:456 bug, where loading/removing a beat mid-recording silently stopped the
  // camera without updating isRecording or detaching the recorder.
  useEffect(() => () => { fetchAbortRef.current?.abort(); releaseWakeLock(); cameraStreamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  // Mirror in-progress Bar Pad notes to disk continuously while a session is running, so a
  // closed tab or crash can't erase unsaved bars. Cleared on a normal session end (the data
  // has landed in History by then) and on idle reset.
  useEffect(() => {
    const active = appState === 'active' || appState === 'vault-drill';
    if (!active) return;
    // RC4 FIX 1: If there's still an unresolved recovered draft, refuse to touch the
    // persisted draft slot. stopSession also checks this ref before calling clearDraft(),
    // so the old draft can never be silently erased by a subsequent session.
    if (recoveredDraftRef.current) return;
    const hasText = Object.values(sessionNotes).some(v =>
      v && typeof v === 'object' ? Object.values(v).some(t => t?.trim()) : v?.trim()
    );
    if (hasText) saveDraft({ notes: sessionNotes, frozenWords: [...frozenWords], savedAt: Date.now() });
    else clearDraft();
  }, [sessionNotes, frozenWords, appState]);


  // Flush and persist synchronously when the page is hidden/unloaded. The regular Bar Pad
  // autosave is intentionally debounced, but a writer can type and immediately swipe the
  // browser away before that debounce fires. pagehide/visibilitychange closes that final
  // sub-second data-loss window on mobile.
  useEffect(() => {
    const active = appState === 'active' || appState === 'vault-drill';
    if (!active || recoveredDraftRef.current) return;
    const persistNow = () => {
      activeNoteFlushRef.current?.();
      const notes = sessionNotesRef.current;
      const hasText = Object.values(notes).some(v =>
        v && typeof v === 'object' ? Object.values(v).some(t => t?.trim()) : v?.trim()
      );
      if (hasText) saveDraft({ notes, frozenWords: [...frozenWordsRef.current], savedAt: Date.now() });
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') persistNow(); };
    window.addEventListener('pagehide', persistNow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', persistNow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [appState]);

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

  const requestWakeLock = async () => { try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch {} };
  const releaseWakeLock = () => { wakeLockRef.current?.release().then(() => { wakeLockRef.current = null; }); };

  // ── Word engine ──
  const getNextWords = (count) => {
    const sel = getNextWordsService(selectedTier, count, customWords, 0.20, lastWordRef.current || []);
    lastWordRef.current = sel;
    return sel;
  };

  // ── BPM ──
  const beatsPerWord = barsPerWord * 4;

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
      if (appState === 'vault-drill') { setVaultDrillIndex(p => (p + 1) % vaultDrillQueue.length); updateWordsSeen(p => p + 1); }
      else { const w = getNextWords(wordCount); setCurrentWords(w); updateWordsSeen(p => p + wordCount); }
    };

    if (bpmMode) {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      // RC4 FIX 3: Preserve total bar count across lock/resume cycles. Only reset on a
      // genuine session start (isResumingFromDictRef is false). On resume, continue from
      // wherever the bar count was — the groove restarts but progress is never erased.
      const resuming = isResumingFromDictRef.current;
      isResumingFromDictRef.current = false;

      beatCountRef.current = 0;
      setCurrentBeat(0);
      if (!resuming) setBarCount(0);   // fresh session only
      setIsCountingIn(true);
      setIsResumeCountIn(resuming);

      if (!beatSchedulerRef.current) beatSchedulerRef.current = new BeatScheduler(ctx, {});
      beatSchedulerRef.current.callbacks = {
        onBeat: ({ beatIndexInBar }) => {
          setCurrentBeat(beatIndexInBar);
          haptic(beatIndexInBar === 0 ? 25 : 10);
        },
        onCountInEnd: () => { setIsCountingIn(false); setIsResumeCountIn(false); },
        onWord: () => { beatCountRef.current += 1; nextWord(); setBarCount(p => p + barsPerWord); },
      };
      beatSchedulerRef.current.start(bpm, beatsPerWord);
      return () => beatSchedulerRef.current?.stop();
    } else {
      timerRef.current = setInterval(nextWord, intervalMs);
      if (isMetronomeOn) { playTick(); metronomeRef.current = setInterval(playTick, intervalMs / 4); }
      return () => { clearInterval(timerRef.current); clearInterval(metronomeRef.current); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, isPausedForDict, selectedTier, intervalMs, isMetronomeOn, wordCount, bpmMode, bpm, barsPerWord, vaultDrillQueue.length]);

  // ── Countdown timer (Writing Sprint model) ──
  // RC4 FIX 4: The countdown now runs even while a word is locked, matching wall-clock
  // duration so Summary always shows consistent numbers. "Writing Sprint" = five minutes
  // of total time, including research and Bar Pad writing. The old behavior of pausing the
  // countdown during a lock could produce sessions that report 7+ minutes against a 5-
  // minute timer. Decrement-only; the actual stop fires in the effect below.
  useEffect(() => {
    const active = appState === 'active' || appState === 'vault-drill';
    if (!active || sessionLimit === 0 || !sessionEndTimeRef.current) {
      clearInterval(countdownRef.current); return;
    }

    // Derive remaining time from an absolute deadline rather than decrementing a counter.
    // Mobile browsers throttle/suspend intervals in the background; an absolute clock
    // catches up immediately when the writer returns instead of silently extending a sprint.
    const syncCountdown = () => {
      const remaining = Math.max(0, Math.ceil((sessionEndTimeRef.current - Date.now()) / 1000));
      setTimeRemaining(remaining);
    };
    syncCountdown();
    countdownRef.current = setInterval(syncCountdown, 250);
    document.addEventListener('visibilitychange', syncCountdown);
    window.addEventListener('focus', syncCountdown);
    return () => {
      clearInterval(countdownRef.current);
      document.removeEventListener('visibilitychange', syncCountdown);
      window.removeEventListener('focus', syncCountdown);
    };
  }, [appState, sessionLimit]);

  useEffect(() => {
    const active = appState === 'active' || appState === 'vault-drill';
    if (active && sessionLimit > 0 && timeRemaining === 0) {
      stopSession('timer');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, appState, sessionLimit]);

  // ── Recording (front camera) ──
  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  useEffect(() => {
    if (isRecording && cameraPreviewRef.current && cameraStreamRef.current) {
      cameraPreviewRef.current.srcObject = cameraStreamRef.current;
    }
  }, [isRecording]);

  const startRecording = async () => {
    if (!canRecord) return;
    setCameraError('');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      cameraStreamRef.current = stream;
      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      recordedMimeRef.current = mimeType.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      recordedChunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recordedMimeRef.current });
        setRecordingBlob(blob); setRecordingAvailable(true);
        stream.getTracks().forEach(t => t.stop());
        cameraStreamRef.current = null;
        if (cameraPreviewRef.current) cameraPreviewRef.current.srcObject = null;
      };
      rec.start(1000); mediaRecorderRef.current = rec; setIsRecording(true);
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
      setCameraError(e.name === 'NotAllowedError' ? 'Camera permission denied.' : 'Camera unavailable.');
    }
  };
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); }
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    if (cameraPreviewRef.current) cameraPreviewRef.current.srcObject = null;
  };
  const downloadRecording = () => {
    if (!recordingBlob) return;
    const ext = recordingBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(recordingBlob), a = document.createElement('a');
    a.href = url; a.download = `barsmith-${Date.now()}.${ext}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── Session start / stop ──
  const startSession = () => {
    isEndingRef.current = false;
    isResumingFromDictRef.current = false;
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    if (beatAudioSrc && audioPlayerRef.current) { audioPlayerRef.current.currentTime = 0; audioPlayerRef.current.play().catch(() => {}); }
    requestWakeLock();
    beatCountRef.current = 0; setCurrentBeat(0); setBarCount(0); setFlashKey(0);
    const startedAt = Date.now();
    sessionStartTimeRef.current = startedAt;
    sessionEndTimeRef.current = sessionLimit > 0 ? startedAt + sessionLimit * 60_000 : null;
    setSessionStartTime(startedAt); updateWordsSeen(wordCount); updateFrozenWords(new Set());
    replaceSessionNotes({});
    setTimeRemaining(sessionLimit > 0 ? sessionLimit * 60 : 0);
    setCurrentWords(getNextWords(wordCount)); setAppState('active'); setIsPausedForDict(false);
    setRecordingAvailable(false); setRecordingBlob(null);
  };

  const stopSession = (source = 'global') => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    audioPlayerRef.current?.pause();
    if (isRecording) stopRecording();
    releaseWakeLock();
    setIsCountingIn(false); setIsResumeCountIn(false);
    // Flush the live Bar Pad value before reading refs. This protects text typed during
    // the final debounce window when a timed sprint ends while the modal is still open.
    activeNoteFlushRef.current?.();
    const startedAt = sessionStartTimeRef.current ?? sessionStartTime ?? Date.now();
    const dur = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    setSessionDuration(dur);
    const liveWordsSeen = totalWordsSeenRef.current;
    const liveFrozen = frozenWordsRef.current;
    const liveNotes = sessionNotesRef.current;
    const rec = {
      id: Date.now(), date: new Date().toISOString(), duration: dur,
      wordsSeen: liveWordsSeen, tier: selectedTier, wordCount,
      pace: bpmMode ? `${bpm} BPM` : `${(intervalMs / 1000).toFixed(1)}s`,
      frozenWords: [...liveFrozen], notes: { ...liveNotes },
      source,
    };
    recordPracticeDay(new Date().toDateString());
    onSessionComplete?.(rec);
    updateWordsSeen(liveWordsSeen);
    sessionEndTimeRef.current = null;
    setAppState('summary'); setIsPausedForDict(false);
    // RC4 FIX 1: Only clear the draft slot when there is no unresolved recovered draft
    // still showing on the idle screen. If an old draft was recovered but the user started
    // a new session without resolving it, clearDraft() would wipe the old bars from
    // storage — they'd survive in React state until page reload but disappear permanently
    // afterward. Since autosave was blocked while recoveredDraft was set, the draft slot
    // still holds the old data; leaving it alone lets it re-surface on the next reload.
    if (!recoveredDraftRef.current) clearDraft();
  };

  // ── Vault drill ──
  // RC4 FIX 6: Vault Drill now starts the beat and acquires wake lock using the same
  // initialization path as a normal session. Previously it silently skipped both, leaving
  // the writer with no audio when entering from Vault with a beat loaded.
  const startVaultDrill = () => {
    if (!vault.length) return;
    isEndingRef.current = false;
    isResumingFromDictRef.current = false;
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    if (beatAudioSrc && audioPlayerRef.current) { audioPlayerRef.current.currentTime = 0; audioPlayerRef.current.play().catch(() => {}); }
    requestWakeLock();
    const q = [...vault].sort(() => Math.random() - 0.5).map(v => v.word);
    const startedAt = Date.now();
    sessionStartTimeRef.current = startedAt;
    sessionEndTimeRef.current = sessionLimit > 0 ? startedAt + sessionLimit * 60_000 : null;
    setVaultDrillQueue(q); setVaultDrillIndex(0); updateFrozenWords(new Set());
    setSessionStartTime(startedAt); updateWordsSeen(1);
    replaceSessionNotes({});
    setTimeRemaining(sessionLimit > 0 ? sessionLimit * 60 : 0);
    setRecordingAvailable(false); setRecordingBlob(null);
    setAppState('vault-drill'); setIsPausedForDict(false);
  };
  const stopVaultDrill = () => stopSession('vault');

  // ── Dictionary lock/resume ──
  const fetchDictData = async (rawWord) => {
    fetchAbortRef.current?.abort();
    const requestId = ++dictRequestIdRef.current;
    const w = rawWord.trim().toLowerCase();

    if (/\s/.test(w)) {
      setIsLoadingDict(false);
      const result = await fetchDictDataService(rawWord, null);
      if (dictRequestIdRef.current === requestId) setDictData(result);
      return;
    }

    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setIsLoadingDict(true); setDictData(null);
    try {
      const result = await fetchDictDataService(rawWord, controller.signal);
      if (dictRequestIdRef.current === requestId) setDictData(result);
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (dictRequestIdRef.current === requestId) {
        setDictData({ definitions: [{ text: 'Network error.' }], rhymes: [], synonyms: [], antonyms: [], syllables: null });
      }
    } finally {
      if (dictRequestIdRef.current === requestId) setIsLoadingDict(false);
    }
  };

  const pauseForDict = (word) => {
    if ((appState !== 'active' && appState !== 'vault-drill') || isPausedForDict) return;
    haptic(25);
    setIsPausedForDict(true); setActiveDictWord(word);
    updateFrozenWords(prev => new Set(prev).add(word));
    fetchDictData(word);
    audioPlayerRef.current?.pause();
  };

  const resumeFromDict = () => {
    // RC4 FIX 3: Signal to the session loop effect that this restart is a resume, not a
    // fresh session, so it can skip the barCount reset and show "Re-entering…".
    isResumingFromDictRef.current = true;
    setIsPausedForDict(false); setActiveDictWord(null); setDictData(null);
    if (beatAudioSrc) audioPlayerRef.current?.play();
  };

  // RC4 FIX 2: handleSaveNote now rejects empty/whitespace-only entries and removes them
  // from the notes object when a previously-populated entry is cleared. This prevents the
  // autosave effect from writing blank entries to disk, and prevents Summary from showing
  // Bar Pad cards with no text inside them.
  const handleSaveNote = (word, entryId, text) => {
    const prev = sessionNotesRef.current;
    const trimmed = text?.trim();
    const wordNotes = { ...(prev[word] || {}) };
    if (trimmed) wordNotes[entryId] = text;
    else delete wordNotes[entryId];

    let next;
    if (Object.keys(wordNotes).length === 0) {
      const { [word]: _removed, ...rest } = prev;
      next = rest;
    } else {
      next = { ...prev, [word]: wordNotes };
    }
    replaceSessionNotes(next);
  };

  const registerActiveNoteFlush = (flushFn) => {
    activeNoteFlushRef.current = flushFn;
    return () => { if (activeNoteFlushRef.current === flushFn) activeNoteFlushRef.current = null; };
  };

  const resetToIdle = () => { sessionEndTimeRef.current = null; setAppState('idle'); setCurrentWords(['READY…']); setDictData(null); };

  const activeWords = appState === 'vault-drill' ? [vaultDrillQueue[vaultDrillIndex] || '—'] : currentWords;
  const sessionIsActive = appState === 'active' || appState === 'vault-drill';

  return {
    appState, setAppState,
    currentWords, activeWords, sessionIsActive,
    vaultDrillQueue, vaultDrillIndex,
    isPausedForDict, activeDictWord, flashKey,
    currentBeat, barCount, isCountingIn, isResumeCountIn,
    timeRemaining,
    sessionStartTime, totalWordsSeen, frozenWords, sessionDuration,
    sessionNotes, handleSaveNote, registerActiveNoteFlush,
    dictData, isLoadingDict, fetchDictData,
    isRecording, canRecord, recordingAvailable, recordingBlob, cameraError, cameraPreviewRef,
    startRecording, stopRecording, downloadRecording,
    startSession, stopSession, startVaultDrill, stopVaultDrill,
    pauseForDict, resumeFromDict, resetToIdle,
  };
}
