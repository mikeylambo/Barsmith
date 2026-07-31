import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

// The two settings that most need explaining are the two labelled with bare numbers —
// a writer opening the app sees "Level: 1 2 3" and "Scheme: 1 2 3 4" with nothing
// saying what either does. Both now lead here, and both carry a caption on the setup
// screen itself.
const STEPS = [
  ['01','Session',     'Words rotate at your tempo. Rap over them. Build bars, find internal rhymes, discover new angles on familiar sounds.'],
  ['02','Level',       'How heavy the words hit. Level 1 is single-syllable — short, concrete, fast to rhyme. Level 2 is two syllables. Level 3 is three or more, where you have to bend a phrase to make it land. Start at 1 to build speed, move up to build control. No level is the "real" one.'],
  ['03','Scheme',      'How many words at once. 1 is a straight prompt. Set 2–4 and you get unrelated words drawn from across the levels at the same time — the work is bridging them into one punchline before the round ends. Harder than a bigger word, and where the craft lives.'],
  ['04','Tap to Lock', 'Tap any word to freeze and pull its full rhyme family, syllable count, synonyms, and definition. Write a bar directly in the panel.'],
  ['05','BPM Grid',    'Lock word changes to a real bar grid. Set BPM and bars-per-word — practice to the actual time signature, not a vague timer.'],
  ['06','Session Timer','Set a 5–20 minute block. Session ends automatically with a summary. Serious writers work in timed sprints — this is that.'],
  ['07','Rhyme Search','Type any word and get a full rhyme map bucketed by syllable count. Perfect, near, and phonetic matches. Tap to copy.'],
  ['08','Your Words',  'Add personal vocabulary in the Vault — names, slang, places. They surface in your sessions. The tool becomes yours.'],
  ['09','Vault Drill', "Your saved words become a custom session. Drill vocabulary you've claimed — words you know are yours."],
  ['10','Record',      'Capture yourself while you write. Review the footage, clip the best moments, study your own flow.'],
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
