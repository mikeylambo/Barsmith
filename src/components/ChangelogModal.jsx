import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

// ─────────────────────────────────────────────
// CHANGELOG MODAL — "what's new"
//
// The quality work has been shipping invisibly: a writer got a faster app, a safer
// restore, real offline rhymes, and never saw one of them land. This makes the polish
// visible after an update — briefly, once, then gone until the next version ships. It is
// deliberately writer-facing: what changed for them, not the engineering behind it.
// ─────────────────────────────────────────────

export default function ChangelogModal({ entries = [], onClose }) {
  const modalRef = useRef(null);
  useFocusTrap(modalRef);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/92 backdrop-blur-md" onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="What's new in Barsmith" className="bg-[#0f0f0f] border border-white/10 rounded-3xl overflow-hidden max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-8 pb-0">
          <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-1">Updated</p>
          <h3 className="text-3xl font-black uppercase tracking-tighter mb-6">What&apos;s New</h3>
        </div>
        <div className="overflow-y-auto custom-scrollbar max-h-[58vh] px-8 pb-2">
          {entries.length === 0 ? (
            <p className="text-gray-600 text-sm leading-relaxed pb-4">You&apos;re on the latest version. Nothing new to show.</p>
          ) : (
            <div className="space-y-7">
              {entries.map(entry => (
                <div key={entry.version}>
                  <div className="flex items-baseline gap-3 mb-3">
                    <span className="text-white font-black text-sm uppercase tracking-wide">{entry.title}</span>
                    <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest tabular-nums">v{entry.version}</span>
                  </div>
                  <ul className="space-y-2.5">
                    {entry.items.map((item, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="text-orange-400 text-xs pt-0.5 shrink-0">▸</span>
                        <span className="text-gray-400 text-sm leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-8 pt-6">
          <button onClick={onClose} className="w-full py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-colors active:scale-95">Got It</button>
        </div>
      </div>
    </div>
  );
}
