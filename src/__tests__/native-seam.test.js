/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The native shell injects a Capacitor global into the WebView; services/platform.js
// reads that global rather than importing @capacitor/core, so the test drives the same
// thing the device does.
let native = false;
globalThis.Capacitor = {
  isNativePlatform: () => native,
  getPlatform: () => (native ? 'ios' : 'web'),
};

const shared = [];
vi.mock('@capacitor/share', () => ({
  Share: { share: (opts) => { shared.push(opts); return Promise.resolve(); } },
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: ({ path }) => Promise.resolve({ uri: `file:///cache/${path}` }) },
  Directory: { Cache: 'CACHE' },
}));

const awake = [];
vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: {
    keepAwake: () => { awake.push('keep'); return Promise.resolve(); },
    allowSleep: () => { awake.push('sleep'); return Promise.resolve(); },
  },
}));

const sessions = [];
vi.mock('@capawesome/capacitor-audio-session', () => ({
  AudioSession: { configure: (o) => { sessions.push(o); return Promise.resolve(); } },
}));

const impacts = [];
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: (o) => { impacts.push(o.style); } },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
}));

import { isNative, platform } from '../services/platform.js';
import { shareFile, canShareImages, canShareType } from '../services/share.js';
import { haptic } from '../services/haptic.js';
import { keepScreenAwake, allowScreenSleep, _resetScreenLock } from '../services/screen.js';
import { useForPlayback, useForRecording, _resetAudioSession } from '../services/audio-session.js';

beforeEach(() => {
  native = false;
  shared.length = 0; impacts.length = 0; awake.length = 0; sessions.length = 0;
  _resetScreenLock(); _resetAudioSession();
});
afterEach(() => vi.unstubAllGlobals());

describe('the platform seam defaults to web', () => {
  it('reports web when Capacitor says it is not native', () => {
    expect(isNative()).toBe(false);
    expect(platform()).toBe('web');
  });
});

describe('the web share path is unchanged by the native seam', () => {
  it('still goes through navigator.share with a files-only payload', async () => {
    const payloads = [];
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: (p) => { payloads.push(Object.keys(p).sort().join(',')); return Promise.resolve(); },
    });
    expect(await shareFile(new Blob(['x'], { type: 'image/png' }), 'card.png')).toBe('shared');
    expect(payloads).toEqual(['files']);
    // The native plugin must not have been touched from a browser.
    expect(shared).toEqual([]);
  });

  it('still reports no file-share support when the browser has none', () => {
    vi.stubGlobal('navigator', {});
    expect(canShareImages()).toBe(false);
  });
});

describe('the native shell shares through the plugin', () => {
  it('writes the file and hands the sheet a files-only payload', async () => {
    native = true;
    vi.stubGlobal('navigator', {}); // WKWebView may expose no Web Share at all
    expect(await shareFile(new Blob(['x'], { type: 'video/mp4' }), 'take.mp4')).toBe('shared');
    expect(shared).toHaveLength(1);
    expect(shared[0].files).toEqual(['file:///cache/take.mp4']);
    // Same rule as the web path: a text caption changes which actions iOS promotes.
    expect(shared[0].text).toBeUndefined();
    expect(shared[0].url).toBeUndefined();
  });

  it('reports it can share even with no navigator.canShare, so the UI offers Share', () => {
    native = true;
    vi.stubGlobal('navigator', {});
    // Without this the wrapped app would hide its working share sheet and offer a
    // download into a sandbox directory nobody can open.
    expect(canShareImages()).toBe(true);
    expect(canShareType('video/mp4', 'take.mp4')).toBe(true);
  });
});

describe('haptics', () => {
  it('uses navigator.vibrate on the web, exactly as before', () => {
    const calls = [];
    vi.stubGlobal('navigator', { vibrate: (ms) => calls.push(ms) });
    haptic(20);
    expect(calls).toEqual([20]);
    expect(impacts).toEqual([]);
  });

  it('uses the Taptic Engine natively, weighted by the call site', async () => {
    native = true;
    vi.stubGlobal('navigator', {});     // iOS Safari has never had navigator.vibrate
    haptic(20);                          // first call resolves the plugin
    await new Promise(r => setTimeout(r, 0));
    haptic(25);                          // downbeat — the heavier of the two
    haptic(10);                          // offbeat tick
    expect(impacts).toEqual(['MEDIUM', 'LIGHT']);
  });
});

describe('screen wake', () => {
  it('uses navigator.wakeLock on the web', async () => {
    const released = [];
    vi.stubGlobal('navigator', { wakeLock: { request: () => Promise.resolve({ release: () => { released.push(1); return Promise.resolve(); } }) } });
    await keepScreenAwake();
    await allowScreenSleep();
    expect(released).toEqual([1]);
    expect(awake).toEqual([]);
  });

  it('uses the plugin natively — WKWebView has no navigator.wakeLock at all', async () => {
    native = true;
    vi.stubGlobal('navigator', {});
    await keepScreenAwake();
    await allowScreenSleep();
    expect(awake).toEqual(['keep', 'sleep']);
  });

  it('a browser with no wake lock support does not throw', async () => {
    vi.stubGlobal('navigator', {});
    await expect(keepScreenAwake()).resolves.toBeUndefined();
    await expect(allowScreenSleep()).resolves.toBeUndefined();
  });
});

describe('audio session', () => {
  it('does nothing at all on the web', async () => {
    await useForPlayback();
    await useForRecording();
    expect(sessions).toEqual([]);
  });

  it('plays through the ringer switch by default', async () => {
    native = true;
    await useForPlayback();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].category).toBe('playback');
  });

  it('switches to playAndRecord for the camera, keeping output on the speaker', async () => {
    native = true;
    await useForPlayback();
    await useForRecording();
    expect(sessions[1].category).toBe('playAndRecord');
    // Without this the click relocates to the earpiece mid-session, which reads to a
    // writer as the metronome having stopped.
    expect(sessions[1].options.defaultToSpeaker).toBe(true);
  });

  it('does not re-configure when already in that category', async () => {
    native = true;
    await useForPlayback();
    await useForPlayback();
    await useForPlayback();
    expect(sessions).toHaveLength(1);
  });

  it('returns to playback after recording, so the click leaves the earpiece', async () => {
    native = true;
    await useForRecording();
    await useForPlayback();
    expect(sessions.map(s => s.category)).toEqual(['playAndRecord', 'playback']);
  });
});
