# Barsmith — the native shell

Capacitor wraps the same `dist/` the web app deploys. There is **one build**: the web
build. Nothing here forks the codebase.

## The rule everything else follows

> **The web build must behave exactly as it did before Capacitor existed.**

People have Barsmith installed from `barsmith.app` with their writing in `localStorage`.
Nothing native may change what happens for them. So:

- Every native path is guarded by `isNative()` (`src/services/platform.js`), which is
  `false` in every browser including the installed PWA.
- `services/platform.js` reads the `Capacitor` global the native shell injects — it does
  **not** import `@capacitor/core`. That import cost ~4KB gzipped in the main bundle and
  six extra precached chunks, all for code no browser executes.
- Every Capacitor *plugin* is imported lazily, inside a native guard.
- The plugins are collected into one `capacitor-native-*.js` chunk (`vite.config.js`),
  which is excluded from the service worker precache and stripped from the modulepreload
  graph. Both exclusions are asserted in `src/__tests__/build.test.js`.

Cost to the web build, measured against `main` before any of this: **+2.8KB** in the entry
bundle — the guard code itself — with an identical `index.html` and an identical precache
set.

## What the shell changes

| | Web | Native |
|---|---|---|
| Share a card / recording | `navigator.share` | `@capacitor/share` + `@capacitor/filesystem` |
| `canShareType()` | probes `navigator.canShare` | always `true` |
| Haptics | `navigator.vibrate` — **a no-op on iOS, always has been** | Taptic Engine |
| Service worker | registered | not registered |

The share swap matters because Web Share inside a WKWebView is version-dependent and its
file support is the fragile part; on Android's WebView it does not exist at all. The
`canShareType` override matters because that answer drives the UI — without it a wrapped
build would hide its working share sheet and offer a download into a sandbox nobody can
open.

Haptics is the one place wrapping *adds* a feature rather than preserving one: Safari has
never supported `navigator.vibrate`, so the Haptics toggle in Settings has been promising
something the web could not deliver on the one platform every tester uses.

## First-time setup (needs macOS + Xcode)

```bash
npm ci
npm run build          # Capacitor copies dist/, so build first — always
npx cap add ios
npx cap sync ios
npx cap open ios       # opens Xcode
```

After any web change: `npm run build && npx cap sync ios`.

## Info.plist — required before the app will run

Add these in Xcode (target → Info). **Missing strings crash the app the first time a
writer taps Record, and are an automatic App Store rejection.** Write them as reasons, not
as restatements of the permission:

| Key | Suggested string |
|---|---|
| `NSCameraUsageDescription` | Barsmith records you rapping so you can watch a take back. Video stays on this device and is never uploaded. |
| `NSMicrophoneUsageDescription` | Barsmith records your audio so you can hear a take back. It stays on this device and is never uploaded. |

Both claims are true — see `useSessionEngine.js`, where the recording is held in memory and
only leaves via the share sheet the writer opens themselves.

## Still to do

- **Wake lock.** `navigator.wakeLock` is not in WKWebView, so the screen sleeps mid-session.
  Needs a keep-awake plugin behind the same `isNative()` guard.
- **Audio session.** The metronome will be silenced by the ringer switch unless the
  `AVAudioSession` category is set to playback.
- **Storage durability.** `localStorage` in a Capacitor WebView is not subject to Safari's
  7-day eviction, so it is already *more* durable than the PWA — but it is still the store
  holding every bar anyone writes, and moving to Preferences or SQLite is the honest
  long-term answer.
- **Save straight to Photos.** Currently the share sheet, same as web. A native media
  plugin would make *Save Recording* write to the camera roll in one tap.

## App Store review

Guideline 4.2 ("Minimum Functionality") rejects repackaged websites. Barsmith's case is
camera and microphone capture, a look-ahead audio scheduler on the hardware clock, an
offline rhyme engine and dictionary shipped in the binary, haptics, and a full writing loop
with no network at all. Make that case in the review notes rather than hoping the reviewer
finds it — and make sure the native paths above are actually wired first, because a wrap
where half the native APIs silently do nothing is the version that gets rejected.

Privacy Policy URL: `https://barsmith.app/privacy`. Support contact: `hello@barsmith.app`.
The App Privacy questionnaire needs the analytics declared — anonymous usage counts, not
linked to identity, not used for tracking.
