# inspector-component

The Rust guest of the `millipede:inspector` Component Model boundary. C0
proved GPU-free, bidirectional host↔guest communication with the
millipede-docs website; P1 adds a separate GPU-analysis world that drives the
existing WebGPU analyzer path through upstream `wasi:webgpu` resource handles
plus a project-owned analyzer workflow import. The plan and decision history
live in the website repo under
`packages/surface/inspector-browser/docs/`: `todo/09-component-boundary-iteration-one.md`
(C0 plan), `architecture/13-component-gpu-p1.md` (P1 implementation), and
`todo/06-decision-log.md` (D23).

**`wit/` is the source of truth for the boundary.** Start with
`wit/world.wit`, then follow the split interface files. Every interface,
record, field, and function is doc-commented there. This crate implements it;
the website package `packages/surface/inspector-wasm-host` hosts it.

## Layout

| Path                                | Role                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `wit/`                              | the boundary contract: package, world, and split interfaces                                                               |
| `wit/deps/`                         | WIT package dependencies fetched by `wkg`; do not edit                                                                    |
| `wkg/`                              | isolated `wkg` config, lockfile, and temporary local `wasi:webgpu` override                                               |
| `xtask/`                            | Rust task runner for WIT dependency fetch/check policy                                                                    |
| `src/lib.rs`                        | tiny crate entrypoint and component export wiring                                                                         |
| `src/wit/`                          | raw `wit-bindgen` output; domain modules should use local binding views                                                   |
| `src/shared/`                       | shared component type and runtime helpers                                                                                 |
| `src/analysis/`                     | product-facing analysis interface and aggregate math                                                                      |
| `src/edge_discovery/`               | pixel-derived edge-discovery planning, buffers, pipelines, command encoding, and separated Rust-owned WGSL fragments      |
| `src/gpu_analysis/`                 | P1 GPU-analysis export: validates metadata, builds the Rust-owned analysis plan, and forwards host-owned resource handles |
| `src/gpu_analysis_async/`           | Chrome/JSPI-only P1 async experiment: same plan and handles, direct async result                                          |
| `src/gpu_analysis_frame/`           | isolated shared-frame experiment: appends analyzer work to a scheduler-owned borrowed encoder                             |
| `src/gpu_shared/`                   | sync-only GPU-analysis validation, planning, and command encoding shared by all GPU worlds                                |
| `src/wasi/`                         | isolated WASI 0.3 async proof interfaces behind `wasi-async-proofs`                                                       |
| `component-loader/src/`             | authored TypeScript loader, host imports, and the P1 GPU handle shim                                                      |
| `component-loader/src/host/webgpu/` | upstream `wasi:webgpu` browser resource shim split into shared sync metadata and async JSPI helpers                       |
| `component-loader/src/generated.ts` | local adapter from authored loader code to jco output under `pkg/generated/`                                              |
| `component-loader/dist/`            | generated JS/types exported by the root npm package; do not edit or check in                                              |
| `pkg/generated/`                    | generated jco output consumed by the loader; do not edit or check in                                                      |
| `tests/component-boundary/`         | priority-ordered Vitest unit and generated-component integration tests with a typed Node test host                        |
| `target/component/`                 | disposable component `.wasm` build output consumed by jco                                                                 |
| `target/component-tests/`           | disposable typed-host build and jco output used only by the Vitest component-boundary suite                               |
| `scripts/build.sh`                  | cargo → `wasm-tools component new` → `target/component/` → world verification                                             |
| `scripts/check-ts-imports.mjs`      | guard for extensionless authored TypeScript imports in `component-loader/src/`                                            |
| `scripts/sync.sh`                   | website transpile → writes `pkg/generated/`                                                                               |

## Commands

```sh
npm run build   # compile Rust and lift all worlds into Wasm Components
npm run wit:fetch   # xtask: refresh wit/deps/ through wkg/
npm run wit:check   # xtask: assert committed WIT deps match wkg output
npm run loader:build   # compile component-loader/src TypeScript to component-loader/dist
npm run test:typecheck   # strict-check the typed component-boundary test host and specs
npm run test:unit   # run typed test-host unit tests without loading a component
npm run test:integration   # transpile and test all five real generated component worlds
npm run test:all   # run the unit and integration categories together
npm test   # typecheck, then run both component-boundary test categories
npm run sync    # transpile against the package host modules and write pkg/generated/
cargo test      # stats math + committed wasi:webgpu async WIT guard
cargo doc --no-deps   # rustdoc — must stay warning-free (#![warn(missing_docs)])
```

The release flow is `build → test → sync`, then refresh the website's local
pnpm `file:` dependency. `sync.sh` is the only writer of `pkg/generated/`.
The root `package.json` is both the tooling manifest and the local package
consumed by the website; the website depends on this repo root, not `pkg/`.
The short rule: `target/*` is scratch, while `component-loader/dist/` and
`pkg/generated/` are generated package payload and are recreated locally.

Authored loader TypeScript uses extensionless relative imports. The build
enforces this with `npm run loader:check-imports`; `tsup` is responsible for
emitting runtime JavaScript module specifiers in `component-loader/dist/`.
Generated component imports go through `component-loader/src/generated.ts`;
do not introduce package-private `#generated/*` aliases.
The adapter exposes explicit facade interfaces; avoid indexed-access type
helpers and type assertions at this boundary.

## Pinned toolchain (recorded 2026-08-08)

| Tool                    | Version                     | Note                                                                            |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| Rust                    | stable 1.96.0               | pinned via `rust-toolchain.toml` (machine default stays nightly)                |
| `wit-bindgen`           | 0.60.0                      | guest bindings; `generate!` in `src/wit/generated.rs`                           |
| `wasm-tools`            | 1.251.0                     | componentization + world verification                                           |
| `wkg`                   | 0.15.1                      | WIT dependency fetch/check; config isolated in `wkg/`                           |
| `@bytecodealliance/jco` | ^1.27.0                     | Resolves to 1.27.0; generated files are used as emitted                         |
| `@webgpu/types`         | ^0.1.71                     | TypeScript host shim types for browser WebGPU objects                           |
| Node                    | 24.15.0                     | typed component-boundary unit and integration runtime                           |
| WIT package             | `millipede:inspector@0.1.0` | import specifiers are versioned — `--map` keys carry `@0.1.0`                   |
| WIT dependency          | `wasi:webgpu@0.0.1`         | fetched with `wkg`; temporary local override until the public registry resolves |

### JCO usage: transpile, not componentize

This repository uses JCO only to transpile existing WebAssembly Components
into browser-consumable JavaScript modules. It does not use JCO to create
those components.

The complete build direction is:

```text
Rust + WIT
  → cargo build
  → core WebAssembly module
  → wasm-tools component new
  → WebAssembly Component
  → jco transpile
  → JavaScript bindings + declarations + core Wasm files
```

#### What this repository currently does

`scripts/build.sh` compiles the Rust guest into core Wasm modules and then
uses `wasm-tools component new` to lift each module into a component:

```sh
wasm-tools component new \
  target/wasm32-unknown-unknown/release/inspector_component.wasm \
  -o target/component/inspector-component.analysis.wasm
```

This uses the Component Model metadata embedded by `wit-bindgen`. The output
is already a WebAssembly Component before JCO is invoked.

`scripts/sync.sh` uses `jco transpile` to turn those existing components into
the generated browser package:

```sh
jco transpile \
  target/component/inspector-component.analysis.wasm \
  -o pkg/generated/analysis \
  --name inspector-component \
  --map \
    'millipede:inspector/host-log@0.1.0=../../../component-loader/dist/host/log.js' \
  --base64-cutoff 0 \
  --no-namespaced-exports
```

JCO produces:

- JavaScript bindings that instantiate and call the component
- TypeScript declarations generated from the component's WIT interfaces
- separate core `.wasm` modules loaded by the generated JavaScript

The `--map` arguments connect component imports to the handwritten browser
host modules under `component-loader/dist/host/`. The asynchronous component
worlds additionally use `--async-mode jspi` and explicit `--async-exports`
names.

`tests/component-boundary/` is the canonical priority-ordered TypeScript/Vitest
boundary suite. Its integration category transpiles the same five component
artifacts into `target/component-tests/` and links them to one typed, resettable
Node host. Its unit category verifies host lifecycle behavior without loading a
component.

#### What `jco componentize` means

`jco componentize` operates in the opposite direction. It takes a
JavaScript or TypeScript implementation plus a WIT world and creates a
WebAssembly Component:

```text
JavaScript/TypeScript + WIT
  → jco componentize
  → WebAssembly Component
```

For example:

```sh
jco componentize analyzer.js \
  --wit analyzer.wit \
  -o analyzer.wasm
```

This is useful for JavaScript-authored portable or sandboxed components that
need to implement a WIT contract outside a normal JavaScript host.

It is not part of this repository's current build. The inspector guest is
authored in Rust, while the TypeScript loader, browser integration, and
WebGPU implementation should remain host-side JavaScript.

Componentization could become relevant later for separately packaged
JavaScript inspector plugins, but it is not required by the core library.

#### `jco` versus `jco-transpile`

The `jco transpile` command delegates its transpilation work to the focused
`@bytecodealliance/jco-transpile` package.

The full `@bytecodealliance/jco` package is currently installed because the
sync script and component-boundary test preparation use its convenient `jco`
command-line interface.

The 2026-08-08 generated-artifact baseline resolves that direct JCO range to
JCO 1.27.0 and, transitively through `pnpm-lock.yaml`, to
`@bytecodealliance/jco-transpile` 0.6.3. That transpiler release embeds
`js-component-bindgen` 2.2.2. The transitive packages are recorded provenance,
not direct project dependencies.

Keep `@bytecodealliance/jco-transpile` transitive while the repository invokes
the JCO CLI. Do not add it as a direct dependency merely to pin its embedded
bindgen: the lockfile records the exact resolved generation toolchain. Invoking
the focused transpilation API directly would be a separate build-architecture
change and would require its own artifact-parity review.

Upstream documentation:

- [JCO overview](https://github.com/bytecodealliance/jco)
- [JCO componentization example](https://bytecodealliance.github.io/jco/example.html)

## Design notes (the short version)

- **Target `wasm32-unknown-unknown`** — zero WASI imports, so the browser
  needs no shim; panics are routed to the host via the `host-log` import
  (there is no WASI stderr).
- **Package boundary** — the root npm package exports the compiled
  `component-loader/dist/` API, and jco's direct-ESM mode + `--map` wires the
  component's imports onto `component-loader/dist/host/*.js`; `--base64-cutoff 0`
  keeps the core modules as separate `inspector-component.core*.wasm` files in
  `pkg/generated/`. `target/component/` is only the intermediate component
  build input for jco. The website consumes this repo through pnpm instead of
  owning copied generated files.
- **Generated browser entrypoints are intentionally split** — `analysis` is
  transpiled from an analysis-only world and has no JSPI dependency, so it
  works in Safari, Firefox, Chrome, and Edge. `gpu-analysis` is the stable P1
  browser-safe WebGPU handle world; it returns an explicit diagnostic
  staging-buffer readback descriptor plus GPU-resident reference-guided
  diagnostic rectangle and border handles, and lets JS perform the current
  diagnostic contract's browser `mapAsync`
  outside the component. Production discovery should not require that readback.
  `gpu-analysis-async` is a Chrome/JSPI-only diagnostic compatibility
  experiment; it awaits the host dispatch and returns the compact diagnostic
  summary plus the same GPU-resident diagnostic handles directly.
  `gpu-analysis-frame` is a separate browser-safe experiment: its generated
  Rust bindings can express `finish()` and queue access, so borrowing alone is
  not the ownership guarantee. The current compiled frame artifact omits those
  imports because this path never calls them; the host ownership guard and
  component-boundary integration proof enforce that this remains true. Rust
  appends analyzer commands
  to a scheduler-owned borrowed encoder, the browser appends its render pass,
  and the scheduler makes the only finish/submit pair.
  `wasi-0.3` is a separate learning harness for WASI 0.3 async behavior and
  is also loaded only when `WebAssembly.Suspending` and
  `WebAssembly.promising` exist.
- **WIT is split by ownership** — `analysis.wit` is the real app contract,
  `host-*.wit` are guest → host callbacks, and `wasi-async-proofs.wit` is a
  separate learning harness for WASI 0.3 async behavior.
- **WIT package dependencies are managed by `wkg/` plus `xtask`** —
  `wit/deps/` is generated from `wkg/wkg.toml` and checked by
  `npm run wit:check`. `xtask` runs `wkg` from the isolated `wkg/` folder and
  verifies the required async `wasi:webgpu` signatures in Rust, not shell. The
  local `wasi:webgpu` override exists only because `wasi:webgpu@0.0.1` is not
  currently reachable through the default registry from this machine.
- **GPU analysis requires compute execution** — every supported GPU backend
  must expose compute shaders, compute pipelines, and workgroup dispatch.
  Rendering-only backends such as WebGL2 and OpenGL ES 3.0 are outside that
  support floor. The complete platform-independent rule is recorded in the
  [GPU compute execution contract](docs/architecture/gpu-compute-execution-contract.md).
- **Shader source is separated plain WGSL** — edge-discovery WGSL lives as
  Rust-owned fragments next to each analyzer concern:
  `frequency_separation/shaders.rs`, `refiner/shaders.rs`,
  `wavelet/haar/shaders.rs`, and `grouping/shaders.rs`. The root
  `src/edge_discovery/shaders.rs` only assembles those fragments for
  `GPUDevice.createShaderModule`. WGSL is the browser/runtime contract; no
  shader authoring/linking layer sits between Rust and browser WGSL.
- **WASI async proofs are isolated** — `wasi-async-proofs` exists only to
  learn and verify `async func`, `future<T>`, and `stream<T>` through jco.
  The transpile scripts use JSPI plus explicit async-export names for the
  `future<T>` and `stream<T>` proof functions because jco's default sync
  export wrapper cannot drive those writer tasks. Do not put product inspector
  behavior there.
- **`%flags`** in the WIT escapes the `flags` keyword; the field is plain
  `flags` in every generated binding.
- **The shared fixture rule:** `src/analysis/stats.rs::tests::fixture`,
  `tests/component-boundary/fixtures/analysis-tree.ts`, and the website's
  `self-test.ts` use the identical 6-node fixture with
  hand-computed expectations (6 nodes, max depth 3, 2 ghosts, total area
  10550, coverage 0.425). Change one, change all three.
- **GPU handles, not GPU ownership** — P1 uses upstream
  `wasi:webgpu/webgpu@0.0.1` resource names for `gpu-device`, `gpu-texture`,
  `gpu-buffer`, `gpu-shader-module`, `gpu-bind-group-layout`,
  `gpu-pipeline-layout`, `gpu-compute-pipeline`, `gpu-bind-group`,
  `gpu-command-encoder`, `gpu-compute-pass-encoder`, `gpu-command-buffer`,
  and `gpu-queue`, then adds only the project-specific analyzer dispatch,
  diagnostic-readback record, visual-output record, and workflow records in
  `host-gpu.wit`.
  Rust already calls the upstream `gpu-texture.width()`,
  `gpu-texture.height()`, and `gpu-buffer.size()` methods to validate the
  request against the actual registered browser texture and ground-truth
  buffer capacity before it builds the `analysis-plan`: selected kernel, WGSL
  workgroup size, dispatch dimensions, and compact diagnostic summary layout.
  It then creates upstream shader-module, bind-group-layout, pipeline-layout,
  compute-pipeline, compact diagnostic-summary buffer, GPU-resident output
  buffers, and bind-group resources through upstream `gpu-device` calls, then
  encodes commands through upstream command encoder/compute-pass methods. The
  stable and async worlds submit through
  `gpu-device.queue().submit(...)`; the frame world deliberately leaves its
  scheduler-owned encoder open. The stable world returns the compact diagnostic
  staging-buffer descriptor to the JS loader for readback.
  The website host maps those upstream operations onto the browser's existing
  shared `GPUDevice`; P0 is only the oracle/compare backend.
  Those handles are backed by the website's browser objects; Rust never
  creates another device, never receives pixel arrays, and never sees
  DOM/CSS/React data.
- **Shared-frame ownership is protected in layers** —
  `gpu-analysis-frame.wit` imports a borrowed `gpu-command-encoder`, which
  prevents retention beyond the call but does not itself remove state-changing
  methods from the Rust bindings. Because valid frame code never calls
  `finish()` or obtains `gpu-device.queue()`, the current compiled component's
  required import surface contains neither encoder finish nor `gpu-queue`.
  The host additionally rejects `finish()` for a scheduler-borrowed encoder,
  and the component-boundary integration suite proves that the component
  performs no finish/submit.
  `component-loader/src/frame.ts` registers the browser scheduler's native
  encoder only for the synchronous component call, then removes that WIT
  projection without touching the native object. GPU output buffers are
  returned immediately for the render pass; compact summary mapping begins
  only after the browser reports successful submission. Stable `gpu-analysis`
  and JSPI `gpu-analysis-async` keep their existing component-owned submission
  paths.
- **Readback is summary-only and one-way** — the current compact summary
  readback exists for conclusion values, parity, and debugging. It must not be
  used to feed later GPU work or reconstruct production discovery overlays.
  Analysis output must remain GPU-resident handles/buffers/textures.
- **Sync and async WebGPU surfaces stay separated** — shared metadata calls
  (`gpu-texture.width()`, `gpu-texture.height()`, `gpu-buffer.size()`) are
  synchronous in browser WebGPU and upstream WIT, so they live in
  `src/gpu_shared/` on the Rust side and `component-loader/src/host/webgpu/sync/`
  on the TypeScript side. Promise-shaped operations
  (`gpu-queue.on-submitted-work-done()`, `gpu-device.pop-error-scope()`) are
  Chrome/JSPI-only for now, so they live in `src/gpu_analysis_async/` and
  `component-loader/src/host/webgpu/async/`. Do not add async wrappers for
  sync metadata just because a caller is the async backend. Also avoid
  repeating `async` in file names inside async-named folders; the folder
  already carries that context.
- **Async GPU analysis is experimental and gated** — `gpu-analysis-async`
  exists to exercise the Chrome/JSPI diagnostic compatibility path without
  replacing `gpu-analysis`. The website must probe JSPI support before loading it, and
  Safari/Firefox stay on `webgpu-baseline` or the stable `component-gpu` path.
  This async world uses upstream `wasi:webgpu` async operations for
  `gpu-queue.on-submitted-work-done` and `gpu-device.pop-error-scope`, with a
  preceding sync `gpu-device.push-error-scope`. The loader returns an
  empty-message `gpu-error` sentinel for a clean validation scope while this
  async resource-result shape stays under observation; Rust treats empty as
  success and any non-empty message as a validation failure.
