# D3Wasm to WebGPU Porting Plan

**Project**: Port D3Wasm (id Tech 4 / Doom 3 engine) from WebGL + WebAssembly to WebGPU + WebAssembly for a fast, shareable browser experience.  
**Goals**:
- Achieve a "super fast" web demo (fast initial load + playable performance).
- Use AI assistance (e.g., Fable 5 or equivalent) for refactoring, shader conversion, and optimizations.
- Maintain full legality (use Doom 3 demo assets + open-source engine).
- Enable end-to-end automated verification during porting.
- Produce a clean, documented, open-sourced result.

**Constraints**:
- Start from existing D3Wasm codebase (https://github.com/gabrielcuvillier/d3wasm).
- Target modern browsers with WebGPU support (Chrome/Edge primary).
- Keep visual fidelity close to original while improving performance.
- Asset size target: < 100 MB initial download with streaming.

**Overall Approach**:
- Front-load web-specific work (assets + loading).
- Use AI heavily for large refactors.
- Automated verification at every phase using terminal commands, build scripts, and browser automation tools (Playwright/Puppeteer scripts that an agent can execute).

---

## Phase 1: Baseline Setup (1–2 weeks)

### Goals
- Get the existing 2022 D3Wasm code compiling and running locally.
- Produce a working web build (even if slow/heavy).
- Establish CI/build pipeline and verification scripts.

### Detailed Tasks
1. Clone the repository and set up development environment.
2. Update Emscripten and build dependencies to latest stable versions.
3. Build the project locally for desktop and confirm Doom 3 demo runs.
4. Create a basic Emscripten web build and test in browser.
5. Set up automated build scripts (Makefile/CMake + shell scripts).
6. Create initial verification scripts.

### Things to Do
- Install Emscripten, CMake, and required libraries.
- Run `./build.sh` (or equivalent) and fix any compilation errors.
- Generate web build with `emcc` and serve via `emrun` or simple HTTP server.
- Document current performance baseline (load time, FPS in browser).

### Tests & Verification
- **Build success**: `./build.sh` exits with code 0.
- **Desktop run**: Game launches and first level is playable.
- **Web build**: `index.html` loads in browser and shows demo menu.
- **Performance baseline**: Record FPS and load time (use browser dev tools or script).

### Automated Verification (Agent Computer Use)
Agent runs these commands/scripts:
```bash
git clone https://github.com/gabrielcuvillier/d3wasm.git
cd d3wasm
./setup.sh          # Install dependencies + Emscripten
./build.sh          # Full build
emrun --browser chrome build/index.html  # Or use Playwright script
```
- Playwright script (`verify_baseline.js`): Launches headless Chrome, checks page loads, looks for canvas element, measures load time.
- Success criteria logged to `verification.log`.

**Exit Criteria**: Working local + web build with documented baseline metrics.

---

## Phase 2: Asset Pipeline Modernization (Parallel with or immediately after Phase 1)

### Goals
- Dramatically reduce asset size and improve loading speed.
- Prepare asset system for WebGPU (modern texture formats).
- Enable streaming so the demo feels fast even during development.

### Detailed Tasks
1. Integrate Basis Universal (KTX2) texture compression.
2. Add Draco mesh compression.
3. Improve audio compression (switch to Opus where possible).
4. Refactor asset loading system for asynchronous + streaming support.
5. Repack .pk4 files with better compression.
6. Implement progressive loading (load core assets first, stream rest).

### Things to Do
- Convert existing textures to Basis Universal using `basisu` tool.
- Modify `idlib` / asset manager code to support KTX2 + runtime transcoding.
- Add streaming logic (background loading of levels/textures).
- Create asset conversion pipeline script.
- Update build system to include compressed assets.

### Tests & Verification
- **Size reduction**: Measure total asset size before/after (target < 150 MB total, < 80 MB initial).
- **Load time**: First playable frame < 15 seconds on average connection.
- **Visual quality**: Side-by-side comparison (no major artifacts).
- **Streaming test**: Game starts while assets continue loading in background.

### Automated Verification (Agent Computer Use)
- Run asset conversion script and measure sizes:
  ```bash
  ./convert_assets.sh
  du -sh assets/          # Before/after comparison
  ```
- Playwright script: Loads page, waits for first frame render, checks FPS after 30 seconds, verifies streaming logs.
- Automated size report generated in `asset_report.md`.

**Exit Criteria**: Assets significantly smaller + streaming working. Web build feels noticeably faster.

---

## Phase 3: WebGPU Renderer Migration (Core Phase – 4–8 weeks)

### Goals
- Replace WebGL rendering backend with WebGPU.
- Maintain or improve visual quality and performance.
- Leverage WebGPU features (compute shaders, better pipelines).

### Detailed Tasks
1. Create new WebGPU rendering backend (modular replacement for existing WebGL code).
2. Convert all GLSL shaders to WGSL.
3. Update resource management (buffers, textures, bind groups, pipelines).
4. Implement command encoding and render passes.
5. Add WebGPU-specific optimizations (compute for culling/post-processing).
6. Maintain fallback or compatibility layer during transition.
7. Integrate with existing game loop and asset system (from Phase 2).

### Things to Do
- Study current custom WebGL backend in D3Wasm.
- Use AI to assist with large-scale shader conversion and code refactoring.
- Implement core WebGPU device/context creation.
- Port key rendering passes (geometry, lighting, post-processing).
- Test incrementally (one pass at a time).

### Tests & Verification
- **Visual parity**: Side-by-side comparison with WebGL version (screenshots + manual check).
- **Performance**: Target ≥ 40 FPS on mid-range hardware in browser.
- **Feature completeness**: All original rendering features working (normal maps, specular, dynamic lights, etc.).
- **No crashes**: Game runs for full demo level without errors.

### Automated Verification (Agent Computer Use)
- Build script that compiles both WebGL and WebGPU versions.
- Playwright + performance tracing script:
  - Loads both versions.
  - Captures screenshots at key points.
  - Measures FPS over 60 seconds using `performance.now()` and `requestAnimationFrame`.
  - Compares metrics and logs differences.
- Automated visual regression test using screenshot comparison library.

**Exit Criteria**: Fully working WebGPU renderer with performance equal or better than original WebGL version.

---

## Phase 4: Polish, Input & Modern Features (3–4 weeks)

### Goals
- Make the demo comfortable to play in browser.
- Add quality-of-life and modern enhancements.
- Prepare for public sharing.

### Detailed Tasks
1. Improve input handling (keyboard + mouse, basic touch support).
2. Add UI improvements (menus, settings, performance overlay).
3. Implement basic compute-shader effects (e.g., improved SSAO, simple reflections).
4. Optimize memory usage and reduce stuttering.
5. Add savegame support and basic configuration.
6. Create demo-specific landing page with instructions.

### Things to Do
- Extend input system for browser events.
- Add on-screen controls or virtual joystick for mobile testing.
- Integrate simple post-processing stack using compute shaders.
- Create `index.html` with nice UI and "Play Demo" button.

### Tests & Verification
- **Playability test**: Complete first level without major issues.
- **Input responsiveness**: No noticeable input lag.
- **Mobile test**: Basic functionality on Android Chrome (touch controls).
- **Stability**: Run for 30+ minutes without crashes or memory leaks.

### Automated Verification (Agent Computer Use)
- Extended Playwright script that:
  - Starts game.
  - Simulates keyboard/mouse input for 2 minutes.
  - Checks for console errors.
  - Measures average FPS and memory usage.
- Automated report comparing Phase 3 vs Phase 4 metrics.

**Exit Criteria**: Polished, playable browser demo with modern touches.

---

## Phase 5: Final Optimization, Documentation & Release (2–3 weeks)

### Goals
- Reach "super fast" web experience.
- Document everything.
- Prepare for public sharing and potential trending.

### Detailed Tasks
1. Further asset optimization and streaming tuning.
2. Advanced WebGPU optimizations (bindless resources, mesh shaders if supported).
3. Create comprehensive documentation (README, build guide, architecture).
4. Set up hosting (GitHub Pages or similar) with single-click play.
5. Add performance metrics and comparison to original WebGL version.
6. Prepare release notes highlighting AI-assisted WebGPU port.

### Things to Do
- Profile and optimize hot paths using browser dev tools.
- Final asset compression pass.
- Write user guide for running the demo.
- Create demo video/screenshots for sharing.

### Tests & Verification
- **End-to-end web test**: Full demo playable in < 10 seconds initial load on good connection.
- **Performance targets**: 50+ FPS average, smooth experience.
- **Cross-browser test**: Works in Chrome, Edge, Firefox (WebGPU enabled).
- **Documentation completeness**: All build and run steps verified.

### Automated Verification (Agent Computer Use)
- Final CI pipeline that:
  - Builds the project.
  - Runs full Playwright test suite (input simulation + performance measurement).
  - Generates size report and performance dashboard.
  - Creates a shareable build artifact.
- Agent can trigger the full pipeline and review the generated `final_report.md`.

**Exit Criteria**: Production-ready, fast, documented WebGPU version ready to share publicly.

---

## Cross-Cutting: AI Assistance & Automation Strategy

- **AI Usage**: Use advanced coding models for:
  - Large code refactors and shader conversion (Phase 3).
  - Writing asset conversion scripts and streaming logic (Phase 2).
  - Performance optimization suggestions.
- **Automated Verification System**:
  - Create a `verify.sh` script + Playwright test suite.
  - Agent runs verification after every major change.
  - All phases produce logs and reports in `/verification/` folder.
- **End-to-End Flow**:
  1. Agent makes code change.
  2. Runs `./build.sh && ./verify.sh`.
  3. Reviews generated reports and screenshots.
  4. Proceeds only if all checks pass.

## Success Metrics (End of Project)
- Initial playable load time < 15 seconds.
- Average FPS ≥ 45 in browser on mid-range hardware.
- Total initial download size < 100 MB with streaming.
- Fully documented and open-sourced.
- Clean, modern WebGPU codebase.

This plan balances safety, efficiency, and web-specific requirements while maximizing the chance of a high-quality, shareable result.
