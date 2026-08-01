#!/usr/bin/env python3
"""
Build the offline pronunciation payload the rhyme engine runs on.

    pip install cmudict wordfreq
    python3 scripts/build-rhyme-data.py

Reads the CMU Pronouncing Dictionary, keeps the words worth carrying, derives the ones
CMU is missing, and writes a compact encoding to src/data/pronunciations.txt.

Three things this has to get right:

 1. **Every prompt word must be pronounceable.** Tap-to-Lock hands the prompt straight
    to the rhyme engine, so a bank word absent from the payload is a dead panel on a
    word Barsmith itself chose. CMU is missing 151 of them — mostly compounds like
    `cashback` and Latinate derivations like `weaponization` — so those are derived, and
    whatever no rule can reach is hand-authored in pronunciation-extra.json.

 2. **Size is a real constraint.** This ships to a PWA that precaches everything, so the
    payload is filtered by Zipf frequency and encoded one character per phoneme rather
    than shipped as CMU's ~3.6MB of text.

 3. **Derivation must be conservative.** A wrong pronunciation is worse than a missing
    one: it produces confidently wrong rhymes. Compound splitting only fires for words
    CMU does not have, requires both halves to be real words of 3+ letters, and prefers
    the most balanced split — so `cashback` resolves but nothing already known is
    second-guessed.

The CMU dictionary is BSD-2-clause; its notice ships in src/data/PRONUNCIATION-LICENSE.
"""

import json
import os
import re
import sys

try:
    import cmudict
    from wordfreq import zipf_frequency
    from english_words import get_english_words_set
except ImportError:
    sys.exit("needs `pip install cmudict wordfreq english-words`")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "src", "data")

# What earns a place in the payload.
#
# Frequency alone is the wrong filter, and measurably so: in the Zipf 2.0-2.5 band, 44%
# of CMU's entries are surnames and brand names — `borthwick`, `botelho`, `hesketh`,
# `cigna`. Nobody wants those offered back as a rhyme, and they cost bytes on every
# install. Sitting right beside them are `curmudgeon`, `bollard`, `oleander`, `minaret`
# — exactly the words a bar-heavy writer is looking for.
#
# So the test is "is this a word", answered by Webster's Second (public domain, and a
# dictionary rather than a corpus, so it lists no surnames). Webster's is from 1934, so
# it misses `internet`, `podcast`, `emoji`, `vibe` — every one of which is Zipf 3.2 or
# above. Hence the second clause: common enough today is its own evidence.
#
# Bank words bypass both. We chose them deliberately; a prompt Barsmith itself hands out
# must never open a dead rhyme panel.
WORDLIST_FLOOR = 1.5   # in Webster's, and not vanishingly rare
MODERN_FLOOR = 3.2     # not in Webster's, but plainly current English

# One character per phoneme. The order is fixed forever — the runtime decoder indexes
# into this exact string, so appending is safe and reordering silently corrupts every
# pronunciation.
PHONEMES = [
    "AA", "AE", "AH", "AO", "AW", "AY", "B", "CH", "D", "DH", "EH", "ER", "EY", "F",
    "G", "HH", "IH", "IY", "JH", "K", "L", "M", "N", "NG", "OW", "OY", "P", "R", "S",
    "SH", "T", "TH", "UH", "UW", "V", "W", "Y", "Z", "ZH",
]
ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM"  # 39 chars, one per phoneme
assert len(PHONEMES) == len(ALPHABET) == 39
CODE = dict(zip(PHONEMES, ALPHABET))
VOWELS = {p for p in PHONEMES if p[0] in "AEIOU"}

# Single letters are in CMU as words and are pure noise in a rhyme list — `tell` came
# back with "well, cell, fell, hell, l, sell". Only `a` and `i` earn their place.
WORD_RE = re.compile(r"^[a-z]+$")
def usable(word):
    return bool(WORD_RE.match(word)) and (len(word) > 1 or word in ("a", "i"))


def encode(phones):
    """ARPAbet list -> compact string. Vowels carry their stress digit inline."""
    out = []
    for p in phones:
        base = p.rstrip("012")
        if base not in CODE:
            return None
        out.append(CODE[base])
        if base in VOWELS:
            out.append(p[-1] if p[-1] in "012" else "0")
    return "".join(out)


def demote_stress(phones):
    """Primary stress -> secondary. Used for the trailing half of a compound, where
    English puts the main stress on the first element: BACKstab, not backSTAB."""
    return [p[:-1] + "2" if p.endswith("1") else p for p in phones]


def split_compound(word, d):
    """Most balanced split into two real words, or None. Balance matters: `starfall`
    could split at `star|fall` or `s|tarfall`, and only one of those is a word."""
    best = None
    for i in range(3, len(word) - 2):
        a, b = word[:i], word[i:]
        if a in d and b in d:
            balance = min(len(a), len(b))
            if best is None or balance > best[0]:
                best = (balance, a, b)
    return (best[1], best[2]) if best else None


# Suffixes whose pronunciation is fully regular given the stem. The stem candidates
# cover English spelling changes: drop-e (`laze` -> `lazing`), doubled consonant
# (`slap` -> `slapping`), and y->i (`happy` -> `happiness`).
SUFFIXES = {
    "s": ["Z"], "es": ["IH0", "Z"], "ed": ["D"], "ing": ["IH0", "NG"],
    "er": ["ER0"], "ly": ["L", "IY0"], "ness": ["N", "AH0", "S"],
    "ful": ["F", "AH0", "L"], "less": ["L", "AH0", "S"], "y": ["IY0"],
}

# Latinate derivations. Regular enough to generate, and heavily represented in tier 3.
LATINATE = [
    ("ization", "ize", ["AH0", "Z", "EY1", "SH", "AH0", "N"]),
    ("ation", "ate", ["EY1", "SH", "AH0", "N"]),
    ("ification", "ify", ["AH0", "F", "IH0", "K", "EY1", "SH", "AH0", "N"]),
    ("ity", "e", ["IH0", "T", "IY0"]),
]


def stem_candidates(stem):
    yield stem
    yield stem + "e"
    if len(stem) > 2 and stem[-1] == stem[-2]:
        yield stem[:-1]
    if stem.endswith("i"):
        yield stem[:-1] + "y"


def derive(word, d):
    """Best-effort pronunciation for a word CMU does not have. Returns (phones, how)."""
    comp = split_compound(word, d)
    if comp:
        a, b = comp
        return d[a][0] + demote_stress(d[b][0]), f"compound {a}+{b}"

    for suf, tail in sorted(SUFFIXES.items(), key=lambda kv: -len(kv[0])):
        if word.endswith(suf) and len(word) > len(suf) + 2:
            for cand in stem_candidates(word[: -len(suf)]):
                if cand in d:
                    return d[cand][0] + tail, f"{cand}+{suf}"

    for suf, stem_suf, tail in LATINATE:
        if word.endswith(suf):
            base = word[: -len(suf)] + stem_suf
            for cand in stem_candidates(base):
                if cand in d:
                    # The derived ending carries the primary stress, so the stem's own
                    # primary drops to secondary — WEAponize but weaponiZAtion.
                    return demote_stress(d[cand][0]) + tail, f"{cand}+{suf}"
    return None, None


def main():
    d = cmudict.dict()

    bank = set()
    for tier in ("tier-1", "tier-2", "tier-3"):
        with open(os.path.join(DATA, f"{tier}.json")) as fh:
            bank |= {w.lower() for w in json.load(fh)}

    extra_path = os.path.join(DATA, "pronunciation-extra.json")
    extra = {}
    if os.path.exists(extra_path):
        with open(extra_path) as fh:
            extra = {k.lower(): v.split() for k, v in json.load(fh).items() if not k.startswith("_")}

    real_words = get_english_words_set(["web2"], lower=True)

    entries = {}
    stats = {"cmu": 0, "derived": 0, "hand": 0}

    for word in d:
        if not usable(word):
            continue
        if word not in bank:
            z = zipf_frequency(word, "en")
            if not ((word in real_words and z >= WORDLIST_FLOOR) or z >= MODERN_FLOOR):
                continue
        entries[word] = d[word][0]
        stats["cmu"] += 1

    unresolved = []
    for word in sorted(bank - set(entries)):
        if word in extra:
            continue
        phones, how = derive(word, d)
        if phones:
            entries[word] = phones
            stats["derived"] += 1
        else:
            unresolved.append(word)

    # Hand-authored last so it can override a derivation that came out wrong.
    for word, phones in extra.items():
        entries[word] = phones
        stats["hand"] += 1

    if unresolved:
        print(f"\n!! {len(unresolved)} bank words have no pronunciation.")
        print("   Add them to src/data/pronunciation-extra.json:\n")
        print(json.dumps({w: "" for w in unresolved}, indent=2))
        sys.exit(1)

    lines = []
    skipped = 0
    for word in sorted(entries):
        enc = encode(entries[word])
        if enc is None:
            skipped += 1
            continue
        # Frequency bucket 0-9 over Zipf 1.0-7.0, so results can be ranked by how usable
        # a word actually is rather than alphabetically.
        z = zipf_frequency(word, "en")
        bucket = max(0, min(9, int((z - 1.0) / 0.6)))
        lines.append(f"{word} {enc}{bucket}")

    out = os.path.join(DATA, "pronunciations.txt")
    payload = "\n".join(lines)
    with open(out, "w") as fh:
        fh.write(payload)

    import gzip
    gz = len(gzip.compress(payload.encode(), 9))
    missing_bank = sorted(bank - set(entries))
    print(f"wrote {out}")
    print(f"  {len(lines):,} words — {len(payload)/1024:.0f} KB raw, {gz/1024:.0f} KB gzipped")
    print(f"  {stats['cmu']:,} from CMU · {stats['derived']} derived · {stats['hand']} hand-authored")
    print(f"  bank coverage: {len(bank)-len(missing_bank)}/{len(bank)}")
    if skipped:
        print(f"  {skipped} skipped (unknown phoneme)")
    if missing_bank:
        sys.exit(f"  MISSING: {missing_bank}")


if __name__ == "__main__":
    main()
