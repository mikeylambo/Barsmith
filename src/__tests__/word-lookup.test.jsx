/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// The payloads are ~800KB and ~730KB; this feature is about wiring, not about the data,
// so the two reference services are stubbed and pinned by their own tests elsewhere.
vi.mock('../services/rhyme', () => ({
  loadRhymeIndex: () => Promise.resolve(),
  findRhymes: (w) => ({
    word: w, found: true, syllables: 1,
    perfect: [{ word: 'torch', syllables: 1 }],
    multi: [], slant: [], assonance: [], homophones: [],
  }),
}));
vi.mock('../services/definitions', () => ({
  loadDefinitions: () => Promise.resolve(),
  lookupDefinition: (w) => (w === 'scorch'
    ? [{ pos: 'v', text: 'burn the surface of' }, { pos: 'n', text: 'a discoloration due to heat' }]
    : null),
}));

import RhymeSearch from '../components/RhymeSearch.jsx';
import HistoryScreen from '../components/HistoryScreen.jsx';

afterEach(cleanup);

describe('the word reference carries meaning, not just rhymes', () => {
  it('shows both senses alongside the rhymes', async () => {
    render(<RhymeSearch initialQuery="scorch" onClose={() => {}} />);
    expect(await screen.findByText(/burn the surface of/)).toBeTruthy();
    expect(screen.getByText(/a discoloration due to heat/)).toBeTruthy();
    // Rhymes still render — the definition is additive, not a replacement.
    expect(screen.getByText('torch')).toBeTruthy();
  });

  it('opened with a word in hand, searches it without waiting for input', async () => {
    render(<RhymeSearch initialQuery="scorch" onClose={() => {}} />);
    // The heading only renders once results are in, so its presence IS the assertion
    // that the search ran on mount rather than waiting for a tap on Find.
    expect(await screen.findByRole('heading', { name: 'scorch' })).toBeTruthy();
    expect(screen.getByPlaceholderText(/Enter any word/).value).toBe('scorch');
  });

  it('opened cold, shows the empty state and no definition block', () => {
    render(<RhymeSearch onClose={() => {}} />);
    expect(screen.getByText(/Type any word/)).toBeTruthy();
    expect(screen.queryByText(/burn the surface of/)).toBeNull();
  });

  it('a word outside the banks still gets its rhymes, just no meaning', async () => {
    render(<RhymeSearch initialQuery="zzzz" onClose={() => {}} />);
    expect(await screen.findByText('torch')).toBeTruthy();
    expect(screen.queryByText(/burn the surface of/)).toBeNull();
  });
});

describe('History: a frozen word can be looked up again', () => {
  const session = {
    id: 's1', date: new Date('2026-08-01T12:00:00Z').toISOString(), duration: 300,
    notes: { scorch: { e1: 'left the whole verse scorched' } },
    frozenWords: ['scorch'],
  };
  const props = {
    resetToIdle: () => {}, sessionHistory: [session], setSessionHistory: () => {},
    fmtDate: () => 'Aug 1', fmtDur: (s) => `${s}s`,
    flattenNotes: (n) => Object.entries(n || {}).flatMap(([w, e]) => Object.entries(e).map(([id, t]) => [w, id, t])),
    copyNoteText: () => {}, copiedNoteKey: null,
    historyAtCap: false, historyCount: 1,
    handleExportData: () => {}, handleExportBars: () => {},
    vault: [], toggleVault: () => {},
  };

  beforeEach(() => {
    navigator.clipboard = { writeText: () => Promise.resolve() };
  });

  it('the chip is a button that opens the reference on that word', async () => {
    render(<HistoryScreen {...props} />);
    const chip = screen.getByRole('button', { name: /Look up scorch/i });
    fireEvent.click(chip);
    expect(await screen.findByText(/burn the surface of/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/Enter any word/).value).toBe('scorch');
  });

  it('closing the reference returns to History without losing it', async () => {
    render(<HistoryScreen {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Look up scorch/i }));
    await screen.findByText(/burn the surface of/);
    fireEvent.click(screen.getByRole('button', { name: /Close Rhyme Search/i }));
    await waitFor(() => expect(screen.queryByText(/burn the surface of/)).toBeNull());
    expect(screen.getByRole('button', { name: /Look up scorch/i })).toBeTruthy();
  });
});
