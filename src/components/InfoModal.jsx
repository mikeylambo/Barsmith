import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

// The How To is the only place Barsmith gets to explain itself, and the first draft used
// the room badly: eleven steps, several of them describing a control rather than a
// reason to touch it, and a couple written for someone who already knew what the app was
// ("practise to the actual time signature, not a vague timer" answers an objection
// nobody has yet).
//
// Rewritten around what a writer needs in the order they need it. Two rules held
// throughout: say what the thing is FOR, not what it does, and never explain a term the
// screen itself does not use. Level and Scheme stay near the top because they are the
// only controls labelled with bare numbers, and everything after them is optional.
const STEPS = [
  ['01', 'The Session',  'A word lands. Build a bar around it before the next one arrives. That is the whole exercise — repeated until reaching for a rhyme stops being something you think about.'],
  ['02', 'Level',        'How much word you get. 1 is single-syllable and quick to place. 2 is heavier. 3 is three syllables or more, where the bar has to bend to fit it. Start at 1 for speed, move up for control.'],
  ['03', 'Scheme',       'How many words at once. Set 2 or more and they arrive together, unrelated, and the job is landing them all in one punchline. This is the hard version.'],
  ['04', 'Tap a Word',   'Tap the word on screen to hold it there. You get everything it rhymes with, what it means, and somewhere to write — without losing the round.'],
  ['05', 'Today',        'The card at the top has already picked a session for you. Different every day of the week. For when you have ten minutes and no appetite for choosing settings.'],
  ['06', 'Rhymes',       'Search any word. Perfect rhymes, multis, slant, assonance — sorted by what kind they are, because they are not the same tool. Works with no signal.'],
  ['07', 'Saved Words',  'Star a word to keep it. Saved words come back in your sessions, and you can run a session on nothing but those. Add your own too — names, slang, places.'],
  ['08', 'Your Bars',    'Everything you write is kept. Take it out as text, or as an image built for posting. History has all of it.'],
  ['09', 'Beat or Timer','Load an instrumental, run the metronome, or lock the words to a bar count at a set BPM. Or leave it silent and work off the clock.'],
  ['10', 'Record',       'Capture yourself while you write, then watch it back. The bar you liked in your head is not always the one that landed.'],
  ['11', 'It Stays Here','Your bars never leave this device — the rhymes and definitions are worked out on it too, so none of this needs a signal. Details and an off switch in Settings.'],
];

export default function InfoModal({ onClose }) {
  const modalRef = useRef(null);
  useFocusTrap(modalRef);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/92 backdrop-blur-md" onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" className="bg-[#0f0f0f] border border-white/10 rounded-3xl overflow-hidden max-w-md w-full shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="p-8 pb-0">
          <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-1">How to</p>
          <h3 className="text-3xl font-black uppercase tracking-tighter mb-6">Smith</h3>
        </div>
        <div className="overflow-y-auto custom-scrollbar max-h-[58vh] px-8 pb-2">
          <ul className="space-y-5">
            {STEPS.map(([n,title,desc]) => (
              <li key={n} className="flex gap-4">
                <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest pt-0.5 w-4 shrink-0">{n}</span>
                <div>
                  <p className="text-white font-black text-sm uppercase tracking-wide mb-0.5">{title}</p>
                  <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-8 pt-6">
          <button onClick={onClose} className="w-full py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-colors active:scale-95">Let's Work</button>
        </div>
      </div>
    </div>
  );
}
