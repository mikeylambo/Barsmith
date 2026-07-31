import { useState, useEffect, useRef } from 'react';
import { haptic } from '../services/haptic';
import { useFocusTrap } from '../hooks/useFocusTrap';

// ─────────────────────────────────────────────
// DICTIONARY MODAL  (with inline bar notepad + syllable count)
// ─────────────────────────────────────────────
export default
  function DictionaryModal({ word, dictData, isLoading, onClose, isVaultMode, onSaveNote, savedEntries, registerActiveNoteFlush }) {
    // Each time this modal is mounted (i.e. each time a word is locked), it owns ONE entry
    // in that word's notes — a stable id generated once per visit. This is what lets the
    // same word be locked multiple times across a session without each visit's bar
    // overwriting the last one; previously notes were a single string per word, so writing
    // a second bar for a repeated word silently erased the first.
    const containerRef = useRef(null);
    useFocusTrap(containerRef);
    const entryIdRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    // RC4 FIX 7: Escape key closes (and flushes) the modal
    useEffect(() => {
      const handler = (e) => { if (e.key === 'Escape') closeAndFlush(); };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    // closeAndFlush is stable (defined below), but we depend on onClose/word which are stable per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [note, setNote]         = useState('');
    const [noteSaved, setNoteSaved] = useState(false);
    const noteRef = useRef(null);
    const autosaveTimerRef = useRef(null);
    const noteLiveRef = useRef('');
    const priorEntries = Object.entries(savedEntries || {}).filter(([id]) => id !== entryIdRef.current);

    const getModalFontSize = (w) => {
      const len = Math.max(w?.length || 1, 4);
      return `clamp(22px, min(9vw, ${380/len}px), 52px)`;
    };

    const handleSaveNote = () => {
      onSaveNote?.(word, entryIdRef.current, note);
      setNoteSaved(true);
      haptic(15);
      setTimeout(() => setNoteSaved(false), 1500);
    };

    const [noteCopied, setNoteCopied] = useState(false);
    const handleCopyNote = () => {
      navigator.clipboard?.writeText(note).catch(() => {});
      setNoteCopied(true);
      haptic(12);
      setTimeout(() => setNoteCopied(false), 1500);
    };

    // Debounced autosave: saves 600ms after the user stops typing, silently.
    useEffect(() => {
      noteLiveRef.current = note;
      if (isVaultMode) return; // vault mode has no notepad
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => { onSaveNote?.(word, entryIdRef.current, note); }, 600);
      return () => clearTimeout(autosaveTimerRef.current);
    }, [note, word, isVaultMode]);

    // Flush-on-close: guarantees the latest text is saved even if the user
    // closes the modal before the debounce timer or a manual Save fires.
    const closeAndFlush = () => {
      clearTimeout(autosaveTimerRef.current);
      if (!isVaultMode) onSaveNote?.(word, entryIdRef.current, noteLiveRef.current);
      onClose();
    };

    // Let the session engine synchronously flush the current textarea value if a timed
    // sprint ends while this modal is still open.
    useEffect(() => {
      if (isVaultMode || !registerActiveNoteFlush) return;
      const flush = () => {
        clearTimeout(autosaveTimerRef.current);
        onSaveNote?.(word, entryIdRef.current, noteLiveRef.current);
      };
      return registerActiveNoteFlush(flush);
    }, [isVaultMode, onSaveNote, registerActiveNoteFlush, word]);

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/92 backdrop-blur-xl animate-in fade-in duration-150" onClick={closeAndFlush}>
        <div ref={containerRef} role="dialog" aria-modal="true" className="bg-[#0a0a0a] w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>

          {/* Word header */}
          <div className="px-6 pt-6 pb-4 border-b border-white/5 flex justify-between items-start bg-gradient-to-br from-white/4 to-transparent">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest mb-1 block text-gray-500">Locked</span>
              <h2 className="font-black uppercase tracking-tighter text-white leading-none drop-shadow-md break-words max-w-[calc(100vw-7rem)]" style={{ fontSize: getModalFontSize(word) }}>{word}</h2>
              {/* Syllable count badge */}
              {dictData?.syllables && (
                <span className="mt-2 inline-flex items-center gap-1 bg-white/8 border border-white/8 rounded-full px-2.5 py-0.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {dictData.syllables} {dictData.syllables === 1 ? 'syllable' : 'syllables'}
                </span>
              )}
            </div>
            <button onClick={closeAndFlush} aria-label="Close and return to session" className="w-10 h-10 shrink-0 bg-white/5 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/15 transition-all border border-white/8 ml-4">✕</button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto custom-scrollbar flex-1 p-6 space-y-4">
            {/* ── BAR NOTEPAD ── always available instantly, never gated on network data */}
            {!isVaultMode && (
              <div className="bg-white/4 rounded-2xl border border-white/8 overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/5">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Bar Pad — ready instantly</h3>
                  {note.trim() && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleCopyNote}
                        className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all ${noteCopied ? 'bg-green-500/20 text-green-400' : 'bg-white/8 text-gray-400 hover:text-white hover:bg-white/15'}`}
                      >
                        {noteCopied ? '✓ Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={handleSaveNote}
                        className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all ${noteSaved ? 'bg-green-500/20 text-green-400' : 'bg-white/8 text-gray-400 hover:text-white hover:bg-white/15'}`}
                      >
                        {noteSaved ? '✓ Saved' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
                <textarea
                  ref={noteRef}
                  value={note}
                  onChange={e => { noteLiveRef.current = e.target.value; setNote(e.target.value); }}
                  placeholder={`Write a bar with "${word}"…`}
                  rows={3}
                  autoFocus
                  className="w-full bg-transparent px-4 py-3 text-gray-200 text-sm leading-relaxed placeholder-gray-700 font-medium"
                />
                {priorEntries.length > 0 && (
                  <div className="px-4 pb-3 pt-1 border-t border-white/5 space-y-1.5">
                    <p className="text-[9px] text-gray-700 font-black uppercase tracking-widest">Saved this session ({priorEntries.length})</p>
                    {priorEntries.map(([id, text]) => text?.trim() ? (
                      <p key={id} className="text-gray-500 text-xs leading-relaxed">{text}</p>
                    ) : null)}
                  </div>
                )}
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-10"><div className="w-9 h-9 border-4 border-white/15 border-t-white rounded-full animate-spin" /></div>
            ) : (
              <>
                {/* Rhymes */}
                <div className="bg-white/4 p-4 rounded-2xl border border-white/5">
                  <h3 className="text-green-400 text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> {dictData?.rhymeLabel || 'Top Rhymes'}
                  </h3>
                  <p className="text-white font-bold text-sm leading-relaxed">
                    {dictData?.rhymes?.length > 0 ? dictData.rhymes.join(', ') : 'No rhymes found'}
                  </p>
                </div>

                {/* Synonyms + Antonyms */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/4 p-4 rounded-2xl border border-white/5">
                    <h3 className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-2">Synonyms</h3>
                    <p className="text-gray-300 text-xs leading-relaxed">{dictData?.synonyms?.length > 0 ? dictData.synonyms.slice(0, 8).join(', ') : '—'}</p>
                  </div>
                  <div className="bg-white/4 p-4 rounded-2xl border border-white/5">
                    <h3 className="text-purple-400 text-[10px] font-black uppercase tracking-widest mb-2">Antonyms</h3>
                    <p className="text-gray-300 text-xs leading-relaxed">{dictData?.antonyms?.length > 0 ? dictData.antonyms.slice(0, 8).join(', ') : '—'}</p>
                  </div>
                </div>

                {/* Definition */}
                {dictData?.definitions?.length > 0 && (
                  <div className="bg-white/4 p-4 rounded-2xl border border-white/5 space-y-2">
                    <h3 className="text-yellow-400 text-[10px] font-black uppercase tracking-widest">Definition</h3>
                    {dictData.definitions.map((d, i) => (
                      <div key={i}>
                        {d.pos && <span className="text-gray-600 text-[10px] uppercase tracking-widest italic">{d.pos} </span>}
                        <p className="text-gray-300 text-xs leading-relaxed inline">{d.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pt-3 border-t border-white/5" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
            <button onClick={closeAndFlush} className="w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest bg-white/8 hover:bg-white/15 text-gray-300 transition-all active:scale-95 border border-white/8">
              {isVaultMode ? 'Close' : 'Resume Session'}
            </button>
          </div>
        </div>
      </div>
    );
  }
