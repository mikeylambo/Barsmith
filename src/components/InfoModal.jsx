import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

const STEPS = [
  ['01','Session',     'Words rotate at your tempo. Rap over them. Build bars, find internal rhymes, discover new angles on familiar sounds.'],
  ['02','Tap to Lock', 'Tap any word to freeze and pull its full rhyme family, syllable count, synonyms, and definition. Write a bar directly in the panel.'],
  ['03','Scheme Mode', 'Set word count to 2–4 to run multiple words at once. Bridge unrelated concepts into a punchline. This is where the craft lives.'],
  ['04','BPM Grid',    'Lock word changes to a real bar grid. Set BPM and bars-per-word — practice to the actual time signature, not a vague timer.'],
  ['05','Session Timer','Set a 5–20 minute block. Session ends automatically with a summary. Serious writers work in timed sprints — this is that.'],
  ['06','Rhyme Search','Type any word and get a full rhyme map bucketed by syllable count. Perfect, near, and phonetic matches. Tap to copy.'],
  ['07','Your Words',  'Add personal vocabulary in the Vault — names, slang, places. They surface in your sessions. The tool becomes yours.'],
  ['08', 'Vault Drill', "Your saved words become a custom session. Drill vocabulary you've claimed — words you know are yours."],
  ['09','Record',      'Capture yourself on front camera while you write. Review the footage, clip the best moments, study your own flow.'],
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
