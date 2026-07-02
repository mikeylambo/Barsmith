import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Off by default for a public build — turn back on temporarily when debugging a
    // specific production issue. (Previously left on with no apparent deliberate choice.)
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
