#!/usr/bin/env python3
"""
Build the offline definition payload for the Tap-to-Lock panel.

    pip install nltk && python3 -c "import nltk; nltk.download('wordnet')"
    python3 scripts/build-definitions.py

Definitions were the last part of the reference that needed a network. Rhymes, syllable
counts and stress went on-device in 5.9.0; this closes the hole, so a writer in airplane
mode gets the whole panel rather than three quarters of it.

Scoped to the word banks on purpose. The panel only ever opens on a prompt or a vault
word, so covering all 41k pronounceable words would quintuple the payload to serve a case
that does not arise. Anything outside the banks — a personal word a writer added — still
falls back to the network, and says so when there isn't one.

**Two senses, not one.** This is the one place the app's own thesis should show up in the
data: a punchline turns on a word's *other* meaning. `clip` as a fastener and `clip` as a
segment of footage is exactly the material this is for, and a panel showing only the
first sense is hiding the half that makes the bar.

WordNet is Princeton's, and its licence permits commercial use with the notice retained;
it ships in src/data/DEFINITION-LICENSE.
"""

import json
import os
import re
import sys

try:
    from nltk.corpus import wordnet as wn
except ImportError:
    sys.exit('needs `pip install nltk` and `nltk.download("wordnet")`')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'src', 'data')

POS = {'n': 'noun', 'v': 'verb', 'a': 'adj', 's': 'adj', 'r': 'adv'}
MAX_GLOSS = 95
MAX_SENSES = 2


def senses(word):
    """Up to two glosses, preferring two different parts of speech.

    Different-POS first because `charge` as a noun and as a verb are the furthest apart
    two senses can be, and that distance is the useful part. Falling back to a second
    sense of the same POS still beats showing one.
    """
    synsets = wn.synsets(word)
    if not synsets:
        return None

    picked, seen_pos, seen_text = [], set(), set()
    for pool in (True, False):  # pass 1: new POS only. pass 2: anything left.
        for s in synsets:
            if len(picked) >= MAX_SENSES:
                break
            pos = POS.get(s.pos())
            if not pos or (pool and pos in seen_pos):
                continue
            text = re.sub(r'\s+', ' ', s.definition()).strip()
            if not text:
                continue
            # A gloss whose first words repeat one already shown is the same idea in
            # other words, and costs a line to say nothing.
            head = ' '.join(text.split()[:4]).lower()
            if head in seen_text:
                continue
            if len(text) > MAX_GLOSS:
                text = text[:MAX_GLOSS].rsplit(' ', 1)[0] + '…'
            picked.append(f'{pos}|{text}')
            seen_pos.add(pos)
            seen_text.add(head)
    return '·'.join(picked) or None


def main():
    bank = set()
    for tier in ('tier-1', 'tier-2', 'tier-3'):
        with open(os.path.join(DATA, f'{tier}.json')) as fh:
            bank |= {w.lower() for w in json.load(fh)}

    lines, missing = [], []
    two = 0
    for word in sorted(bank):
        g = senses(word)
        if g:
            lines.append(f'{word} {g}')
            if '·' in g:
                two += 1
        else:
            missing.append(word)

    out = os.path.join(DATA, 'definitions.txt')
    body = '\n'.join(lines)
    with open(out, 'w') as fh:
        fh.write(body)

    import gzip
    gz = len(gzip.compress(body.encode(), 9))
    print(f'wrote {out}')
    print(f'  {len(lines):,}/{len(bank):,} bank words defined ({two:,} with a second sense)')
    print(f'  {len(body)/1024:.0f} KB raw, {gz/1024:.0f} KB gzipped')
    if missing:
        # Not a build failure: an undefined word still prompts, rhymes and locks fine.
        # A missing *pronunciation* is fatal; a missing gloss just falls back to the
        # network, which is where every gloss came from until now.
        print(f'  {len(missing)} without a WordNet entry, e.g. {", ".join(missing[:12])}')


if __name__ == '__main__':
    main()
