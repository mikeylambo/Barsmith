// @vitest-environment node
//
// The changelog has one rule that matters and is easy to get wrong: it shows once per
// version BUMP and never on a fresh baseline, so a first-ever run (no version stored)
// announces nothing. Get that wrong and every new install gets a "what's new" for
// features it never had a "before" of — or, worse, it stacks on top of the first-run
// walkthrough.

import { describe, it, expect } from 'vitest';
import pkg from '../../package.json';
import {
  CHANGELOG, CURRENT_VERSION, compareVersions, entriesSince, shouldShowChangelog,
} from '../services/changelog.js';

describe('version as single source of truth', () => {
  it('reports the newest entry as the current version', () => {
    expect(CURRENT_VERSION).toBe(CHANGELOG[0].version);
  });

  // The one that stops silent drift: the app's reported version and package.json must agree.
  it('matches package.json', () => {
    expect(CURRENT_VERSION).toBe(pkg.version);
  });

  it('is ordered newest-first', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    }
  });

  it('every entry has a title and at least one item', () => {
    for (const e of CHANGELOG) {
      expect(typeof e.title).toBe('string');
      expect(e.items.length).toBeGreaterThan(0);
    }
  });
});

describe('compareVersions', () => {
  it('orders by numeric segment, not lexically', () => {
    expect(compareVersions('5.20.0', '5.9.0')).toBeGreaterThan(0); // 20 > 9, not "2" < "9"
    expect(compareVersions('5.19.0', '5.20.0')).toBeLessThan(0);
  });
  it('treats missing segments as zero', () => {
    expect(compareVersions('5.20', '5.20.0')).toBe(0);
  });
  it('sorts absent/garbage input as the lowest version', () => {
    expect(compareVersions(null, '0.0.1')).toBeLessThan(0);
    expect(compareVersions(undefined, '1.0.0')).toBeLessThan(0);
  });
});

describe('shouldShowChangelog', () => {
  it('never shows on a fresh baseline (no version seen yet)', () => {
    expect(shouldShowChangelog(null, '5.20.0')).toBe(false);
    expect(shouldShowChangelog(undefined, '5.20.0')).toBe(false);
  });
  it('shows after a genuine bump', () => {
    expect(shouldShowChangelog('5.19.0', '5.20.0')).toBe(true);
  });
  it('does not show when already current or ahead', () => {
    expect(shouldShowChangelog('5.20.0', '5.20.0')).toBe(false);
    expect(shouldShowChangelog('5.21.0', '5.20.0')).toBe(false);
  });
});

describe('entriesSince', () => {
  it('returns only entries newer than the last seen version', () => {
    const since = entriesSince('5.19.0');
    expect(since.length).toBeGreaterThan(0);
    expect(since.every(e => compareVersions(e.version, '5.19.0') > 0)).toBe(true);
  });
  it('returns nothing when already current', () => {
    expect(entriesSince(CURRENT_VERSION)).toEqual([]);
  });
  it('returns nothing on a fresh baseline', () => {
    expect(entriesSince(null)).toEqual([]);
  });
});
