// ─────────────────────────────────────────────
// SESSION GOAL
// An optional target for a single session, and the arithmetic behind confirming it.
//
// The Session Timer already caps a session's length — but a cap ends the work, it does
// not reward it. A goal is the opposite lever: a target you aim AT, that fires a clear
// "you did it" the moment you cross it and then gets out of the way. Reaching a goal is
// a win, never a forced stop; the session keeps going for as long as the writer wants.
//
// Two kinds, because they train different things:
//   • bars — a volume target ("write 10 bars"), measured against real Bar Pad entries.
//   • time — a stamina target ("drill for 5 minutes"), measured against elapsed seconds.
//
// Pure: progress comes in as {bars, seconds} so the crossing logic is testable without a
// running session or a clock.
// ─────────────────────────────────────────────

export const GOAL_OFF = 'off';
export const GOAL_BARS = 'bars';
export const GOAL_TIME = 'time';

export const EMPTY_GOAL = { type: GOAL_OFF, amount: 0 };

/** The choices offered on the idle screen. Small, round numbers a writer picks at a glance. */
export const GOAL_PRESETS = {
  [GOAL_BARS]: [5, 10, 16, 24],
  [GOAL_TIME]: [3, 5, 10, 15], // minutes
};

/**
 * Coerce a stored or user-chosen goal into a valid shape.
 *
 * A goal with a non-positive amount is treated as Off — there is no such thing as a
 * "write 0 bars" target, and defaulting it off is safer than persisting a goal that can
 * never be crossed.
 */
export function normalizeGoal(type, amount) {
  if (type !== GOAL_BARS && type !== GOAL_TIME) return { ...EMPTY_GOAL };
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return { ...EMPTY_GOAL };
  return { type, amount: n };
}

/** Is a goal actually set (as opposed to Off)? */
export const goalIsActive = (goal) =>
  (goal?.type === GOAL_BARS || goal?.type === GOAL_TIME) && Number(goal.amount) > 0;

/**
 * Where a session stands against its goal.
 *
 * @param {{type,amount}} goal
 * @param {{bars:number, seconds:number}} progress
 * @returns {{active,type,target,current,met,remaining,percent,unit}}
 */
export function goalStatus(goal, { bars = 0, seconds = 0 } = {}) {
  if (!goalIsActive(goal)) {
    return { active: false, type: GOAL_OFF, target: 0, current: 0, met: false, remaining: 0, percent: 0, unit: '' };
  }
  const isBars = goal.type === GOAL_BARS;
  const target = isBars ? goal.amount : goal.amount * 60;   // bars, or seconds
  const current = Math.max(0, Math.floor(isBars ? bars : seconds));
  const met = current >= target;
  return {
    active: true,
    type: goal.type,
    target,
    current,
    met,
    remaining: Math.max(0, target - current),
    percent: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
    unit: isBars ? 'bars' : 'time',
  };
}

/** A one-line description for the idle-screen selector, or null when off. */
export function describeGoal(goal) {
  if (!goalIsActive(goal)) return null;
  if (goal.type === GOAL_BARS) return `Write ${goal.amount} ${goal.amount === 1 ? 'bar' : 'bars'}`;
  return `Drill for ${goal.amount} min`;
}

/** The word shown on the "goal reached" confirmation. */
export function goalMetLabel(goal) {
  if (!goalIsActive(goal)) return '';
  if (goal.type === GOAL_BARS) return `${goal.amount} ${goal.amount === 1 ? 'bar' : 'bars'} written`;
  return `${goal.amount} ${goal.amount === 1 ? 'minute' : 'minutes'} in`;
}
