// ─────────────────────────────────────────────
// RECAP CARD SERVICE
// Renders a whole session — its stats and its best bar — to one shareable image.
//
// The bar card carries a single line; this carries the session it came out of. It is the
// growth loop the app has no backend for: a writer posts the evidence of a session — how
// much they wrote, how long they held it, the line they were proudest of — and the
// wordmark underneath does the introducing. Same square 1080×1080, same near-black shell
// and self-hosted Inter, so a recap and a bar card read as the same app.
//
// Everything reusable — the background, the brand footer, the bar text layout, the
// glyph-tracking — comes from services/bar-card.js so the two cards can never drift apart.
// ─────────────────────────────────────────────

import {
  CARD_SIZE, BG, WHITE, DIM, PAD,
  layoutBarText, drawTracked, drawCardBackground, drawBrandFooter, ensureInterFonts,
} from './bar-card';
import { dateStamp } from './download';

/** Centre a hand-tracked string on `cx`. drawTracked draws left-to-right from an x. */
function drawTrackedCentered(ctx, text, cx, y, spacing) {
  ctx.textAlign = 'left';
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  w -= spacing;
  drawTracked(ctx, text, cx - w / 2, y, spacing);
}

/**
 * Draw a session recap and return it as a PNG blob.
 *
 * @param {object}  opts
 * @param {object}  opts.stats   { bars, time (mm:ss string), words }
 * @param {string} [opts.bar]    The highlighted bar, newlines preserved.
 * @param {string} [opts.word]   The prompt word that bar was written on.
 * @param {Date}   [opts.date]   Session date, for the header. Defaults to now.
 */
export async function renderRecapCard({ stats, bar, word, date = new Date() }) {
  await ensureInterFonts(['900 84px Inter', '800 26px Inter', '900 40px Inter']);

  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');

  drawCardBackground(ctx);

  const maxWidth = CARD_SIZE - PAD * 2;
  const measure = (text, fontSize) => {
    ctx.font = `900 ${fontSize}px Inter, sans-serif`;
    return ctx.measureText(text).width;
  };

  // ── Footer first, so the content band knows where it must stop ──
  const { footerY, anvilH } = await drawBrandFooter(ctx);

  // ── Header line: SESSION RECAP · <date> ──
  const dateLabel = String(date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '').toUpperCase();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '800 26px Inter, sans-serif';
  ctx.fillStyle = DIM;
  drawTracked(ctx, dateLabel ? `SESSION RECAP · ${dateLabel}` : 'SESSION RECAP', PAD, PAD, 4);

  // ── Stat row ──
  const row = [
    { value: String(stats?.bars ?? 0), label: (stats?.bars ?? 0) === 1 ? 'BAR' : 'BARS' },
    { value: String(stats?.time ?? '0:00'), label: 'TIME' },
    { value: String(stats?.words ?? 0), label: (stats?.words ?? 0) === 1 ? 'WORD' : 'WORDS' },
  ];
  const statsTop = PAD + 26 + 64;
  const colW = maxWidth / row.length;
  const NUM_SIZE = 84;
  row.forEach((s, i) => {
    const cx = PAD + colW * i + colW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `900 ${NUM_SIZE}px Inter, sans-serif`;
    ctx.fillStyle = WHITE;
    ctx.fillText(s.value, cx, statsTop + NUM_SIZE);
    ctx.font = '800 22px Inter, sans-serif';
    ctx.fillStyle = DIM;
    ctx.textBaseline = 'top';
    drawTrackedCentered(ctx, s.label, cx, statsTop + NUM_SIZE + 22, 3);
  });
  const statsBottom = statsTop + NUM_SIZE + 22 + 22;

  // ── Divider ──
  const divY = statsBottom + 52;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(PAD, divY, maxWidth, 2);

  // ── Highlighted bar, filling the space between the divider and the footer ──
  const barTop = divY + 52;
  const barBandBottom = footerY - anvilH - 56;
  const bandHeight = Math.max(0, barBandBottom - barTop);

  ctx.textAlign = 'left';
  const LABEL_SIZE = 24;
  const LABEL_GAP = 30;
  const labelBlock = word && bar ? LABEL_SIZE + LABEL_GAP : 0;

  if (word && bar) {
    ctx.font = `800 ${LABEL_SIZE}px Inter, sans-serif`;
    ctx.fillStyle = DIM;
    ctx.textBaseline = 'top';
    drawTracked(ctx, `ON ${String(word).toUpperCase()}`, PAD, barTop, 4.5);
  }

  if (bar) {
    const { fontSize, lines, lineHeight, indentContinuations } = layoutBarText(bar, {
      maxWidth, maxHeight: bandHeight - labelBlock, measure,
    });
    ctx.font = `900 ${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = WHITE;
    ctx.textBaseline = 'top';
    const indent = indentContinuations ? Math.round(fontSize * 0.55) : 0;
    let y = barTop + labelBlock;
    for (const line of lines) {
      ctx.fillText(line.text, PAD + (line.continuation ? indent : 0), y);
      y += lineHeight;
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('recap encoding failed'))),
      'image/png',
    );
  });
}

/** `barsmith-recap-2026-09-20.png` — a filename that says what the image is. */
export function recapCardFilename(date = new Date()) {
  return `barsmith-recap-${dateStamp(date)}.png`;
}
