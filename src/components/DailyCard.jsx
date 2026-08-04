import { describeSession } from '../services/daily';

// The week strip. One session is a task; a week with gaps in it is a programme — and
// seeing that Tuesday is still empty with two days left is a better reason to open the
// app tomorrow than a card that only ever describes today.
function WeekStrip({ week }) {
  const done = week.filter(d => d.done).length;
  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">This Week</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-600 tabular-nums">
          {done} of 7
        </p>
      </div>
      <div className="flex gap-1.5">
        {week.map(day => (
          <div
            key={day.key}
            title={`${day.name}${day.done ? ' — done' : day.future ? '' : ' — not yet'}`}
            className={`flex-1 rounded-lg py-2 text-center text-[10px] font-black transition-all border ${
              day.done
                ? 'bg-white text-black border-white'
                : day.isToday
                  ? 'bg-transparent text-white border-white/40'
                  : day.future
                    ? 'bg-transparent text-gray-800 border-white/5'
                    : 'bg-transparent text-gray-700 border-white/5'
            }`}
          >
            {day.done ? '✓' : day.initial}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DAILY CARD
// Today's prescribed session, at the top of the idle screen.
//
// It sits above the manual settings rather than replacing them: a writer who knows what
// they want to train keeps the full control surface, and one who just has ten minutes
// gets a decision already made. The card is the first thing on the screen because
// answering "what am I doing today" is the entire point of it.
// ─────────────────────────────────────────────

export default function DailyCard({ plan, completed, week, onStart, disabled }) {
  return (
    <div className={`rounded-3xl border p-5 ${completed ? 'bg-[#0f0f0f] border-white/5' : 'bg-[#0f0f0f] border-white/10'}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-gray-600">
            {plan.dayName} · Today&apos;s Session
          </p>
          <h2 className="text-2xl font-black uppercase tracking-tighter truncate">{plan.name}</h2>
        </div>
        {completed && (
          <span className="shrink-0 flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
            ✓ Done
          </span>
        )}
      </div>

      <p className="text-gray-500 text-xs leading-relaxed mb-4">{plan.focus}</p>

      <div className="flex items-center justify-between gap-4">
        {/* Wraps rather than truncates. A BPM session's summary is five facts wide —
            "Level 2 · 1 word · 102 BPM · 2 bars/word · 10 min" — and on a phone the last
            one fell off the end as "10…", which is the one that says how long this will
            take. Nothing here is a sentence, so a second line costs nothing. */}
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-600 tabular-nums min-w-0 leading-relaxed">
          {describeSession(plan)}
        </p>
      </div>

      <button
        onClick={onStart}
        disabled={disabled}
        className={`w-full mt-4 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
          completed
            ? 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
            : 'bg-white text-black hover:bg-gray-200'
        }`}
      >
        {completed ? 'Run It Again' : 'Start Today’s Session'}
      </button>

      {week && <WeekStrip week={week} />}
    </div>
  );
}
