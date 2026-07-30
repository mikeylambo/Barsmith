import { Component } from 'react';
import { STORAGE_KEYS, exportAllData } from '../services/storage';
import { downloadText, dateStamp } from '../services/download';

// ─────────────────────────────────────────────
// ERROR BOUNDARY
// Without this, any render-time exception unmounts the whole tree and leaves a
// black screen. That is the worst possible failure for this app specifically:
// every bar the writer has ever saved is sitting in localStorage, intact and
// completely unreachable, with no UI left to export it through.
//
// So this screen's job is not to look apologetic — it's to guarantee the work
// gets out. `exportAllData()` reads localStorage directly and touches no React
// state, so the backup button keeps working even when the component tree that
// crashed was holding corrupt data.
//
// The reset button exists for the one failure mode a reload cannot fix: if a
// malformed record is what crashes the render, every reload crashes again and
// the writer is stuck in a loop. Reset clears only Barsmith's own keys, and
// only after the confirm text has told them to grab a backup first.
// ─────────────────────────────────────────────

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, savedBackup: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // No telemetry endpoint by design — Barsmith stores nothing off-device. The
    // console trace is what a writer can screenshot into a bug report.
    console.error('[Barsmith] Unrecoverable render error:', error, info?.componentStack);
  }

  handleBackup = () => {
    try {
      downloadText(
        `barsmith-rescue-${dateStamp()}.json`,
        exportAllData(),
        'application/json',
      );
      this.setState({ savedBackup: true });
    } catch {
      // Storage itself is unreadable; the reset path is all that's left.
      this.setState({ savedBackup: false });
    }
  };

  handleReset = () => {
    const ok = confirm(
      'Reset Barsmith?\n\nThis erases every session, saved word, and preference on this device. ' +
      'Download a backup first if you have not already — this cannot be undone.',
    );
    if (!ok) return;
    try {
      Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('flowForgeVault'); // legacy key from pre-5.x builds
    } catch {}
    location.reload();
  };

  render() {
    const { error, savedBackup } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[100dvh] w-full bg-[#050505] text-white flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-3">
            Something broke
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-4">
            Your bars are safe
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed mb-8">
            Barsmith hit an error it could not recover from. Nothing has been deleted — every
            session and saved word is still stored on this device. Download a backup, then
            reload.
          </p>

          <button
            onClick={this.handleBackup}
            className={`w-full py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all mb-3 ${
              savedBackup
                ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                : 'bg-white text-black hover:bg-gray-200'
            }`}
          >
            {savedBackup ? '✓ Backup downloaded' : '⬇ Download backup'}
          </button>

          <button
            onClick={() => location.reload()}
            className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-black uppercase tracking-widest hover:bg-white/10 transition-all mb-3"
          >
            Reload Barsmith
          </button>

          <button
            onClick={this.handleReset}
            className="w-full py-3 text-gray-700 text-[11px] font-black uppercase tracking-widest hover:text-red-400 transition-colors"
          >
            Reload keeps crashing — reset app data
          </button>

          {/* Collapsed rather than hidden: a writer filing an issue needs something to
              paste, but a stack trace should not be the first thing they see. */}
          <details className="mt-6">
            <summary className="text-gray-700 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:text-gray-500 transition-colors">
              Technical details
            </summary>
            <pre className="mt-3 p-4 bg-[#0f0f0f] border border-white/5 rounded-xl text-[10px] text-gray-500 overflow-x-auto whitespace-pre-wrap select-text">
              {String(error?.stack || error?.message || error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
