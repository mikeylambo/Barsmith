# Barsmith 5.0.1 — Release Candidate

This package is based on RC4 and includes the final stabilization fixes found during an actual install/build plus automated session-flow testing.

## Confirmed RC4 defect repaired

RC4 could lose the newest Bar Pad text when a timed sprint ended while the lock modal was open and the 600 ms autosave debounce had not fired yet. A deterministic automated test reproduced the loss. The session engine now requests a synchronous flush from the live modal before finalizing the History record.

## Additional hardening

- absolute-deadline session countdown for backgrounded/mobile browsers
- immediate `pagehide`/background draft persistence
- synchronized live refs for final word/note/frozen-word counts
- recovered-draft resolution gate before new sessions or Vault Drills
- dictionary request-race protection
- in-session recording stop control
- Rhyme Search encoding, deduplication, cleanup, mobile sizing, and haptic correction
- focus traps, Escape handling, safe-area spacing, accessible star/close controls
- calendar-based streak arithmetic across DST
- full network-outage handling for locked-word research
- reproducible `package-lock.json`
- current Vite/Vitest toolchain with a clean dependency audit

## Verification

- `npm ci`: passed
- `npm test`: 11/11 passed
- word-bank validation: 0 errors, 0 warnings
- `npm run build`: passed
- `npm audit`: 0 vulnerabilities

Real-device camera, microphone, download, haptic, and musical timing still require the short hardware playtest described in README.md.
