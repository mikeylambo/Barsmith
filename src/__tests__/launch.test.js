// @vitest-environment node
//
// A home-screen quick action arrives as a URL query string the app must read exactly once
// at launch. Only the known intents may pass; anything else has to fall through to the
// normal idle screen rather than acting on an attacker-controllable or stale parameter.

import { describe, it, expect } from 'vitest';
import { parseLaunchAction, LAUNCH_ACTIONS } from '../services/launch.js';

describe('parseLaunchAction', () => {
  it('reads each known action', () => {
    expect(parseLaunchAction('?do=daily')).toBe(LAUNCH_ACTIONS.DAILY);
    expect(parseLaunchAction('?do=session')).toBe(LAUNCH_ACTIONS.SESSION);
    expect(parseLaunchAction('?do=rhymes')).toBe(LAUNCH_ACTIONS.RHYMES);
  });

  it('tolerates a search string with no leading question mark', () => {
    expect(parseLaunchAction('do=daily')).toBe(LAUNCH_ACTIONS.DAILY);
  });

  it('ignores unknown or absent actions', () => {
    expect(parseLaunchAction('?do=launch-nukes')).toBeNull();
    expect(parseLaunchAction('?foo=bar')).toBeNull();
    expect(parseLaunchAction('')).toBeNull();
    expect(parseLaunchAction(null)).toBeNull();
    expect(parseLaunchAction(undefined)).toBeNull();
  });

  it('picks the action out of a multi-parameter query', () => {
    expect(parseLaunchAction('?utm=x&do=session&ref=y')).toBe(LAUNCH_ACTIONS.SESSION);
  });
});
