# Barsmith

A writing gym, rhyme reference, and idea-capture tool for serious hip-hop writers.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- npm

## Setup

```bash
npm ci
npm run dev       # local dev server
npm test          # automated release checks
npm run build     # validates the word bank, then builds to dist/
npm run preview   # preview the production build
```

## Release verification

This package was installed, tested, validated, built, and dependency-audited.

- Word bank: Tier 1 `993`, Tier 2 `1,366`, Tier 3 `1,515`
- Cross-tier duplicates: `0`
- Automated tests: `11 passed`
- Production build: passed
- `npm audit`: `0 vulnerabilities`
- `package-lock.json`: included for reproducible Vercel/local builds

The automated suite covers:

- repeated prompt words retaining multiple separate bars
- Summary and History persistence
- crash/reload draft recovery
- immediate `pagehide` recovery before the normal debounce completes
- blocking a new session until recovered writing is resolved
- timer-expiry flushing of the currently open Bar Pad
- absolute-deadline countdown recovery after a background/clock jump
- custom-word repeat fallback
- streak calendar arithmetic
- malformed backup rejection
- dictionary outage handling
- cancellation of scheduled BPM callbacks after stop

## Final real-device checks

Browser automation cannot substitute for hardware-specific media/audio behavior. Before replacing production, run one preview deployment through:

1. iPhone Safari, including Add to Home Screen.
2. Android Chrome when available.
3. Front-camera + microphone permission, recording, stop, and download/playback.
4. BPM count-in, lock/re-entry, and word changes by ear.
5. Keyboard-open Bar Pad scrolling and safe-area spacing.
6. Background the app during a timed session, return, and confirm immediate completion.
7. Export a backup, restore it, and verify Vault/History/preferences.

## Project structure

```text
src/
  App.jsx
  components/
    ActionBar.jsx
    ActiveScreen.jsx
    DictionaryModal.jsx
    HistoryScreen.jsx
    IdleScreen.jsx
    InfoModal.jsx
    RhymeSearch.jsx
    Splash.jsx
    SummaryScreen.jsx
    VaultScreen.jsx
  hooks/
    useFocusTrap.js
    useSessionEngine.js
  services/
    audio-clock.js
    dictionary.js
    haptic.js
    storage.js
    wordbank.js
  data/
    tier-1.json
    tier-2.json
    tier-3.json
  __tests__/
    release.smoke.test.jsx
    services.test.js
scripts/
  validate-wordbank.js
public/
  manifest.json
  icon-192.png
  icon-512.png
```

## Release-hardening changes beyond RC4

- Bar Pad is synchronously flushed if a timed session ends while the modal is open.
- Sub-second text is persisted on `pagehide`/backgrounding before debounce can fire.
- Session counts, frozen words, notes, and start time use synchronized live refs at finalization.
- Timed sessions use an absolute deadline, so mobile timer throttling cannot extend a sprint.
- New sessions and Vault Drills are blocked until recovered writing is saved or discarded.
- Dictionary requests use request IDs so a canceled lookup cannot clear a newer lookup's loading state.
- Front-camera recording can be stopped from inside an active session.
- Rhyme Search now URL-encodes input, cancels on unmount, removes duplicate entries, and avoids double haptics.
- Focus trapping, Escape-to-close, safe-area spacing, accessible icon labels, and long-word wrapping were restored.
- Streak calculation uses calendar-day arithmetic across DST boundaries.
- Total dictionary/network outages are surfaced rather than cached as legitimate empty results.
- Vite and Vitest were upgraded to currently non-vulnerable lines; the full npm audit is clean.
