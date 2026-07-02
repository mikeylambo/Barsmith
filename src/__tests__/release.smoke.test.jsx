/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, fireEvent, screen, act, cleanup } from '@testing-library/react';
import App from '../App.jsx';

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
    fireEvent.click(screen.getByRole('button',{name:'5m'}));
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
    fireEvent.click(screen.getByRole('button',{name:'5m'}));
    fireEvent.click(screen.getByRole('button',{name:'Start Session'}));
    const future=Date.now()+5*60_000+1000;
    vi.setSystemTime(future);
    await act(async()=>{ window.dispatchEvent(new Event('focus')); vi.advanceTimersByTime(300); });
    expect(screen.getByText('Complete')).toBeTruthy();
  });
});
