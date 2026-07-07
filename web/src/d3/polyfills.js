// D3WEBGPU FIX (migrated from neo/sys/wasm/shell.html): TextDecoder polyfill
// for resizable/growable ArrayBuffer compatibility. Emscripten with a resizable
// (or growable SharedArrayBuffer) WASM heap can make some Chromium builds reject
// heap views in TextDecoder.decode(). This try/catch version is property-name
// agnostic: it retries with a fresh, non-resizable Uint8Array copy whenever the
// native decode throws, regardless of .resizable (ArrayBuffer) or .growable
// (SharedArrayBuffer). Belt-and-suspenders with the direct d3wasm.js patch.
// Importing this module installs the polyfill as a side effect (run once, early).
let _installed = false;
export function installTextDecoderPolyfill() {
  if (_installed) return;
  _installed = true;
  const origDecode = TextDecoder.prototype.decode;
  TextDecoder.prototype.decode = function (input, options) {
    try {
      return origDecode.call(this, input, options);
    } catch (e) {
      if (input) {
        const view =
          typeof input.length === 'number'
            ? input
            : typeof input.byteLength === 'number'
            ? new Uint8Array(input)
            : null;
        if (view) {
          const copy = new Uint8Array(view.length);
          copy.set(view);
          return origDecode.call(this, copy, options);
        }
      }
      throw e;
    }
  };
}

installTextDecoderPolyfill();