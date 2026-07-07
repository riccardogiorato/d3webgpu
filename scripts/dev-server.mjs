#!/usr/bin/env node
// D3WEBGPU zero-dependency dev server with SSE live reload.
//
// Replaces the dead `python3 -m http.server` from Phase 1. That server had two
// problems this fixes: (1) it served a *directory listing* at `/`, so the user
// had to type `/d3wasm.html`; (2) it sent no cache headers, so Arc/Chrome kept
// serving the stale (pre-fix) `.wasm`/`.js`/`.data` from cache on reload — the
// exact "bufferData crash" that wasted a turn in Phase 1.
//
// What this does:
//   - Serves `build-wasm/` at the root. `http://localhost:3001/` → d3wasm.html
//     directly (no directory listing).
//   - Sends `Cache-Control: no-store` on every response, so a rebuild is always
//     fetched fresh. (The `?v=v2` cache-busting in d3wasm.html is now redundant
//     but harmless and left in place.)
//   - Watches `build-wasm/` for changes to the *served* artifacts only
//     (.html/.js/.wasm/.data/.mem/.pak/.pk4/.css), ignoring cmake/build-system
//     noise (.o/.a/Makefile/CMakeCache…). A rebuild settles, then one reload
//     is pushed — not one per intermediate file write.
//   - Pushes a `reload` event over an SSE connection (`GET /__livereload`).
//     A small client script is injected into served HTML on the fly; it opens
//     the SSE stream and calls `location.reload()` when it arrives.
//
// No third-party deps — only node: built-ins.
//
// Usage:
//   node scripts/dev-server.mjs              # port 3001, build-wasm/
//   PORT=3002 node scripts/dev-server.mjs
//   node scripts/dev-server.mjs 3002 ./path/to/build

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || process.argv[2] || 3001);
const BUILD_DIR = path.resolve(
  process.env.BUILD_DIR || process.argv[3] || path.join(REPO_ROOT, 'build-wasm')
);
// D3WEBGPU Phase 2: root is now the React host's index.html (Vite builds the
// React UI into build-wasm/). The Emscripten shell d3wasm.html is gone (the
// build is MODULARIZE — d3wasm.js only).
const ROOT_FILE = process.env.ROOT_FILE || 'index.html';
const VERBOSE = process.env.VERBOSE === '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.mem': 'application/octet-stream',
  '.pak': 'application/octet-stream',
  '.pk4': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

// Only reload on changes to files the browser actually loads. This filters out
// the cmake/build-system chatter (.o, .a, Makefile, CMakeCache.txt, …) so a
// `make` reconfigure doesn't reload the page into a half-built state.
const WATCH_EXTS = new Set([
  '.html', '.htm', '.js', '.mjs', '.css', '.wasm', '.data', '.mem', '.pak', '.pk4',
]);

// Injected before </body>. Guards against double-injection and is no-op'd if the
// page has no </body> (appends instead).
const RELOAD_CLIENT = `<script>(function(){
  if (window.__d3lr) return; window.__d3lr = true;
  function connect(){
    var es = new EventSource('/__livereload');
    es.addEventListener('open', function(){ console.log('[d3webgpu] live reload connected'); });
    es.addEventListener('reload', function(){
      try { es.close(); } catch(e){}
      console.log('[d3webgpu] file changed — reloading');
      location.reload();
    });
  }
  connect();
})();</script>`;

const clients = new Set(); // active SSE responses

function injectReload(html) {
  if (html.includes('window.__d3lr')) return html; // already injected
  if (html.includes('</body>')) return html.replace('</body>', `${RELOAD_CLIENT}\n</body>`);
  return html + RELOAD_CLIENT;
}

function sendFile(res, filePath, isHtml) {
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`404 Not Found: ${path.basename(filePath)}\n`);
      return;
    }
    let body = buf;
    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (isHtml) {
      body = injectReload(buf.toString('utf8'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else {
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    }
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
  });
}

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('retry: 2000\n');
  res.write('event: hello\ndata: connected\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

function broadcastReload(reason) {
  const msg = `event: reload\ndata: ${JSON.stringify({ reason })}\n\n`;
  for (const c of clients) {
    try { c.write(msg); } catch (e) { clients.delete(c); }
  }
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  } catch {
    res.statusCode = 400;
    res.end('400 Bad Request');
    return;
  }

  if (VERBOSE) console.log(`${req.method} ${pathname}`);

  if (pathname === '/__livereload') {
    handleSSE(req, res);
    return;
  }

  // Root → d3wasm.html (no directory listing).
  const rel = pathname === '/' ? '/' + ROOT_FILE : pathname;

  // Resolve under BUILD_DIR and block traversal.
  const filePath = path.resolve(BUILD_DIR, '.' + rel);
  if (!filePath.startsWith(BUILD_DIR + path.sep)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('403 Forbidden\n');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`404 Not Found: ${rel}\n`);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    sendFile(res, filePath, ext === '.html' || ext === '.htm');
  });
});

// --- File watcher → debounced SSE reload broadcast ---
let reloadTimer = null;
let watchOk = false;
try {
  const watcher = fs.watch(BUILD_DIR, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const ext = path.extname(filename).toLowerCase();
    if (!WATCH_EXTS.has(ext)) return;
    // A rebuild touches many files; reload once after writes settle.
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      const n = clients.size;
      broadcastReload(filename);
      console.log(`[reload] ${filename} → ${n} client${n === 1 ? '' : 's'}`);
    }, 250);
  });
  watcher.on('error', () => {});
  watchOk = true;
} catch (e) {
  console.warn('[watch] fs.watch failed; live reload disabled:', e.message);
}

// --- Optional: auto-rebuild C++ on source change (REBUILD=1 / npm run dev:watch) ---
// Watches neo/ for source edits and runs an incremental `emmake make d3wasm`
// (via scripts/build.sh, which sources emsdk). When make finishes it writes new
// d3wasm.{wasm,js,html} into build-wasm/ — and the artifact watcher above fires
// the SSE reload. So: edit a .cpp -> incremental make -> page reloads. No
// staleness. C++ compiles are NOT instant (one file + relink is seconds; a cold
// build longer), so this is "warm reload", not sub-millisecond HMR. A failed
// build does NOT reload the page (don't reload into a broken build) — fix the
// error and save again.
const AUTO_REBUILD = process.env.REBUILD !== '0';
const SRC_EXTS = new Set(['.cpp', '.cc', '.c', '.h', '.hpp', '.hxx', '.inl', '.in', '.cmake']);
let buildProc = null;
let buildQueued = false;
let srcWatchOk = false;

function runBuild(reason) {
  if (buildProc) { buildQueued = true; return; } // never overlap two makes
  const startedAt = Date.now();
  console.log(`\n[build] ${reason} -> incremental make d3wasm ...`);
  buildProc = spawn('bash', [path.join(REPO_ROOT, 'scripts', 'build.sh'), 'd3wasm'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, EMSDK_QUIET: '1' }, // silence the EMSDK env-setup spam
  });
  const pipe = (stream, fn) => stream.on('data', (d) => d.toString().split('\n').forEach((l) => { if (l) fn(l); }));
  pipe(buildProc.stdout, (l) => console.log(`[build] ${l}`));
  pipe(buildProc.stderr, (l) => console.error(`[build] ${l}`));
  buildProc.on('exit', (code) => {
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    buildProc = null;
    if (code === 0) console.log(`[build] done in ${secs}s — new artifacts will trigger a reload`);
    else console.error(`[build] FAILED (exit ${code}) in ${secs}s — page NOT reloaded; fix and save again`);
    if (buildQueued) { buildQueued = false; runBuild('queued change'); }
  });
}

if (AUTO_REBUILD) {
  let srcTimer = null;
  try {
    const srcWatcher = fs.watch(path.join(REPO_ROOT, 'neo'), { recursive: true }, (_t, filename) => {
      if (!filename) return;
      const ext = path.extname(filename).toLowerCase();
      const isCmake = /(^|\/)CMakeLists\.txt$/.test(filename.replace(/\\/g, '/'));
      if (!SRC_EXTS.has(ext) && !isCmake) return;
      if (srcTimer) clearTimeout(srcTimer);
      srcTimer = setTimeout(() => { srcTimer = null; runBuild(filename); }, 500);
    });
    srcWatcher.on('error', () => {});
    srcWatchOk = true;
  } catch (e) {
    console.warn('[watch] neo/ source watcher failed; auto-rebuild disabled:', e.message);
  }
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Try PORT=3002 npm run dev.`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  d3webgpu dev server');
  console.log('  ' + '-'.repeat(40));
  console.log(`  root:        http://localhost:${PORT}/  →  ${ROOT_FILE}`);
  console.log(`  build dir:   ${BUILD_DIR}`);
  console.log(`  live reload: ${watchOk ? 'SSE /__livereload (watching ' + [...WATCH_EXTS].join(' ') + ')' : 'disabled'}`);
  console.log('  cache:       no-store (every reload fetches fresh)');
  console.log(`  auto-rebuild: ${AUTO_REBUILD && srcWatchOk ? 'on — edit neo/*.cpp → make → reload' : 'off (REBUILD=0)'}`);
  console.log('');
  if (!fs.existsSync(path.join(BUILD_DIR, ROOT_FILE))) {
    console.warn(`  ⚠  ${ROOT_FILE} not found in build dir. Run \`npm run build\` first.`);
    console.warn(`     (then \`npm run dev\` again)`);
    console.log('');
  }
  console.log('  Press Ctrl-C to stop.');
  console.log('');
});