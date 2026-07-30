// ─────────────────────────────────────────────
// DAILY SESSION SERVICE
// Today's prescribed workout.
//
// The retention problem this solves is not motivation, it is decision cost. Opening
// Barsmith meant facing five settings — level, scheme, pace, tempo, timer — before a
// single word appeared. That is a fine control surface for someone who knows what they
// want to train, and a reason to close the app for someone who just has ten minutes.
//
// So: a session already chosen for you, different every day, the same for everyone.
//
// Two deliberate choices:
//
//  1. **Structured by weekday, not randomised.** A random draw each morning is noise; a
//     writer cannot anticipate it, and there is nothing to build a habit around. A
//     training week has a shape — foundations, tempo, scheme, heavy, wild, long, light
//     — so Friday means something, and skipping it means missing something specific.
//  2. **Derived from the date, so no backend.** Everyone on a given day gets the same
//     prescription, computed on-device, working offline like the rest of the app. The
//     specifics inside each day's shape still vary week to week so it never goes stale.
// ─────────────────────────────────────────────

/**
 * Deterministic 32-bit hash of a calendar date. FNV-1a over `YYYY-M-D` — the point is a
 * stable, well-mixed integer per day, not cryptographic strength.
 *
 * Built from the local calendar fields rather than a timestamp so the prescription
 * changes at the writer's local midnight rather than UTC's.
 */
export function dateSeed(date = new Date()) {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pick from a list using one slice of the seed, so different fields vary independently. */
const pick = (seed, shift, list) => list[(seed >>> shift) % list.length];

// The training week. Each day names what it trains, so a skipped day is a specific
// thing missed rather than a generic lapse.
const WEEK = [
  { key: 'reset',       name: 'Reset',       focus: 'Loose and short. Keep the streak, stay warm.' },
  { key: 'foundations', name: 'Foundations', focus: 'Short concrete words at a steady pace. Clean, obvious, fast.' },
  { key: 'tempo',       name: 'Tempo',       focus: 'Locked to a real bar grid. Write to the count, not to a timer.' },
  { key: 'scheme',      name: 'Scheme',      focus: 'Multiple words at once. Bridge them into one punchline.' },
  { key: 'heavy',       name: 'Heavy',       focus: 'Long multisyllabic words. Fit them without breaking the flow.' },
  { key: 'sprint',      name: 'Sprint',      focus: 'Words come fast. No time to deliberate — go on instinct.' },
  { key: 'endurance',   name: 'Endurance',   focus: 'The long one. Hold quality past the point it gets hard.' },
];

/**
 * The prescription for a given day.
 *
 * Returns everything the idle screen needs to display it and everything App needs to
 * apply it as live settings.
 *
 * @param {Date} [date]
 * @returns {{key,name,focus,dayName,tier,wordCount,intervalMs,bpmMode,bpm,barsPerWord,limitMinutes}}
 */
export function dailySession(date = new Date()) {
  const seed = dateSeed(date);
  const shape = WEEK[date.getDay()];

  // Defaults; each shape overrides what it cares about and leaves the rest varying.
  const plan = {
    key: shape.key,
    name: shape.name,
    focus: shape.focus,
    dayName: date.toLocaleDateString('en-US', { weekday: 'long' }),
    tier: 1,
    wordCount: 1,
    intervalMs: 3500,
    bpmMode: false,
    bpm: 90,
    barsPerWord: 2,
    limitMinutes: 10,
  };

  switch (shape.key) {
    case 'reset':
      plan.tier = pick(seed, 3, [1, 2]);
      plan.intervalMs = pick(seed, 7, [4000, 4500, 5000]);
      plan.limitMinutes = 5;
      break;
    case 'foundations':
      plan.tier = 1;
      plan.intervalMs = pick(seed, 5, [3000, 3500, 4000]);
      plan.limitMinutes = 10;
      break;
    case 'tempo':
      plan.tier = pick(seed, 3, [1, 2]);
      plan.bpmMode = true;
      plan.bpm = pick(seed, 9, [72, 80, 88, 95, 102]);
      plan.barsPerWord = pick(seed, 13, [2, 2, 4]);
      plan.limitMinutes = 10;
      break;
    case 'scheme':
      plan.tier = pick(seed, 3, [1, 2, 3]);
      plan.wordCount = pick(seed, 11, [2, 2, 3]);
      plan.intervalMs = pick(seed, 6, [4500, 5000, 6000]);
      plan.limitMinutes = 10;
      break;
    case 'heavy':
      plan.tier = 3;
      plan.intervalMs = pick(seed, 5, [4000, 4500, 5000]);
      plan.limitMinutes = pick(seed, 15, [10, 10, 15]);
      break;
    case 'sprint':
      // The one day that trains speed rather than craft: the interval is short enough
      // that deliberating costs you the word, which is the freestyle skill.
      plan.tier = pick(seed, 3, [1, 1, 2]);
      plan.intervalMs = pick(seed, 5, [2000, 2000, 2500]);
      plan.limitMinutes = pick(seed, 15, [5, 10]);
      break;
    case 'endurance':
      plan.tier = pick(seed, 3, [2, 3]);
      plan.wordCount = pick(seed, 11, [1, 1, 2]);
      plan.intervalMs = pick(seed, 6, [3500, 4000, 4500]);
      plan.limitMinutes = pick(seed, 17, [15, 20]);
      break;
    default:
      break;
  }

  return plan;
}

/** One-line summary of the prescription, e.g. `Level 2 · 2 words · 5.0s · 10 min`. */
export function describeSession(plan) {
  const level = `Level ${plan.tier}`;
  const pace = plan.bpmMode
    ? `${plan.bpm} BPM · ${plan.barsPerWord} ${plan.barsPerWord === 1 ? 'bar' : 'bars'}/word`
    : `${(plan.intervalMs / 1000).toFixed(1)}s`;
  const words = plan.wordCount === 1 ? '1 word' : `${plan.wordCount} words`;
  return [level, words, pace, `${plan.limitMinutes} min`].join(' · ');
}

/** Calendar-day identity, matching the format practice days are already stored in. */
export const dayKey = (date = new Date()) => date.toDateString();

/** Calendar-day arithmetic, DST-safe: add to the date, not 24h to the clock. */
const shiftDays = (date, delta) => {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
};

/** Completed days are kept for roughly four months — enough for any week view. */
const COMPLETED_RETENTION = 120;

/** Has today's prescription already been completed? */
export const isCompletedToday = (record, today = new Date()) =>
  !!record?.completed?.includes(dayKey(today));

/**
 * Mark today's prescription done.
 *
 * `count` is a lifetime tally kept separately from the `completed` list because that
 * list is capped: it is the one number describing whether a writer follows the
 * programme rather than merely showing up, and someone can hold a long practice streak
 * of freeform sessions without ever completing a prescribed one. Repeat sessions on the
 * same day do not double-count.
 */
export function markCompleted(record, today = new Date()) {
  const key = dayKey(today);
  const current = record || { completed: [], count: 0 };
  if (current.completed?.includes(key)) return current;
  return {
    completed: [...(current.completed || []), key].slice(-COMPLETED_RETENTION),
    count: (current.count || 0) + 1,
  };
}

/**
 * This week's programme, Sunday through Saturday, with what has been completed.
 *
 * The daily card shows one session; this shows where it sits. That context is what turns
 * a prescription into a programme — a writer can see that Tuesday was missed and that
 * two days remain, which is a far better reason to open the app tomorrow than a card
 * that only ever describes today.
 */
export function programmeWeek(record, today = new Date()) {
  const completed = new Set(record?.completed || []);
  const todayKey = dayKey(today);
  const sunday = shiftDays(today, -today.getDay());

  return WEEK.map((shape, i) => {
    const date = shiftDays(sunday, i);
    const key = dayKey(date);
    return {
      key,
      date,
      initial: date.toLocaleDateString('en-US', { weekday: 'narrow' }),
      name: shape.name,
      done: completed.has(key),
      isToday: key === todayKey,
      future: date > today && key !== todayKey,
    };
  });
}
