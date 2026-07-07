# PRE-MIGRATION PLAN — d3webgpu (Doom 3 -> WASM/WebGL, before the WebGPU port)

**Date:** 2026-07-06. **Branch:** `master`. **Status:** Phases 0, 1, 2 all done +
verified live (headless Chromium/Playwright). Phase 2 (target architecture)
landed in commits `fc2323e` (Stage A: MODULARIZE) + `<Stage B>` (Vite + React
host). Companion to `HANDOFF.md` (the bug state) and `DIARY.md` (full narrative,
esp. Turn 11). This doc records the plan we landed on after discussing the
Vite + React architecture, so it survives across turns.

> **Phase 2 outcome (2026-07-07):** Emscripten now emits `d3wasm.js` +
> `d3wasm.wasm` only (`MODULARIZE=1`, `EXPORT_NAME=DoomModule`; no HTML). A
> Vite + React app in `web/` owns the page, creates a fullscreen `<canvas>`,
> loads `demo00.js` (augments the shared `Module` config) then `d3wasm.js`, and
> boots `DoomModule(window.Module)`. The shell.html fixes (TextDecoder
> resizable-heap polyfill, `locateFile` cache-bust, the ESC bridge +
> pointer-lock forwarder) migrated into `web/src/d3/{polyfills,escBridge,
> loadEngine,controls}.js`. Overlay buttons (Menu/Save/Load/Screenshot/Play)
> call the verified `Module._d3_*` KEEPALIVE exports. "One server": `vite build`
> writes the React UI into `build-wasm/` (`emptyOutDir:false` keeps the engine
> files), and the existing dev server (`:3001`) serves it all — one origin,
> no CORS, SSE reload on engine *or* React rebuild. `npm run dev:all` runs
> both. Verified: React mounts, canvas renders real game content
> (`game/demo_mars_city1`), Play Demo loads the level, **physical ESC opens the
> menu** (bridge), Menu/Screenshot buttons work (`shot00001.tga`).

> Why this doc: the previous agent got stuck because its environment had **no
browser-automation tool**, so the two user blockers (ESC, cinematic) were
only ever analyzed statically. **This environment has Computer Use**, and
`AGENTS.md` mandates live-browser verification via a **Qwen 3.7 Max**
subagent rather than the orchestrator guessing about a 3D frame loop. So the
decisive step that was impossible before — *observe the running app* — is
now available and is Phase 0 below.

---

## Target architecture (the key decision)

The UI and the game renderer are **two cleanly separated parts**:

```
Vite + React app ── owns the page, routing, all UI chrome
   └── <canvas> ── full-screen, React creates and owns this element
         └── Emscripten engine (d3wasm.js + d3wasm.wasm) renders WebGL into it
```

React does **not** render the game; it hosts the canvas and talks to the engine
through a small control surface. The engine doesn't know React exists — it
renders into whatever canvas it's handed.

**We do NOT need Emscripten to output HTML.** Switch the build to
**MODULARIZE** (`-o d3wasm.js` + `MODULARIZE=1` + `EXPORT_NAME=DoomModule`).
Emscripten then emits just a JS module + the wasm (no HTML). The React app
`import()`s the module, creates the `<canvas>`, and boots the engine with
`{ canvas: myCanvas }`. The generated `d3wasm.html` goes away; React's
`index.html` becomes the host. (This replaces the earlier "overlay React on the
Emscripten-generated HTML" half-measure — the cleaner pattern we agreed on.)

---

## Current state (confirmed by read-only recon, 2026-07-06)

- **Git:** `master`, clean except `M DIARY.md` + untracked `HANDOFF.md`.
  Turn-11 ESC fix + auto-rebuild server are **already committed**
  (`b22fcd3`). Nothing half-finished in the tree.
- **Source fixes in place:** `neo/framework/Common.cpp:2612` ->
  `StartMenu(false)` (cinematic skip); `neo/sys/wasm/shell.html` has the
  `_d3SynthEscKey` + `pointerlockchange` forwarder with the `keyCode`/`which`
  `Object.defineProperty` override and the `[D3WEBGPU] Forwarded ESC` log.
- **Served build matches source:** `build-wasm/d3wasm.html` carries the same
  ESC code; artifacts rebuilt 18:54; `d3wasm.wasm` = 6,527,898 bytes.
- **Dev server running** on `http://localhost:3001/` (node
  `scripts/dev-server.mjs`): root -> `d3wasm.html` (200), wasm (200
  `application/wasm`), `no-store` + SSE live-reload + auto-rebuild on
  `neo/*.cpp` changes.
- **Both user blockers still open despite the above:** ESC doesn't open the
  menu; the intro cinematic still plays on load. Static analysis can prove a
  mechanism is *possible*, not that it *works* — hence Phase 0.

---

## The three phases

### Phase 0 — Observe the live app (decisive; was impossible last turn)

Spawn a **Qwen 3.7 Max** verification subagent (`agent_type: default`,
**read-only**), Computer Use, hard-reload `http://localhost:3001/` with DevTools
open, and capture:
1. **Console + screenshot during the first ~15 s** -> determine *what is
   actually playing* during the "cinematic": the `Squishy` GUI animation?
   `intro.gui`? a RoQ video (`video/intro/introid.RoQ` / `introloop.RoQ`)?
   a recorded demo (`demo00`)? This decides the cinematic bug's real cause.
2. **Network tab** -> is `d3wasm.wasm` served `no-store` and is it the fresh
   6.5 MB / 18:54 build? (rules stale cache in/out).
3. **Press ESC** -> does `[D3WEBGPU] Forwarded ESC (keyCode=27)` log? Does
   pointer lock ever engage/exit (diary already saw `WrongDocumentError`
   pointer-lock failures on macOS)? Does the menu open?

Report: PASS/FAIL + screenshots + verbatim console text. No file edits.

### Phase 1 — Fix the two bugs from the evidence (no guessing)

Branch on what Phase 0 actually shows:

- **Cinematic:**
  - If `Squishy` GUI anim -> `StartMenu(false)` isn't being hit (startup cmd?
    stale wasm despite `no-store`?).
  - If a **RoQ video** or **demo00** recording -> `StartMenu(false)` never
    addressed those; short-circuit the video/demo path or add a startup skip.
  - If `intro.gui` (its `onESC { set "cmd" "startgame" }`) -> that explains
    both bugs at once (ESC there *starts a game*, not `togglemenu`).
- **ESC:**
  - If the forward log **never fires** -> pointer lock never engaged, so
    `pointerlockchange` never fires -> stop gating ESC on pointer-lock-exit;
    forward on the real ESC keydown **and/or** bypass keys entirely.
  - If it fires but the menu doesn't open -> key-state issue, or ESC!=togglemenu
    in the current state.
  - **Robust, mechanism-independent fix:** add an `extern "C"` command-executor,
    export it in `neo/CMakeLists.txt` (`EXPORTED_FUNCTIONS`), rebuild, and have
    the overlay/buttons call `ccall('d3_exec_cmd', ...)` with `togglemenu`. This
    sidesteps the whole synthetic-key/pointer-lock fragility.

Each fix -> `bash scripts/build.sh` -> **re-verify** with the same Qwen subagent
before moving on.

### Phase 2 — Vite + React shell (target architecture above)

- React owns the page; full-screen `<canvas>`; Emscripten switched to
  **MODULARIZE** (JS module + wasm, no HTML).
- Overlay buttons (Menu=ESC/togglemenu, Save=F5, Load=F9, Pause=PAUSE,
  Screenshot=F12) wired through the Phase-1 command-executor (fallback:
  synthetic keys).
- Final Qwen subagent verification: fullscreen canvas renders, buttons work.

---

## Real decisions / wrinkles this architecture forces (resolve during Phase 2)

1. **Build output mode** — `neo/CMakeLists.txt`: `-o d3wasm.html` (HTML) ->
   `-o d3wasm.js` + `MODULARIZE=1` + `EXPORT_NAME=DoomModule`. One-time CMake
   change; standard, supported (how everyone embeds Emscripten apps in React).
2. **Migrate the `shell.html` fixes into the React host** — the
   TextDecoder/resizable-ArrayBuffer polyfill, the `locateFile` cache-bust,
   the ESC pointer-lock forwarder, the keyboard hints all currently live in the
   Emscripten-generated HTML. They must move into the React app / a small
   loader module. **Do not silently lose the resizable-heap polyfill**
   (Turns 5-7). This is a cleanup (they belong in the host layer) but is work.
3. **Dev-server shape** — where the React app fetches `d3wasm.wasm` +
   `demo00.data` from:
   - **One server (recommended start):** existing `dev-server.mjs` serves
     `build-wasm/` on `:3001`; Vite builds the React UI **into** `build-wasm/`
     so canvas + wasm + demo data share one origin/port. Keeps `no-store` +
     live-reload. No CORS.
   - **Two servers (nicer UI dev):** Vite HMR on `:5173`, proxy
     `/d3wasm.js|.wasm|demo00.*` to `:3001`. Better React authoring loop, two
     moving parts.
   Start with one; revisit if the UI authoring loop hurts.
4. **`demo00.data` preloader under MODULARIZE** — the generated `demo00.js`
   preloader assumes the old shell; under MODULARIZE it must attach to the
   Module instance React creates. Standard; flagged so it isn't glossed over.
5. **`preserveDrawingBuffer`** — leave default (off) for the user's real
   experience (content displays fine; only programmatic `readPixels` breaks).
   The verification subagent can set it via a test hook when it needs to
   sample pixels.

---

## Execution order

Phase 0 -> Phase 1 -> Phase 2, with a live-browser verification subagent
(Qwen 3.7 Max) gating each phase. The React shell is built **on top of** a
working engine + input path — if ESC/cinematic are engine bugs, a React shell
won't fix them; if they're input-layer bugs, the React buttons + `ccall`
executor are the robust fix. So observe first.
