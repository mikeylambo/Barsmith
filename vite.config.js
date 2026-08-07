import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Naming the Capacitor chunk below makes Vite treat it as a shared chunk and emit a
    // <link rel="modulepreload"> for it in index.html — which would have every browser
    // eagerly download 21KB of plugin code it can never run, and leave index.html
    // referencing an asset the service worker deliberately does not precache, breaking the
    // offline contract. Strip it from the preload graph; the native shell reaches it
    // through its dynamic import, which needs no preload hint.
    modulePreload: {
      resolveDependencies: (_filename, deps) => deps.filter(d => !d.includes('capacitor-native')),
    },
    rollupOptions: {
      output: {
        // Capacitor plugins are dynamically imported and only ever reached inside the
        // native shell (see services/platform.js). Rollup still has to emit them, but
        // collecting them under one predictable name lets the service worker leave them
        // out of the precache instead of making every browser download plugin code it
        // will never execute in order to be "offline ready".
        manualChunks(id) {
          if (id.includes('node_modules/@capacitor/')) return 'capacitor-native';
        },
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
