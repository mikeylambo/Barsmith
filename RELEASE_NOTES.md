# Barsmith 5.1.0 — v1 completion pass

Built on top of 5.0.1 (RC, based on RC4 + stabilization fixes). This pass closes the
gaps identified in a v1-readiness review: offline support, data-loss prevention at the
History retention cap, an accessibility sweep, and two smaller hardening items — plus a
real-device checklist that still needs to be run manually.

## Additions

- **Offline support.** A build-generated service worker now precaches every hashed Vite JS and CSS asset at install time, so Barsmith launches fully offline after one completed online visit. The precache manifest is injected into `dist/sw.js` by `scripts/inject-sw-precache.js`, which runs as part of `npm run build`. A failed `cache.addAll()` now correctly aborts SW installation rather than being swallowed — preventing a partially-cached build from activating and serving a broken offline experience. Dictionary/rhyme API calls are deliberately left untouched by the worker — they already degrade gracefully offline in the app code.
- **History cap export nudge.** History now retains up to 100 sessions (raised from 20). When the count reaches 95 a banner appears on the History screen showing the actual saved count and explaining that older sessions will begin rolling off at 100, with a one-tap Export Backup action. Previously this could only be discovered after the fact.
- **Front/rear camera toggle.** Recording defaulted to the front camera only. A writer
  can now switch to the rear camera between recordings (disabled mid-recording to avoid
  tearing down an in-progress capture) — useful for filming a whiteboard, a beat machine,
  or hands instead of a face. The camera preview's mirror effect is now conditional on
  facing mode, since mirroring a rear-camera feed would look wrong.
- **Bounded dictionary cache.** The in-memory rhyme/definition cache is now a capped LRU `Map` (300 entries). Cache hits refresh insertion order so the evicted entry is always the genuinely least-recently-used one, not merely the oldest inserted.

## Accessibility pass

- The word-lock interaction — the single most-used control in the app — was pointer-only.
  Word tiles are now keyboard-operable (`role="button"`, `tabIndex`, Enter/Space) with a
  descriptive `aria-label`.
- Added `aria-pressed` and descriptive `aria-label`s to every numeric-only toggle group
  (Level, Scheme word count, Session Timer, bars-per-word, Timer/BPM mode, Metronome,
  Haptics, Vault sort mode) — previously these read as bare numbers or ambiguous state to
  a screen reader.
- Added `aria-label`s to the remaining icon-only controls (remove-beat, BPM/interval
  sliders) that didn't already have one.

## Cleanup

- Removed a dead ref (`beatCountRef`) that was written to in three places in
  `useSessionEngine` but never read anywhere.

## Still required before replacing production

Everything above is code-complete, tested, and built clean — but the real-device
checklist in README.md has **not** been run as part of this pass and remains the one
manual gate before calling this final. See README.md for the checklist and a suggested
script for running it.

## Verification

- `npm ci`: passed
- `npm run verify`: 16/16 passed (build + full test suite) (2 tests updated to match new, more descriptive accessible
  names on the Session Timer buttons — behavior unchanged)
- word-bank validation: 0 errors, 0 warnings
- `npm run build`: passed
- `npm audit`: 0 vulnerabilities
