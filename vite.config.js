import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const NATIVE_CHUNK = 'capacitor-native';

/**
 * Is this module from a Capacitor package?
 *
 * Structural rather than an enumerated pattern, and that distinction has already cost
 * something twice:
 *
 *  1. The first version keyed on the `@capacitor/` scope alone, so
 *     `@capacitor-community/keep-awake` and `@capawesome/capacitor-audio-session` escaped
 *     into their own chunks and were precached — native-only code shipped to every
 *     browser, with every name-based check still passing.
 *  2. The build guard below then shared that same pattern, which meant narrowing it
 *     disabled the guard at the same time. A check that goes blind in exactly the case it
 *     exists to catch is not a check.
 *
 * So: look at the package name in the path and ask whether it mentions Capacitor. Adding
 * a plugin needs no change here, and no scope can be forgotten.
 */
function isCapacitorModule(id) {
  const norm = String(id).replace(/\\/g, '/');
  const at = norm.lastIndexOf('/node_modules/');
  if (at === -1) return false;
  const parts = norm.slice(at + '/node_modules/'.length).split('/');
  const pkg = parts[0].startsWith('@') ? `${parts[0]}/${parts[1] || ''}` : parts[0];
  return /capacitor/i.test(pkg);
}

/**
 * Fail the build if Capacitor plugin code lands anywhere except the native chunk.
 *
 * The service worker excludes that chunk by name, so the exclusion is only worth anything
 * while every plugin actually ends up in it. Checking built artifacts for telltale strings
 * proved useless — the main bundle legitimately contains `KeepAwake` as a property name
 * from its own dynamic import. Rollup knows exactly which modules went into which chunk,
 * so ask it instead.
 */
function capacitorChunkGuard() {
  return {
    name: 'barsmith:capacitor-chunk-guard',
    generateBundle(_options, bundle) {
      const strays = [];
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        if (file.includes(NATIVE_CHUNK)) continue;
        if (Object.keys(chunk.modules || {}).some(isCapacitorModule)) strays.push(file);
      }
      if (strays.length) {
        this.error(
          `Capacitor plugin code landed outside the ${NATIVE_CHUNK} chunk: ${strays.join(', ')}.\n` +
          'Those chunks are precached and shipped to every browser, which is native-only ' +
          'code no browser can run. Check manualChunks in vite.config.js.',
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), capacitorChunkGuard()],
  build: {
    outDir: 'dist',
    // Naming the Capacitor chunk below makes Vite treat it as a shared chunk and emit a
    // <link rel="modulepreload"> for it in index.html — which would have every browser
    // eagerly download 21KB of plugin code it can never run, and leave index.html
    // referencing an asset the service worker deliberately does not precache, breaking the
    // offline contract. Strip it from the preload graph; the native shell reaches it
    // through its dynamic import, which needs no preload hint.
    modulePreload: {
      resolveDependencies: (_filename, deps) => deps.filter(d => !d.includes(NATIVE_CHUNK)),
    },
    rollupOptions: {
      output: {
        // Capacitor plugins are dynamically imported and only ever reached inside the
        // native shell (see services/platform.js). Rollup still has to emit them, but
        // collecting them under one predictable name lets the service worker leave them
        // out of the precache instead of making every browser download plugin code it
        // will never execute in order to be "offline ready".
        manualChunks: (id) => (isCapacitorModule(id) ? NATIVE_CHUNK : undefined),
      },
    },
    // Off by default for a public build — turn back on temporarily when debugging a
    // specific production issue. (Previously left on with no apparent deliberate choice.)
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
