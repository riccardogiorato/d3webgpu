// D3WEBGPU Phase 2 — Vite config for the React host.
//
// "One server" architecture (see PREMIGRATION-WEBGPU.md): Vite BUILDS the React
// UI into ../build-wasm/ (where d3wasm.js / d3wasm.wasm / demo00.js / demo00.data
// already live from the Emscripten build). The existing zero-dep dev server
// (scripts/dev-server.mjs, :3001) then serves the whole build-wasm/ dir as one
// origin — React index.html + engine — with no-store + SSE live reload (it
// injects the livereload client into the index.html it serves). Single origin
// means no CORS, no proxy; engine rebuilds and React rebuilds both trigger the
// dev server's SSE reload.
//
// emptyOutDir: false is CRITICAL — without it Vite would wipe d3wasm.js/.wasm/
// demo00.* when it writes the React build into ../build-wasm.
//
// Dev loop:  `npm run dev:all` (root) spawns both the dev server (engine) and
// `vite build --watch` (React). `vite build --watch` is a production build per
// change (no HMR); for a host shell that barely changes that's fine, and it
// keeps the single-origin reload story simple. Switch to a Vite dev server +
// proxy later if React authoring needs HMR.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // root is web/ (this file's dir). index.html here is the Vite entry.
  build: {
    outDir: '../build-wasm',
    emptyOutDir: false,        // do NOT delete the Emscripten engine artifacts
    assetsDir: 'assets',
    sourcemap: false,
    // Keep chunk filenames stable enough for the dev server's reload debounce.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    // Not used in the one-server build-watch flow, but configured so `npx vite`
    // (Vite dev server) still works for ad-hoc React authoring if desired.
    port: 5174,
    strictPort: true,
  },
});