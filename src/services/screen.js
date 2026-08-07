// ─────────────────────────────────────────────
// SCREEN WAKE
//
// A writing session is a screen you look at and rarely touch — the whole point is that
// your hands are busy and your eyes are on the word. So the display going to sleep
// mid-bar is not a cosmetic problem, it ends the session.
//
// `navigator.wakeLock` covers this on the web, but **WKWebView does not implement it**,
// so a wrapped build would sleep exactly where the PWA stays awake. The native shell gets
// the same guarantee through a plugin instead.
//
// Both paths are best-effort and silent on failure. A refused wake lock is a worse
// session, never a broken one, and nothing here may throw into the session loop.
// ─────────────────────────────────────────────

import { isNative } from './platform';

let webLock = null;
let nativeHeld = false;

export async function keepScreenAwake() {
  if (isNative()) {
    try {
      const { KeepAwake } = await import('@capacitor-community/keep-awake');
      await KeepAwake.keepAwake();
      nativeHeld = true;
    } catch {}
    return;
  }
  try {
    if ('wakeLock' in navigator) webLock = await navigator.wakeLock.request('screen');
  } catch {}
}

export async function allowScreenSleep() {
  if (nativeHeld) {
    nativeHeld = false;
    try {
      const { KeepAwake } = await import('@capacitor-community/keep-awake');
      await KeepAwake.allowSleep();
    } catch {}
    return;
  }
  try {
    await webLock?.release();
  } catch {}
  webLock = null;
}

/** Test seam — the module holds process-wide state, so tests must be able to reset it. */
export function _resetScreenLock() { webLock = null; nativeHeld = false; }
