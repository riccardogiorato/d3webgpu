#!/usr/bin/env bash
# Package the Doom 3 demo game data (demo00.pk4) into the web build.
# Usage: ./tools/add_game_data.sh /path/to/demo00.pk4
set -euo pipefail

PK4="${1:-}"
if [[ -z "$PK4" ]]; then
  echo "Usage: $0 /path/to/demo00.pk4" >&2
  exit 1
fi
if [[ ! -f "$PK4" ]]; then
  echo "Error: file not found: $PK4" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build-wasm"

# Activate the Emscripten SDK installed at ~/emsdk
if [[ -f "$HOME/emsdk/emsdk_env.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/emsdk/emsdk_env.sh"
else
  echo "Error: Emscripten SDK not found at ~/emsdk" >&2
  exit 1
fi

mkdir -p "$BUILD/data/demo"
cp "$PK4" "$BUILD/data/demo/demo00.pk4"
echo "Packaging demo00.pk4 -> demo00.data / demo00.js ..."
cmake --build "$BUILD" --target package_demo_data
echo "Done. Restart your web server and open http://localhost:3000/d3wasm.html"
