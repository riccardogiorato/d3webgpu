// D3WEBGPU FIX (migrated from neo/sys/wasm/shell.html): ESC opens the menu
// reliably (verified live in-browser).
//
// Root cause (Session.cpp ~line 2072, fix A): under __EMSCRIPTEN__ the "ESC
// brings up the menu" special-case was keyed to K_HOME, not K_ESCAPE.
// default.cfg binds ESCAPE to "togglemenu", which is NOT a registered command
// in this port, so ESC was a hard no-op in-game. Fix A makes that branch accept
// K_ESCAPE. But the Emscripten key listener only acts on DOCUMENT-targeted key
// events: a synthetic ESC dispatched to the canvas does NOT reach it, and a
// physical ESC targets the focused canvas. So we BRIDGE: catch every physical
// Escape at the document level and re-dispatch a document-targeted synthetic
// ESC (keyCode 27), which the engine accepts -> ProcessEvent -> fix A ->
// StartMenu (in-game), or the active GUI's onESC (in a menu).
//
// KEY GOTCHA: modern Chrome IGNORES keyCode/which in the KeyboardEvent() init
// dict (always 0 for synthetic events). The Emscripten glue builds the SDL key
// from e.keyCode (HEAP32[idx+6]=e.keyCode), so we override the getters on the
// event instance to return 27, exactly like a physical ESC.
//
// installEscBridge() is idempotent (guards on window.__d3esc) — call once, early.

export function _d3SynthEscKey(type) {
  const ev = new KeyboardEvent(type, {
    key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
  });
  Object.defineProperty(ev, 'keyCode', { get() { return 27; } });
  Object.defineProperty(ev, 'which', { get() { return 27; } });
  Object.defineProperty(ev, 'charCode', { get() { return 0; } });
  Object.defineProperty(ev, '_d3fwd', { get() { return true; } }); // marker: bridged, don't re-bridge
  return ev;
}

export function installEscBridge() {
  if (window.__d3esc) return;
  window.__d3esc = true;

  // Catch physical Escape (any target) at document; re-dispatch a document-
  // targeted synth ESC the engine actually processes.
  document.addEventListener('keydown', (e) => {
    if (e._d3fwd) return; // our bridged synth -> let the engine handle it, no loop
    if (e.key === 'Escape' || e.keyCode === 27) {
      document.dispatchEvent(_d3SynthEscKey('keydown'));
      setTimeout(() => document.dispatchEvent(_d3SynthEscKey('keyup')), 16);
    }
  });

  // Pointer-lock forwarder: when pointer lock IS engaged the browser swallows
  // ESC (to exit lock) and the page never sees the keydown, so the bridge can't
  // catch it. On pointerlockchange-exit re-dispatch a document-targeted synth
  // ESC so the engine still gets it. (Dispatch to DOCUMENT, not canvas — the
  // listener only acts on document-targeted events. On macOS pointer lock often
  // fails to engage, so the bridge handles ESC directly; this covers builds/
  // browsers where lock does engage.)
  let pendingEscForward = false;
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) {
      pendingEscForward = true;
      setTimeout(() => {
        if (pendingEscForward) {
          document.dispatchEvent(_d3SynthEscKey('keydown'));
          document.dispatchEvent(_d3SynthEscKey('keyup'));
          console.log('[D3WEBGPU] Forwarded ESC (keyCode=27) to document after pointer lock exit');
          pendingEscForward = false;
        }
      }, 50);
    }
  });
}