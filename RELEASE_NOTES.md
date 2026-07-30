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
