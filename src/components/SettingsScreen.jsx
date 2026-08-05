import { useState, useEffect, useRef } from 'react';
import { loadAnalyticsOptOut, saveAnalyticsOptOut } from '../services/storage';
import { previewTick, closePreviewTick } from '../services/audio-clock';

// ─────────────────────────────────────────────
// SETTINGS
//
// Privacy used to live inside the Vault, next to Backup & Restore, on the reasoning that
// a writer thinking about where their work lives is already in the right frame of mind.
// That was true and still wrong: it made the disclosure findable only by someone already
// looking for it, in a screen named after something else. A promise about what leaves
// the device belongs where anyone would look for it.
//
// So: everything that changes how the app behaves rather than what it prompts you with,
// on one screen. Backup and Restore stay in the Vault, because those act on the vault's
// own contents.
// ─────────────────────────────────────────────

export default function SettingsScreen({ resetToIdle, hapticsOn, setHapticsOn, metronomeVolume, setMetronomeVolume }) {
  const [analyticsOff, setAnalyticsOff] = useState(() => loadAnalyticsOptOut());

  // Preview the click while dragging, throttled so a drag doesn't machine-gun. The
  // context is torn down on leaving the screen rather than left open.
  const lastPreviewRef = useRef(0);
  useEffect(() => closePreviewTick, []);
  const onVolumeChange = (v) => {
    setMetronomeVolume(v);
    const now = Date.now();
    if (now - lastPreviewRef.current > 120) { lastPreviewRef.current = now; previewTick(v); }
  };

  const Row = ({ label, hint, value, onClick, pressed }) => (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      className="w-full text-left py-4 px-5 rounded-2xl border border-white/5 bg-[#0f0f0f] hover:bg-[#151515] transition-all active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-bold text-gray-200">{label}</span>
        <span className="text-xs font-black uppercase tracking-widest text-gray-400 shrink-0">{value}</span>
      </div>
      {hint && <p className="text-[10px] text-gray-600 mt-1.5 leading-relaxed">{hint}</p>}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto w-full custom-scrollbar pb-36">
      <div className="w-full mt-6 max-w-2xl">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={resetToIdle} aria-label="Back to home" className="w-10 h-10 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/10 transition-all">←</button>
          <h2 className="text-3xl font-black tracking-tighter uppercase">Settings</h2>
        </div>

        <div className="space-y-3 mb-8">
          <Row
            label="Haptics"
            hint="A short pulse when a word changes or a bar is saved."
            value={hapticsOn ? 'On' : 'Off'}
            pressed={hapticsOn}
            onClick={() => setHapticsOn(!hapticsOn)}
          />

          {/* Off is a real option here, not an edge case. Running a tempo session over
              your own instrumental means you already have the count — the click is then
              something to turn down rather than a feature. Silencing it leaves the bar
              grid itself running, so words still change on the beat. */}
          <div className="w-full py-4 px-5 rounded-2xl border border-white/5 bg-[#0f0f0f]">
            <div className="flex items-center justify-between gap-4 mb-1">
              <span className="text-sm font-bold text-gray-200">Metronome</span>
              <span className="text-xs font-black uppercase tracking-widest text-gray-400 shrink-0 tabular-nums">
                {metronomeVolume <= 0 ? 'Silent' : `${Math.round(metronomeVolume * 100)}%`}
              </span>
            </div>
            <p className="text-[10px] text-gray-600 mb-3 leading-relaxed">
              The click, and the count-in before a tempo session. Drag to hear it at that
              level. Silent still keeps the bar grid — words change on the beat either way.
            </p>
            <input
              type="range" min="0" max="1" step="0.05"
              value={metronomeVolume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              aria-label="Metronome volume"
              className="w-full appearance-none bg-transparent focus:outline-none"
            />
          </div>
        </div>

        {/* Privacy gets the room to be read rather than a line in a list. It is the one
            thing here a writer might reasonably want to check before trusting the app
            with unreleased work. */}
        <div className="bg-[#0f0f0f] border border-white/5 rounded-2xl p-5 mb-5">
          <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3">Privacy</p>
          <p className="text-sm text-gray-300 leading-relaxed mb-4">
            <span className="text-white font-bold">Your bars never leave this device.</span>{' '}
            Not a bar, not a saved word, not a rhyme search. There is no account and no
            server holding a copy — which is also why a backup is the only way to move
            your work, or get it back.
          </p>
          <p className="text-xs text-gray-500 leading-relaxed mb-4">
            Barsmith does send anonymous counts — that a session happened, roughly how
            long, roughly how many bars — so it can tell which parts are worth keeping.
            No cookies, nothing that ties any of it to you.
          </p>
          <button
            onClick={() => { const next = !analyticsOff; setAnalyticsOff(next); saveAnalyticsOptOut(next); }}
            aria-pressed={!analyticsOff}
            className={`w-full py-3.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${analyticsOff ? 'bg-[#0a0a0a] border-white/8 text-gray-500 hover:text-gray-300' : 'bg-white/6 border-white/10 text-gray-200 hover:bg-white/10'}`}
          >
            {analyticsOff ? 'Anonymous counts: off' : 'Anonymous counts: on'}
          </button>
          <p className="text-[10px] text-gray-700 mt-3 leading-relaxed">
            {analyticsOff
              ? 'Nothing is being sent. Tap to help improve Barsmith.'
              : 'Tap to turn this off. Everything else works exactly the same.'}
          </p>
          <p className="text-[10px] text-gray-700 mt-3 leading-relaxed">
            One exception, so you know: tapping a word for its <em>synonyms</em> sends
            that single word to a public dictionary. Just the word, only when you tap.
          </p>
          {/* The full policy is a page rather than more text here: the App Store requires a
              hosted one, and a writer who wants the specifics deserves the specifics
              without this screen becoming a document. */}
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white underline underline-offset-4 transition-colors"
          >
            Full privacy policy →
          </a>
        </div>

        <p className="text-[10px] text-gray-700 text-center leading-relaxed">
          Your work lives on this device — back it up from Saved Words.
        </p>
      </div>
    </div>
  );
}
