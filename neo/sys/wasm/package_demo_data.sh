#!/usr/bin/env bash
# macOS has no `python` (only python3); use the Emscripten SDK's own Python when
# available (it's the interpreter file_packager.py is meant to run under).
PYTHON="${EMSDK_PYTHON:-python3}"
"$PYTHON" "$(dirname "$(which emcc)")/tools/file_packager.py" demo00.data --preload "$1/demo00.pk4@/usr/local/share/d3wasm/base/demo00.pk4" --js-output=demo00.js --use-preload-cache
