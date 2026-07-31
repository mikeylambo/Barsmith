// ─────────────────────────────────────────────
// BAR CARD SERVICE
// Renders a single bar to a shareable image.
//
// This is the app's only outward-facing artifact. Bars previously left Barsmith
// as .txt, and nobody posts a .txt — so nothing a writer made here could ever
// bring anyone back to it. A card carries the writer's own best line as the
// creative and the wordmark as the footer.
//
// Square 1080×1080 deliberately: it is the one ratio that survives an Instagram
// feed post, a story (letterboxed), and an X timeline without being centre-
// cropped into nonsense.
//
// Everything is drawn with the self-hosted Inter and the same near-black as the
// app shell, so a card reads as Barsmith without needing a logo watermark.
// ─────────────────────────────────────────────

import lockupUrl from '../assets/brand-lockup.png';

export const CARD_SIZE = 1080;

const BG = '#050505';
const WHITE = '#ffffff';
const DIM = '#6b7280';       // tailwind gray-500 — prompt label and footer
const PAD = 96;

// Candidate sizes, largest first. A one-line punchline should be huge; a written
// four-bar block steps down until it fits rather than overflowing the frame.
const SIZES = [78, 72, 66, 60, 55, 50, 46, 42, 38, 34, 30, 26, 23];
const LINE_RATIO = 1.3;

// Below this, keeping a writer's line breaks intact costs more in legibility than
// it gains in structure, so wrapping is allowed instead. See layoutBarText.
const STRUCTURED_FLOOR = 34;

// The anvil, cropped out of the full lockup (which also contains a wordmark whose
// light-on-light styling was drawn for a white background). Source-rect coords in
// the 512×512 original — kept in sync with scripts/make-brand-assets.py.
const ANVIL = { x: 48, y: 160, w: 127, h: 145 };

/**
 * Break a single token that cannot fit on its own line (a long hashtag, a URL,
 * a run of characters with no spaces) so it wraps instead of bleeding off-card.
 */
function breakToken(token, maxWidth, fontSize, measure) {
  const pieces = [];
  let cur = '';
  for (const ch of token) {
    if (cur && measure(cur + ch, fontSize) > maxWidth) { pieces.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) pieces.push(cur);
  return pieces;
}

function wrap(paragraph, maxWidth, fontSize, measure) {
  const lines = [];
  let cur = '';
  for (const word of paragraph.split(/\s+/).filter(Boolean)) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (measure(candidate, fontSize) <= maxWidth) { cur = candidate; continue; }
    if (cur) { lines.push(cur); cur = ''; }
    if (measure(word, fontSize) <= maxWidth) { cur = word; continue; }
    // Token is wider than the card on its own.
    const pieces = breakToken(word, maxWidth, fontSize, measure);
    lines.push(...pieces.slice(0, -1));
    cur = pieces[pieces.length - 1] || '';
  }
  if (cur) lines.push(cur);
  return lines;
}

const toLines = (perParagraph) =>
  perParagraph.flatMap(lines => lines.map((text, i) => ({ text, continuation: i > 0 })));

/**
 * Choose a font size and line breaks so a bar fills the card without overflowing.
 *
 * Pure and measurement-injected so the layout rules can be tested without a real
 * canvas: `measure(text, fontSize)` returns a width in px.
 *
 * The writer's own newlines are hard breaks, and the rule that matters most here is
 * that a bar written as four lines should RENDER as four lines. Simply picking the
 * largest size that fits the frame wrapped each of those lines in two, producing
 * eight visual lines with nothing to distinguish "next bar" from "continuation of
 * the last one" — which reads as a paragraph and destroys the rhythm that is the
 * entire point of sharing a bar. So for multi-line input this hunts for the largest
 * size at which nothing wraps, accepting smaller type as the price of intact
 * structure, down to STRUCTURED_FLOOR. Where wrapping is unavoidable, continuation
 * lines are flagged so the renderer can indent them.
 *
 * A single-line bar is a different case: it has no structure to preserve, so
 * wrapping is expected and the largest fitting size wins. `indentContinuations` is
 * false there too — with only one bar on the card there is no ambiguity for an
 * indent to resolve, and a hanging indent would read as deliberate poetic
 * indentation the writer never asked for.
 *
 * @returns {{fontSize: number, lines: {text: string, continuation: boolean}[],
 *            lineHeight: number, truncated: boolean, indentContinuations: boolean}}
 */
export function layoutBarText(text, {
  maxWidth, maxHeight, measure,
  sizes = SIZES, lineRatio = LINE_RATIO, structuredFloor = STRUCTURED_FLOOR,
}) {
  const paragraphs = String(text ?? '').split('\n').map(p => p.trim()).filter(Boolean);
  if (!paragraphs.length) {
    return {
      fontSize: sizes[sizes.length - 1], lines: [], lineHeight: 0,
      truncated: false, indentContinuations: false,
    };
  }
  const indentContinuations = paragraphs.length > 1;

  let largestThatFits = null;

  for (const fontSize of sizes) {
    const perParagraph = paragraphs.map(p => wrap(p, maxWidth, fontSize, measure));
    const lineHeight = Math.round(fontSize * lineRatio);
    const lineCount = perParagraph.reduce((n, l) => n + l.length, 0);
    if (lineCount * lineHeight > maxHeight) continue;

    const result = {
      fontSize, lines: toLines(perParagraph), lineHeight,
      truncated: false, indentContinuations,
    };

    // Nothing wrapped: the writer's structure is intact at the biggest size that allows it.
    if (perParagraph.every(l => l.length === 1)) return result;

    largestThatFits ||= result;
    // One paragraph has no structure to protect, so stop at the biggest size that fits.
    if (paragraphs.length === 1) return result;
    if (fontSize <= structuredFloor) break;
  }

  if (largestThatFits) return largestThatFits;

  // Longer than any size can fit. Keep the smallest size and cut, marking the
  // break with an ellipsis so it reads as deliberate rather than broken — the
  // full text is still in History and in the text exports.
  const fontSize = sizes[sizes.length - 1];
  const lineHeight = Math.round(fontSize * lineRatio);
  const all = toLines(paragraphs.map(p => wrap(p, maxWidth, fontSize, measure)));
  const room = Math.max(1, Math.floor(maxHeight / lineHeight));
  const lines = all.slice(0, room);
  const last = lines[lines.length - 1];
  lines[lines.length - 1] = { ...last, text: `${last.text.replace(/[.,;:\s]+$/, '')}…` };
  return { fontSize, lines, lineHeight, truncated: true, indentContinuations };
}

/** Canvas has no reliable letter-spacing across browsers, so step glyphs by hand. */
function drawTracked(ctx, text, x, y, spacing) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  return cursor - spacing - x; // total drawn width
}

let lockupPromise = null;
function loadLockup() {
  // Cached: the modal re-renders on every open, and decoding the PNG each time
  // adds visible latency to a screen the writer is waiting on.
  lockupPromise ||= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('lockup failed to load'));
    img.src = lockupUrl;
  });
  return lockupPromise;
}

/**
 * Draw the card and return it as a PNG blob.
 *
 * @param {object}  opts
 * @param {string}  opts.bar   The bar text, newlines preserved.
 * @param {string} [opts.word] The prompt word this bar was written on.
 */
export async function renderBarCard({ bar, word }) {
  // The variable font must be resident before any measureText call, or the layout
  // is computed against a fallback face and every line break is wrong.
  if (document.fonts) {
    try {
      await Promise.all([
        document.fonts.load('900 78px Inter'),
        document.fonts.load('800 26px Inter'),
      ]);
      await document.fonts.ready;
    } catch { /* fall through to whatever face is available */ }
  }

  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  // Forge glow — heat rising off the anvil in the footer. Kept very low: a stronger
  // gradient in the middle of the frame read as a smudge, and social platforms
  // recompress uploads hard enough that a broad soft gradient can band into
  // something that looks like an artifact rather than a choice.
  const glow = ctx.createRadialGradient(170, CARD_SIZE - 150, 0, 170, CARD_SIZE - 150, 560);
  glow.addColorStop(0, 'rgba(255,140,48,0.075)');
  glow.addColorStop(0.4, 'rgba(255,120,30,0.022)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  const maxWidth = CARD_SIZE - PAD * 2;

  // ── Footer: anvil + wordmark ──
  // This is the attribution that makes a shared card work as an introduction to the
  // app, so it is sized to be legible after a platform downscales the image, not
  // tucked away as a watermark.
  const footerY = CARD_SIZE - PAD;
  const anvilH = 84;
  const anvilW = Math.round((ANVIL.w / ANVIL.h) * anvilH);
  let wordmarkX = PAD;
  try {
    const lockup = await loadLockup();
    ctx.drawImage(lockup, ANVIL.x, ANVIL.y, ANVIL.w, ANVIL.h, PAD, footerY - anvilH, anvilW, anvilH);
    wordmarkX = PAD + anvilW + 24;
  } catch {
    // Card without the mark still beats no card — the wordmark just moves left.
  }
  ctx.font = '900 36px Inter, sans-serif';
  ctx.fillStyle = WHITE;
  ctx.textBaseline = 'alphabetic';
  drawTracked(ctx, 'BARSMITH', wordmarkX, footerY - 24, 3);

  // ── Prompt label + bar, centred together as one group ──
  // Pinning the label to the top of the frame left it stranded, reading as a caption
  // for the card rather than for the bar. Sitting it directly above the text keeps the
  // relationship obvious at any line count.
  const LABEL_SIZE = 26;
  const LABEL_GAP = 34;
  const labelBlock = word ? LABEL_SIZE + LABEL_GAP : 0;

  const bandTop = PAD + 24;
  const bandBottom = footerY - anvilH - 64;
  const bandHeight = bandBottom - bandTop;

  const measure = (text, fontSize) => {
    ctx.font = `900 ${fontSize}px Inter, sans-serif`;
    return ctx.measureText(text).width;
  };
  const { fontSize, lines, lineHeight, indentContinuations } = layoutBarText(bar, {
    maxWidth, maxHeight: bandHeight - labelBlock, measure,
  });

  const textHeight = lines.length * lineHeight;
  const groupTop = bandTop + Math.max(0, (bandHeight - (labelBlock + textHeight)) / 2);

  if (word) {
    ctx.font = `800 ${LABEL_SIZE}px Inter, sans-serif`;
    ctx.fillStyle = DIM;
    ctx.textBaseline = 'top';
    drawTracked(ctx, `ON ${String(word).toUpperCase()}`, PAD, groupTop, 4.5);
  }

  ctx.font = `900 ${fontSize}px Inter, sans-serif`;
  ctx.fillStyle = WHITE;
  ctx.textBaseline = 'top';
  // Continuation lines are indented so a wrapped line still reads as part of the bar
  // above it rather than as the start of a new one — but only when the card holds
  // more than one bar, since otherwise there is nothing to disambiguate.
  const indent = indentContinuations ? Math.round(fontSize * 0.55) : 0;
  let y = groupTop + labelBlock;
  for (const line of lines) {
    ctx.fillText(line.text, PAD + (line.continuation ? indent : 0), y);
    y += lineHeight;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('card encoding failed'))),
      'image/png',
    );
  });
}

/** `barsmith-fracture.png` — a filename that says what the image is. */
export function barCardFilename(word) {
  const slug = String(word || 'bar').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `barsmith-${slug || 'bar'}.png`;
}
