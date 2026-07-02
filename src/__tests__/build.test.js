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
  it('dist/sw.js precaches every hashed JS and CSS asset emitted by vite build', async () => {
    const distPath = join(process.cwd(), 'dist');

    // dist/ must exist — this test is only meaningful post-build.
    // Use `npm run verify` (which builds first) rather than `npm test` alone.
    // Failing loudly here prevents a green test run from masking a missing build step.
    expect(existsSync(distPath), 'dist/ not found — run `npm run verify` instead of `npm test`').toBe(true);

    const assetsPath = join(distPath, 'assets');
    const assetFiles = (await readdir(assetsPath))
      .filter(f => f.endsWith('.js') || f.endsWith('.css'));

    expect(assetFiles.length).toBeGreaterThan(0);

    const swContent = await readFile(join(distPath, 'sw.js'), 'utf8');

    const missing = assetFiles.filter(f => !swContent.includes(`/assets/${f}`));

    expect(missing, `sw.js is missing precache entries for: ${missing.join(', ')}`).toHaveLength(0);
  });
});
