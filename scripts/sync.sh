#!/usr/bin/env bash
# Transpile the component into the root local npm package's generated output.
#
# sync.sh is the ONLY writer of pkg/generated/. The root package exports the
# authored component-loader, while this script refreshes jco output.
#
# The --map targets point at the package's authored host modules. They are
# plain .js files so the generated import specifiers resolve in any ESM
# bundler without extension aliasing.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPONENT_BUILD_DIR="${INSPECTOR_COMPONENT_BUILD_DIR:-$PWD/target/component}"
GENERATED_DIR="${INSPECTOR_COMPONENT_GENERATED_DIR:-$PWD/pkg/generated}"
GENERATED_DIR="$(node -p 'require("node:path").resolve(process.argv[1])' "$GENERATED_DIR")"
ANALYSIS_COMPONENT="$COMPONENT_BUILD_DIR/inspector-component.analysis.wasm"
GPU_ANALYSIS_COMPONENT="$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis.wasm"
GPU_ANALYSIS_ASYNC_COMPONENT="$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis-async.wasm"
GPU_ANALYSIS_FRAME_COMPONENT="$COMPONENT_BUILD_DIR/inspector-component.gpu-analysis-frame.wasm"
WASI_COMPONENT="$COMPONENT_BUILD_DIR/inspector-component.wasi-0.3.wasm"

if [ "$GENERATED_DIR" = "/" ] || [ "$GENERATED_DIR" = "$PWD" ]; then
  echo "error: refusing unsafe generated output directory: $GENERATED_DIR" >&2
  exit 1
fi

if [ ! -f "$PWD/package.json" ]; then
  echo "error: inspector component package root not found" >&2
  exit 1
fi

if [ ! -f "$ANALYSIS_COMPONENT" ] || [ ! -f "$GPU_ANALYSIS_COMPONENT" ] || [ ! -f "$GPU_ANALYSIS_ASYNC_COMPONENT" ] || [ ! -f "$GPU_ANALYSIS_FRAME_COMPONENT" ] || [ ! -f "$WASI_COMPONENT" ]; then
  echo "error: component artifacts missing; run npm run build first" >&2
  exit 1
fi

# Build into a staging directory first so a failed transpile can never
# leave generated/ half-written.
STAGING_ROOT="$(mktemp -d)"
trap 'rm -rf "$STAGING_ROOT"' EXIT

STAGING_GENERATED_DIR="$STAGING_ROOT/generated"
ANALYSIS_STAGING_DIR="$STAGING_GENERATED_DIR/analysis"
GPU_ANALYSIS_STAGING_DIR="$STAGING_GENERATED_DIR/gpu-analysis"
GPU_ANALYSIS_ASYNC_STAGING_DIR="$STAGING_GENERATED_DIR/gpu-analysis-async"
GPU_ANALYSIS_FRAME_STAGING_DIR="$STAGING_GENERATED_DIR/gpu-analysis-frame"
WASI_STAGING_DIR="$STAGING_GENERATED_DIR/wasi-0.3"

mkdir -p "$ANALYSIS_STAGING_DIR" "$GPU_ANALYSIS_STAGING_DIR" "$GPU_ANALYSIS_ASYNC_STAGING_DIR" "$GPU_ANALYSIS_FRAME_STAGING_DIR" "$WASI_STAGING_DIR"

npx jco transpile "$ANALYSIS_COMPONENT" \
  -o "$ANALYSIS_STAGING_DIR" \
  --name inspector-component \
  --map 'millipede:inspector/host-log@0.1.0=../../../component-loader/dist/host/log.js' \
  --map 'millipede:inspector/host-events@0.1.0=../../../component-loader/dist/host/events.js' \
  --base64-cutoff 0 \
  --no-namespaced-exports

# `millipede:inspector/host-gpu` currently contributes records and resource
# types only, so JCO emits declarations for it but no runtime host import.
npx jco transpile "$GPU_ANALYSIS_COMPONENT" \
  -o "$GPU_ANALYSIS_STAGING_DIR" \
  --name inspector-component \
  --map 'millipede:inspector/host-log@0.1.0=../../../component-loader/dist/host/log.js' \
  --map 'millipede:inspector/host-events@0.1.0=../../../component-loader/dist/host/events.js' \
  --map 'wasi:webgpu/webgpu@0.0.1=../../../component-loader/dist/host/webgpu.js' \
  --base64-cutoff 0 \
  --no-namespaced-exports

npx jco transpile "$GPU_ANALYSIS_ASYNC_COMPONENT" \
  -o "$GPU_ANALYSIS_ASYNC_STAGING_DIR" \
  --name inspector-component \
  --map 'millipede:inspector/host-log@0.1.0=../../../component-loader/dist/host/log.js' \
  --map 'millipede:inspector/host-events@0.1.0=../../../component-loader/dist/host/events.js' \
  --map 'wasi:webgpu/webgpu@0.0.1=../../../component-loader/dist/host/webgpu.js' \
  --async-mode jspi \
  --async-exports 'millipede:inspector/gpu-analysis-async@0.1.0#analyze' \
  --base64-cutoff 0 \
  --no-namespaced-exports

npx jco transpile "$GPU_ANALYSIS_FRAME_COMPONENT" \
  -o "$GPU_ANALYSIS_FRAME_STAGING_DIR" \
  --name inspector-component \
  --map 'millipede:inspector/host-log@0.1.0=../../../component-loader/dist/host/log.js' \
  --map 'millipede:inspector/host-events@0.1.0=../../../component-loader/dist/host/events.js' \
  --map 'wasi:webgpu/webgpu@0.0.1=../../../component-loader/dist/host/webgpu.js' \
  --base64-cutoff 0 \
  --no-namespaced-exports

# WASI 0.3 async exports rely on JSPI in today's jco output. `async func`
# is detected from WIT, but exported `future<T>`/`stream<T>` functions also
# need to be named here so their wasm calls are wrapped with
# WebAssembly.promising instead of the sync path.
npx jco transpile "$WASI_COMPONENT" \
  -o "$WASI_STAGING_DIR" \
  --name inspector-component \
  --map 'millipede:inspector/host-log@0.1.0=../../../component-loader/dist/host/log.js' \
  --map 'millipede:inspector/host-events@0.1.0=../../../component-loader/dist/host/events.js' \
  --async-mode jspi \
  --async-exports \
    'millipede:inspector/wasi-async-proofs@0.1.0#prove-future' \
    'millipede:inspector/wasi-async-proofs@0.1.0#prove-stream' \
  --base64-cutoff 0 \
  --no-namespaced-exports

# JCO emits per-interface declarations in `interfaces/` subdirectories, so
# replace the complete generated tree only after every world transpiles.
rm -rf "$GENERATED_DIR"
mkdir -p "$(dirname "$GENERATED_DIR")"
mv "$STAGING_GENERATED_DIR" "$GENERATED_DIR"

npm run loader:build

echo "--- synced to $GENERATED_DIR ---"
find "$GENERATED_DIR" -maxdepth 2 -type f | sort
echo "note: in the website repo, refresh pnpm's file: snapshot with:"
echo "  pnpm add -w @millipede/inspector-component@file:../../../Reverse-Engineering/Frida/Source-Code-Org/Wasm/inspector-component"
