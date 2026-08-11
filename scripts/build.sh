#!/usr/bin/env bash
# Build the Component Model artifact from the Rust guest.
#
# 1. Build an analysis-only component for all browsers.
# 2. Build the self-submitting stable GPU-analysis component.
# 3. Build a JSPI-only async GPU-analysis component.
# 4. Build the isolated scheduler-owned shared-frame GPU component.
# 5. Build a full component with WASI 0.3 async proofs for JSPI-capable runtimes.
# 6. Lift each core wasm to a component: wit-bindgen already embedded the
#    component-type metadata, so `component new` needs no adapter.
#    (If metadata were ever missing, run `wasm-tools component embed wit/ …`
#    first — the documented fallback.)
# 7. Print each component's world for capability verification: analysis remains
#    free of `wasi:*`; GPU worlds import only the required `wasi:webgpu`
#    operations and must not grow DOM/CSS/React or copied-pixel data.
set -euo pipefail
cd "$(dirname "$0")/.."

for required_tool in cargo wasm-tools; do
  if ! command -v "$required_tool" >/dev/null 2>&1; then
    echo "error: required tool not found: $required_tool" >&2
    exit 1
  fi
done

COMPONENT_BUILD_DIR="${INSPECTOR_COMPONENT_BUILD_DIR:-$PWD/target/component}"
CARGO_BUILD_DIR="${CARGO_TARGET_DIR:-$PWD/target}"
CORE_WASM="$CARGO_BUILD_DIR/wasm32-unknown-unknown/release/inspector_component.wasm"

CARGO_BUILD_ARGS=(
  --locked
  --package inspector-component
  --release
  --target wasm32-unknown-unknown
  --target-dir "$CARGO_BUILD_DIR"
  --no-default-features
)

mkdir -p "$COMPONENT_BUILD_DIR"
rm -f \
  "$COMPONENT_BUILD_DIR/inspector-component.analysis.wasm" \
  "$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis.wasm" \
  "$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis-async.wasm" \
  "$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis-frame.wasm" \
  "$COMPONENT_BUILD_DIR/inspector-component.wasi-0.3.wasm"

cargo build "${CARGO_BUILD_ARGS[@]}"
wasm-tools component new \
  "$CORE_WASM" \
  -o "$COMPONENT_BUILD_DIR/inspector-component.analysis.wasm"

cargo build "${CARGO_BUILD_ARGS[@]}" --features gpu-analysis
wasm-tools component new \
  "$CORE_WASM" \
  -o "$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis.wasm"

cargo build "${CARGO_BUILD_ARGS[@]}" --features gpu-analysis-async
wasm-tools component new \
  "$CORE_WASM" \
  -o "$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis-async.wasm"

cargo build "${CARGO_BUILD_ARGS[@]}" --features gpu-analysis-frame
wasm-tools component new \
  "$CORE_WASM" \
  -o "$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis-frame.wasm"

cargo build "${CARGO_BUILD_ARGS[@]}" --features wasi-async-proofs
wasm-tools component new \
  "$CORE_WASM" \
  -o "$COMPONENT_BUILD_DIR/inspector-component.wasi-0.3.wasm"

echo "--- analysis world (browser-safe; verify: no wasi:* imports) ---"
wasm-tools component wit "$COMPONENT_BUILD_DIR/inspector-component.analysis.wasm"

echo "--- gpu-analysis world (browser-safe; verify: required wasi:webgpu operations only) ---"
wasm-tools component wit "$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis.wasm"

echo "--- gpu-analysis-async world (JSPI-only; verify: upstream async buffer readback) ---"
wasm-tools component wit "$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis-async.wasm"

echo "--- gpu-analysis-frame world (verify: no encoder finish or gpu-queue submit import) ---"
wasm-tools component wit "$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis-frame.wasm"

echo "--- wasi-0.3 proof world (JSPI-only in browsers; verify: no wasi:* imports) ---"
wasm-tools component wit "$COMPONENT_BUILD_DIR/inspector-component.wasi-0.3.wasm"
