# Barsmith 5.7.0 — the word bank pass

5.6.0 asked whether the banks were any good. This answers it, with measurements
rather than taste, and grows them from 4,016 words to 5,414.

## What was actually wrong

The first diagnosis — "tier 3 is 43% abstract" — described a symptom. Two better
measurements replaced it.

**Rhyme-tail diversity.** How many different ways can a tier end, and how much of it
piles into the top few? Tier 3 was the biggest bank and could end the fewest ways —
fewer than tier 1, which had half again fewer words:

| Tier | Words | Bare roots | Distinct endings | Top-10 cover |
| --- | --- | --- | --- | --- |
| 1 | 1,020 → 1,223 | 96.8% → 97.1% | 321 → 368 | 13.6% → 11.9% |
| 2 | 1,425 → 2,035 | 71.6% → 76.9% | 450 → 578 | 20.4% → 18.2% |
| 3 | 1,571 → 2,156 | 33.0% → 47.6% | 251 → **457** | 59.4% → 44.7% |

Tier 1 is almost entirely bare concrete roots, each ending its own way. Tier 3 had
inverted that into Latinate abstractions, which all end alike. The tiers were designed
as a ramp in word *length* and had quietly become a ramp in *abstraction* too.

**Polysemy.** A punchline turns on a word's second meaning. Checking a sample of 118
obviously double-meaning words — `clip`, `iron`, `piece`, `toast`, `deck`, `pawn` —
against each tier:

    tier 1: 70/118 present     tier 2: 6/118     tier 3: 0/118

Zero. Latinate abstractions are monosemous by construction: `classification` means
exactly one thing, so there is nothing for a writer to turn. 42 of those words were
missing from the bank entirely.

## What was added

1,093 words across tiers 1-3, aimed at two properties rather than volume alone: a
second meaning, and an ending the tier was short of. Drafted across domains chosen for
concrete imagery — weapons, anatomy, machines, architecture, wildlife, food, crime and
law, instruments, materials, vehicles, myth, cosmology — then filtered against band,
duplicates, the single-token rule, and obscurity.

Tier 3 now leads the bank on rhyme diversity instead of trailing it, reached **entirely
by addition**. The `-ation` family is untouched at 175 words; its share fell to 8% by
dilution alone.

## Obscurity is now measured

`pip` reaches PyPI from the build container even though datamuse and the academic
concreteness hosts are blocked, so `wordfreq` provides a Zipf-frequency gate. It cleanly
separates words that needed removing by hand (`clavichord` 1.6, `caravel` 1.7) from ones
worth keeping (`ambulance` 4.1, `locomotive` 3.5, `ligament` 3.3), and auto-rejected 44
candidates that would otherwise have needed an eyeball.

Run over the existing bank, it found 21 entries that are effectively not English:
`officialize`, `territorialization`, `groundlessness`, `predomination` — all at Zipf 0.0,
meaning the corpus contains them essentially never. These are strings a suffix rule can
build, which is direct evidence the tier was padded from a stem list rather than curated.
All 21 removed.

## A migration bug, found while reviewing for release

Preferences persist. A writer who had selected the short-lived WILD tier still had
`tier: 4` in localStorage, and with that bank removed in 5.6.0, every prompt slot
resolved to nothing — `getNextWords` returned an empty array and a session started with
a blank where the word belongs. No crash, no error message. Silent failure is the worst
kind.

`normalizeTier()` now coerces any tier without a bank behind it back to 1, applied at
the preference boundary and again inside `getTierDist`. Tested against `4`, `0`, `-1`,
`99`, `null`, `undefined` and a string, across all four Scheme counts. Real-world
exposure was nil — 5.5.0 only existed on a branch behind SSO — but the bug class is not:
any persisted setting pointing at a removed option behaves this way.

## Two diagnostics, neither of which edits anything

- `npm run audit-wordbank` → `docs/wordbank-audit.md`. Shape: composition by word class,
  rhyme-tail diversity, concentration, syllable-band drift. Its narrative is derived
  rather than asserted — it detects whether tier 3 still rhymes narrowest and reports
  the current state instead of repeating a claim that has stopped being true.
- `python3 scripts/check-word-frequency.py` → `docs/wordbank-frequency.md`. Whether the
  words are ones anyone uses. A review list, not a cut list: rap vocabulary skews from
  general English, so `sycophant` at 2.2 earns its place.

## Verification

- `npm run verify`: 126/126 passed (was 124/124)
- Word bank: 5,414 words · 0 cross-tier duplicates · 0 multi-word entries · 0 entries
  below the not-in-use line in tiers 2 and 3
- `npm audit`: 0 vulnerabilities

---

# Barsmith 5.6.0 — one word bank, and a week you can see

## Wildcards folded back into the tiers

5.5.0 shipped wildcards as a fourth tier. On review that was the wrong shape, and this
undoes it.

The category only earns its own mode if the words are genuinely extreme. A handful were —
`orange`, `month`, `ninth`, `cusp` — but they are far too few to fill a session, and the
rest were ordinary polysyllables (`sombrero`, `avocado`, `wheelbarrow`) that belong on the
existing difficulty ramp. A fourth button that mostly serves tier-3 words is a second
mental model for no gain, and another word pass is already flagged.

So: **142 single words redistributed into tiers 1-3 by syllable count**, the WILD button
removed, and the Level selector back to three. Word bank grew from 3,874 to 4,016.

| Tier | Was | Now | Rule |
| --- | --- | --- | --- |
| 1 | 993 | 1,020 | one syllable |
| 2 | 1,366 | 1,425 | two syllables |
| 3 | 1,515 | 1,571 | three or more |

**25 multi-word phrases were dropped rather than placed** — including four originals
(`real estate`, `self esteem`, `star power`, `war zone`). Not a taste call: Tap-to-Lock
sends the prompt straight to dictionaryapi.dev, which 404s on a phrase, so a two-word
prompt opens a broken dictionary panel instead of a definition. The build validator now
*fails* on a multi-word entry rather than warning, so this cannot drift back in. If those
four should return, the dictionary lookup needs a fallback first.

Friday was Wildcard day in the programme; it is now **Sprint** — 2.0-2.5s intervals on
tiers 1-2, where deliberating costs you the word. That is the freestyle skill, and it is
the one thing the week was not training.

## The week strip

The daily card now shows the whole week: seven cells, Sunday to Saturday, with completed
prescriptions filled in, today outlined, and later days dimmed rather than drawn as
missed.

One session is a task. A week with gaps in it is a programme — and seeing Tuesday still
empty with two days left is a far better reason to open the app tomorrow than a card that
only ever describes today. `Progress` gains a matching **Programme** count, deliberately
distinct from the streak: a writer can practise daily for a month on freeform sessions
and never complete a single prescribed one.

Completion moved from a single `lastCompleted` marker to a set of days, capped at 120
with the lifetime count kept separately so it survives the cap. Records written by 5.5.0
are promoted on read, so nobody loses credit for a day already done.

## On daily reminders — a correction

Earlier I said web push works on installed PWAs and would carry over to the native wrap.
The first half is true and the conclusion was wrong, so before building it: **the Web
Push API cannot send you a notification without a server.** `pushManager.subscribe()`
yields an endpoint that some backend must sign and POST to with a VAPID key. There is no
client-side scheduling for a closed app — Notification Triggers never shipped past a
Chrome origin trial and does not exist in Safari.

Which means a daily nudge costs either a push backend plus mailing every subscriber's
endpoint off-device — directly against "stores nothing off your device", the app's real
differentiator — or waiting for the Capacitor wrap, where `@capacitor/local-notifications`
schedules on-device with no server and no data leaving the phone.

Recommendation: **wait for the wrap.** Building web push now means standing up
infrastructure, weakening the privacy story, and then deleting it. The week strip is the
backend-free retention mechanic that was actually available, so that is what got built.

## Verification

- `npm run verify`: 124/124 passed (was 119/119, minus the wildcard-specific tests,
  plus 11 for the week strip and the merged banks)
- Word bank: 4,016 words, 0 cross-tier duplicates, 0 multi-word entries
- `npm audit`: 0 vulnerabilities
- Driven end-to-end in headless Chromium: the week strip read `2 of 7` against a
  part-completed week, a 5.5.0-format record migrated with the day still credited, the
  Level selector reported three buttons and zero wildcard buttons, and no page errors.

---

# Barsmith 5.5.0 — today’s session

5.4.0 gave a writer evidence they were getting stronger. This gives them something to do
about it today.

## The daily prescription

The idle screen now opens with a session already chosen: level, scheme, pace, duration.
Tap once and it starts.

The problem this solves is decision cost, not motivation. Barsmith put five settings
between opening the app and seeing a single word. That is a good control surface for
someone who knows what they want to train, and a reason to close the app for someone who
just has ten minutes — and the second person is the one retention is lost on.

**Structured by weekday, not randomised.** A random draw each morning is noise a writer
cannot anticipate and cannot build a habit around. The week has a shape:

| Day | Session | Trains |
| --- | --- | --- |
| Sunday | Reset | Loose and short. Keep the streak, stay warm. |
| Monday | Foundations | Short concrete words at a steady pace. |
| Tuesday | Tempo | Locked to a real bar grid. Write to the count. |
| Wednesday | Scheme | Multiple words at once, bridged into one punchline. |
| Thursday | Heavy | Long multisyllabic words, without breaking flow. |
| Friday | Wildcard | Words with no clean rhyme. Slant it or restructure. |
| Saturday | Endurance | The long one. Hold quality past where it gets hard. |

Friday means something, and skipping it misses something specific. The specifics inside
each shape still vary week to week, so the same day never goes stale.

Derived from the local calendar date, so it needs no backend, works offline, turns over
at the writer’s midnight rather than UTC’s, and is the same for everyone on a given day.

Only a session started from the card completes the prescription. Freeform training is
still training — it just is not the programme, and a writer can have a long streak
without having followed it once.

## Wildcards are a real category

`wildcards.json` held fifteen words and was imported by nothing. It is now 167 and wired
in as tier 4, selectable as **WILD** beside levels 1-3.

It is deliberately *not* a fourth difficulty step. Tiers 1-3 are a ramp by syllabic
weight; this is a different axis — words with no clean perfect rhyme, awkward stress, or
a shape that resists landing on a beat. The training value is that autopilot fails and
the writer is pushed into slant rhyme and multisyllabic construction.

Two rules follow from that and are enforced rather than assumed:

- A wildcard may not also live in an ordinary tier — then it is not a wildcard. Twenty-
  seven candidates were dropped for this on the way in, and the build validator now
  checks all four banks against each other.
- Scheme mode blends tiers 1-3 so a writer bridges registers. It does **not** blend
  wildcards, because handing back an easy word to rhyme on removes the only thing the
  mode exists for.

## A full year of consistency

The practice grid was 26 weeks while practice days are retained for 400 — it was
discarding half a record writers had already earned. It is now 52 weeks. That many
columns cannot fit a phone at a legible cell size, so the grid scrolls horizontally and
opens at its right-hand edge, since the recent weeks are what anyone opens it to see.

## Verification

- `npm run verify`: 119/119 passed (build + full suite; was 97/97)
- 22 new tests: the prescription being stable within a day and varying across days,
  covering every weekday shape, and — the one that matters — only ever emitting settings
  the session engine will accept, asserted across all 365 days of a year rather than
  spot-checked; plus wildcard isolation in Scheme mode
- Word bank: Tier 1 `993`, Tier 2 `1,366`, Tier 3 `1,515`, Wild `167`, 0 cross-tier
  duplicates
- `npm audit`: 0 vulnerabilities
- Driven end-to-end in headless Chromium at iPhone viewport: the card applied its
  prescription to live settings and started against them (Thursday → Heavy → Level 3,
  5.0s, 15 min, first prompt `devastate`), completion flipped the card and recorded it,
  a freeform session correctly did **not** mark the prescription complete, WILD drew only
  from the wildcard bank, and the year grid rendered 364 cells scrolled to today.

### One wiring note worth keeping

Applying a prescription writes seven pieces of settings state. React batches those, so
calling `engine.startSession()` in the same handler starts the session against the
*previous* settings — the engine reads them from props. A pending flag defers the start
by one render. The end-to-end check above exists specifically to catch a regression here,
because the failure is silent: the session runs, just with yesterday’s configuration.

---

# Barsmith 5.4.0 — the training log

Barsmith has called itself a writing gym since the beginning while only ever showing
attendance: a streak counter, and nothing else. A gym that cannot show you getting
stronger has no answer to "why open this today", which is the whole retention question.

## Progress

A new screen, reachable from the idle nav and by tapping the streak chip — which was
previously display-only and is now the shortcut to the thing a writer actually wants
when they glance at it.

- **Bars, sessions, time trained** — lifetime, not windowed.
- **Consistency** — a 26-week grid of practice days, plus current and longest streak.
  Longest streak is the record that a missed day cannot take away.
- **Volume** — bars written per week over twelve weeks.
- **Vocabulary breadth** — how many of the ~3,900 bank words the writer has actually
  written a bar on, alongside the count claimed in the Vault. Distinct words, so
  re-drilling a favourite does not inflate it.
- **Personal bests** — most bars in a session, longest session.

Everything is computed on-device from data already stored. Nothing new is asked of the
writer, and nothing leaves the device.

## Lifetime totals that survive History rollover

This is the part that took the care. History keeps only the most recent 100 sessions,
so any cumulative figure derived from it would climb, plateau, and then **fall** once a
writer passed that mark — a "bars written" number that goes down is worse than no number
at all on a screen whose entire purpose is showing accumulation.

Totals are therefore stored independently, exactly as `practiceDays` already was, with
three rules that each exist because of a specific way this goes wrong:

- **Seeded once from existing history**, so anyone already using Barsmith opens the log
  to their real numbers rather than zeroes. Seeding recomputes rather than accumulates,
  which makes it safe to re-run.
- **Never marked seeded against an empty history.** Found while testing: a first launch
  on a fresh install wrote the seeded flag with zeroes, after which history arriving by
  any other route could never be folded in. Staying unseeded is safe precisely because
  seeding recomputes, and the flag only has to win before History begins rolling over.
- **Included in the JSON backup**, so a training log survives moving devices. Restoring
  a backup written before totals existed rebuilds them from the restored history.

## Smaller things

- Time trained renders as decimal hours past the hour mark: "635" reads as noise where
  "10.6h" reads as a season of work. The two-part "10h 35m" form was tried first and
  wrapped to a second line in a third-width stat tile, breaking the row's alignment.
- The vocabulary bar shows a visible sliver for any progress at all. Against a ~3,900
  word bank, real early work rounds to 0% and the bar read as "you have done nothing".
- The idle nav went from three buttons to four, in a 2×2 grid on phones.

## Verification

- `npm run verify`: 97/97 passed (build + full suite; was 68/68)
- 29 new tests covering the training-log arithmetic — idempotent seeding, the
  empty-history seeding trap, distinct-word breadth, personal bests as maxima, longest
  streak across month and DST boundaries, weekly bucketing, and a fully empty install
- `npm audit`: 0 vulnerabilities
- Bundle: 281 KB JS (88 KB gzip), 30 KB CSS (6 KB gzip)
- Driven end-to-end in headless Chromium at iPhone viewport against a seeded five-month
  training history: totals seeded correctly from existing sessions (182 bars across 73),
  a reload left them unchanged rather than double-counting, and a cleared install showed
  the empty state rather than a wall of zeroes.

---

# Barsmith 5.3.0 — the bar card

5.2.0 got a writer's work out of the app as text. This release is about the other
direction: giving Barsmith a reason anyone hears about it at all.

Until now nothing Barsmith produced could travel. Bars left as `.txt`, and nobody
posts a `.txt` — so a writer could do their best work here and it would never point
anyone back. Writers share bars constantly; the app just had no part in it.

## Bar cards

Every individual bar in Summary and History now has a **Share** action that renders it
as a 1080×1080 image and hands it to the OS share sheet.

- Drawn on-device with the self-hosted Inter and the anvil mark, so it works offline
  like the rest of the app and looks like Barsmith without needing a watermark.
- Square deliberately: it is the one ratio that survives an Instagram feed post, a
  story, and an X timeline without being centre-cropped into nonsense.
- The prompt word sits above the bar, grouped with it rather than pinned to the top of
  the frame, so the label reads as belonging to the bar at any line count.
- Where the OS cannot share files, the button becomes *Save Image* instead of offering
  a share that would quietly turn into a download.

### Two details that took real care

**A writer's line breaks are structure, not whitespace.** The first working version
picked the largest type that fit the frame, which wrapped each of a four-line bar's
lines in two — eight visual lines with nothing distinguishing a new bar from a
continuation. It read as a paragraph and destroyed the rhythm that made the bar worth
sharing. `layoutBarText` now hunts for the largest size at which *nothing* wraps before
settling for merely fitting, accepting smaller type as the price of intact structure.
Where wrapping is unavoidable, continuation lines are indented — but only on
multi-line bars, since on a single bar a hanging indent reads as deliberate poetic
indentation the writer never asked for.

**iOS only honours `navigator.share()` inside a live user gesture.** Any `await` before
the call — encoding the canvas, loading the font — drops the activation and the sheet
silently never opens. The card is therefore rendered when the modal opens, so the Share
handler does no async work before sharing. A dismissed sheet is also distinguished from
a real failure: reacting to a cancellation with a fallback download would drop an
unwanted file in someone's camera roll.

## Built for the native path

`services/share.js` is the single seam between Barsmith and the OS share sheet, and
every caller goes through it for a plain outcome string. Wrapping in Capacitor means
swapping the Web Share call in that one file for `@capacitor/share`; no UI moves.

## Fixes found along the way

- **The service worker was under-precaching.** The extension allowlist covered JS and
  CSS only, so self-hosting the font in 5.2.0 and drawing the brand lockup in the card
  renderer each slipped through, leaving an offline install to boot without its typeface
  and then without its logo. The precache now takes everything Vite emits into
  `assets/` — anything there is by definition something the build references — and the
  build test asserts against the unfiltered directory listing rather than an allowlist,
  so the next new asset type cannot repeat this. A second test covers manifest icons.
- `downloadText` and the share fallback had separate copies of the object-URL dance;
  `downloadBlob` is now the single implementation and `downloadText` wraps it.
- `dateStamp` threw on an Invalid Date, which would have turned one malformed history
  record into a dead export button. It falls back to today.
- *Copy All Bars* and the per-session *Copy All* claimed success even when the clipboard
  write rejected or the API was absent entirely — a checkmark over a failed copy of a
  whole session is how someone loses a verse. Both now report the real outcome.

## Verification

- `npm run verify`: 68/68 passed (build + full suite; was 47/47)
- 20 new tests: bar-card layout rules, share-outcome handling, manifest-icon precaching
- `npm audit`: 0 vulnerabilities
- Bundle: 270 KB JS (86 KB gzip), 29 KB CSS (6 KB gzip), 48 KB font, 44 KB lockup
- Cards rendered end-to-end in headless Chromium at iPhone viewport across three shapes
  — a one-line punchline, a four-line block with the writer's own breaks, and a bar far
  too long for the frame — and inspected at full 1080×1080. Confirmed the *Share* button
  correctly gives way to *Save Image* where file sharing is unsupported.

## Still required before replacing production

The real-device checklist in README.md remains the manual gate, and it now has a check
that automation genuinely cannot substitute for: the iOS gesture rule only bites on a
real device, so the share sheet has to be opened on hardware and an actual image
carried through to Instagram or Messages.

---

# Barsmith 5.2.0 — public-release pass

5.1.0 was already a solid, careful build: the session engine, timers, audio clock, draft
recovery, and accessibility work were in good shape. This pass is not more of that. It
closes the three gaps that stood between a well-built app and a public release — work
that could not leave the app, a crash that stranded it, and a distribution story that
did not exist — plus a set of platform-correctness fixes found along the way.

## Bars can leave the app

Previously, written bars had exactly two exits: a Copy button one note at a time, or a
JSON backup that only Barsmith can read. For a tool whose premise is capturing ideas,
that made it a place bars went into rather than came out of.

- **Summary** now offers *Copy All Bars* (every bar from the session, blank-line
  separated, no labels — the shape you paste straight into a verse) and *Export .txt*
  (the session with its date, stats, word labels, and frozen-word list).
- **History** now offers *Export All Bars* for the entire archive as one text file, and
  *Copy All* per session.
- Plain text rather than Markdown, deliberately: the realistic destination is a notes
  app, a lyric doc, or a DAW comment field, none of which render Markdown.
- Sessions with nothing written are skipped in the archive export rather than padded
  with empty stanzas, and the header states how many bars and sessions were actually
  written out.

The JSON backup is unchanged and still the way to restore Barsmith itself. The two are
now documented as distinct, because conflating them is why bars used to be stuck.

## History is searchable

An archive that holds 100 sessions is only an archive if you can find things in it.
History now filters across bar text, the word each bar was written on, and frozen words,
and reports how many sessions matched instead of silently showing a shorter list.

## A crash no longer strands your work

There was no error boundary. Any render-time exception unmounted the tree and left a
black screen — the worst possible failure here, because every saved bar was sitting in
`localStorage`, intact and completely unreachable, with no UI left to export it through.

`ErrorBoundary` now catches that and offers a backup download that reads `localStorage`
directly, so it keeps working even when the component tree that crashed was holding
corrupt data. It also offers a reset for the one failure a reload cannot fix — a
malformed record that crashes every render — which clears only Barsmith's own keys, and
only behind a confirm that tells you to take a backup first.

## Platform correctness

- **Inter is now self-hosted.** It was loaded from the Google Fonts CDN, which cost two
  extra DNS+TLS handshakes on a render-blocking path, sent every visitor's IP to a third
  party, and — because the service worker deliberately never touches cross-origin
  requests — was the one asset a fully "offline-capable" PWA still could not render
  offline. Launching in airplane mode dropped the whole interface to system sans. The
  `latin` subset of the Inter variable font is now vendored, hashed by Vite, and included
  in the service-worker precache. One file covers every weight the UI uses, so
  `font-medium` now gets a real 500 cut instead of a synthesized one.
- **PWA icons fixed for install surfaces.** `icon-512.png` shipped with a fully
  transparent background and near-white artwork, so any light launcher background made it
  nearly invisible; it now has an opaque `#050505` field. Neither icon declared
  `purpose: "maskable"`, so Android applied its adaptive mask anyway and cropped the ends
  off a wordmark that spanned the full frame. A dedicated maskable icon uses the anvil
  alone, sized inside the mask's safe circle.
- **Real page metadata.** `index.html` had no description, canonical URL, or Open Graph
  tags, so every shared link rendered as a bare URL. Added description, canonical,
  Open Graph and Twitter card tags with a generated 1200×630 share image, `color-scheme:
  dark`, and `WebApplication` structured data. The share card is rendered from the app's
  own Inter font and anvil mark by `scripts/make-brand-assets.py`.
- **Splash no longer blocks.** It was a hard 2.2s gate with no way past it, in front of a
  tool whose entire job is catching an idea before it goes — and nothing was actually
  loading during it, since word banks are bundled and preferences are a synchronous
  read. Now ~0.9s, and a tap or keypress skips it. Measured time-to-writable dropped from
  2.2s+ to ~0.8s.
- **Node engine pin corrected.** `package.json` pinned `20.x`, which reached end of life
  in April 2026, and disagreed with the Vercel project's configured `24.x`. Now
  `22.x || 24.x`.
- **`postcss` advisory cleared.** GHSA-r28c-9q8g-f849 (high, path traversal via
  `sourceMappingURL`) landed against the pinned `postcss` after 5.1.0 shipped. Build-time
  only, and fixed within the existing semver range — `npm audit` is clean again.

## Cleanup

- `flattenNotes` had one implementation in `App.jsx`, passed down by prop. It is now the
  canonical copy in `services/export-text.js`, so the on-screen Bar Pad and the exporters
  cannot drift apart on note shape.
- Blob-download logic was inlined in `App.jsx`; it is now `services/download.js`, shared
  by the backup export, both text exports, and the crash-rescue screen. The
  mobile-Safari revoke-timing workaround is written down once instead of duplicated.

## Verification

- `npm run verify`: 47/47 passed (build + full suite; was 16/16)
- 31 new tests covering the exporters, the error boundary, History search, and clipboard
  success/failure reporting
- Word bank: Tier 1 `993`, Tier 2 `1,366`, Tier 3 `1,515`, 0 cross-tier duplicates
- `npm audit`: 0 vulnerabilities
- Bundle: 262 KB JS (83 KB gzip), 29 KB CSS (6 KB gzip), 48 KB font
- Driven end-to-end in headless Chromium at iPhone viewport: session → two bars on one
  locked word → Summary → both text exports → History. Confirmed both bars survive into
  the exported file, and that the only outbound requests are the dictionary and rhyme
  APIs — no font CDN.

## Still required before replacing production

The real-device checklist in README.md has **not** been run as part of this pass and
remains the one manual gate. Two new items were added to it: the text-export round-trip
(iOS Safari is historically flaky about programmatic downloads) and the home-screen icon
check on both platforms.
