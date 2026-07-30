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

  // Open the year grid on the most recent weeks rather than a year ago.
  const gridScrollRef = useRef(null);
  useEffect(() => {
    const el = gridScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [p.grid.length]);

  const peakWeek = Math.max(1, ...p.weeks.map(w => w.bars));
  const monthLabel = (d) => d.toLocaleDateString('en-US', { month: 'short' });

  // Month labels above the grid, placed on the column where each month first appears.
  const columns = p.grid.length / 7;
  const monthMarks = [];
  for (let c = 0; c < columns; c++) {
    const first = p.grid[c * 7];
    const prev = c > 0 ? p.grid[(c - 1) * 7] : null;
    if (!prev || first.date.getMonth() !== prev.date.getMonth()) {
      monthMarks.push({ column: c, label: monthLabel(first.date) });
    }
  }

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
              {/* A full year rather than half of one: practice days are retained for 400
                  days, so a 26-week window was discarding half the record a writer had
                  already earned. Fifty-two columns cannot fit a phone at a legible cell
                  size, so the grid scrolls and starts at the right-hand edge — the
                  recent weeks are what someone opens this to see. */}
              <div ref={gridScrollRef} className="overflow-x-auto custom-scrollbar -mx-1 px-1">
                <div className="min-w-[640px]">
                  <div className="relative h-4 mb-1.5" aria-hidden="true">
                    {monthMarks.map(m => (
                      <span
                        key={`${m.column}-${m.label}`}
                        className="absolute top-0 text-[9px] font-black uppercase tracking-widest text-gray-700"
                        style={{ left: `${(m.column / columns) * 100}%` }}
                      >{m.label}</span>
                    ))}
                  </div>
                  <div
                    className="grid grid-rows-7 grid-flow-col gap-[3px]"
                    style={{ gridAutoColumns: 'minmax(0, 1fr)' }}
                    role="img"
                    aria-label={`Practice consistency over the last 52 weeks. ${p.daysTrained} ${p.daysTrained === 1 ? 'day' : 'days'} trained in total.`}
                  >
                    {p.grid.map(day => (
                      <div
                        key={day.key}
                        title={`${day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${day.practiced ? ' — trained' : ''}`}
                        className={`aspect-square rounded-[2px] ${
                          day.future ? 'bg-transparent'
                            : day.practiced ? 'bg-orange-400/85'
                            : 'bg-white/[0.06]'
                        }`}
                      />
                    ))}
                  </div>
                </div>
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
              title="Volume"
              aside={<span className="text-[10px] font-black uppercase tracking-widest text-gray-600">Bars · 12 weeks</span>}
            >
              <div className="flex items-end gap-1.5 h-32">
                {p.weeks.map((w, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end items-center h-full group">
                    <span className="text-[9px] font-black text-gray-600 tabular-nums mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {w.bars || ''}
                    </span>
                    <div
                      className={`w-full rounded-sm ${w.bars ? 'bg-white/80' : 'bg-white/[0.06]'}`}
                      style={{ height: `${w.bars ? Math.max(4, (w.bars / peakWeek) * 100) : 3}%` }}
                      title={`Week of ${w.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${w.bars} ${w.bars === 1 ? 'bar' : 'bars'}`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-3 text-[9px] font-black uppercase tracking-widest text-gray-700">
                <span>{p.weeks[0]?.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span>This week</span>
              </div>
            </Section>

            <Section
              title="Vocabulary"
              aside={<span className="text-[10px] font-black uppercase tracking-widest text-gray-600">★ {p.vocabulary.claimed} claimed</span>}
            >
              <p className="text-white font-black text-2xl tabular-nums mb-1">
                {fmtNum(p.vocabulary.written)}
                <span className="text-gray-600 text-base"> / {fmtNum(p.vocabulary.bankSize)}</span>
              </p>
              <p className="text-gray-500 text-xs mb-4">Words you have actually written a bar on.</p>
              {/* The bank is ~3,900 words, so early progress rounds to 0% and the bar would
                  read as "you have done nothing" after real work. Any progress at all gets
                  a visible sliver. */}
              <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/80 rounded-full transition-all"
                  style={{ width: p.vocabulary.written > 0 ? `max(1.5%, ${p.vocabulary.percent}%)` : '0%' }}
                />
              </div>
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
