#!/usr/bin/env bash
# Build the d3wasm WebAssembly binary using Emscripten.
# Usage: bash scripts/build.sh [target]
set -euo pipefail

TARGET="${1:-d3wasm}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$REPO_ROOT/build-wasm"

# Source Emscripten SDK
if [ -f "$HOME/emsdk/emsdk_env.sh" ]; then
  source "$HOME/emsdk/emsdk_env.sh"
else
  echo "ERROR: Emscripten SDK not found at ~/emsdk. Install it first:"
  echo "  git clone https://github.com/emscripten-core/emsdk.git ~/emsdk"
  echo "  cd ~/emsdk && ./emsdk install latest-upstream && ./emsdk activate latest-upstream"
  exit 1
fi

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Configure (only if not already configured)
if [ ! -f "Makefile" ]; then
  echo "==> Configuring CMake (first run)..."
  emcmake cmake "$REPO_ROOT/neo"
fi

echo "==> Building $TARGET..."
emmake make "$TARGET" -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 8)"

echo ""
echo "✅ Engine build complete! Output in $BUILD_DIR/ (d3wasm.js + d3wasm.wasm)"
echo "   Phase 2 host: \`npm run build\` also builds the React UI into $BUILD_DIR/."
echo "   Dev loop:    \`npm run dev:all\`  ->  http://localhost:3001/  (React + engine, one origin)"
