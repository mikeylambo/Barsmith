/* @vitest-environment jsdom */
//
// Two things a public release must not get wrong:
//
//  1. A render crash must still leave the writer a way to retrieve their bars.
//     The boundary's whole reason for existing is that localStorage survives the
//     crash while the UI does not, so the backup path is tested against a tree
//     that has genuinely thrown.
//  2. History search must actually narrow a multi-session archive — it is the
//     only way to find a remembered bar once the list grows.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import HistoryScreen from '../components/HistoryScreen.jsx';
import { flattenNotes } from '../services/export-text.js';

function Boom() {
  throw new Error('synthetic render failure');
}

// jsdom re-reports a caught React render error as an uncaught window error and dumps
// the full stack. The throw below is deliberate, so swallow it and keep the suite
// output readable.
const swallowExpectedThrow = (e) => e.preventDefault();

describe('ErrorBoundary', () => {
  let clickedAnchor;

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    clickedAnchor = null;
    window.addEventListener('error', swallowExpectedThrow);
    // React logs caught render errors; silence it so a passing run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.URL.createObjectURL = vi.fn(() => 'blob:test');
    window.URL.revokeObjectURL = vi.fn();
    // Capture the synthesized download instead of letting jsdom navigate.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clickedAnchor = { download: this.download, href: this.href };
    });
  });
  afterEach(() => {
    window.removeEventListener('error', swallowExpectedThrow);
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders children untouched when nothing throws', () => {
    render(<ErrorBoundary><p>all good</p></ErrorBoundary>);
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('replaces a crashed tree with the rescue screen instead of blanking', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('Your bars are safe')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download backup/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reload Barsmith/ })).toBeTruthy();
  });

  it('still exports saved work after a crash, because the backup reads storage directly', () => {
    localStorage.setItem('barsmithHistory', JSON.stringify([
      { id: 1, date: '2026-07-30T12:00:00.000Z', notes: { fracture: { a: 'a bar worth keeping' } } },
    ]));
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: /Download backup/ }));
    expect(clickedAnchor?.download).toMatch(/^barsmith-rescue-\d{4}-\d{2}-\d{2}\.json$/);
    expect(screen.getByRole('button', { name: /Backup downloaded/ })).toBeTruthy();
  });

  it('clears only Barsmith keys on reset, leaving other origin data alone', () => {
    localStorage.setItem('barsmithHistory', '[]');
    localStorage.setItem('barsmithVault', '[]');
    localStorage.setItem('someOtherApp', 'keep me');
    vi.stubGlobal('confirm', vi.fn(() => true));
    // jsdom throws on real navigation; a stub keeps the reload observable.
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload }, writable: true });

    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: /reset app data/ }));

    expect(localStorage.getItem('barsmithHistory')).toBeNull();
    expect(localStorage.getItem('barsmithVault')).toBeNull();
    expect(localStorage.getItem('someOtherApp')).toBe('keep me');
    expect(reload).toHaveBeenCalled();
  });

  it('does not wipe anything when the reset confirm is declined', () => {
    localStorage.setItem('barsmithHistory', '["kept"]');
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: /reset app data/ }));
    expect(localStorage.getItem('barsmithHistory')).toBe('["kept"]');
  });
});

describe('History search', () => {
  const history = [
    {
      id: 1, date: '2026-07-30T12:00:00.000Z', duration: 120, tier: 1, wordCount: 1, pace: '2.0s',
      frozenWords: ['lantern'], notes: { lantern: { a: 'holding up a lantern' } },
    },
    {
      id: 2, date: '2026-07-29T12:00:00.000Z', duration: 90, tier: 2, wordCount: 1, pace: '90 BPM',
      frozenWords: ['verdict'], notes: { verdict: { a: 'the jury never blinked' } },
    },
  ];

  const renderHistory = () => render(
    <HistoryScreen
      sessionHistory={history}
      historyAtCap={false}
      historyCount={history.length}
      handleExportData={vi.fn()}
      handleExportBars={vi.fn()}
      resetToIdle={vi.fn()}
      setSessionHistory={vi.fn()}
      fmtDate={(d) => d.slice(0, 10)}
      fmtDur={(s) => `${s}s`}
      flattenNotes={flattenNotes}
      copyNoteText={vi.fn()}
      copiedNoteKey={null}
    />
  );

  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('matches on bar text, hiding sessions that do not', () => {
    renderHistory();
    fireEvent.change(screen.getByLabelText('Search session history'), { target: { value: 'jury' } });
    expect(screen.getByText(/1 of 2 sessions match/)).toBeTruthy();
    expect(screen.getByText(/the jury never blinked/)).toBeTruthy();
    expect(screen.queryByText(/holding up a lantern/)).toBeNull();
  });

  it('matches on a frozen word as well as written text', () => {
    renderHistory();
    fireEvent.change(screen.getByLabelText('Search session history'), { target: { value: 'verdict' } });
    expect(screen.getByText(/1 of 2 sessions match/)).toBeTruthy();
  });

  it('is case-insensitive', () => {
    renderHistory();
    fireEvent.change(screen.getByLabelText('Search session history'), { target: { value: 'LANTERN' } });
    expect(screen.getByText(/1 of 2 sessions match/)).toBeTruthy();
  });

  it('reports a miss rather than showing an unexplained empty list', () => {
    renderHistory();
    fireEvent.change(screen.getByLabelText('Search session history'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No sessions match/)).toBeTruthy();
  });

  it('restores the full archive when the query is cleared', () => {
    renderHistory();
    const input = screen.getByLabelText('Search session history');
    fireEvent.change(input, { target: { value: 'jury' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText(/holding up a lantern/)).toBeTruthy();
    expect(screen.getByText(/the jury never blinked/)).toBeTruthy();
  });
});

// Copying a whole session moves more work than a single note, so the button must
// report what actually happened. Some in-app browsers expose no clipboard at all,
// and a checkmark over a failed write is how a writer loses a verse.
describe('Copy All reports real clipboard outcomes', () => {
  const session = {
    id: 7, date: '2026-07-30T12:00:00.000Z', duration: 60, tier: 1, wordCount: 1, pace: '2.0s',
    frozenWords: ['ember'], notes: { ember: { a: 'a bar to copy' } },
  };

  const renderOne = () => render(
    <HistoryScreen
      sessionHistory={[session]} historyAtCap={false} historyCount={1}
      handleExportData={vi.fn()} handleExportBars={vi.fn()} resetToIdle={vi.fn()}
      setSessionHistory={vi.fn()} fmtDate={(d) => d.slice(0, 10)} fmtDur={(s) => `${s}s`}
      flattenNotes={flattenNotes} copyNoteText={vi.fn()} copiedNoteKey={null}
    />
  );

  beforeEach(() => cleanup());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('confirms success when the clipboard write resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderOne();
    fireEvent.click(screen.getByRole('button', { name: 'Copy All' }));
    expect(writeText).toHaveBeenCalledWith('a bar to copy');
    expect(await screen.findByRole('button', { name: '✓ Copied' })).toBeTruthy();
  });

  it('surfaces a failure when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderOne();
    fireEvent.click(screen.getByRole('button', { name: 'Copy All' }));
    expect(await screen.findByRole('button', { name: 'Failed' })).toBeTruthy();
  });

  it('surfaces a failure when there is no clipboard API at all', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    renderOne();
    fireEvent.click(screen.getByRole('button', { name: 'Copy All' }));
    expect(await screen.findByRole('button', { name: 'Failed' })).toBeTruthy();
  });
});
