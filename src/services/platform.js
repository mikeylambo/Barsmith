// ─────────────────────────────────────────────
// PLATFORM
//
// The single answer to "is this the native shell or a browser tab", and the rule every
// native adaptation in this app is built around:
//
//   **The web build must behave exactly as it did before Capacitor existed.**
//
// People already have Barsmith installed from barsmith.app with their writing in
// localStorage. Nothing here may change what happens for them. So every native path is
// guarded by isNative(), which is false in every browser, and every Capacitor *plugin* is
// imported lazily inside that guard — a static import would pull plugin code into the web
// bundle for no reason and give a browser a chance to run it.
//
// Deliberately NOT `import { Capacitor } from '@capacitor/core'`. That import is harmless
// on web but not free — it pulled ~4KB gzipped into the main bundle and six extra chunks
// into the service worker's precache, all of it for code no browser will ever execute.
//
// The native shell injects a `Capacitor` global into the WebView before app code runs, so
// reading the global answers the question with nothing imported. If it is ever absent, the
// answer is "web", and every native path falls back to the browser behaviour that already
// works — the safe direction to fail in.
// ─────────────────────────────────────────────

/** True only inside the iOS/Android shell. False in every browser, including the PWA. */
export function isNative() {
  try {
    return globalThis.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** 'ios' | 'android' | 'web'. */
export function platform() {
  try {
    return globalThis.Capacitor?.getPlatform?.() || 'web';
  } catch {
    return 'web';
  }
}
