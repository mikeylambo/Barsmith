// @vitest-environment node
//
// Verifies that the generated dist/sw.js contains every hashed JS and CSS
// asset that Vite emitted in the same build. Run AFTER `npm run build`.
// Skips automatically when dist/ doesn't exist so `npm test` without a prior
// build doesn't fail in unit-test-only contexts (e.g. pre-push hooks).
//
// This test catches the exact failure mode identified in the v1 review:
// a service worker that precaches only static shell URLs but omits the hashed
// bundles will appear to install correctly and then fail to boot offline.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('build output', () => {
  it('dist/sw.js precaches every hashed asset emitted by vite build', async () => {
    const distPath = join(process.cwd(), 'dist');

    // dist/ must exist — this test is only meaningful post-build.
    // Use `npm run verify` (which builds first) rather than `npm test` alone.
    // Failing loudly here prevents a green test run from masking a missing build step.
    expect(existsSync(distPath), 'dist/ not found — run `npm run verify` instead of `npm test`').toBe(true);

    const assetsPath = join(distPath, 'assets');
    // Deliberately unfiltered: anything Vite emits into assets/ is something the
    // bundle references, so it all belongs in the install set. Checking every file
    // rather than an allowlist of extensions is what catches the next asset type
    // someone imports — self-hosting the font and drawing the brand lockup in the
    // bar-card renderer each silently escaped an extension-filtered version of
    // this test, leaving the app to boot offline without its typeface, then
    // without its logo.
    const assetFiles = await readdir(assetsPath);

    expect(assetFiles.length).toBeGreaterThan(0);

    const swContent = await readFile(join(distPath, 'sw.js'), 'utf8');

    // The single exception, and it stays a single exception on purpose: the Capacitor
    // plugin chunk is only imported inside the native shell, where no service worker runs.
    // Precaching it would make every browser download plugin code it can never execute,
    // and a failed fetch would abort the install and cost the app its offline support.
    // Everything else is still checked unfiltered — that unfiltered check is what caught
    // the self-hosted font and the brand lockup escaping earlier versions of this test.
    const NATIVE_ONLY = /^capacitor-native/;
    const webAssets = assetFiles.filter(f => !NATIVE_ONLY.test(f));

    // Guard the guard: if the chunk is ever renamed, this notices rather than silently
    // widening the exception to nothing.
    expect(
      assetFiles.some(f => NATIVE_ONLY.test(f)),
      'no capacitor-native chunk found — was it renamed? Update vite.config.js, scripts/inject-sw-precache.js and this test together.',
    ).toBe(true);

    const missing = webAssets.filter(f => !swContent.includes(`/assets/${f}`));
    expect(missing, `sw.js is missing precache entries for: ${missing.join(', ')}`).toHaveLength(0);

    const wronglyPrecached = assetFiles.filter(f => NATIVE_ONLY.test(f) && swContent.includes(`/assets/${f}`));
    expect(wronglyPrecached, `native-only chunks must not be precached: ${wronglyPrecached.join(', ')}`).toHaveLength(0);
  });

  // Note: the real enforcement is at build time. vite.config.js fails the build outright
  // if any Capacitor module lands outside the native chunk, reading Rollup's module graph
  // rather than guessing from artifacts — an earlier content-based check here was useless,
  // because the main bundle legitimately contains `KeepAwake` as a property name from its
  // own dynamic import. What remains above is the artifact-level half of that guarantee.

  it('dist/sw.js precaches every icon the manifest declares', async () => {
    const distPath = join(process.cwd(), 'dist');
    expect(existsSync(distPath), 'dist/ not found — run `npm run verify` instead of `npm test`').toBe(true);

    const manifest = JSON.parse(await readFile(join(distPath, 'manifest.json'), 'utf8'));
    const swContent = await readFile(join(distPath, 'sw.js'), 'utf8');

    const missing = manifest.icons.map(i => i.src).filter(src => !swContent.includes(src));

    expect(missing, `sw.js is missing manifest icons: ${missing.join(', ')}`).toHaveLength(0);
  });
});
