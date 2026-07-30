import { describeSession } from '../services/daily';

// ─────────────────────────────────────────────
// DAILY CARD
// Today's prescribed session, at the top of the idle screen.
//
// It sits above the manual settings rather than replacing them: a writer who knows what
// they want to train keeps the full control surface, and one who just has ten minutes
// gets a decision already made. The card is the first thing on the screen because
// answering "what am I doing today" is the entire point of it.
// ─────────────────────────────────────────────

export default function DailyCard({ plan, completed, onStart, disabled }) {
  const isWild = plan.key === 'wild';

  return (
    <div className={`rounded-3xl border p-5 ${
      completed
        ? 'bg-[#0f0f0f] border-white/5'
        : isWild
          ? 'bg-orange-400/[0.07] border-orange-400/25'
          : 'bg-[#0f0f0f] border-white/10'
    }`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isWild && !completed ? 'text-orange-400' : 'text-gray-600'}`}>
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
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-600 tabular-nums min-w-0 truncate">
          {describeSession(plan)}
        </p>
      </div>

      <button
        onClick={onStart}
        disabled={disabled}
        className={`w-full mt-4 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
          completed
            ? 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
            : isWild
              ? 'bg-orange-400 text-black hover:bg-orange-300'
              : 'bg-white text-black hover:bg-gray-200'
        }`}
      >
        {completed ? 'Run It Again' : 'Start Today’s Session'}
      </button>
    </div>
  );
}
