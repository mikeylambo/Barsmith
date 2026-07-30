// @vitest-environment node
//
// The bar card is the app's only outward-facing artifact, so its text layout is
// worth pinning down. The rule that matters most — and the one that was wrong in
// the first working version — is that a bar written as four lines must RENDER as
// four lines. Picking the largest type that merely fits the frame wrapped each of
// those lines in two, producing eight visual lines with no way to tell a new bar
// from a continuation, which reads as prose and destroys the rhythm.
//
// layoutBarText takes its text measurement as a parameter precisely so these rules
// can be tested without a canvas. The fake below is a linear stand-in for a real
// font's advance widths: wide enough to be predictable, proportional enough to
// exercise the same branches.

import { describe, it, expect } from 'vitest';
import { layoutBarText, barCardFilename } from '../services/bar-card.js';

const measure = (text, fontSize) => text.length * fontSize * 0.5;
const opts = (over = {}) => ({ maxWidth: 900, maxHeight: 620, measure, ...over });

const FOUR_BARS = [
  'they asked me where the hunger went',
  'I told them check the empty plate',
  'I been eating off the same intent',
  'since before they knew my name',
].join('\n');

describe('layoutBarText — structure', () => {
  it('renders a four-line bar as exactly four lines', () => {
    const { lines } = layoutBarText(FOUR_BARS, opts());
    expect(lines).toHaveLength(4);
    expect(lines.map(l => l.text)).toEqual(FOUR_BARS.split('\n'));
    expect(lines.every(l => !l.continuation)).toBe(true);
  });

  it('accepts smaller type as the price of keeping those lines whole', () => {
    const structured = layoutBarText(FOUR_BARS, opts());
    // The same words as a single paragraph are free to wrap, so they get bigger type.
    const asProse = layoutBarText(FOUR_BARS.replace(/\n/g, ' '), opts());
    expect(structured.fontSize).toBeLessThan(asProse.fontSize);
  });

  it('uses the largest size that fits for a single-line bar, since it has no structure to keep', () => {
    const { fontSize, lines } = layoutBarText('short punchline', opts());
    expect(fontSize).toBe(78);
    expect(lines).toHaveLength(1);
  });

  it('collapses blank lines rather than emitting empty rows', () => {
    const { lines } = layoutBarText('first bar\n\n\nsecond bar', opts());
    expect(lines.map(l => l.text)).toEqual(['first bar', 'second bar']);
  });

  it('treats empty and whitespace-only input as no lines', () => {
    expect(layoutBarText('', opts()).lines).toEqual([]);
    expect(layoutBarText('   \n  \n', opts()).lines).toEqual([]);
    expect(layoutBarText(null, opts()).lines).toEqual([]);
  });
});

describe('layoutBarText — wrapping', () => {
  it('wraps within the width and flags continuations when structure cannot be kept', () => {
    const long = ['x'.repeat(120), 'y'.repeat(120)].join('\n');
    const { lines, indentContinuations } = layoutBarText(long, opts());
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.some(l => l.continuation)).toBe(true);
    expect(indentContinuations).toBe(true);
  });

  it('does not flag indentation for a single wrapped bar, where there is nothing to disambiguate', () => {
    const { lines, indentContinuations } = layoutBarText('word '.repeat(60).trim(), opts());
    expect(lines.length).toBeGreaterThan(1);
    expect(indentContinuations).toBe(false);
  });

  it('never lets a line exceed the available width', () => {
    const { lines, fontSize } = layoutBarText('word '.repeat(80).trim(), opts());
    for (const line of lines) {
      expect(measure(line.text, fontSize)).toBeLessThanOrEqual(900);
    }
  });

  it('breaks a single token too wide for the card instead of letting it bleed off', () => {
    const { lines, fontSize } = layoutBarText('z'.repeat(400), opts());
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measure(line.text, fontSize)).toBeLessThanOrEqual(900);
    }
    // Nothing dropped: the pieces reassemble into the original token.
    expect(lines.map(l => l.text).join('')).toBe('z'.repeat(400));
  });
});

describe('layoutBarText — overflow', () => {
  it('truncates with an ellipsis when no size can fit, rather than overflowing', () => {
    const result = layoutBarText('word '.repeat(400).trim(), opts({ maxHeight: 200 }));
    expect(result.truncated).toBe(true);
    expect(result.lines[result.lines.length - 1].text.endsWith('…')).toBe(true);
    expect(result.lines.length * result.lineHeight).toBeLessThanOrEqual(200);
  });

  it('always keeps at least one line, even in an impossibly short band', () => {
    const result = layoutBarText('word '.repeat(200).trim(), opts({ maxHeight: 1 }));
    expect(result.lines.length).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('does not report truncation when everything fits', () => {
    expect(layoutBarText(FOUR_BARS, opts()).truncated).toBe(false);
  });
});

describe('barCardFilename', () => {
  it('names the file after the prompt word', () => {
    expect(barCardFilename('fracture')).toBe('barsmith-fracture.png');
  });

  it('slugifies multi-word and punctuated prompts', () => {
    expect(barCardFilename('real estate')).toBe('barsmith-real-estate.png');
    expect(barCardFilename("don't")).toBe('barsmith-don-t.png');
  });

  it('falls back to a generic name when there is no usable word', () => {
    expect(barCardFilename('')).toBe('barsmith-bar.png');
    expect(barCardFilename('!!!')).toBe('barsmith-bar.png');
    expect(barCardFilename(undefined)).toBe('barsmith-bar.png');
  });
});
