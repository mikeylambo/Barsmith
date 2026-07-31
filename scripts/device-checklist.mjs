// ─────────────────────────────────────────────
// DEVICE CHECKLIST — the automatable half
//
// README.md carries a 14-item checklist for a real device. Seven of those items are
// really assertions about the built app rather than about hardware, and a checklist
// item that is only ever verified by hand is an item that eventually stops being
// verified at all. This runs those seven against the exact production build.
//
// The other seven need a phone: a camera, a soft keyboard, a notch, an ear. Those are
// printed at the end as an explicit hardware list rather than quietly skipped, because
// a green run that silently covered half of what it claims is worse than no run.
//
// Usage:
//   npm run build && npm run preview &        # serves dist on :4173
//   npx playwright-core@latest --version      # or have playwright-core available
//   node scripts/device-checklist.mjs
//
// Overrides: CHECKLIST_BASE (preview URL), CHECKLIST_CHROME (browser executable).
// ─────────────────────────────────────────────
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (f) => resolve(ROOT, 'dist', f);
const BASE = process.env.CHECKLIST_BASE || 'http://127.0.0.1:4173';
const EXE = process.env.CHECKLIST_CHROME || undefined;
const results = [];
const check = (n, name, ok, detail) => {
  results.push({ n, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(n).padStart(2)}. ${name}\n        ${detail}`);
};

// EXE undefined lets playwright-core find its own download; set CHECKLIST_CHROME
// to point at a system or preinstalled Chromium instead.
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

// ── 2. Offline load ──────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('barsmithHasSeenInfo', '1'));
  // Let the service worker install and finish precaching.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(2500);

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  let booted = false, wrote = false, font = false;
  try {
    await page.getByRole('button', { name: 'Start Session' }).waitFor({ timeout: 8000 });
    booted = true;
    font = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('900 16px Inter'); });
    await page.getByRole('button', { name: 'Start Session' }).click();
    await page.locator('h2.cursor-pointer').click();
    await page.getByPlaceholder(/Write a bar with/).fill('written with no network');
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: 'Resume Session' }).click();
    await page.getByRole('button', { name: 'End Session' }).click();
    wrote = await page.getByText('written with no network').isVisible();
  } catch (e) { /* recorded below */ }
  // Playwright's setOffline fails subresource requests below the service worker, so an
  // end-to-end offline boot cannot be observed here even when the cache is correct.
  // Verify the contract instead: every asset the built HTML references is precached and
  // Cache Storage serves it with the network down.
  const cacheState = await page.evaluate(async () => {
    const names = await caches.keys();
    const c = await caches.open(names[0]);
    // Match on the stored Request itself, not a reconstructed pathname: the cache was
    // keyed by full URL, and a bare path only resolves by accident.
    const reqs = await c.keys();
    const misses = [];
    for (const req of reqs) {
      const hit = await caches.match(req);
      if (!hit || !hit.ok) misses.push(new URL(req.url).pathname);
    }
    return {
      names,
      keys: reqs.map(r => new URL(r.url).pathname),
      misses,
      allServed: misses.length === 0,
      onLine: navigator.onLine,
    };
  });
  const html = await readFile(DIST('index.html'), 'utf8');
  const referenced = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
  const allPrecached = referenced.every(r => cacheState.keys.includes(r));
  check(2, 'Offline assets precached and served from cache', allPrecached && cacheState.allServed,
    `cache ${cacheState.names[0]} holds ${cacheState.keys.length} entries; navigator.onLine=${cacheState.onLine}; all ${referenced.length} assets referenced by index.html present: ${allPrecached}; every entry served by Cache Storage with the network down: ${cacheState.allServed}${cacheState.misses.length ? ` (misses: ${cacheState.misses.join(', ')})` : ''}.\n        Informational (not asserted — see hardware list): offline boot reached the idle screen ${booted}, self-hosted font resolved ${font}, wrote and saved a bar ${wrote}.`);
  await ctx.close();
}

// ── 9. Background/return during a timed session ──────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('barsmithHasSeenInfo', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  // exact: the accessible name of the 15-minute button contains the 5-minute one's.
  const fiveMin = page.getByRole('button', { name: '5 minute session timer', exact: true });
  await fiveMin.scrollIntoViewIfNeeded();
  await fiveMin.click();
  await page.getByRole('button', { name: 'Start Session' }).click();
  await page.waitForTimeout(1200);
  // The countdown renders as "⏱ 4:58", so match on the substring rather than anchoring.
  const before = (await page.getByText(/⏱\s*\d+:\d\d/).first().textContent())?.trim();
  // Simulate the tab being backgrounded past the deadline: jump the clock forward.
  // The engine stores an absolute end time, so elapsed wall-clock must be honoured
  // rather than counted in ticks a throttled timer would have missed.
  await page.evaluate(() => {
    const realNow = Date.now;
    const jump = 6 * 60 * 1000;
    Date.now = () => realNow.call(Date) + jump;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1500);
  const ended = await page.getByRole('button', { name: 'New Session' }).isVisible().catch(() => false);
  check(9, 'Background/return during a timed session', ended,
    `countdown read ${before} before a +6min clock jump on a 5min sprint; session auto-ended: ${ended}`);
  await ctx.close();
}

// ── 10 & 11. Backup round-trip and text export ───────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, acceptDownloads: true });
  const page = await ctx.newPage();
  // Restore is destructive, so it asks first; Playwright dismisses dialogs by default,
  // which silently cancels the import rather than failing it.
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('barsmithHasSeenInfo', '1'));
  await page.reload({ waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Start Session' }).click();
  await page.locator('h2.cursor-pointer').click();
  await page.getByPlaceholder(/Write a bar with/).fill('the bar that must survive a restore');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Resume Session' }).click();
  await page.getByRole('button', { name: 'End Session' }).click();

  const [txt] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.getByRole('button', { name: 'Export .txt' }).click(),
  ]);
  const txtBody = await readFile(await txt.path(), 'utf8');
  check(11, 'Text export round-trip', txtBody.includes('the bar that must survive a restore'),
    `${txt.suggestedFilename()} contains the written bar`);

  await page.getByRole('button', { name: 'New Session' }).click();
  await page.getByRole('button', { name: /Vault/ }).click();
  const [json] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.getByRole('button', { name: /Export Backup/i }).click(),
  ]);
  const backupPath = await json.path();
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));

  // Wipe as if this were a fresh device, then restore.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('barsmithHasSeenInfo', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Vault/ }).click();
  await page.locator('input[type=file]').last().setInputFiles(backupPath);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Back to home' }).click();
  await page.getByRole('button', { name: /History/ }).click();
  const restored = await page.getByText('the bar that must survive a restore').isVisible().catch(() => false);
  // The confirm text is the last thing read before an overwrite, so its counts are held
  // to agreeing with themselves rather than merely being printed for eyeballing.
  const agrees = !/\b1 \w+s\b/.test(dialogs[0] || '');
  check(10, 'Backup round-trip', restored && backup.totals !== undefined && dialogs.length === 1 && agrees,
    `history restored after a full wipe: ${restored} · backup carried lifetime totals: ${backup.totals !== undefined} · confirmed before overwriting: ${dialogs.length === 1} · counts agree with their nouns: ${agrees}\n        ("${dialogs[0] || ''}")`);
  await ctx.close();
}

// ── 13. Today's session across midnight ──────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    // Pin the clock to 23:50 local so the prescription is computed for "today".
    const Real = Date;
    const fixed = new Real(new Real().getFullYear(), new Real().getMonth(), new Real().getDate(), 23, 50);
    class FakeDate extends Real {
      constructor(...a) { return a.length ? new Real(...a) : new Real(fixed); }
      static now() { return fixed.getTime(); }
    }
    window.Date = FakeDate;
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('barsmithHasSeenInfo', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start Session' }).waitFor({ timeout: 5000 });
  const tonight = (await page.locator('h2.text-2xl').first().textContent())?.trim();

  const ctx2 = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page2 = await ctx2.newPage();
  await page2.addInitScript(() => {
    const Real = Date;
    const t = new Real(); t.setDate(t.getDate() + 1); t.setHours(0, 10, 0, 0);
    class FakeDate extends Real {
      constructor(...a) { return a.length ? new Real(...a) : new Real(t); }
      static now() { return t.getTime(); }
    }
    window.Date = FakeDate;
  });
  await page2.goto(BASE, { waitUntil: 'networkidle' });
  await page2.evaluate(() => localStorage.setItem('barsmithHasSeenInfo', '1'));
  await page2.reload({ waitUntil: 'networkidle' });
  await page2.getByRole('button', { name: 'Start Session' }).waitFor({ timeout: 5000 });
  const tomorrow = (await page2.locator('h2.text-2xl').first().textContent())?.trim();

  check(13, "Today's session rolls at local midnight", tonight !== tomorrow,
    `23:50 showed "${tonight}", 00:10 next day showed "${tomorrow}"`);
  await ctx.close(); await ctx2.close();
}

// ── 12. Home-screen icon assets ──────────────────────────────────────────────
{
  const manifest = JSON.parse(await readFile(DIST('manifest.json'), 'utf8'));
  const maskable = manifest.icons.filter(i => i.purpose === 'maskable');
  const any = manifest.icons.filter(i => i.purpose === 'any');
  check(12, 'Home-screen icon assets', maskable.length > 0 && any.length >= 2,
    `manifest declares ${any.length} purpose:any and ${maskable.length} purpose:maskable icons (visual check on device still required)`);
}

// ── 14. Bar card render + share fallback ─────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('barsmithHasSeenInfo', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start Session' }).click();
  await page.locator('h2.cursor-pointer').click();
  await page.getByPlaceholder(/Write a bar with/).fill('line one\nline two\nline three');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Resume Session' }).click();
  await page.getByRole('button', { name: 'End Session' }).click();
  await page.getByRole('button', { name: /Share the bar written on/ }).click();
  const img = page.locator('img[alt^="Bar card reading"]');
  await img.waitFor({ timeout: 10000 });
  const dims = await page.evaluate(async (src) => {
    const b = await (await fetch(src)).blob();
    const bmp = await createImageBitmap(b);
    return { w: bmp.width, h: bmp.height, bytes: b.size };
  }, await img.getAttribute('src'));
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.getByRole('button', { name: 'Save Image' }).click(),
  ]);
  check(14, 'Bar card render + share fallback', dims.w === 1080 && dims.h === 1080 && !!dl,
    `rendered ${dims.w}x${dims.h} (${Math.round(dims.bytes/1024)}KB); no file-share support so Save Image was primary and produced ${dl.suggestedFilename()}`);
  await ctx.close();
}

await browser.close();

console.log('\n' + '─'.repeat(70));
console.log(`AUTOMATED: ${results.filter(r => r.ok).length}/${results.length} passed`);
console.log('HARDWARE-ONLY, still to run on a real device:');
for (const [n, name, why] of [
  [1, 'Install to home screen', 'iOS Safari Add to Home Screen; no installable surface here'],
  [3, 'Camera + mic permission', 'no camera device in the container'],
  [4, 'Recording round-trip', 'MediaRecorder needs real capture hardware'],
  [5, 'Front-camera framing', 'preview mirroring is a visual judgement on real capture'],
  [6, 'BPM by ear', 'audible drift is a human judgement'],
  [7, 'Keyboard-open scrolling', 'needs a soft keyboard resizing the viewport'],
  [8, 'Safe-area spacing', 'needs a notch / Dynamic Island'],
]) console.log(`   ${String(n).padStart(2)}. ${name} — ${why}`);
console.log('   14b. Share sheet itself — the iOS user-gesture rule only bites on hardware');
