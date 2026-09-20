// @vitest-environment node
//
// The session goal is a small piece of arithmetic with one job it must get exactly right:
// fire "reached" on the crossing and not before, for both a bar count and an elapsed time.
// The status is pure — progress comes in as {bars, seconds} — so the crossing is pinned
// here without a running session or a clock.

import { describe, it, expect } from 'vitest';
import {
  normalizeGoal, goalIsActive, goalStatus, describeGoal, goalMetLabel,
  GOAL_OFF, GOAL_BARS, GOAL_TIME,
} from '../services/goal.js';

describe('normalizeGoal', () => {
  it('keeps a valid bars goal', () => {
    expect(normalizeGoal(GOAL_BARS, '10')).toEqual({ type: GOAL_BARS, amount: 10 });
  });
  it('keeps a valid time goal', () => {
    expect(normalizeGoal(GOAL_TIME, 5)).toEqual({ type: GOAL_TIME, amount: 5 });
  });
  it('rounds a fractional amount', () => {
    expect(normalizeGoal(GOAL_BARS, 3.6)).toEqual({ type: GOAL_BARS, amount: 4 });
  });
  it('treats an unknown type as off', () => {
    expect(normalizeGoal('minutes', 5)).toEqual({ type: GOAL_OFF, amount: 0 });
  });
  it('treats a non-positive amount as off — there is no "write 0 bars" target', () => {
    expect(normalizeGoal(GOAL_BARS, 0)).toEqual({ type: GOAL_OFF, amount: 0 });
    expect(normalizeGoal(GOAL_BARS, -4)).toEqual({ type: GOAL_OFF, amount: 0 });
    expect(normalizeGoal(GOAL_TIME, undefined)).toEqual({ type: GOAL_OFF, amount: 0 });
  });
});

describe('goalIsActive', () => {
  it('is false for off, null, or a zero amount', () => {
    expect(goalIsActive({ type: GOAL_OFF, amount: 0 })).toBe(false);
    expect(goalIsActive(null)).toBe(false);
    expect(goalIsActive({ type: GOAL_BARS, amount: 0 })).toBe(false);
  });
  it('is true for a real target', () => {
    expect(goalIsActive({ type: GOAL_BARS, amount: 10 })).toBe(true);
  });
});

describe('goalStatus — bars', () => {
  const goal = { type: GOAL_BARS, amount: 10 };
  it('reports progress below target as not met', () => {
    const s = goalStatus(goal, { bars: 4, seconds: 9999 });
    expect(s).toMatchObject({ active: true, target: 10, current: 4, met: false, remaining: 6, percent: 40 });
  });
  it('is met exactly on the crossing', () => {
    expect(goalStatus(goal, { bars: 10 }).met).toBe(true);
  });
  it('clamps percent past the target', () => {
    const s = goalStatus(goal, { bars: 25 });
    expect(s.met).toBe(true);
    expect(s.percent).toBe(100);
  });
  it('ignores elapsed time for a bars goal', () => {
    expect(goalStatus(goal, { bars: 2, seconds: 100000 }).met).toBe(false);
  });
});

describe('goalStatus — time', () => {
  const goal = { type: GOAL_TIME, amount: 5 }; // 5 minutes → 300 seconds
  it('measures against seconds, not the raw amount', () => {
    const s = goalStatus(goal, { seconds: 120, bars: 999 });
    expect(s).toMatchObject({ target: 300, current: 120, met: false, percent: 40 });
  });
  it('is met once the seconds cross the target', () => {
    expect(goalStatus(goal, { seconds: 300 }).met).toBe(true);
    expect(goalStatus(goal, { seconds: 299 }).met).toBe(false);
  });
});

describe('goalStatus — off', () => {
  it('is inactive and never met', () => {
    const s = goalStatus({ type: GOAL_OFF, amount: 0 }, { bars: 100, seconds: 100000 });
    expect(s.active).toBe(false);
    expect(s.met).toBe(false);
  });
});

describe('describeGoal / goalMetLabel', () => {
  it('describes a plural bars goal', () => {
    expect(describeGoal({ type: GOAL_BARS, amount: 10 })).toBe('Write 10 bars');
  });
  it('describes a singular bar goal', () => {
    expect(describeGoal({ type: GOAL_BARS, amount: 1 })).toBe('Write 1 bar');
  });
  it('describes a time goal', () => {
    expect(describeGoal({ type: GOAL_TIME, amount: 5 })).toBe('Drill for 5 min');
  });
  it('returns null when off', () => {
    expect(describeGoal({ type: GOAL_OFF, amount: 0 })).toBeNull();
  });
  it('labels the reached moment', () => {
    expect(goalMetLabel({ type: GOAL_BARS, amount: 1 })).toBe('1 bar written');
    expect(goalMetLabel({ type: GOAL_TIME, amount: 5 })).toBe('5 minutes in');
  });
});
