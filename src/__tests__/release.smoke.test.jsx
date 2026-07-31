/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, fireEvent, screen, act, cleanup, renderHook } from '@testing-library/react';
import App from '../App.jsx';
import HistoryScreen from '../components/HistoryScreen.jsx';
import { useSessionEngine } from '../hooks/useSessionEngine.js';

class FakeAudioContext {
  constructor(){ this.state='running'; this.currentTime=0; this.destination={}; }
  createOscillator(){ return { connect(){}, frequency:{setValueAtTime(){}}, start(){}, stop(){}, onended:null }; }
  createGain(){ return { connect(){}, gain:{setValueAtTime(){}, exponentialRampToValueAtTime(){}} }; }
  resume(){ this.state='running'; return Promise.resolve(); }
  close(){ return Promise.resolve(); }
}

function installGlobals(){
  Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable:true });
  Object.defineProperty(window, 'webkitAudioContext', { value: FakeAudioContext, configurable:true });
  Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable:true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable:true });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: vi.fn().mockResolvedValue({release:()=>Promise.resolve()}) }, configurable:true });
  vi.stubGlobal('confirm', vi.fn(()=>true));
  vi.stubGlobal('fetch', vi.fn(async (url)=>{
    if (String(url).includes('dictionaryapi')) return {ok:true,json:async()=>[{meanings:[{partOfSpeech:'noun',definitions:[{definition:'test definition'}],synonyms:['alias'],antonyms:['opposite']}]}]};
    return {ok:true,json:async()=>[{word:'fire',numSyllables:1},{word:'wire',numSyllables:1},{word:'desire',numSyllables:2}]};
  }));
  window.URL.createObjectURL = vi.fn(()=> 'blob:test');
  window.URL.revokeObjectURL = vi.fn();
}

async function boot(){
  localStorage.setItem('barsmithHasSeenInfo','1');
  const result=render(<App/>);
  await act(async()=>{ vi.advanceTimersByTime(2300); });
  return result;
}

function activeWord(){ return document.querySelector('h2.cursor-pointer'); }

beforeEach(()=>{ cleanup(); localStorage.clear(); vi.useFakeTimers(); installGlobals(); });
afterEach(()=>{ cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Barsmith release flow', ()=>{
  it('preserves separate bars for the same locked word through Summary and History', async()=>{
    await boot();
    fireEvent.click(screen.getByRole('button',{name:'Start Session'}));
    fireEvent.click(activeWord());
    fireEvent.change(screen.getByPlaceholderText(/Write a bar with/),{target:{value:'first test bar'}});
    await act(async()=>{ vi.advanceTimersByTime(700); });
    fireEvent.click(screen.getByRole('button',{name:'Resume Session'}));
    fireEvent.click(activeWord());
    fireEvent.change(screen.getByPlaceholderText(/Write a bar with/),{target:{value:'second test bar'}});
    await act(async()=>{ vi.advanceTimersByTime(700); });
    fireEvent.click(screen.getByRole('button',{name:'Resume Session'}));
    fireEvent.click(screen.getByRole('button',{name:'End Session'}));
    expect(screen.getByText('first test bar')).toBeTruthy();
    expect(screen.getByText('second test bar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'New Session'}));
    fireEvent.click(screen.getByRole('button',{name:/History/}));
    expect(screen.getByText('first test bar')).toBeTruthy();
    expect(screen.getByText('second test bar')).toBeTruthy();
  });

  it('recovers an autosaved draft after remount', async()=>{
    const result=await boot();
    fireEvent.click(screen.getByRole('button',{name:'Start Session'}));
    fireEvent.click(activeWord());
    fireEvent.change(screen.getByPlaceholderText(/Write a bar with/),{target:{value:'recover me'}});
    await act(async()=>{ vi.advanceTimersByTime(700); });
    result.unmount();
    render(<App/>);
    await act(async()=>{ vi.advanceTimersByTime(2300); });
    expect(screen.getByText('Recovered Bars')).toBeTruthy();
    expect(screen.getByText('recover me')).toBeTruthy();
  });

  it('persists text immediately on pagehide even before the debounce finishes', async()=>{
    const result=await boot();
    fireEvent.click(screen.getByRole('button',{name:'Start Session'}));
    fireEvent.click(activeWord());
    fireEvent.change(screen.getByPlaceholderText(/Write a bar with/),{target:{value:'instant close bar'}});
    await act(async()=>{ window.dispatchEvent(new Event('pagehide')); });
    result.unmount();
    render(<App/>);
    await act(async()=>{ vi.advanceTimersByTime(2300); });
    expect(screen.getByText('instant close bar')).toBeTruthy();
  });

  it('blocks a new session until recovered writing is resolved', async()=>{
    localStorage.setItem('barsmithDraft', JSON.stringify({
      savedAt: Date.now(), frozenWords:['fire'], notes:{fire:{one:'old recovered bar'}}
    }));
    await boot();
    const start=screen.getByRole('button',{name:'Resolve Recovered Bars First'});
    expect(start.disabled).toBe(true);
    expect(activeWord()).toBeNull();
  });

  it('flushes the latest Bar Pad text when a timed sprint ends before debounce', async()=>{
    await boot();
    fireEvent.click(screen.getByRole('button',{name:'5 minute session timer'}));
    fireEvent.click(screen.getByRole('button',{name:'Start Session'}));
    fireEvent.click(activeWord());
    await act(async()=>{ vi.advanceTimersByTime(299500); });
    fireEvent.change(screen.getByPlaceholderText(/Write a bar with/),{target:{value:'last second bar'}});
    await act(async()=>{ vi.advanceTimersByTime(500); });
    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.getByText('last second bar')).toBeTruthy();
  });

  it('uses an absolute deadline and ends immediately after a background-style clock jump', async()=>{
    await boot();
    fireEvent.click(screen.getByRole('button',{name:'5 minute session timer'}));
    fireEvent.click(screen.getByRole('button',{name:'Start Session'}));
    const future=Date.now()+5*60_000+1000;
    vi.setSystemTime(future);
    await act(async()=>{ window.dispatchEvent(new Event('focus')); vi.advanceTimersByTime(300); });
    expect(screen.getByText('Complete')).toBeTruthy();
  });
});

describe('v1 real implementation tests (React rendering)', () => {
  // Renders the actual HistoryScreen component with 95 sessions and verifies the
  // warning banner displays the real count and the real 100-session limit. Will
  // fail if someone reverts the copy to the old "20-session limit" text.
  it('History warning banner shows actual count and 100-session limit at 95 entries', () => {
    const history = Array.from({ length: 95 }, (_, i) => ({
      id: i, date: new Date(2026, 0, i + 1).toISOString(), duration: 120,
      tier: 1, wordCount: 1, pace: '2.0s', frozenWords: [], notes: {}, source: 'active',
    }));
    render(
      <HistoryScreen
        sessionHistory={history}
        historyAtCap={true}
        historyCount={95}
        handleExportData={vi.fn()}
        resetToIdle={vi.fn()}
        setSessionHistory={vi.fn()}
        fmtDate={(d) => d.slice(0, 10)}
        fmtDur={(s) => `${s}s`}
        flattenNotes={() => []}
        copyNoteText={vi.fn()}
        copiedNoteKey={null}
      />
    );
    // Banner must mention the actual count and the real cap; must not say "20"
    expect(screen.getByText(/95/)).toBeTruthy();
    expect(screen.getByText(/100/)).toBeTruthy();
    expect(screen.queryByText(/20-session/)).toBeNull();
    expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
  });

  // Uses renderHook to drive useSessionEngine directly. canRecord requires both
  // getUserMedia AND MediaRecorder to be present — both must be mocked or
  // startRecording() exits at the guard and tests nothing.
  //
  // The rear camera was removed rather than kept as an option: recording rear-facing
  // points the screen away from the writer, so the prompt words they are meant to be
  // rapping over end up behind the phone. This pins the request to the front camera so
  // nobody reintroduces a facing option without meeting that argument first.
  it('always requests the front camera, and surfaces a denied permission', async () => {
    const capturedConstraints = { video: {} };

    // Minimal MediaRecorder fake — just enough for canRecord to pass and startRecording
    // to reach the getUserMedia call. The mock getUserMedia then rejects (permission
    // denied) so we never need a real stream or real recorder behavior.
    class FakeMediaRecorder {
      static isTypeSupported() { return true; }
      constructor() { this.ondataavailable = null; this.onstop = null; }
      start() {}
      stop() { this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockImplementation((constraints) => {
          Object.assign(capturedConstraints, constraints);
          // Reject after capturing args — simulates the permission-denied path so the
          // test exits cleanly without needing a real stream or recording lifecycle.
          return Promise.reject(Object.assign(new Error(), { name: 'NotAllowedError' }));
        }),
      },
      configurable: true,
    });

    const audioPlayerRef = { current: null };
    const { result } = renderHook(() => useSessionEngine({
      selectedTier: 1, wordCount: 1, intervalMs: 2000, isMetronomeOn: false,
      bpmMode: false, bpm: 90, barsPerWord: 2, customWords: [], sessionLimit: 0,
      beatAudioSrc: null, audioPlayerRef, vault: [], recoveredDraft: null,
      onSessionComplete: vi.fn(),
    }));

    // canRecord is now true, so startRecording reaches getUserMedia
    await act(async () => { await result.current.startRecording(); });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    expect(capturedConstraints.video.facingMode).toBe('user');
    expect(result.current.toggleCameraFacing).toBeUndefined();
    // The mock rejects with NotAllowedError, so this also covers the denial path
    // reaching the UI as a message rather than failing silently.
    expect(result.current.cameraError).toBe('Camera permission denied.');
  });
});
