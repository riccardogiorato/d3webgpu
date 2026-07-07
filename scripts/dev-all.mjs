#!/usr/bin/env node
// D3WEBGPU Phase 2 — one-command dev loop for the React + MODULARIZE-engine host.
//
// Spawns both processes that make the "one server" architecture work:
//   1. The zero-dep dev server (scripts/dev-server.mjs, :3001) — serves
//      build-wasm/ (React index.html + d3wasm.js + demo00.*) with no-store +
//      SSE live reload, AND auto-rebuilds the Emscripten engine on neo/*.cpp
//      changes.
//   2. `vite build --watch` (in web/) — rebuilds the React UI into build-wasm/
//      on web/src changes (emptyOutDir:false keeps the engine files).
//
// Both write to build-wasm/, so the dev server's SSE reload fires on either an
// engine rebuild or a React rebuild. Open http://localhost:3001/ once.
//
// Ctrl-C kills both children. Run: `npm run dev:all`.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const procs = [];
function start(label, file, args, cwd, color) {
  const child = spawn(file, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  procs.push(child);
  const tag = `\x1b[${color}m[${label}]\x1b[0m`;
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        process.stdout.write(`${tag} ${line}\n`);
      }
    });
  }
  child.on('exit', (code, sig) => {
    process.stdout.write(`${tag} exited (code=${code} sig=${sig})\n`);
    if (exiting) return;
    if (code !== 0 && code !== null) shutdown();
  });
  return child;
}

let exiting = false;
function shutdown() {
  if (exiting) return; exiting = true;
  for (const c of procs) { try { c.kill('SIGTERM'); } catch {} }
  setTimeout(() => {
    for (const c of procs) { try { c.kill('SIGKILL'); } catch {} }
    process.exit(0);
  }, 1500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('\x1b[36m[d3webgpu]\x1b[0m Phase 2 dev: dev-server (:3001) + vite build --watch (web/)\n');
console.log('\x1b[36m[d3webgpu]\x1b[0m Open http://localhost:3001/ once both are up.\n');

// 1. Engine dev server (:3001) — serves build-wasm/ + SSE reload + engine auto-rebuild.
start('engine', process.execPath, [path.join(REPO_ROOT, 'scripts/dev-server.mjs')], REPO_ROOT, '36');

// 2. React UI — vite build --watch into ../build-wasm (emptyOutDir:false).
start('ui', 'npm', ['run', 'dev'], path.join(REPO_ROOT, 'web'), '35');