# agents.md — Multi-agent operating manual for d3webgpu

> How Codex desktop should orchestrate work on this project: a **Doom 3 → WebAssembly / WebGPU** port running as a *real* interactive 3D app in the browser. The renderer, input, audio, and game state are all live — this is not a static page. Every change must be verified against the **running app**, never against the model's imagination.

---

## 0. Project facts every agent must internalize before acting

| Fact | Value |
| --- | --- |
| What it is | idTech4 (Doom 3) engine ported to WebAssembly with a WebGL/WebGPU renderer backend |
| Build command | `bash scripts/build.sh` (Emscripten → `build-wasm/`) |
| Dev server | `node scripts/dev-server.mjs` → serves `build-wasm/` at **`http://localhost:3001/`** (zero-dependency, SSE live-reload, `Cache-Control: no-store`) |
| Served entry | `build-wasm/d3wasm.html` (mounted at `/`) |
| Hot artifacts | `.html .js .wasm .data .mem .pak .pk4 .css` — a settled rebuild triggers **one** reload, not one per intermediate file |
| Source tree | `neo/` (the idTech4 C++ source: `renderer/`, `framework/`, `sys/`, `idlib/`, `game/`, …), `scripts/`, `tools/`, `docs/` |
| It is a **real 3D app** | Frame loop, GPU pipelines, input polling, audio. A successful `build.sh` with no compiler errors is **not** proof it works — the binary can still crash on `bufferData`, black-screen, or freeze input at runtime. **Always verify in the live browser.** |

---

## 1. Model topology — who does what

Codex desktop is running **GLM 5.2** (`zai-org/GLM-5.2`) as the **main orchestrator**. GLM 5.2 is strong at planning, code editing, build orchestration, and reading the codebase — so it should *keep* that work locally and delegate only when delegation genuinely helps.

### 1.1 Main agent (GLM 5.2) — do this work yourself, do not delegate

- Reading & editing the C++/WASM source under `neo/`, scripts, and build config.
- Driving `bash scripts/build.sh` and interpreting Emscripten/CMake errors.
- Running the dev server (`node scripts/dev-server.mjs`) and inspecting its stdout/stderr.
- Planning, patching, and synthesizing results from subagents back into commits.
- Deciding **when** to spawn a verification subagent (see §3).

> **Do not** offload the critical-path code change to a subagent and then block waiting for it. If the very next step depends on the result, do it locally on GLM 5.2. Delegate only sidecar verification that can run in parallel.

### 1.2 Subagent models — for Computer Use verification of the live app

When the task requires **driving the real running app** through the browser (Computer Use: screenshots, clicks, keyboard, observing rendered frames, checking the JS console for crashes), delegate to a subagent running one of these models. They are the ones that should be "watching the screen," because they hallucinate far less when grounded in live screenshots than GLM 5.2 does when guessing about a 3D frame loop.

| Model ID (for `spawn_agent` `model`) | Aliases | When to pick it |
| --- | --- | --- |
| `Qwen/Qwen3.7-Max` | Qwen 3.7 Max | **DEFAULT for verification subagents.** Long context window → can hold the whole rendered-page accessibility tree + a long screenshot history + the engine's verbose console logs at once without dropping the thread. Best for deep multi-step interactive sessions (e.g. "load the game, start a demo, confirm the 3D view renders and input turns the camera"). |
| `moonshotai/Kimi-K2.7-Code` | Kimi 2.7 | Strong code-grounded reasoning; good when the verification step is tightly coupled to reading a specific `neo/renderer/` or `sys/` file the error points at, *and* watching the screen in the same breath. |
| `moonshotai/Kimi-K2.6` | Kimi 2.6 | Fallback when K2.7 or Qwen 3.7 Max is unavailable/rate-limited. Solid, but prefer the two above. |

**Routing rule of thumb:**

1. **Qwen 3.7 Max** — default for any Computer Use verification task (it can carry the long context a real 3D app generates).
2. **Kimi K2.7 Code** — when the task mixes screen-reading with precise source-file reasoning in one agent.
3. **Kimi K2.6** — fallback only.

> These are the *only* models permitted for subagents on this project unless the user explicitly overrides. Do **not** spawn GLM-5.2 subagents for Computer Use — the whole point is to avoid GLM 5.2 hallucinating behavior it cannot see.

---

## 2. Why this split exists (read before ignoring it)

GLM 5.2 is excellent at code but, like any large model, will confabulate what a 3D app "probably looks like" when it can't see it. For a port this brittle (WASM `bufferData` crashes, stale-cache reloads, GPU context loss), "it probably works" is how regressions ship. Grounding verification in **live screenshots from Computer Use**, run on a model with a long enough context to keep the whole interaction history, is the cheap insurance that stops that.

Concretely: a verification subagent **sees** the canvas is black, **sees** the console error, **sees** the camera doesn't move on keypress — it doesn't have to infer it. That is the hallucination firewall.

---

## 3. Standard workflow for any non-trivial change

1. **GLM 5.2 (local):** reproduce/understand the issue in source under `neo/`. Make the code change with `apply_patch`.
2. **GLM 5.2 (local):** `bash scripts/build.sh`. Fix compiler/linker errors locally — never delegate compiler errors, they're just text.
3. **GLM 5.2 (local):** ensure the dev server is up: `node scripts/dev-server.mjs` (or reuse the running one). Note the URL (`http://localhost:3001/` by default).
4. **Spawn a verification subagent** (model = `Qwen/Qwen3.7-Max` unless §1.2 routing says otherwise), `agent_type: "default"`, with a *concrete, screen-grounded* task, e.g.:
   > Open `http://localhost:3001/` in the browser via Computer Use. Wait for the canvas to init. Screenshot it. Confirm the 3D view is rendering (not a black canvas). Open the devtools console, report any red errors verbatim. Then press the arrow keys and confirm the camera moves in the viewport. Report PASS/FAIL with the screenshot evidence.
5. **GLM 5.2 (local):** read the subagent's screenshot-backed verdict. If FAIL, loop back to step 1 with the *actual* failure it saw — not a guess. If PASS, commit.
6. **Never** declare "it works" without either (a) a passing verification-subagent run with screenshots, or (b) the user confirming they saw it themselves.

---

## 4. Subagent briefing template (copy this into every `spawn_agent` message)

When you spawn a Computer Use verification subagent, give it all of this — it prevents it from guessing about a project it didn't read:

```
You are a verification subagent for d3webgpu (Doom 3 → WASM/WebGPU port).
DO NOT guess how this app behaves. It is a real interactive 3D engine — every
claim you make MUST come from a screenshot or the live console you drive via
Computer Use. If you cannot see it, say "could not verify" — never infer it.

Project facts:
- Dev URL: http://localhost:3001/  (serves build-wasm/d3wasm.html at "/")
- It uses WebGL/WebGPU; the canvas is a real 3D viewport, not a static image.
- Watch the devtools console (JS) for red errors — WASM crashes often surface
  there as "bufferData", "ArrayBuffer", or "memory access out of bounds".
- Stale-cache reloads are a known footgun; a fresh rebuild should already be
  served (the dev server sends no-store), but if output looks identical to a
  pre-change state, hard-reload (Cmd+Shift+R) before reporting.

Your task: <CONCRETE, SCREEN-GROUNDED GOAL HERE>
Report format: PASS or FAIL, the exact screenshots that prove it, and any
console errors copied verbatim. Do not edit files — you are read-only
verification. Surface a concrete failure (with the screenshot) to the
orchestrator; the orchestrator (GLM 5.2) will fix the code.
```

> Subagents on this project are **verification-only** by default (read-only on files). If you genuinely need a subagent to *edit* source, keep it on a disjoint file set from your own work and tell it which files it owns — never let two writers touch the same file.

---

## 5. Anti-hallucination rules (binding)

1. **No claim about runtime behavior without a screenshot.** "The menu should appear" is forbidden; "the menu appears, see screenshot #2" is required.
2. **Console errors are quoted verbatim**, not paraphrased. A paraphrased `bufferData` crash is useless for debugging.
3. **A green build ≠ a working app.** Step 2 (build) passing only earns the right to attempt step 4 (verify in browser).
4. **Stale-cache is a real failure mode.** If a "fix" produced zero visible change, suspect cache before suspecting your code — hard-reload and re-screenshot.
5. **"Could not verify" is an acceptable answer.** It is strictly better than a confident hallucination. Surface it to the orchestrator and let the user decide.
6. **One writer per file.** When subagents do edit, enforce disjoint write scopes.

---

## 6. Quick reference

- Spawn a verification subagent: `spawn_agent` with `model: "Qwen/Qwen3.7-Max"`, `agent_type: "default"`.
- Build: `bash scripts/build.sh`
- Run: `node scripts/dev-server.mjs` → `http://localhost:3001/`
- Build artifacts land in `build-wasm/`; source lives in `neo/`.
- Commit only after a verification subagent returns PASS with screenshots, or the user confirms.
