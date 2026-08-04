// @vitest-environment node
//
// The text exporters are the only path by which a writer's work leaves Barsmith
// in a form another tool can read, so the shapes below are effectively a data
// contract. In particular: multiple bars on the same locked word must all
// survive (the bug the per-entryId note shape was introduced to fix), and blank
// Bar Pad entries must never pad an export with empty stanzas.

import { describe, it, expect } from 'vitest';
import {
  flattenNotes, hasBars, sessionToText, sessionBarsOnly, historyToText,
} from '../services/export-text.js';

const session = (over = {}) => ({
  id: 1,
  date: '2026-07-30T15:42:00.000Z',
  duration: 750,
  wordsSeen: 24,
  tier: 2,
  wordCount: 1,
  pace: '90 BPM',
  frozenWords: ['fracture', 'lantern'],
  notes: {
    fracture: { a: 'hear the fracture in the way I say it', b: 'second bar, same word' },
    lantern: { a: 'holding up a lantern to the parts I hid' },
  },
  ...over,
});

describe('flattenNotes', () => {
  it('keeps every bar written on the same locked word', () => {
    const flat = flattenNotes({ fracture: { a: 'first', b: 'second' } });
    expect(flat).toHaveLength(2);
    expect(flat.map(([, , text]) => text)).toEqual(['first', 'second']);
  });

  it('reads the legacy one-string-per-word shape from pre-5.x records', () => {
    expect(flattenNotes({ verdict: 'an older bar' })).toEqual([['verdict', 'legacy', 'an older bar']]);
  });

  it('treats missing or empty notes as no bars', () => {
    expect(flattenNotes(undefined)).toEqual([]);
    expect(flattenNotes({})).toEqual([]);
  });
});

describe('hasBars', () => {
  it('is false when every Bar Pad entry was opened but left blank', () => {
    expect(hasBars(session({ notes: { fracture: { a: '' }, lantern: { a: '   ' } } }))).toBe(false);
  });

  it('is true as soon as one entry has real text', () => {
    expect(hasBars(session({ notes: { fracture: { a: '', b: 'a real bar' } } }))).toBe(true);
  });

  it('is false for a null session', () => {
    expect(hasBars(null)).toBe(false);
  });
});

describe('sessionToText', () => {
  it('includes the header, every bar, and the frozen-word list', () => {
    const text = sessionToText(session());
    expect(text).toContain('BARSMITH · July 30, 2026');
    expect(text).toContain('12:30 session');
    expect(text).toContain('24 words');
    expect(sessionToText(session({ wordsSeen: 1 }))).toContain('1 word ·');
    expect(text).toContain('Level 2');
    expect(text).toContain('90 BPM');
    expect(text).toContain('FRACTURE');
    expect(text).toContain('hear the fracture in the way I say it');
    expect(text).toContain('second bar, same word');
    expect(text).toContain('holding up a lantern to the parts I hid');
    expect(text).toContain('fracture · lantern');
  });

  it('omits the header when the caller supplies its own', () => {
    const text = sessionToText(session(), { heading: false });
    expect(text).not.toContain('BARSMITH ·');
    expect(text).toContain('hear the fracture in the way I say it');
  });

  it('drops blank entries rather than emitting empty stanzas', () => {
    const text = sessionToText(session({ notes: { fracture: { a: 'kept', b: '  ' } } }));
    expect(text).toContain('kept');
    expect(text.match(/FRACTURE/g)).toHaveLength(1);
  });

  it('labels a vault drill and a recovered draft instead of a tier', () => {
    expect(sessionToText(session({ source: 'vault' }))).toContain('Saved words');
    expect(sessionToText(session({ source: 'recovered' }))).toContain('Recovered draft');
  });

  it('says so plainly when a session has no written bars', () => {
    expect(sessionToText(session({ notes: {} }))).toContain('(no bars written)');
  });

  it('survives an unparseable date without throwing', () => {
    expect(sessionToText(session({ date: 'not-a-date' }))).toContain('Unknown date');
  });
});

describe('sessionBarsOnly', () => {
  it('emits bar text alone, blank-line separated, with no labels or metadata', () => {
    expect(sessionBarsOnly(session())).toBe(
      'hear the fracture in the way I say it\n\nsecond bar, same word\n\nholding up a lantern to the parts I hid'
    );
  });

  it('returns an empty string when nothing was written', () => {
    expect(sessionBarsOnly(session({ notes: {} }))).toBe('');
  });
});

describe('historyToText', () => {
  it('counts the bars and sessions it actually wrote out', () => {
    const text = historyToText([session(), session({ id: 2, notes: { verdict: { a: 'one more' } } })]);
    expect(text).toContain('4 bars across 2 sessions');
    expect(text).toContain('one more');
  });

  it('skips empty sessions so a long archive is not padded with noise', () => {
    const text = historyToText([session({ id: 1, notes: {} }), session({ id: 2 })]);
    expect(text).toContain('3 bars across 1 session');
    expect(text).not.toContain('(no bars written)');
  });

  it('singularizes a one-bar, one-session archive', () => {
    expect(historyToText([session({ notes: { solo: { a: 'just the one' } } })]))
      .toContain('1 bar across 1 session');
  });

  it('reports an empty archive instead of returning a bare header', () => {
    expect(historyToText([])).toContain('No written bars found');
    expect(historyToText(undefined)).toContain('No written bars found');
  });
});
