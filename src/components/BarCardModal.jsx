import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { renderBarCard, barCardFilename } from '../services/bar-card';
import { shareImage, canShareImages } from '../services/share';
import { downloadBlob } from '../services/download';

// ─────────────────────────────────────────────
// BAR CARD MODAL
// Preview and share a single bar as an image.
//
// The card is rendered as soon as the modal opens, before the writer taps
// anything. That is not just for perceived speed: iOS Safari only honours
// navigator.share() inside a live user gesture, and awaiting a canvas encode
// first would drop the activation and silently open nothing. By the time Share
// is tappable the blob already exists, so the handler can call share straight
// away. See services/share.js.
// ─────────────────────────────────────────────

export default function BarCardModal({ bar, word, onClose }) {
  const modalRef = useRef(null);
  useFocusTrap(modalRef);

  const [state, setState] = useState('rendering'); // rendering | ready | error
  const [previewUrl, setPreviewUrl] = useState(null);
  const blobRef = useRef(null);
  const [outcome, setOutcome] = useState('');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    let url = null;
    renderBarCard({ bar, word })
      .then((blob) => {
        if (cancelled) return;
        blobRef.current = blob;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bar, word]);

  const filename = barCardFilename(word);

  const handleShare = async () => {
    if (!blobRef.current) return;
    const result = await shareImage(blobRef.current, filename);
    if (result === 'downloaded') setOutcome('Saved to your device.');
    else if (result === 'failed') setOutcome('Could not share the card. Your bar is still saved.');
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
        aria-label="Share this bar as an image"
        className="bg-[#0f0f0f] border border-white/10 rounded-3xl overflow-hidden max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-0 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-1">Share</p>
            <h3 className="text-2xl font-black uppercase tracking-tighter">Bar Card</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/5 text-gray-500 hover:bg-white/10 hover:text-white transition-all"
          >✕</button>
        </div>

        <div className="p-6">
          {/* Fixed aspect box so the modal does not resize when the render lands. */}
          <div className="w-full aspect-square rounded-2xl overflow-hidden border border-white/10 bg-[#050505] flex items-center justify-center">
            {state === 'rendering' && (
              <p className="text-gray-700 text-[10px] font-black uppercase tracking-widest">Rendering…</p>
            )}
            {state === 'error' && (
              <p className="text-gray-600 text-xs text-center px-6 leading-relaxed">
                Could not draw the card. Your bar is still saved — use Copy or Export instead.
              </p>
            )}
            {state === 'ready' && previewUrl && (
              <img src={previewUrl} alt={`Bar card reading: ${bar}`} className="w-full h-full object-contain" />
            )}
          </div>

          {state === 'ready' && (
            <div className="mt-5 flex flex-col gap-3">
              {shareSupported && (
                <button
                  onClick={handleShare}
                  className="w-full py-4 rounded-2xl bg-white text-black text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Share
                </button>
              )}
              {/* Only where Share cannot carry a file. On iOS the share sheet already
                  offers Save Image and Save to Files, so a second in-app button did the
                  same job worse — a download into a folder the writer then has to find. */}
              {!shareSupported && (
                <button
                  onClick={handleSave}
                  className="w-full py-4 rounded-2xl bg-white text-black text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Save Image
                </button>
              )}
              {outcome && (
                <p className="text-center text-gray-500 text-[11px] font-bold" role="status">{outcome}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
