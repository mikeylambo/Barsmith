# Barsmith 5.17.0 — a restore you can take back

The one path in the app that could destroy a writer's work, hardened before anybody is
invited in.

## The failure was never a corrupt file

It was a perfectly valid one that happened to be **old**. Back up Monday, write Wednesday,
restore Monday's file to "get your words back" — and Wednesday is gone, with a confirm
dialog reading *"Existing local data will be replaced"* as the only thing that stood in the
way. Nothing in that sentence tells you that you are about to lose a day, and the filename
certainly doesn't.

## Two fixes, and the first one matters more

**The dialog shows the delta.** Not a warning, a comparison:

```
This backup has FEWER sessions than this device. Restoring will replace what is here.

On this device now: 2 sessions, 0 saved words.
In this backup: 1 session, 0 saved words, 0 personal words.
```

`2 sessions → 1 session` is legible in a way "data will be replaced" is not. This is the
change most likely to stop the mistake happening at all, which beats any amount of
recovery afterwards.

**And if it happens anyway, it is reversible.** The current state is snapshotted
immediately before the overwrite, and *Saved Words* then offers **Undo Restore**, labelled
with what was there — "this device had 2 sessions and 2 bars". Kept in localStorage rather
than pushed out as a download, because on a phone a download means a share sheet and a trip
to Files, which is friction at the exact moment somebody is already anxious about their
writing. It survives closing the app, which is usually when the loss gets noticed.

If storage refuses the snapshot, the restore says so and asks again rather than proceeding
on the promise of an undo that would not exist.

Restore and undo now run through one code path. An undo that reapplied live state
differently from a restore would leave the app in a third state neither of them describes.

## Verification

- `186 passed` (7 new, including the Monday/Wednesday scenario end to end at the
  storage layer, and the quota-refusal branch)
- Driven in a real browser through the actual mistake: two sessions, restore a
  one-session backup, undo, Wednesday's bar comes back — and the undo is still offered
  after a full reload
- Device checklist `7/7`

---

# Barsmith 5.16.0 — one word reference, reachable from everywhere

The question was whether a word frozen in a past session should be tappable in History.
Following it up found the larger version of the same gap: **Rhyme Search had no
definitions either.**

So the definitions — 6,561 words, already built, already bundled, already precached —
were reachable by exactly one route: locking a word mid-session. Which is the single
moment a writer is least able to stop and read, because they are in the middle of writing
a bar. Paid-for capability, effectively unreachable.

## What changed

**Rhyme Search now shows meaning.** Up to two senses, POS-tagged, above the rhyme groups.
`scorch` reads *noun: a surface burn · verb: make very hot and dry*, and then the perfect
rhymes. Entirely on-device, so it works in airplane mode like everything else in that
panel.

**Frozen words in History are buttons.** Tap one and the same panel opens on that word.
It searches on mount and leaves the keyboard shut — arriving with the word already in
hand, the useful thing is the answer, not a focused empty box. Cold-opening Rhyme Search
from the home screen still focuses the input as before.

The result is one word-reference surface reached three ways: mid-session (where it also
carries the notepad), from Rhyme Search, and from a word you froze weeks ago.

The definitions payload is fetched independently of the rhyme index rather than awaited
alongside it. Rhymes are what the panel is for; the meaning block appears when it appears
and its absence never delays them.

## Verification

- `179 passed` (6 new: both senses render, search-on-mount, cold open unchanged,
  out-of-bank words still get rhymes, the History chip opens the panel, closing returns)
- Real browser against the production bundle with the actual 800KB/730KB payloads:
  `scorch` returns both senses plus porch/torch/blowtorch, `orange` returns its citrus
  definition, the keyboard stays shut from History and opens on a cold launch
- Device checklist `7/7`

---

# Barsmith 5.15.0 — a privacy policy, and the second page that exposed two bugs

## The policy

`/privacy.html`, linked from Settings. App Store Connect requires a hosted privacy policy
URL before you can submit anything, so this had to exist regardless — but it was worth
writing properly rather than pasting a generator's output, because the app's actual answer
is unusually good and a generic template would have undersold it.

It lists **every event the app can send, by name**, states that properties are bucketed
ranges rather than exact figures, and explains that content cannot reach the wire by
construction rather than by care. The one exception — tapping a word for synonyms sends
that single word to a public dictionary — is named in its own section rather than buried.

The contact line is a marked placeholder. **It must be filled in before submission.**

## Adding a second page broke two things that had been fine by accident

**The service worker cached every navigation under `/`.** Harmless for as long as the app
was the only page on the origin — and the moment a second one existed, visiting the
privacy policy would have overwritten the cached app shell with it, so an *offline launch
from the home screen would have opened a legal document instead of Barsmith.* Now only the
shell itself may be stored under `/`, and an offline navigation falls back to the shell,
which is the one page guaranteed to work without a connection.

**There were two copies of the service worker.** `public/sw.js` looked like the real one —
it was the obvious file to edit, and Vite copied it into `dist/` on every build. Then
`scripts/inject-sw-precache.js` overwrote it a moment later with its own inlined template.
Editing `public/sw.js` had no effect on the shipped worker whatsoever, which is exactly how
the fix above appeared to be applied while the built output still had the bug. The decoy
is deleted; the generator is now the only source.

## `/privacy` vs `/privacy.html`

Worth recording because it nearly shipped wrong. Served as a directory index, the page
answered on `/privacy/` but fell through to the SPA on `/privacy` — the exact URL you would
hand to Apple. It is now a flat file at `/privacy.html`, which every static host resolves
identically, with a Vercel redirect from `/privacy` for the tidier link.

## Verification

- `173 passed`; device checklist `7/7`, including the offline precache contract
- Confirmed in a real browser that after visiting the policy, the cached shell is still the
  app — the assertion that would have failed before the fix

---

# Barsmith 5.14.0 — the slider that wasn't the volume

Three things, one of which was not the bug it looked like.

## "Metronome volume not working at all"

The volume setting itself turned out to be fine. I checked it three ways before touching
anything — driving the hook directly, driving the whole app in a fake DOM, and driving the
**real production bundle in a real browser with a spy on the audio graph** — and in every
case the gain reaching the oscillator scaled exactly as it should: `0.45` at full, `0.225`
at half, nothing at all at Silent, in both timer mode and BPM mode.

So the interesting question was what someone was actually adjusting. Here is what the
Timing block looked like:

```
[ METRO ]  ———————•———————  3.5s
```

A button labelled **Metro**, and immediately to its right, an unlabelled slider. Every
other slider in the app has a word in front of it — `BPM`, `Every`. That one didn't. It is
the *word-change pace*, but sitting where it sat, it reads as the metronome's slider, and
the only slider a metronome has is volume. Dragging it changes how often words appear and
does nothing whatsoever to the click.

That is not a misreading — that's the row being wrong. Split into two labelled rows, so
the only thing next to Metro is Metro:

```
EVERY    ———————•———————  3.5s
CLICK                    [ METRO ]
```

And because a volume control you cannot hear is a volume control you cannot trust,
**dragging the Settings slider now plays a click at that level.** Drag it, hear it. No
inference required.

The volume path is now pinned by tests on both code paths — the BPM look-ahead scheduler
and the timer-mode interval are genuinely different code, and a setting that only reaches
one of them is the ordinary way this feature breaks. Both assert the number handed to the
gain node, not the property that was set.

## Save Image is gone, where the share sheet exists

iOS already offers *Save Image* and *Save to Files* from the share sheet. A second in-app
button did the same job worse: a download into a folder you then have to go find. It now
appears **only** on browsers whose share cannot carry a file, which is exactly the case it
was written for. Verified both ways — share-capable shows Share alone, share-incapable
shows Save Image alone.

## Practice

British spelling, American app. Fixed.

## Verification

- Automated tests: `173 passed` (3 new — the two volume paths and the default)
- Device checklist: `7/7` automated items pass
- Real-browser check against the production bundle: pace row, preview click, and both
  bar-card button states

---

# Barsmith 5.13.0 — recordings you can actually watch

Four things from a real iPhone, three of them about media.

## The recording was a .webm

Fixed, and the fix is a one-line reorder that matters more than it looks. The codec
preference asked for WebM first and MP4 last. Safari has since gained WebM recording, so
iOS happily produced a `.webm` — **a file Photos cannot open, cannot preview, and will
not accept into the camera roll.** A recording nobody can watch is not a recording.

MP4 is now asked for first. Every browser that records at all can do H.264 in MP4; WebM
stays as the fallback for the ones that cannot.

## It went to Files, not Photos

A plain download link always lands in Files on iOS. The share sheet is the only route
Apple gives a web app to Photos, and it is the same seam the bar card already uses — so
*Save Recording* now goes through it. Tap it, then *Save Video*.

## No way to check the take

There is now a **player on the Summary screen**. Watch it back before deciding whether to
keep it. Previously the only way to see a take was to export it, which on a phone means
leaving the app — so nobody checked whether the framing or the audio were any good until
the session was already over.

## Saving a card opened the file browser first

This one was a real bug with a non-obvious cause. iOS decides which actions to promote
from **what the share payload contains**: files alone reads as *"share this image"* and
puts Save Image near the front, while adding a `text` caption makes it a generic share
and promotes *Save to Files* instead.

Barsmith was attaching the bar's own words as a caption. Removing it is the whole fix —
the share sheet now opens on the image actions. Pinned by a test, for both images and
video, because nothing in a browser would have caught it.

## Metronome volume

A click you cannot turn down is one you turn off. **Settings → Metronome**, 0 to 100%,
persisted. Silent still keeps the bar grid running, so words change on the beat while you
work over your own instrumental — which is the case that prompted it.

## Verification

- Automated tests: `170 passed` (2 new, on the share payload)
- Confirmed the recorder asks for MP4 before WebM, and that both `shareImage` and
  `shareFile` hand `navigator.share` a files-only payload

Everything else on the device pass came back clean: permission denial, front camera, BPM
and metronome, keyboard-open scrolling, safe-area in portrait and landscape, the share
sheet itself, and an Airplane-mode cold boot.

---

# Barsmith 5.12.0 — the beta build

Thirteen notes from a real phone, and one thing runs through most of them: the app was
explaining itself to the writer instead of getting out of the way.

## Things that were in the way

**Pinch-zoom is off.** `maximum-scale=5` let the whole UI be dragged out of frame
mid-session. This is an app surface, not a document, and nothing in it is small enough to
need zooming — OS text scaling still applies, which is the accessible route anyway.

**Tapping a word no longer opens the keyboard.** Locking a word is for *reading* what it
rhymes with; `autoFocus` put a keyboard over that the instant it appeared.

**The session view drops its settings readout.** `Scheme · Lvl 3 · 4w` restated dials the
writer had set thirty seconds earlier and could not change from there. Only the
saved-words counter survives, because that is progress through a queue rather than a
restatement of a dial. **History rows** had the same disease, in the one place a writer
looks back at what they *made* — they now show bars written.

**The daily summary wraps instead of truncating.** A BPM session is five facts wide and
`10 min` fell off the end as `10…` — the one that says how long this will take.

## Things that gave away too much

**Progress loses the year grid.** Fifty-two squares is a GitHub contribution graph, and
everyone who has seen a repository recognises it, which made a writing tool look like a
side effect of how it was built. Same data as a level meter: one bar per day across five
weeks, full height where work happened. Five rather than ten because seventy bars on a
phone are hairlines — legible as a texture, useless for *"did I train on Thursday"*.

**Vocabulary drops the denominator.** `0 / 6,614` published the bank size and turned a
growth number into a completion percentage against a total nobody needs to know.

**Two panels are gone rather than fixed.** *Programme* counted completed daily
prescriptions as distinct from the streak, which counts any session — a real difference,
and one nobody can infer from the word, sitting third in a row where the other two
explain themselves. The question it answered is now an analytics question, which is where
it belongs rather than on a writer's screen. *Volume* was bars-per-week over twelve
weeks: empty for a new writer's first month, and answering roughly what the level meter
directly above it already showed.

## Things that were named from the inside

**Vault is now Saved Words**, and **End Drill is End Session**. "Vault" is a metaphor the
app never explains; "drill" assumes a rapper, when the mechanic — practise the words you
chose to keep — serves a songwriter or someone building vocabulary just as well. The
rename runs through the nav chip, the empty state, the backup copy, the How To and the
text exports. Storage keys keep their old names: renaming `barsmithVault` would break
every existing install for a cosmetic gain.

**Settings is its own screen**, reached from the ⚙ in the header. Privacy was tucked
inside the Vault, which made a promise about what leaves the device findable only by
someone already looking for it, on a screen named after something else. Haptics moved
there too.

**Saved Words rows drop the syllable and rhyme census.** Engine output dressed as a
feature: interesting to build, noise to read.

**Rhyme Search drops the stress analysis and the group descriptions.** Somebody looking
for a word does not need to be taught what assonance is.

## The How To, rewritten

Eleven steps became eleven better ones under two rules: **say what a thing is for, not
what it does**, and **never explain a term the screen itself does not use**.

The old copy described controls — *"Set BPM and bars-per-word"* — and answered objections
nobody had formed yet: *"practice to the actual time signature, not a vague timer."* The
new one opens on the exercise:

> **The Session** — A word lands. Build a bar around it before the next one arrives. That
> is the whole exercise, repeated until reaching for a rhyme stops being something you
> think about.

Level and Scheme stay near the top because they are the only controls labelled with bare
numbers. Everything after them is optional.

## Verification

- Automated tests: `168 passed`
- Device checklist, automated half: `7/7 passed`
- Every change confirmed in a browser at iPhone width, including that no screen says
  "Vault" or "Drill" and that locking a word leaves focus on the word rather than a text
  field

Still hardware-only before this is called final: install to home screen, camera and mic
permission, the recording round-trip, front-camera mirroring, BPM by ear, keyboard-open
scrolling, safe-area spacing in portrait and landscape, an Airplane-mode cold boot, and
the iOS share sheet.

---

# Barsmith 5.11.0 — 1,200 more words, chosen by measurement, and a way to tell if any of this works

## The bank grows by arithmetic instead of taste

Every earlier expansion was hand-authored: I thought of words, then checked them. That
finds the obvious ones and misses everything nobody happened to think of. The
pronunciation payload already holds 41,257 words, and after removing inflections, proper
nouns, rarities and anything over four syllables, **14,632** of them were plain candidates
no one had ever looked at.

Two things exist now that did not last time the bank grew, and together they turn the job
from taste into measurement. The **rhyme engine** can say whether a word lands on an
ending its tier is short of — rhyme-tail diversity being the measure the audit already
uses. **WordNet** can count senses, and better, can answer whether a word is concrete: its
noun tree splits at the top into `physical_entity` and `abstraction`, so "can you picture
it" is a question the data answers rather than one a suffix rule guesses at.

`scripts/propose-words.py` scores every candidate on those, plus a frequency *band* —
because too rare is unusable and too common is a word a writer would have reached for
unprompted. The result:

| Tier | Words | Distinct endings | Top-10 endings cover |
| --- | --- | --- | --- |
| 1 | 1,223 → **1,623** | 368 → **449** | 11.9% → **10.0%** |
| 2 | 2,035 → **2,435** | 578 → **667** | 18.2% → **16.6%** |
| 3 | 2,156 → **2,556** | 457 → **517** | 44.7% → **40.9%** |

**5,414 → 6,614 words**, and every quality measure improved rather than diluting. Tier 3's
abstract-noun share fell 29.4% → 25.5%. New words include `roach`, `pierce`, `weld`,
`fluke`, `groin`, `jinx`, `transplant`, `charcoal`, `mouthpiece`, `ballast`, `deluge`,
`nucleus`, `pinnacle`, `honeycomb`, `thoroughbred`, `welterweight`, `turntable`.

The first two attempts were wrong in instructive ways. Ranking by sense count and raw
frequency put `was`, `then`, `have` and `want` at the very top — grammatical furniture
scores brilliantly on both. And Webster's Second lists `adam`, `arthur`, `mecca`,
`kremlin` and `merlin` as lowercase headwords, so the filter that keeps surnames out of
the pronunciation payload waved all of them through; WordNet preserving lemma
capitalisation is what finally caught them.

One incidental result: **`anvil` — the brand's own icon — is now a prompt word.** It was
not before. A test that assumed otherwise is how we found out.

## Phrase rhymes are gone

They worked, and `laboratory` → *elaborate story* was genuinely good. But the same
construction that produces that also produces *for plunge*, and a reference whose
suggestions have to be sifted is worse than one that offers fewer. Single words only.

## Analytics — and an honest change to the promise

Barsmith shipped its retention features — the training log, the daily prescription, the
week strip — with no way to tell whether any of them work. This is that way, and it is
deliberately the narrowest version of it.

**Nothing you write is ever sent.** Not a bar, not a vault word, not a search. What goes
out is bucketed counts: that a session happened, roughly how long, roughly how many bars,
and whether it came from the daily card or from setting the dials by hand — which is the
one comparison that answers whether the prescription earns its place.

Three rules, each with a test:

- **Never content, structurally.** Every property value is filtered against
  `/^[a-z0-9+_-]{1,24}$/`, so there is no shape of call that carries free text — a bar
  fails on its spaces before its length. The event name list is fixed; an unknown one is
  dropped.
- **Bucketed, never exact.** "12 bars" is a fact about a person; "6-15 bars" is a fact
  about a population, and only the second is anyone's business. The install date is kept
  on-device so retention is measurable at all, and only ever leaves as a range.
- **Off means off.** The opt-out is read at call time rather than cached, so the toggle
  stops the very next event instead of the next reload. Do Not Track is honoured without
  being asked.

The provider sits behind a seam like `services/share.js` — Vercel Web Analytics by
default, cookieless, served from the deployment's own origin, and off entirely on
localhost.

This does change what the app promised. The old line was "stores everything locally and
sends nothing anywhere"; the honest version is now in the copy, and it is the one that
matters: **your bars never leave the device.** The switch lives in **Vault → Privacy**
next to Backup & Restore rather than buried three menus deep, and the How To carries the
disclosure as its own step.

Verifying that in a browser turned up an inaccuracy in the first draft of the copy, which
claimed no vault word is ever sent. Tapping a word for its synonyms still calls a public
dictionary API with that one word — true before this release and unchanged by it, but the
privacy panel had no business implying otherwise. It now names the exception directly.

## Verification

- Automated tests: `170 passed` (12 new, all on the analytics guarantees)
- Word bank: `6,614` words, `0` cross-tier duplicates, every one pronounceable and `6,561`
  defined offline
- Production build passed · `npm audit`: `0 vulnerabilities`

---

# Barsmith 5.10.0 — phrases, offline definitions, and a vault that tells you something

5.9.0 put rhymes on-device. This finishes the reference: the last network dependency is
gone, the engine now does the thing no rhyme API does, and the vault stopped being a list
of words with nothing to say about them.

## Phrases — where "nothing rhymes with orange" stops being true

`findPhraseRhymes` cuts the query's stressed tail at every syllable boundary and looks for
a word ending in the back half and a word ending in the front:

```
orange       for plunge · for sponge · or plunge · your sponge · four plunge
laboratory   elaborate story · elaborate glory
cinema       in eczema · been enema · skin eczema · win maxima
purple       burp hull · chirp skull · antwerp dull
wasabi       job see · job free · bob three · mob see
```

This is the move the writers Barsmith is for actually make, and no rhyme API offers it,
because it is a search over pairs rather than a lookup.

Generated output is held to a higher bar than looked-up output. Nobody sees an obscure
dictionary entry unless they type it; a phrase puts two of them side by side and presents
the result as a suggestion. Unfiltered, the first version returned:

```
cinema   aluminium a · aluminium the · molybdenum a
wasabi   job be · job he · job me · job we
purple   burp hull · burp skull · burp dull · burp null
```

Three filters, each pinned by a test: both halves must be **the size of the slot they
fill** (a four-syllable word cannot answer a one-syllable front), the back half **cannot
be a function word** (it is where the rhyme lands, so it has to be something a listener
registers — they stay allowed at the front, where *for plunge* is a perfectly good half
of a bar), and no **one front word** may take more than three slots, because "burp hull,
burp skull, burp dull, burp null" is one idea, not four.

## Definitions work with no connection

`scripts/build-definitions.py` writes a WordNet gloss payload for the word banks — the
only place the Tap-to-Lock panel ever opens from. 5,361 of 5,414 prompts defined, 204KB
gzipped.

**Two senses wherever they exist**, and that is the point rather than a detail: the app's
whole thesis about which words earn a place is that a punchline turns on a word's *other*
meaning. A panel showing only the first sense hides the half that makes the bar. 4,231
words carry a second one.

The network entry still wins when there is one — dictionaryapi.dev has more senses and
fresher usage than a WordNet dump. The local copy is what makes the panel work without it,
not a preferred source. Outside the banks, a personal word still falls back to the network
and says so plainly when there isn't one.

## The vault says something now

Every row carries its own shape, computed on-device:

```
LABORATORY   4 syl · 60+ multi
NATION       2 syl · 60+ perfect
SILVER       2 syl · 1 perfect
ORANGE       2 syl · slant only
```

A writer scanning saved words can see which are rich and which are dead ends without
opening any of them. Counts at the result cap read `60+` rather than `60`, because
`nation` has hundreds and saying otherwise would be a small lie in a place there is no
reason to tell one.

## Warmed before they are wanted

Both payloads — 289KB of pronunciations, 204KB of definitions — stay out of the main
bundle so the idle screen paints fast, and are then fetched on `requestIdleCallback` once
the app is up. The moment they are actually needed, a writer tapping a word mid-round, is
the worst possible moment to begin a download. The service worker caches both, so it is a
first-visit cost only.

## Verification

- Automated tests: `165 passed` (11 new, against the real payloads)
- Verified in the browser **with the network down**: phrase rhymes, the definition panel
  showing both senses of `drill`, and vault rows all working
- Production build passed · `npm audit`: `0 vulnerabilities`

Definitions are Princeton WordNet (notice in `src/data/DEFINITION-LICENSE`);
pronunciations are the CMU Pronouncing Dictionary (`src/data/PRONUNCIATION-LICENSE`).

---

# Barsmith 5.9.0 — the rhyme reference, offline

Barsmith has called itself "a writing gym, rhyme reference, and idea-capture tool" since
5.2.0. Two of those three were true. Rhymes came from three Datamuse calls, which meant
the feature a writer reaches for most was the only part of an offline-first app that
needed a network — dead in airplane mode, dead on the subway, dead in a booth with no
signal. That is now the app's own code, running on the device.

## It answers a better question, too

A flat list of perfect rhymes is a beginner's tool. The writers this is built for work in
*multis* — runs where the vowels line up across two, three, four syllables and the
consonants are free to drift. So results are grouped by what kind of rhyme they are:

| Group | What it means | Example |
| --- | --- | --- |
| **Perfect** | the stressed tail lands whole | `nation` / `station` |
| **Multi** | 2+ syllables agree, offset from the stress | `sacrament` / `detriment` |
| **Slant** | the vowel holds, the consonants bend | `silver` / `pilfer` |
| **Assonance** | the vowel run matches, consonants free | `hostile` / `gospel` |

What that looks like on the words people say cannot be rhymed:

```
orange      slant      lozenge, challenge, scavenge, damage, image, knowledge, language
silver      slant      pilfer, river, liver, giver, quiver, shiver, sliver, differ
month       slant      once, seventh, eleventh, corinth, millionth, billionth
laboratory  multi      mandatory, statutory, lavatory, transitory, excretory, dilatory
```

`month` and `orange` return **no perfect rhymes**, because they have none — the engine
says so rather than padding the list. It still hands over the near misses that actually
get used.

## Four judgements that were wrong first

The unit of comparison is the **rime**: a vowel plus every consonant up to the next vowel.
Comparing rime-by-rime from the end sidesteps the alignment problem a raw phoneme walk
has, where `cat` and `cast` fall out of step on the coda and score as unrelated. Past
that, four decisions each started out wrong, and each now has a test pinning it:

- **Match against the query's stress, not the candidate's.** Keying every word by where
  its own primary stress falls meant `time` and `lifetime` got different keys and never
  met. A rhyme is the query's stressed tail reappearing at the end of another word; where
  that word carries its own main stress is not the query's business.
- **Weight the final consonant hardest.** Averaging coda positions evenly scored `orange`
  against `government` as a rhyme, on the strength of a shared `N`, even though `JH` and
  `T` have nothing in common.
- **Treat secondary stress as a wildcard.** CMU writes `lifetime`'s full `AY2` and
  `company`'s reduced word-final `IY2` identically. Demanding an answer breaks `money` /
  `company` to fix `time` / `lifetime`, or the reverse.
- **A run of unstressed schwas is not assonance.** Schwa is the most common vowel in
  English, so before the stress test `cinema` came back with `london`, `services` and
  `available`.

## Every prompt is pronounceable

Tap-to-Lock sends the prompt straight to the engine, so a bank word the payload cannot
pronounce is a dead panel on a word Barsmith itself chose. CMU is missing **151** of them.
92 are derived by rule — compounds (`cashback` → `cash` + `back`, with the trailing
stress demoted, because English says BACKstab not backSTAB) and Latinate forms
(`weaponize` → `weaponization`). The remaining 59 are loanwords no rule can reach —
`wasabi`, `quesadilla`, `didgeridoo`, `trebuchet` — hand-authored in
`pronunciation-extra.json`. **The build fails if any bank word is left without one.**

## Size, and where it sits

Frequency alone turned out to be the wrong filter for what to carry: in the Zipf 2.0-2.5
band, **44% of CMU's entries are surnames and brand names** — `borthwick`, `botelho`,
`hesketh`, `cigna` — sitting right beside `curmudgeon`, `bollard`, `oleander` and
`minaret`. So the test is "is this a word", answered by Webster's Second, plus a second
clause for anything common enough today that a 1934 dictionary missing it proves nothing
(`internet`, `podcast`, `emoji`, `vibe`).

That lands at **41,257 words, 289KB gzipped**. It is fetched on first use rather than at
start-up — the app's own bundle is 99KB and nothing on the idle screen needs a rhyme — and
precached by the service worker, so it is there offline from the second visit on. Queries
run in about **4ms**.

The dictionary panel mid-session now shows the strongest kind of rhyme a word has and
says which kind it is. Definitions still need the network; when it is gone the panel says
so, and the rhymes are still right.

## Verification

- Automated tests: `154 passed` (22 new, against the real payload rather than a fixture)
- Bank coverage: `5,414 / 5,414` prompts pronounceable, asserted in both build and tests
- Verified in the browser with the network down: search and Tap-to-Lock both return rhymes
- Device checklist, automated half: `7/7 passed` · `npm audit`: `0 vulnerabilities`

Pronunciations are the CMU Pronouncing Dictionary, BSD-2-clause, notice shipped in
`src/data/PRONUNCIATION-LICENSE`.

---

# Barsmith 5.8.1 — say what Level and Scheme mean, drop the rear camera

## Two settings labelled with bare numbers

Level and Scheme were the only controls on the setup screen offering nothing but `1 2 3`
and `1 2 3 4`. A writer opening Barsmith for the first time had no way to know that Level
is syllable weight and Scheme is how many words land at once — the two settings that most
change what the session *is* were the two least readable.

Both now carry a caption that moves with the selection:

> **3. Level** — *Three or more. Bend the phrase to make it fit.*
> **4. Scheme** — *Three at once. One punchline has to hold all of them.*

Phrased as what the setting does to the work rather than to the data: "three or more
syllables" is the mechanism, "bend the phrase" is the reason to pick it. A caption rather
than a tooltip because nobody taps a tooltip, and it keeps the row's existing shape
instead of adding another control.

The How To now leads with both, in the order they appear on screen, ahead of Tap to Lock.

## The rear camera is gone

It was a real option with a toggle, a mirroring branch, a test, and a checklist item that
needed a second physical camera to verify. The argument against it is structural, not
taste: **a rear-facing recording points the screen away from the writer.** The prompt
words they are meant to be rapping over end up behind the phone, and they cannot frame
themselves either, because the preview is on the far side too. The one thing worth
filming here is the writer's own delivery, and that is the camera on the same side as the
words.

So `facingMode` is pinned to `'user'`, the preview is always mirrored, and the button
reads *Record Yourself*. The test that used to assert the toggle now pins the front
camera and additionally covers the permission-denied path reaching the UI — so nobody
reintroduces a facing option without meeting the argument first. Device checklist item 5
becomes a mirroring check rather than a two-camera check.

## A flaky test, found and fixed

The session-scope test shipped in 5.8.0 compared two 40-draw samples from a 1,223-word
bank and asserted they overlapped. They miss each other about **27% of the time** — a
test that fails one run in four teaches people to re-run rather than to look. Resized to
half the bank each, where zero overlap is not something that happens. Confirmed over
fifteen consecutive full-suite runs.

## Verification

- Automated tests: `132 passed`, stable across 15 consecutive runs
- Device checklist, automated half: `7/7 passed`
- Captions, How To, and the absence of any camera-facing control verified in the browser
  against the production build

---

# Barsmith 5.8.0 — a session never hands you the same word twice

The standing assumption was that the word bank should keep growing. Measuring it says
otherwise, and points at a change that costs nothing.

## The bank was never the problem

`getNextWords` blocked only the *previous* draw, so repeats were governed by the birthday
problem. At tier 1's 1,223 words, in a ten-minute session at 3.5s — 171 draws:

| Tier | Words | Repeats/session | First repeat at |
| --- | --- | --- | --- |
| 1 | 1,223 | 11.4 (6.6%) | 44 draws — 2.6 min in |
| 2 | 2,035 | 6.9 (4.1%) | 57 draws |
| 3 | 2,156 | 6.6 (3.8%) | 58 draws |

Buying your way out with vocabulary does not work, because the curve is a square root:

| Tier 1 bank | Repeats/session | First repeat |
| --- | --- | --- |
| 1,223 (today) | 11.4 | 44 draws |
| 2,446 (2×) | 5.8 | 62 draws |
| 4,892 (4×) | 2.9 | 88 draws |
| 9,784 (8×) | 1.5 | 124 draws |

**Eight times the words still repeats inside one session.** 5.7.0 added 1,093 words
across the bank and moved tier 1's first repeat from draw 40 to draw 44.

## Remembering the session settles it

The longest session Today's Session can prescribe is 20 minutes at 3.5s — 342 draws —
against a smallest tier of 1,223 words. That is 3.6× headroom, so a session-scoped
exclusion fits with room to spare and never has to give way. It is still written to
degrade rather than assume that.

Measured over a live session in the browser, interval forced below the UI minimum so a
full session's worth of draws fits in seconds:

```
session A: 417 draws, 417 distinct, 0 repeats
session B: 134 draws, 48 of them also appeared in A
```

417 consecutive prompts, none repeated — past the longest session the app can prescribe.
The same run under the old rule would have averaged **64 repeats**. Session B reusing 48
of A's words is the other half: the memory is scoped to the session and the slate clears
at the start of the next one, not on resume from a locked word.

Cost is 1.4µs per draw, and across the longest session on every tier the fallback scan
never runs once.

## Three deliberate exceptions

- **Personal words are exempt.** A writer who added three custom words wants all three,
  repeatedly — that is why they added them. Session-scoping would spend that pool in
  three draws and then quietly stop honouring the 20% custom chance for the rest of the
  session. They still never repeat back-to-back.
- **An exhausted tier restarts its cycle** rather than dropping the exclusion for the rest
  of the session. Other tiers keep their memory, which matters for a Scheme round drawing
  across all three at once.
- **Probing gives way to a scan.** Drawing at random is right while most of the pool is
  eligible, which is nearly always — but a fixed try budget fails *by luck* as the pool
  thins, and would silently return the repeat it was asked to avoid. When probing runs
  out, the code scans for what is genuinely left instead of guessing harder.

## What this means for the word bank

The bank grows for **reach** — more rhyme endings, more second meanings, more registers
to be pushed into — and never again for freshness, which is now solved outright. It is
also why a hip-hop lyric corpus is not the answer to tier 3's remaining ending
concentration: corpora rank by what rappers already say, and those are precisely the
words a writer does not need prompting for.

## Verification

- Automated tests: `133 passed` (7 new, covering the exhaustion and cycle-restart paths
  that cannot occur in the app — the untaken branch is the one that rots)
- Live browser run: 417 draws, 0 repeats, slate cleared between sessions
- Device checklist, automated half: `7/7 passed` · `npm audit`: `0 vulnerabilities`

---

# Barsmith 5.7.1 — half the device checklist now runs itself

The README has carried a 14-item checklist for a real phone since 5.2.0. Running it
against 5.7.0 turned up something about the checklist itself: seven of those fourteen
are not really about hardware at all. They are assertions about the built app that
happened to be written as instructions for a human, and a check that is only ever run by
hand is a check that eventually stops being run.

## `npm run device-checklist`

Items **2, 9, 10, 11, 12, 13** and the render half of **14** now run against the exact
production build and print PASS/FAIL with their evidence:

```
PASS   9. Background/return during a timed session
        countdown read ⏱ 4:59 before a +6min clock jump on a 5min sprint; session auto-ended: true
PASS  13. Today's session rolls at local midnight
        23:50 showed "Sprint", 00:10 next day showed "Endurance"
```

7/7 pass. The remaining seven — install to home screen, camera and mic permission, the
recording round-trip, the facing toggle, BPM by ear, keyboard-open scrolling, safe-area
spacing — are printed at the end as an explicit hardware list. Skipping them silently
would be worse than not running at all, because a green run that quietly covered half of
what it claims is a green run nobody should trust.

Two items are honest about covering less than the manual check does, and say so in their
own output rather than in a footnote:

- **Item 2** verifies the precache *contract* — every asset the built HTML references is
  in Cache Storage and served with the network down — because Playwright's offline mode
  fails subresources below the service worker, so an end-to-end offline boot is not
  observable in a container. Airplane Mode on a phone still proves something this cannot.
- **Item 12** checks what the manifest declares, not how the icon looks inside Android's
  circular mask.

## What the run found

One real defect, in the dialog with the least room for one:

> Restore **1 sessions**, 0 vault words, and 0 personal words? Existing local data will
> be replaced.

This is the last thing a writer reads before every session they have ever saved is
overwritten. A count that disagrees with its own noun reads as a bug in the very dialog
asking to be trusted with all of it. Fixed, and the checklist now asserts the counts
agree rather than merely printing them for eyeballing.

## Verification

- Automated tests: `126 passed`
- Device checklist, automated half: `7/7 passed`
- Production build: passed · `npm audit`: `0 vulnerabilities`

---

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
