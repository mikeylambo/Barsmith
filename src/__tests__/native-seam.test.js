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

const impacts = [];
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: (o) => { impacts.push(o.style); } },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
}));

import { isNative, platform } from '../services/platform.js';
import { shareFile, canShareImages, canShareType } from '../services/share.js';
import { haptic } from '../services/haptic.js';

beforeEach(() => { native = false; shared.length = 0; impacts.length = 0; });
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
