import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

// ─────────────────────────────────────────────
// ONBOARDING — the first-run walkthrough
//
// The one thing a first-time writer cannot infer from the screen is where their work
// goes. Barsmith keeps writing in three distinct places — the Bar Pad you write in
// during a round, the Saved Words you star to keep, and the History that holds every
// finished session — and nothing in the app has ever explained that split. A dense
// eleven-step "How To" existed, but a reference is the wrong shape for a first launch:
// it answers questions nobody has yet.
//
// So: three screens, skippable, shown exactly once (gated by hasSeenInfo in storage).
// The detailed How To stays one tap away behind the ? button for anyone who wants it.
// ─────────────────────────────────────────────

const SLIDES = [
  {
    kicker: 'Welcome',
    title: 'The Rep',
    body: 'Barsmith is a writing gym. A word lands on screen — you build a bar around it before the next one arrives. That’s the whole exercise, repeated until reaching for a rhyme stops being something you think about.',
  },
  {
    kicker: 'Where your work lives',
    title: 'Three Places',
    // The core of the walkthrough: the split the app never explained.
    points: [
      ['Bar Pad', 'Tap a word mid-round to hold it, and write your bar right there — rhymes and a definition included — without losing the session.'],
      ['Saved Words', 'Star a word to keep it. Saved words come back in future sessions, and you can run a whole session on nothing but them.'],
      ['History', 'Every finished session is kept in full, so a bar is never lost to the round ending. Take it out as text or an image any time.'],
    ],
  },
  {
    kicker: 'And it’s yours',
    title: 'Stays On This Device',
    body: 'No account, no server, works with no signal. Your bars, saved words, and rhyme lookups are all worked out and stored right here — which is also why a backup, from Saved Words, is the way to keep them safe.',
  },
];

export default function Onboarding({ onDone }) {
  const modalRef = useRef(null);
  useFocusTrap(modalRef);
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDone]);

  const next = () => (last ? onDone() : setI(n => n + 1));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/95 backdrop-blur-md">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Welcome to Barsmith" className="bg-[#0f0f0f] border border-white/10 rounded-3xl overflow-hidden max-w-md w-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-8 pt-7">
          <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">{slide.kicker}</p>
          {!last && (
            <button onClick={onDone} className="text-[10px] font-black uppercase tracking-widest text-gray-600 hover:text-white transition-colors">Skip</button>
          )}
        </div>

        <div className="px-8 pt-3 pb-2 overflow-y-auto custom-scrollbar max-h-[62vh]">
          <h3 className="text-4xl font-black uppercase tracking-tighter mb-5">{slide.title}</h3>

          {slide.body && (
            <p className="text-gray-400 text-base leading-relaxed">{slide.body}</p>
          )}

          {slide.points && (
            <ul className="space-y-5 mt-1">
              {slide.points.map(([name, desc]) => (
                <li key={name}>
                  <p className="text-white font-black text-sm uppercase tracking-wide mb-1">{name}</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-8 pb-8 pt-5 mt-auto">
          <div className="flex items-center justify-center gap-2 mb-5" role="tablist" aria-label="Walkthrough progress">
            {SLIDES.map((_, n) => (
              <span
                key={n}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all ${n === i ? 'w-6 bg-white' : 'w-1.5 bg-white/20'}`}
              />
            ))}
          </div>
          <button
            onClick={next}
            className="w-full py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-colors active:scale-95"
          >
            {last ? 'Start Writing' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
