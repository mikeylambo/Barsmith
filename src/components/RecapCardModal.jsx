import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { renderRecapCard, recapCardFilename } from '../services/recap-card';
import { shareImage, canShareImages } from '../services/share';
import { downloadBlob } from '../services/download';

// ─────────────────────────────────────────────
// RECAP CARD MODAL
// Choose a bar to feature, then preview and share the session recap as an image.
//
// The writer picks which line to feature — Barsmith does not decide it. So this opens on a
// chooser rather than a finished card: the session's bars, plus "no featured bar" for a
// stats-only recap. Only once a choice is made is the card rendered, and — as with the bar
// card — the render completes before Share is tappable, because iOS Safari only honours
// navigator.share() inside a live user gesture and awaiting a canvas encode first would
// drop the activation. See services/share.js.
// ─────────────────────────────────────────────

const oneLinePreview = (text) => {
  const first = String(text || '').split('\n').find(l => l.trim()) || '';
  return first.length > 46 ? `${first.slice(0, 46).trimEnd()}…` : first;
};

export default function RecapCardModal({ stats, bars = [], date, onClose }) {
  const modalRef = useRef(null);
  useFocusTrap(modalRef);

  const [step, setStep] = useState('choose');      // choose | rendering | ready | error
  const [selected, setSelected] = useState(bars.length ? 0 : -1); // bar index, or -1 for none
  const [previewUrl, setPreviewUrl] = useState(null);
  const [outcome, setOutcome] = useState('');
  const blobRef = useRef(null);
  const urlRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Revoke the last preview URL when the modal closes.
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const chosen = selected >= 0 ? bars[selected] : null;
  const filename = recapCardFilename(date);

  const createRecap = () => {
    setStep('rendering');
    setOutcome('');
    renderRecapCard({ stats, bar: chosen?.text, word: chosen?.word, date })
      .then((blob) => {
        blobRef.current = blob;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setPreviewUrl(url);
        setStep('ready');
      })
      .catch(() => setStep('error'));
  };

  const handleShare = async () => {
    if (!blobRef.current) return;
    const result = await shareImage(blobRef.current, filename);
    if (result === 'downloaded') setOutcome('Saved to your device.');
    else if (result === 'failed') setOutcome('Could not share the recap. Your session is still saved.');
    else setOutcome(''); // shared or cancelled: the OS already gave feedback
  };

  const handleSave = () => {
    if (!blobRef.current) return;
    try {
      downloadBlob(filename, blobRef.current);
      setOutcome('Saved to your device.');
    } catch {
      setOutcome('Could not save the image.');
    }
  };

  const shareSupported = canShareImages();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/92 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Share this session recap as an image"
        className="bg-[#0f0f0f] border border-white/10 rounded-3xl overflow-hidden max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-0 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-1">Share</p>
            <h3 className="text-2xl font-black uppercase tracking-tighter">Session Recap</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/5 text-gray-500 hover:bg-white/10 hover:text-white transition-all"
          >✕</button>
        </div>

        {step === 'choose' ? (
          <div className="p-6">
            <p className="text-gray-500 text-xs font-black uppercase tracking-widest mb-3">Choose a bar to feature</p>
            <div role="radiogroup" aria-label="Bar to feature" className="flex flex-col gap-2 max-h-[42vh] overflow-y-auto custom-scrollbar">
              {bars.map((b, i) => (
                <button
                  key={i}
                  role="radio"
                  aria-checked={selected === i}
                  onClick={() => setSelected(i)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all ${selected === i ? 'bg-white/10 border-white/30' : 'bg-[#0a0a0a] border-white/5 hover:bg-[#151515]'}`}
                >
                  <span className="block text-[9px] font-black uppercase tracking-widest text-gray-600 mb-0.5">{b.word}</span>
                  <span className="block text-sm text-gray-200 truncate">{oneLinePreview(b.text)}</span>
                </button>
              ))}
              <button
                role="radio"
                aria-checked={selected === -1}
                onClick={() => setSelected(-1)}
                className={`text-left px-4 py-3 rounded-xl border transition-all ${selected === -1 ? 'bg-white/10 border-white/30' : 'bg-[#0a0a0a] border-white/5 hover:bg-[#151515]'}`}
              >
                <span className="block text-sm font-bold text-gray-400">No featured bar — stats only</span>
              </button>
            </div>
            <button
              onClick={createRecap}
              className="w-full mt-5 py-4 rounded-2xl bg-white text-black text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-[0.98]"
            >
              Create Recap
            </button>
          </div>
        ) : (
          <div className="p-6">
            {/* Fixed aspect box so the modal does not resize when the render lands. */}
            <div className="w-full aspect-square rounded-2xl overflow-hidden border border-white/10 bg-[#050505] flex items-center justify-center">
              {step === 'rendering' && (
                <p className="text-gray-700 text-[10px] font-black uppercase tracking-widest">Rendering…</p>
              )}
              {step === 'error' && (
                <p className="text-gray-600 text-xs text-center px-6 leading-relaxed">
                  Could not draw the recap. Your session is still saved — everything is in History.
                </p>
              )}
              {step === 'ready' && previewUrl && (
                <img src={previewUrl} alt="Session recap card with your stats and your chosen bar" className="w-full h-full object-contain" />
              )}
            </div>

            {step === 'ready' && (
              <div className="mt-5 flex flex-col gap-3">
                {shareSupported ? (
                  <button
                    onClick={handleShare}
                    className="w-full py-4 rounded-2xl bg-white text-black text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                  >
                    Share
                  </button>
                ) : (
                  <button
                    onClick={handleSave}
                    className="w-full py-4 rounded-2xl bg-white text-black text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                  >
                    Save Image
                  </button>
                )}
                {bars.length > 0 && (
                  <button
                    onClick={() => setStep('choose')}
                    className="text-[10px] font-black uppercase tracking-widest text-gray-600 hover:text-white transition-colors"
                  >
                    ← Choose a different bar
                  </button>
                )}
                {outcome && (
                  <p className="text-center text-gray-500 text-[11px] font-bold" role="status">{outcome}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
