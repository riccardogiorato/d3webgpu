// D3WEBGPU Phase 2 (MODULARIZE): this file is --pre-js'd into the DoomModule
// factory, so `Module` here is the config object the host passed to
// DoomModule(moduleConfig). We push setupD3memfs onto Module.preRun so the
// engine sets up /usr/local/share/d3wasm/base + the IDBFS-backed user home
// before main() runs.
//
// NOTE: the demo00.js data preloader is NO LONGER injected here. Under
// MODULARIZE there is no global `Module`, so a document-injected <script
// src=demo00.js> would create an orphan Module and the data would never
// attach to the engine. Instead the HOST loads demo00.js first (it does
// `var Module = typeof Module != 'undefined' ? Module : {}`, picking up the
// host's `window.Module` config and augmenting it), then calls
// DoomModule(window.Module). demo00.js pushes runWithFS onto the same
// config.preRun, so the data file loads with a run-dependency that gates main().
var Module;
if (Module['preRun'] instanceof Array) {
  Module['preRun'].push(setupD3memfs);
} else {
  Module['preRun'] = [setupD3memfs];
}

function setupD3memfs() {
  console.info("Creating d3wasm data folder (/usr/local/share/d3wasm/base)");
  FS.createPath('/', 'usr', true, true);
  FS.createPath('/usr', 'local', true, true);
  FS.createPath('/usr/local', 'share', true, true);
  FS.createPath('/usr/local/share', 'd3wasm', true, true);
  FS.createPath('/usr/local/share/d3wasm', 'base', true, true);

  console.info("Creating user home folder (/home/web_user)");
  FS.createPath('/', 'home', true, true);
  FS.createPath('/home', 'web_user', true, true);

  console.info("Mounting user home to IDBFS");
  FS.mount(IDBFS, {}, '/home/web_user');

  FS.syncfs(true, function (err) {
    if (err) {
      console.error(err);
    }
    else {
      console.info("Mounting user home completed");
      console.info("Creating user home config and local folders if necessary (~/.config, ~/.local/d3wasm/base)");
      FS.createPath('/home/web_user', '.config', true, true);
      FS.createPath('/home/web_user/.config', 'd3wasm', true, true);
      FS.createPath('/home/web_user', '.local', true, true);
      FS.createPath('/home/web_user/.local', 'd3wasm', true, true);
      FS.createPath('/home/web_user/.local/d3wasm', 'base', true, true);
      Module['removeRunDependency']("setupD3memfs");
    }
  });

  Module['addRunDependency']("setupD3memfs");
}
