# Barsmith

A writing gym, rhyme reference, and idea-capture tool for serious hip-hop writers.

## Setup

```bash
npm install
npm run dev       # local dev server, http://localhost:5173
npm run build     # production build to dist/ (runs word-bank validation first)
npm run preview   # preview the production build locally
```

## Project structure

```
src/
  App.jsx                 — main application component (not yet split further; see below)
  main.jsx                — React entry point
  index.css               — global styles + Tailwind directives
  services/
    storage.js             — all localStorage access, centralized
    dictionary.js           — rhyme/synonym/antonym/definition lookups
    audio-clock.js           — look-ahead BPM scheduler (BeatScheduler class)
    wordbank.js              — word selection logic, loads data/*.json
    haptic.js                — vibration helper
  data/
    tier-1.json, tier-2.json, tier-3.json, wildcards.json
scripts/
  validate-wordbank.js     — checks the word data for duplicates/malformed entries
public/
  manifest.json            — PWA manifest
  icon-192.png, icon-512.png  — NOT INCLUDED, see below
```

## Known gaps / things to do before shipping

1. **App icons are missing.** `public/manifest.json` references `icon-192.png`
   and `icon-512.png`, but the source HTML this was migrated from never
   actually included these files — they were hosted separately. Copy your
   existing icons into `public/` before building, or the splash screen and
   home-screen icon will be broken.

2. **`App.jsx` is still one large file (~1,150 lines).** The services layer
   (storage, dictionary, audio clock, word bank, validation) is fully split
   out and is the highest-value, lowest-risk part of this migration. Splitting
   the UI itself into separate component files (SessionScreen, VaultScreen,
   HistoryScreen, SummaryScreen, DictionaryModal, RhymeSearch, etc.) is the
   natural next step, but wasn't done in this pass — it's larger and riskier
   to get right without being able to click through it during the change.

3. **This was migrated and statically checked, not run.** The sandbox this
   was built in has no network access, so `npm install` and `npm run dev`
   could not be executed here. The code has been checked for syntax
   correctness, brace/paren balance, and consistent import/export naming, but
   it has not been compiled or clicked through. Run `npm run dev` yourself
   and walk through a full session (idle → start → lock a word → save a bar
   → end session → check summary and history) before trusting it.

4. **`RhymeSearch`'s rhyme lookup is separate from `services/dictionary.js`.**
   They overlap in purpose (both call Datamuse) but serve different screens
   (typed search vs. lock-screen lookup) and were left independent rather
   than force-merged, to avoid behavior changes in an unproven refactor.

## Word bank validation

`npm run build` runs `scripts/validate-wordbank.js` automatically and will
fail the build if it finds duplicate words within or across tiers, empty
entries, or malformed data. Run it standalone any time with:

```bash
npm run validate-wordbank
```
