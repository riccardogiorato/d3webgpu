// D3WEBGPU Phase 2 — the React host. React OWNS the page: it creates the
// fullscreen <canvas>, boots the MODULARIZE Emscripten engine into it (see
// d3/loadEngine.js), and renders the overlay control bar wired to the engine's
// _d3_* exports (d3/controls.js). The engine renders WebGL into the canvas; it
// does not know React exists.
import { useEffect, useRef, useState } from 'react';
import { bootDoom } from './d3/loadEngine.js';
import { installEscBridge } from './d3/escBridge.js';
import { CONTROLS, callExport } from './d3/controls.js';
import './styles.css';

export default function App() {
  const canvasRef = useRef(null);
  const moduleRef = useRef(null); // the booted engine instance (=== window.Module)
  const [status, setStatus] = useState('Booting…');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // ESC bridge is document-level and engine-independent; install before boot.
    installEscBridge();

    const canvas = canvasRef.current;
    let cancelled = false;

    bootDoom(canvas, { setStatus })
      .then((M) => {
        if (cancelled) return;
        moduleRef.current = M;
        setReady(true);
        setStatus('');
        console.log(
          '[d3host] ready; _d3_open_menu=' + typeof M._d3_open_menu +
          ' _d3_load_demo_map=' + typeof M._d3_load_demo_map +
          ' _d3_screenshot=' + typeof M._d3_screenshot
        );
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('[d3host] boot failed', e);
        setStatus('Boot failed: ' + (e && e.message ? e.message : e));
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {/* the canvas React creates and owns; the Emscripten engine renders into it */}
      <canvas
        id="canvas"
        ref={canvasRef}
        onContextMenu={(e) => e.preventDefault()}
        tabIndex={-1}
      />

      {status ? <div id="d3-status">{status}</div> : null}

      {/* overlay controls: pointer-events:none on the bar so mouse input reaches
          the canvas; only the buttons themselves capture clicks (see styles.css) */}
      <div id="d3-controls">
        {CONTROLS.map((c) => (
          <button
            key={c.id}
            id={'d3b-' + c.id}
            className="d3-btn"
            onClick={() => callExport(moduleRef, c.fn)}
            disabled={!ready}
          >
            {c.label}
            {c.hint ? <small>{c.hint}</small> : null}
          </button>
        ))}
      </div>
    </>
  );
}