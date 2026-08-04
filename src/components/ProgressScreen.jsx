import { useMemo, useRef, useEffect } from 'react';
import { computeProgress } from '../services/progress';

// ─────────────────────────────────────────────
// PROGRESS SCREEN — the training log
//
// Barsmith described itself as a writing gym while only ever showing attendance:
// a streak counter and nothing else. This screen is the other half of that claim —
// evidence of getting stronger, which is the only durable reason to come back to a
// gym. Everything here is computed from data already on the device; nothing new is
// asked of the writer.
// ─────────────────────────────────────────────

const fmtDur = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`;
const fmtNum = (n) => (n || 0).toLocaleString('en-US');
// Past an hour, raw minutes stop meaning anything — "635" reads as noise where "10.6h"
// reads as a season of work. Decimal hours rather than "10h 35m" because the two-part
// form wraps to a second line in a third-width stat tile and breaks the row's alignment.
const fmtTrained = (mins) => (mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}m`);

function Stat({ label, value, sub }) {
  return (
    <div className="bg-[#0f0f0f] border border-white/5 py-6 px-3 rounded-2xl text-center">
      <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl md:text-3xl font-black text-white tabular-nums whitespace-nowrap">{value}</p>
      {sub && <p className="text-gray-700 text-[10px] font-bold uppercase tracking-widest mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, aside, children }) {
  return (
    <div className="bg-[#0f0f0f] p-6 rounded-3xl border border-white/5">
      <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-4">
        <h3 className="text-gray-500 text-xs font-black uppercase tracking-widest">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

export default function ProgressScreen({
  resetToIdle, totals, sessionHistory, practiceDays, vault, streak,
}) {
  const p = useMemo(
    () => computeProgress({ totals, history: sessionHistory, practiceDays, vault }),
    [totals, sessionHistory, practiceDays, vault],
  );

  // Five weeks. Ten fitted, but seventy bars across a phone are hairlines — legible as a
  // texture, useless as "did I train on Thursday". The full 52 weeks are still computed
  // and still drive days-trained and the longest streak below; this is the window, not
  // the record.
  const recentDays = useMemo(() => p.grid.slice(-35), [p.grid]);

  return (
    <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto w-full custom-scrollbar pb-36">
      <div className="w-full mt-6 max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={resetToIdle} className="w-10 h-10 shrink-0 bg-white/5 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/10 transition-all" aria-label="Back to home">←</button>
          <h2 className="text-3xl font-black tracking-tighter uppercase">Progress</h2>
        </div>

        {p.sessions === 0 ? (
          <div className="text-center py-16 text-gray-700">
            <p className="text-4xl mb-4 opacity-30">▲</p>
            <p className="font-black uppercase tracking-widest text-sm mb-2">No training logged yet</p>
            <p className="text-gray-700 text-xs leading-relaxed max-w-xs mx-auto">
              Finish a session and this fills in — bars written, consistency, vocabulary, and
              personal bests, all kept on this device.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Bars" value={fmtNum(p.bars)} />
              <Stat label="Sessions" value={fmtNum(p.sessions)} />
              <Stat label="Time" value={fmtTrained(p.minutes)} />
            </div>

            <Section
              title="Consistency"
              aside={
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">
                  {p.daysTrained} {p.daysTrained === 1 ? 'day' : 'days'} trained
                </span>
              }
            >
              {/* A 52-week square grid is a GitHub contribution graph, and everyone who
                  has seen a repository recognises it — which makes a writing tool look
                  like a side effect of how it was built. Same data, read as a level
                  meter instead: one bar per day across the last five weeks, full height
                  where work happened. It belongs to music rather than to source
                  control. */}
              <div
                className="flex items-end gap-[3px] h-14"
                role="img"
                aria-label={`Practice over the last five weeks. ${p.daysTrained} ${p.daysTrained === 1 ? 'day' : 'days'} trained in total.`}
              >
                {recentDays.map(day => (
                  <div
                    key={day.key}
                    title={`${day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${day.practiced ? ' — trained' : ''}`}
                    className={`flex-1 rounded-sm ${
                      day.future ? 'bg-white/[0.03] h-1.5'
                        : day.practiced ? 'bg-orange-400/85 h-full'
                        : 'bg-white/[0.08] h-2'
                    }`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2 mb-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-700">
                  {recentDays[0]?.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-700">Today</span>
              </div>
              <div className="flex gap-3 mt-5 pt-4 border-t border-white/5">
                <div className="flex-1">
                  <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest mb-1">Current streak</p>
                  <p className="text-white font-black text-lg tabular-nums">{streak} {streak === 1 ? 'day' : 'days'}</p>
                </div>
                <div className="flex-1">
                  <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest mb-1">Longest streak</p>
                  <p className="text-white font-black text-lg tabular-nums">{p.longestStreak} {p.longestStreak === 1 ? 'day' : 'days'}</p>
                </div>
              </div>
            </Section>

            <Section
              title="Vocabulary"
              aside={<span className="text-[10px] font-black uppercase tracking-widest text-gray-600">★ {p.vocabulary.claimed} claimed</span>}
            >
              <p className="text-white font-black text-2xl tabular-nums mb-1">
                {fmtNum(p.vocabulary.written)}
              </p>
              <p className="text-gray-500 text-xs">Words you have actually written a bar on.</p>
            </Section>

            <Section title="Personal Bests">
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest mb-1">Most bars in a session</p>
                  <p className="text-white font-black text-lg tabular-nums">{p.records.bestBars}</p>
                </div>
                <div className="flex-1">
                  <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest mb-1">Longest session</p>
                  <p className="text-white font-black text-lg tabular-nums">{fmtDur(p.records.bestSeconds)}</p>
                </div>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
