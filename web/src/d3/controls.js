// D3WEBGPU Phase 2 — overlay control buttons -> verified no-arg KEEPALIVE exports
// (Session.cpp): _d3_open_menu (ESC), _d3_save_quick (F5), _d3_load_quick (F9),
// _d3_screenshot (F12), _d3_load_demo_map (Play Demo). These are called
// directly as Module._d3_*() — no ccall/marshalling (ccall isn't exported and
// reading Module.ccall triggers an aborting getter in this build).

// Each button: { id, label, hint, fn } — `fn` is the export name called on the
// booted Module instance.
export const CONTROLS = [
  { id: 'menu', label: 'Menu', hint: 'ESC', fn: '_d3_open_menu' },
  { id: 'save', label: 'Save', hint: 'F5', fn: '_d3_save_quick' },
  { id: 'load', label: 'Load', hint: 'F9', fn: '_d3_load_quick' },
  { id: 'shot', label: 'Screenshot', hint: 'F12', fn: '_d3_screenshot' },
  { id: 'play', label: 'Play Demo', hint: '', fn: '_d3_load_demo_map' },
];

// Invoke an export on the engine instance. Safe before boot / if missing.
export function callExport(moduleRef, fnName) {
  const M = moduleRef.current;
  if (M && typeof M[fnName] === 'function') {
    try {
      M[fnName]();
    } catch (e) {
      console.error('[d3controls] ' + fnName + ' threw', e);
    }
  } else {
    console.warn('[d3controls] Module.' + fnName + ' not available (engine not ready?)');
  }
}