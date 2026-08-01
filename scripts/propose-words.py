#!/usr/bin/env python3
"""
Propose word-bank additions, ranked by measurement rather than taste.

    pip install cmudict wordfreq english-words nltk
    python3 scripts/propose-words.py            # writes docs/word-proposals.md
    python3 scripts/propose-words.py --apply    # also writes the tiers

Every earlier expansion was hand-authored: I thought of words, then checked them. That
gets the obvious ones and misses everything I did not happen to think of. The
pronunciation payload already holds 41,257 words, and after removing inflections, proper
nouns, rarities and anything over four syllables, **14,632** of them are plain candidates
nobody has ever looked at.

Two things exist now that did not when the bank was last grown, and together they turn
this from taste into arithmetic:

 1. **The rhyme engine**, which can say whether a word lands on an ending its tier is
    short of. Rhyme-tail diversity is the measure of a tier's usefulness — see
    `npm run audit-wordbank` — so "does this add an ending" is the question that matters,
    and it is now answerable.
 2. **WordNet**, which counts a word's senses. The bank's other rule is that a word needs
    a second meaning for a punchline to turn on, and sense count measures exactly that
    instead of approximating it by suffix.

So each candidate is scored on: does it fill a thin ending, does it carry more than one
sense, is it concrete, is it a word people actually use. The output is a proposal file
for review — the bank is the thing the app pushes at writers, and no script should get
to write to it unattended.
"""

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

try:
    import cmudict
    from wordfreq import zipf_frequency
    from english_words import get_english_words_set
    from nltk.corpus import wordnet as wn
except ImportError:
    sys.exit('needs `pip install cmudict wordfreq english-words nltk` (+ nltk wordnet)')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'src', 'data')
DOCS = os.path.join(ROOT, 'docs')

VOWELS = set('abcdefklmqryzGH')

# Abstraction is the failure mode this bank has fallen into twice: Latinate nouns that
# all end alike and each mean exactly one thing. Suffix is a rough proxy for it, and the
# sense count below is the real test, but these are worth weighting against outright.
ABSTRACT_SUFFIX = re.compile(
    r'(tion|sion|ment|ness|ity|ance|ence|ism|ist|ology|ography|acy|ship|hood|dom)$')

# Grammatical furniture. Every one of these is common, carries a pile of WordNet senses,
# and is useless as a prompt — the first version of this script ranked `was`, `then`,
# `have` and `want` at the very top for exactly that reason.
FUNCTION_WORDS = set((
    'a an the of to and in is it be he we me she they you i at on or for as but by do so '
    'no my up if us am are was were has had have will can its his her him them then than '
    'that this these those with from not all any may more most such some what when which '
    'who why how there here into out off over under been being does did would could '
    'should shall must our your their whom whose about after before very just also only '
    'even still yet own same other another each both few many much own get got go went '
    'come came make made take took give gave say said see saw know knew think thought '
    'want used need let put keep kept find found tell told ask asked work worked seem '
    'feel felt try tried leave left call called').split())

# The bank is built from things and actions. An adjective prompt gives a writer a
# quality with nothing to picture, and WordNet orders senses by frequency, so the first
# one is what the word most *is*.
PROMPTABLE_POS = {'n', 'v'}


def is_proper_noun(word, senses):
    """True when WordNet's own lemma for this word is capitalised.

    Webster's Second lists `adam`, `arthur`, `athens`, `apache`, `bantu` and `baltic` as
    lowercase headwords, so the wordlist filter that keeps surnames out of the
    pronunciation payload lets these straight through. WordNet preserves case in its
    lemmas, which answers the question directly rather than by heuristic.
    """
    # *Any* capitalised lemma, not a majority of them. `mecca`, `kremlin`, `merlin`,
    # `nelson`, `kelvin`, `coca` and `davenport` all carry a lowercase common-noun sense
    # alongside the proper one and survive a majority test; none of them belongs in a
    # prompt bank. Checked against `hammer`, `diamond`, `zombie`, `battery`, `iceberg`
    # and `jazz`, which are all clean.
    return any(lemma[0].isupper()
               for s in senses
               for lemma in s.lemma_names()
               if lemma.lower() == word)

# Inflections are not new words. They rhyme exactly like their stem and add nothing but
# bulk — the bank already avoids them, and the payload is full of them.
INFLECTION = ('s', 'es', 'ed', 'ing', 'er', 'est', 'ly', 'ers', 'ings', 'ings')


def load_payload():
    words, encs = [], {}
    for line in open(os.path.join(DATA, 'pronunciations.txt')):
        w, rest = line.split(' ')
        words.append(w)
        encs[w] = rest.strip()[:-1]
    return words, encs


def rimes(enc):
    out = []
    i = 0
    while i < len(enc):
        if enc[i] in VOWELS:
            out.append([enc[i], enc[i + 1], ''])
            i += 2
        else:
            if out:
                out[-1][2] += enc[i]
            i += 1
    return out


def syllables(enc):
    return sum(1 for c in enc if c in VOWELS)


def rhyme_tail(enc):
    """The ending a word contributes, keyed the way the audit measures diversity."""
    rs = rimes(enc)
    if not rs:
        return None
    stressed = 1
    for i in range(len(rs) - 1, -1, -1):
        if rs[i][1] == '1':
            stressed = len(rs) - i
            break
    return '|'.join(r[0] + r[2] for r in rs[-stressed:])


def tier_for(n):
    return 1 if n == 1 else 2 if n == 2 else 3 if n <= 4 else None


def stem_of(word, pool):
    for suf in sorted(INFLECTION, key=len, reverse=True):
        if word.endswith(suf) and len(word) > len(suf) + 2:
            base = word[:-len(suf)]
            for cand in (base, base + 'e',
                         base[:-1] if len(base) > 2 and base[-1] == base[-2] else None,
                         base[:-1] + 'y' if base.endswith('i') else None):
                if cand and cand in pool:
                    return cand
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='write the accepted words into the tiers')
    ap.add_argument('--per-tier', type=int, default=400, help='how many to propose per tier')
    args = ap.parse_args()

    words, encs = load_payload()
    payload = set(words)
    d = cmudict.dict()
    real = get_english_words_set(['web2'], lower=True)

    tiers = {}
    for n in (1, 2, 3):
        with open(os.path.join(DATA, f'tier-{n}.json')) as fh:
            tiers[n] = json.load(fh)
    bank = {w.lower() for t in tiers.values() for w in t}

    # How thin is each ending, per tier? A word landing on an ending the tier already has
    # forty of adds nothing; one landing on an ending it has none of is the whole point.
    tail_counts = {n: Counter() for n in (1, 2, 3)}
    for n, tier in tiers.items():
        for w in tier:
            e = encs.get(w.lower())
            if e:
                t = rhyme_tail(e)
                if t:
                    tail_counts[n][t] += 1

    proposals = defaultdict(list)
    for w in words:
        if w in bank or len(w) < 3:
            continue
        if w not in real:                       # proper nouns and modern coinages
            continue
        if stem_of(w, payload):                 # inflection of something already covered
            continue
        # Irregular inflections the suffix rules cannot see: `matrices`, `nuclei`,
        # `calves`, `brethren`. WordNet's morphological analyser knows the lemma, and an
        # inflection rhymes exactly like its stem while adding nothing but bulk.
        for pos in ('n', 'v'):
            lemma = wn.morphy(w, pos)
            if lemma and lemma != w:
                break
        else:
            lemma = None
        if lemma:
            continue
        z = zipf_frequency(w, 'en')
        if z < 2.6:                             # too rare to prompt with
            continue
        enc = encs[w]
        n_syl = syllables(enc)
        tier = tier_for(n_syl)
        if tier is None:
            continue
        tail = rhyme_tail(enc)
        if not tail:
            continue

        if w in FUNCTION_WORDS:
            continue

        senses = wn.synsets(w)
        if not senses:                          # nothing to look up, nothing to turn
            continue
        if senses[0].pos() not in PROMPTABLE_POS:
            continue                            # a word that is mostly an adjective
        if is_proper_noun(w, senses):
            continue

        # Concreteness, measured rather than guessed at. WordNet's noun tree splits at
        # the top into physical_entity and abstraction, so "can you picture it" is a
        # question the data answers — far better than the suffix rule, which reads
        # spelling and cannot tell `ligament` from `judgement`.
        noun_senses = [s for s in senses if s.pos() == 'n']
        concrete = any(
            any(h.name() == 'physical_entity.n.01' for path in s.hypernym_paths() for h in path)
            for s in noun_senses[:3])

        # A second meaning is the punchline test. Nineteen meanings is not nineteen times
        # better — it means the word is grammatical glue. Reward the band, not the count.
        n = len(senses)
        sense_value = 0.0 if n < 2 else 2.0 if n <= 8 else 1.0 if n <= 14 else 0.0

        # Frequency is a band too, and for the same reason at both ends: too rare and
        # nobody can use it, too common and it is a word a writer would have reached for
        # unprompted. The prompt's job is to push somewhere they would not have gone.
        freq_value = 2.0 if 3.0 <= z <= 4.6 else 1.0 if 2.8 <= z < 5.2 else -1.5

        have = tail_counts[tier][tail]
        # Thin endings are worth the most, and the curve is steep: 0 -> 1 on an ending is
        # a new rhyme family, 12 -> 13 is nothing.
        ending_value = 6.0 if have == 0 else 3.0 if have <= 2 else 1.0 if have <= 6 else 0.2

        abstract = bool(ABSTRACT_SUFFIX.search(w))
        # Continuous terms as well as banded ones, so words do not pile up on identical
        # scores and get ordered alphabetically — the first pass read like a dictionary
        # page: `abbey, acid, adam, adept, adjunct, aegis`.
        rarity_of_ending = 1.0 / (1 + have)
        score = (ending_value + sense_value + freq_value
                 + (2.5 if concrete else -2.5) - (2.0 if abstract else 0)
                 + rarity_of_ending + min(n, 10) * 0.08 + (5.0 - abs(z - 3.8)) * 0.15)

        proposals[tier].append({
            'word': w, 'score': round(score, 2), 'tail': tail, 'have': have,
            'senses': n, 'zipf': round(z, 1), 'concrete': concrete,
        })

    os.makedirs(DOCS, exist_ok=True)
    out = [
        '# Word proposals',
        '',
        'Generated by `python3 scripts/propose-words.py`. **Nothing here is in the bank yet.**',
        '',
        'Ranked by: how thin the rhyme ending is in that tier (the measure the audit uses),',
        'how many senses the word carries (the punchline test), and how ordinary it is —',
        'minus a penalty for abstract Latinate endings, which is the failure mode this bank',
        'has fallen into twice.',
        '',
    ]
    accepted = {}
    for tier in (1, 2, 3):
        ranked = sorted(proposals[tier], key=lambda p: (-p['score'], -p['zipf'], p['word']))[:args.per_tier]
        accepted[tier] = [p['word'] for p in ranked]
        new_tails = len({p['tail'] for p in ranked if p['have'] == 0})
        out += [
            f'## Tier {tier} — {len(ranked)} proposed (from {len(proposals[tier]):,} candidates)',
            '',
            f'{new_tails} land on an ending tier {tier} does not currently have.',
            '',
            '| word | score | senses | zipf | concrete | tier already has this ending |',
            '| --- | --- | --- | --- | --- | --- |',
        ]
        for p in ranked:
            out.append(f"| {p['word']} | {p['score']} | {p['senses']} | {p['zipf']} "
                       f"| {'yes' if p['concrete'] else 'no'} | {p['have']} |")
        out.append('')

    path = os.path.join(DOCS, 'word-proposals.md')
    with open(path, 'w') as fh:
        fh.write('\n'.join(out))
    print(f'wrote {path}')
    for tier in (1, 2, 3):
        print(f'  tier {tier}: {len(accepted[tier])} proposed from {len(proposals[tier]):,} candidates')

    if args.apply:
        for tier in (1, 2, 3):
            merged = sorted(set(tiers[tier]) | set(accepted[tier]))
            with open(os.path.join(DATA, f'tier-{tier}.json'), 'w') as fh:
                json.dump(merged, fh, indent=2)
                fh.write('\n')
            print(f'  tier {tier}: {len(tiers[tier])} -> {len(merged)}')
        print('\nRe-run: npm run validate-wordbank && python3 scripts/build-rhyme-data.py'
              ' && python3 scripts/build-definitions.py && npm run audit-wordbank')


if __name__ == '__main__':
    main()
