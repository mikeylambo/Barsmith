// @vitest-environment node
//
// The recap card's text layout is the bar card's, exercised by bar-card.test.js already —
// what is worth pinning here is the recap-specific filename and that the renderer is wired
// up (canvas drawing itself needs a real canvas and is covered by hand on device).

import { describe, it, expect } from 'vitest';
import { recapCardFilename, renderRecapCard } from '../services/recap-card.js';

describe('recapCardFilename', () => {
  it('stamps the session date into the name', () => {
    expect(recapCardFilename(new Date('2026-09-20T12:00:00Z'))).toBe('barsmith-recap-2026-09-20.png');
  });

  it('falls back to today rather than throwing on a bad date', () => {
    expect(recapCardFilename(new Date('not a date'))).toMatch(/^barsmith-recap-\d{4}-\d{2}-\d{2}\.png$/);
  });
});

describe('renderRecapCard', () => {
  it('is exported as a function', () => {
    expect(typeof renderRecapCard).toBe('function');
  });
});
