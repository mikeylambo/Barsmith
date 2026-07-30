import { useState, useMemo } from 'react';
import { sessionBarsOnly, hasBars } from '../services/export-text';

export default function HistoryScreen({
  resetToIdle, sessionHistory, setSessionHistory, fmtDate, fmtDur,
  flattenNotes, copyNoteText, copiedNoteKey,
  historyAtCap, historyCount, handleExportData, handleExportBars,
}) {
  // An archive that can hold 100 sessions of bars is only an archive if you can find
  // things in it. Matching runs over bar text, the word each bar was written on, and
  // frozen words, so "that bar about lanterns" is reachable whether `lantern` was the
  // prompt or something the writer typed.
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!q) return sessionHistory;
    return sessionHistory.filter(s => {
      const notes = flattenNotes(s.notes);
      return notes.some(([word, , text]) =>
        word?.toLowerCase().includes(q) || text?.toLowerCase().includes(q)
      ) || s.frozenWords?.some(w => w.toLowerCase().includes(q));
    });
  }, [sessionHistory, q, flattenNotes]);

  // Tracks { id, ok } rather than just an id: copying a whole session is worth more than
  // one note, so a clipboard rejection must not still render a checkmark.
  const [copied, setCopied] = useState(null);
  const copySession = (s) => {
    const done = (ok) => { setCopied({ id: s.id, ok }); setTimeout(() => setCopied(null), 1800); };
    const write = navigator.clipboard?.writeText(sessionBarsOnly(s));
    if (!write) return done(false);
    write.then(() => done(true)).catch(() => done(false));
  };

  const anyBars = sessionHistory.some(hasBars);

  return (
    <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto w-full custom-scrollbar pb-36">
      <div className="w-full mt-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button onClick={resetToIdle} className="w-10 h-10 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/10 transition-all" aria-label="Back to home">←</button>
            <h2 className="text-3xl font-black tracking-tighter uppercase">History</h2>
          </div>
          {sessionHistory.length > 0 && <button onClick={()=>{if(confirm('Clear history?'))setSessionHistory([]);}} className="text-gray-700 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors">Clear</button>}
        </div>

        {/* Export every written bar as one text file. Distinct from the JSON backup, which
            only Barsmith can read — this is the one a writer opens somewhere else. */}
        {anyBars && handleExportBars && (
          <button
            onClick={handleExportBars}
            className="w-full mb-4 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            ⬇ Export All Bars (.txt)
          </button>
        )}

        {sessionHistory.length > 1 && (
          <div className="relative mb-5">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bars and words…"
              aria-label="Search session history"
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-white/25 transition-colors"
            />
            <span aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700 text-sm">⌕</span>
          </div>
        )}

        {/* History keeps only the most recent 100 sessions — the streak counter is tracked
            separately and unaffected, but Bar Pad notes on older sessions are only safe
            if backed up before they roll off. */}
        {historyAtCap && handleExportData && (
          <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-2xl p-4 mb-5 flex items-center justify-between gap-4">
            <p className="text-yellow-400 text-xs leading-relaxed">History stores up to 100 sessions. You have {historyCount} saved — export a backup before older sessions begin rolling off.</p>
            <button onClick={handleExportData} className="shrink-0 text-[10px] font-black uppercase tracking-widest text-yellow-400 hover:text-yellow-300 transition-colors border border-yellow-500/30 rounded-full px-3 py-2">Export</button>
          </div>
        )}

        {sessionHistory.length === 0 && (
          <div className="text-center py-16 text-gray-700">
            <p className="text-4xl mb-4 opacity-30">◷</p>
            <p className="font-black uppercase tracking-widest text-sm">No sessions yet</p>
          </div>
        )}

        {q && (
          <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest mb-4" role="status">
            {visible.length === 0
              ? `No sessions match “${query.trim()}”`
              : `${visible.length} of ${sessionHistory.length} sessions match`}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {visible.map(s=>(
            <div key={s.id} className="bg-[#0f0f0f] border border-white/5 rounded-2xl p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">{fmtDate(s.date)}</p>
                  <p className="text-white font-black text-lg">{fmtDur(s.duration)} <span className="text-gray-600 text-sm font-bold">session</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest">{s.source === 'vault' ? `Vault Drill · ${s.wordsSeen} words` : s.source === 'recovered' ? `Recovered · ${flattenNotes(s.notes).length} bars` : `Lvl ${s.tier} · ${s.wordCount}w`}</p>
                  <p className="text-gray-400 text-sm font-bold">{s.pace}</p>
                </div>
              </div>
              {s.notes && Object.keys(s.notes).length > 0 && (
                <div className="border-t border-white/5 pt-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-gray-700 font-black uppercase tracking-widest">Bar Pad</p>
                    {/* Grabbing a whole session used to mean tapping Copy once per bar. */}
                    {hasBars(s) && (
                      <button
                        onClick={() => copySession(s)}
                        className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full transition-all ${
                          copied?.id !== s.id ? 'bg-white/8 text-gray-500 hover:text-white'
                          : copied.ok ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {copied?.id !== s.id ? 'Copy All' : copied.ok ? '✓ Copied' : 'Failed'}
                      </button>
                    )}
                  </div>
                  {flattenNotes(s.notes).map(([w,entryId,t])=>t?.trim()?(
                    <div key={w+entryId} className="mb-2 flex items-start justify-between gap-2">
                      <p className="flex-1"><span className="text-[10px] text-gray-600 uppercase tracking-widest font-black">{w}: </span><span className="text-gray-400 text-xs select-text whitespace-pre-wrap break-words">{t}</span></p>
                      <button onClick={() => copyNoteText(`h-${s.id}-${w}-${entryId}`, t)} className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full transition-all ${copiedNoteKey===`h-${s.id}-${w}-${entryId}` ? 'bg-green-500/20 text-green-400' : 'bg-white/8 text-gray-500 hover:text-white'}`}>
                        {copiedNoteKey===`h-${s.id}-${w}-${entryId}` ? '✓' : 'Copy'}
                      </button>
                    </div>
                  ):null)}
                </div>
              )}
              {s.frozenWords?.length > 0 && (
                <div className="border-t border-white/5 pt-3">
                  <p className="text-[10px] text-gray-700 font-black uppercase tracking-widest mb-2">Frozen</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.frozenWords.map(w=>(
                      <span key={w} className="bg-white/4 border border-white/5 px-2.5 py-1 rounded-full text-xs font-black text-gray-400 uppercase">{w}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
