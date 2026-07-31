# Barsmith

A writing gym, rhyme reference, and idea-capture tool for serious hip-hop writers.

## Requirements

- Node.js `22.x` or `24.x` (as pinned in `package.json`)
- npm

## Setup

```bash
npm ci
npm run dev       # local dev server
npm test          # automated release checks
npm run build     # validates the word bank, then builds to dist/
npm run preview   # preview the production build
```

## Getting your bars out

Barsmith stores everything locally and sends nothing anywhere, which makes export
the only way work leaves the app. There are three, and they are not interchangeable:

- **A bar as an image** — the *Share* action on any individual bar, in Summary or
  History, renders a 1080×1080 bar card and hands it to the OS share sheet (or saves it,
  where file sharing is unavailable). This is the one meant to be posted.
- **Bars as text** (`.txt`) — Summary offers *Copy All Bars* and *Export .txt* for the
  session you just finished; History offers *Export All Bars* for the whole archive and
  *Copy All* per session. This is the one you open in a notes app, a lyric doc, or a DAW.
- **Backup** (`.json`) — from the Vault screen. Restores Barsmith itself (history, vault,
  personal words, preferences) on this or another device. Nothing else reads it.

### Bar cards

`services/bar-card.js` draws the card on a canvas using the self-hosted Inter and the
anvil from `src/assets/brand-lockup.png`, so a card is generated on-device and works
offline like everything else.

Two things in there are load-bearing and easy to break:

- **The writer's line breaks are structure, not whitespace.** A bar written as four
  lines must render as four lines. `layoutBarText` therefore hunts for the largest type
  size at which nothing wraps before it settles for merely fitting the frame — a bar
  whose lines each wrap in two reads as prose and loses the rhythm that made it worth
  sharing. Where wrapping is unavoidable, continuation lines are indented.
- **iOS only honours `navigator.share()` inside a live user gesture.** Any `await`
  before the call — encoding the canvas, loading the font — drops the activation and the
  sheet silently never opens. So the card is rendered when the modal opens, and the
  Share handler does no async work before sharing. `services/share.js` is the single
  seam for this; swapping in `@capacitor/share` for a native build touches that file
  and nothing else.

## Today's session

The idle screen opens with a prescribed session for the day — level, scheme, pace, and
duration already chosen. The problem it solves is decision cost, not motivation: five
settings between opening the app and seeing a word is a fine control surface for someone
who knows what they want to train, and a reason to close it for someone who has ten
minutes.

`services/daily.js` derives it from the local calendar date, so it needs no backend,
works offline, and is identical for everyone on a given day. It is **structured by
weekday rather than randomised** — Reset, Foundations, Tempo, Scheme, Heavy, Sprint,
Endurance. A random draw each morning is noise a writer cannot anticipate; a week with a
shape means Friday is Sprint day and skipping it misses something specific. The specifics
inside each shape still vary week to week.

The card also carries a **week strip**: seven cells, Sunday to Saturday, showing which
prescriptions are done. One session is a task; a week with gaps in it is a programme, and
seeing that Tuesday is still empty with two days left is a better reason to open the app
tomorrow than a card that only ever describes today.

Only a session started from the card counts as completing the prescription — freeform
training is training, but it is not the programme.

Note the wiring in `App.jsx`: applying a prescription writes seven pieces of settings
state, which React batches, so `engine.startSession()` cannot run in the same handler or
it would start against the *previous* settings. A pending flag defers the start by one
render.

## The word banks

Three tiers, graded by syllabic weight — tier 1 is ~97% single-syllable, tier 2 ~84%
two-syllable, tier 3 predominantly three or more. **New words are placed by that rule**,
and the test suite asserts each tier stays on its band.

Beyond the band, two things decide whether a word earns its place, both aimed at the
bar-heavy, punchline-driven writer the app is for:

- **A second meaning.** A punchline turns on a word's other sense — `clip`, `iron`,
  `piece`, `deck`, `pawn`, `charge`. Words carrying only one sense give a writer nothing
  to turn.
- **A distinct ending.** Rhyme-tail diversity, not word count, is the measure of a tier's
  usefulness — see `npm run audit-wordbank`. Tier 3 used to be the biggest bank that ended
  the fewest different ways, because it had filled up with Latinate abstractions that all
  end alike and each mean exactly one thing. It now leads on endings (459) rather than
  trailing, reached by adding concrete multisyllabic roots rather than cutting anything.

Two diagnostics sit alongside the build validator. The validator says a bank is
well-*formed*; these say whether it is *good*. Neither edits anything — re-run both after
any word pass.

- `npm run audit-wordbank` → `docs/wordbank-audit.md`. Shape: composition by word class,
  rhyme-tail diversity, where concentration sits, syllable-band drift.
- `python3 scripts/check-word-frequency.py` → `docs/wordbank-frequency.md`. Whether the
  words are ones anyone actually uses, by Zipf frequency (`pip install wordfreq`). This is
  what catches entries a suffix rule can build but no writer will pick up — tier 3 still
  holds 19 words below the not-in-use line, `officialize` and `territorialization` among
  them. Treat it as a review list, not a cut list: rap vocabulary skews away from general
  English, so `sycophant` at 2.2 earns its place.

Two constraints the build validator enforces rather than trusting:

- **Single tokens only.** Tap-to-Lock sends the prompt straight to dictionaryapi.dev,
  which 404s on a phrase — so a multi-word prompt would open a broken dictionary panel
  rather than a definition. This is why 25 candidate phrases were dropped rather than
  added when the wildcard list was merged in.
- **No cross-tier duplicates**, so the difficulty ramp means something.

A fourth "wildcard" tier was built and then removed. The words that justified it — real
unrhymables like `orange` and `month` — were too few to fill a mode, and the rest were
ordinary polysyllables that belong on the existing ramp. Its 142 single words were
redistributed into tiers 1-3 by syllable count. One difficulty axis, one mental model.

## The training log

`ProgressScreen` is the evidence behind the "writing gym" claim: bars written, time
trained, a 52-week consistency grid, weekly volume, vocabulary breadth, and personal
bests. Everything is computed on-device from data already stored.

The consistency grid covers a full year because practice days are retained for 400 — a
shorter window would discard record a writer had already earned. Fifty-two columns
cannot fit a phone at a legible cell size, so it scrolls horizontally and opens at the
right-hand edge, since recent weeks are what someone opens it to see.

One thing here is load-bearing. **Cumulative figures come from `barsmithTotals`, never
from `sessionHistory`.** History is capped at 100 sessions, so lifetime bars derived
from it would climb, plateau, and then *fall* — the precise opposite of what a progress
screen exists to say. Totals are stored independently, exactly as `practiceDays`
already is, and:

- are seeded once from whatever history exists, so writers upgrading into this release
  do not open the log to zeroes;
- refuse to mark themselves seeded against an *empty* history, because doing so on a
  fresh install would permanently lock in zeroes and prevent later data from folding in;
- are included in the JSON backup, so a lifetime record survives moving devices, and
  are rebuilt from history when restoring a backup written before they existed.

`services/progress.js` holds the arithmetic and takes `today` as an argument, so the
calendar logic is tested against fixed dates rather than the clock.

## Brand assets

`public/og-image.png`, `public/icon-512.png`, and `public/icon-maskable-512.png` are
generated by `scripts/make-brand-assets.py` from `src/assets/brand-lockup.png` and the
self-hosted Inter font. The outputs are committed, so no build or deploy needs Python —
run the script only when the tagline, wordmark, or brand colours change:

```bash
pip install Pillow fonttools brotli
python3 scripts/make-brand-assets.py
```

## Release verification

This package was installed, tested, validated, built, and dependency-audited.

- Word bank: Tier 1 `1,223`, Tier 2 `2,037`, Tier 3 `2,175`
- Cross-tier duplicates: `0`
- Automated tests: `124 passed`
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
- text-export shape: multi-bar words, legacy note records, blank-entry omission, pluralization
- error-boundary rescue flow, including a backup taken from a crashed tree and a reset
  that clears only Barsmith's own storage keys
- History search matching bar text and frozen words, and clearing back to the full archive
- Copy All reporting a real outcome when the clipboard rejects or is absent entirely
- training-log arithmetic: idempotent seeding, distinct-word breadth, personal bests as
  maxima, longest streak across month and DST boundaries, weekly bucketing
- the daily prescription being stable within a day, varying across days, covering every
  weekday shape, and only ever emitting settings the session engine accepts
- the week strip marking past completions, flagging today, and not drawing later days
  as missed, across a month boundary
- completed days capping oldest-first while the lifetime programme count survives
- every word bank holding single tokens only, and each tier staying on its syllabic band
- bar-card layout: line structure preserved, continuation indent only where it
  disambiguates, width never exceeded, over-long tokens broken, overflow truncated
- share outcomes distinguishing a completed share, a dismissed sheet, a genuine
  failure that falls back to download, and a browser with no file-share support
- every hashed asset, and every manifest icon, appearing in the generated
  service-worker precache

## Final real-device checks

Browser automation cannot substitute for hardware-specific media/audio behavior. Before replacing production, run one preview deployment through this on both an iPhone (Safari) and an Android phone (Chrome) where possible — mark each box, note the device/OS version next to any failure, and don't ship until every box is checked on at least one real iOS device and one real Android device.

1. **Install.** Open the preview URL in Safari on iPhone → Share → Add to Home Screen. Launch from the home screen icon (not the Safari tab) and confirm it opens full-screen with no browser chrome, correct icon, and correct name ("Barsmith").
2. **Offline load.** With the app already opened once while online, turn on Airplane Mode, fully close the app, and relaunch from the home screen icon. Confirm the app shell loads and a session can be started and written in. Confirm the dictionary panel shows a network-error state (not a blank/broken one) when a word is locked while offline. Turn Airplane Mode back off.
3. **Camera + mic permission.** From a fresh app state (or after removing the site's permissions in Settings), tap Record. Confirm the OS permission prompt appears, and that denying it surfaces "Camera permission denied." in the UI rather than a silent failure or a crash.
4. **Recording round-trip.** On the setup screen, tap Record and grant camera/microphone permission. Then Start Session and write for at least 30 seconds. Tap Stop (visible in the red recording bar or in-session controls), end the session, and download the recording from the Summary screen. Confirm the downloaded file opens and plays with audio in Photos/Files.
5. **Camera facing toggle.** Before recording, tap the camera-switch button and confirm the preview and resulting recording use the rear camera; switch back and confirm the front camera preview is mirrored (rear should not be).
6. **BPM by ear.** Turn on BPM mode, set a familiar tempo (e.g. 90), and confirm the count-in and beat clicks sound correct and evenly spaced by ear, with no audible drift over a 2–3 minute session.
7. **Keyboard-open scrolling.** Lock a word to open the dictionary panel, tap into the Bar Pad textarea to bring up the keyboard, and confirm the panel scrolls/resizes so the textarea and Save/Copy buttons stay visible above the keyboard, with no content cut off at the bottom.
8. **Safe-area spacing.** On a notched/Dynamic Island device in both portrait and landscape, confirm no controls (Start/End Session button, top info bar, recording preview) sit under the notch, home indicator, or camera cutout.
9. **Background/return during a timed session.** Start a 5-minute Writing Sprint, switch to another app (or lock the phone) for over a minute, then return. Confirm the countdown reflects real elapsed wall-clock time (not paused/frozen) and that the session ends automatically and correctly once the deadline has actually passed.
10. **Backup round-trip.** From Vault, tap Export Backup and confirm a `.json` file is actually saved (not silently dropped — this is the specific case Safari can be flaky about). Then clear browser data for the site (or use a second device), tap Restore Backup, select that file, and confirm Vault, History, and custom words all come back correctly.
11. **Text export round-trip.** After a session with at least two bars, tap *Copy All Bars* on Summary and paste into Notes — confirm every bar arrives, blank-line separated, in order. Then tap *Export .txt* and confirm the file actually saves and opens as readable text (same Safari flakiness as the backup download applies). Repeat *Export All Bars* from History with more than one session archived.
12. **Home-screen icon.** On Android/Chrome, install to the home screen and confirm the launcher icon shows the anvil on a dark field with nothing clipped by the system's circular mask. On iPhone, confirm the home-screen icon is not a white tile.
13. **Today's session across midnight.** Open the app late at night, note the prescription, then check again after local midnight and confirm it has rolled to the next day's shape. Start a session before midnight and finish it after, and confirm it still completes the prescription it began under rather than being marked against the new day.
14. **Bar card share sheet.** This is the one check browser automation genuinely cannot stand in for, because the iOS gesture rule only bites on a real device. Tap *Share* on a bar and confirm the native share sheet opens with the image attached, that picking Instagram/Messages actually carries the picture through, and that dismissing the sheet leaves no stray file in Photos. Repeat with a multi-line bar and confirm each written line renders as its own line on the card.

## Project structure

```text
src/
  App.jsx
  components/
    ActionBar.jsx
    ActiveScreen.jsx
    BarCardModal.jsx
    DailyCard.jsx
    DictionaryModal.jsx
    ErrorBoundary.jsx
    HistoryScreen.jsx
    IdleScreen.jsx
    InfoModal.jsx
    ProgressScreen.jsx
    RhymeSearch.jsx
    Splash.jsx
    SummaryScreen.jsx
    VaultScreen.jsx
  hooks/
    useFocusTrap.js
    useSessionEngine.js
  services/
    audio-clock.js
    bar-card.js
    daily.js               # today's prescribed session; date-derived, no backend
    dictionary.js
    download.js
    export-text.js
    haptic.js
    progress.js            # training-log arithmetic; pure, date-injected
    share.js               # the one seam to swap for @capacitor/share
    storage.js
    wordbank.js
  assets/
    brand-lockup.png          # source artwork for the generated icons + OG card
    fonts/
      inter-latin.woff2       # self-hosted, so the PWA renders offline
  data/
    tier-1.json
    tier-2.json
    tier-3.json
  __tests__/
    bar-card.test.js
    build.test.js
    daily.test.js
    export-text.test.js
    progress.test.js
    release.smoke.test.jsx
    resilience.test.jsx
    services.test.js
scripts/
  inject-sw-precache.js
  make-brand-assets.py        # regenerates committed brand images; not part of the build
  validate-wordbank.js
public/
  manifest.json
  icon-192.png
  icon-512.png
  icon-maskable-512.png
  og-image.png
  sw.js
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
