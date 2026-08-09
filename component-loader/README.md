# component-loader

Authored TypeScript loader source for `@millipede/inspector-component`.

The root `package.json` is the package manifest. `src/` contains the
handwritten TypeScript loader and host-import code; `dist/` contains the
generated JavaScript and declaration files exported by the local package.

jco generates raw Component Model JavaScript bindings, `.d.ts` files, and
`.wasm` files under `pkg/generated/`. It does not generate our browser fallback
policy, stable loader API, or host import implementations. Those handwritten
pieces live here.

Do not edit or check in `dist/` by hand. Edit `src/`, then run:

```sh
npm run loader:build
```

Authored TypeScript in `src/` must use extensionless relative imports, for
example `./host/gpu`, not `./host/gpu.js`. The `loader:build` command enforces
that policy before typechecking and then lets `tsup` emit browser-ready ESM
into `dist/`. Runtime `.js` specifiers belong to generated output, not source.
Generated component imports are centralized in `src/generated.ts`; do not use
package-private `#generated/*` aliases.
The generated adapter uses explicit facade interfaces for the loader boundary:
do not derive public types with indexed-access helpers such as
`Parameters<T["method"]>`, and do not use type assertions to coerce generated
module imports.

Why this exists:

- `src/index.ts` exposes the stable public loader API.
- `src/index.ts` always loads the browser-safe `analysis` entrypoint.
- `src/index.ts` loads the stable `gpu-analysis` entrypoint for the P1
  component backend without requiring JSPI.
- `src/index.ts` loads `gpu-analysis-async` only when JSPI exists and the web
  app explicitly selects the experimental async backend.
- `src/frame.ts` owns the isolated `gpu-analysis-frame` loader. It preloads
  asynchronously, lends the scheduler's open encoder synchronously, and
  returns a pending summary lifecycle without finishing or submitting.
- `src/index.ts` loads `wasi-0.3` only when JSPI exists in the browser.
- `src/generated.ts` is the single local adapter from handwritten loader code
  to the jco output under `pkg/generated/`; it exposes explicit facade
  interfaces instead of leaking generated resource types into the public loader.
- `src/host/log.ts` implements the guest -> host logging import.
- `src/host/events.ts` implements the guest -> host event import.
- `src/host/webgpu/` maps upstream `wasi:webgpu` device/texture/buffer
  resource handles onto real browser `GPUDevice`, `GPUTexture`, and
  `GPUBuffer` objects owned by the inspector. `index.ts` owns resource
  identity and the jco-facing classes, `sync/` contains upstream methods that
  are synchronous in browser WebGPU and WIT, and `async/` contains only
  promise-shaped WebGPU operations plus the clean-scope sentinel used by that
  path. When a folder name already says `async`, inner authored file names
  should not repeat `async`.
- `src/host/gpu-types.ts` shares the compact analyzer request/result shapes
  between the stable, async, and shared-frame GPU workflow shims.
- `src/host/gpu.ts` implements only the project-specific analyzer workflow:
  resolve handles, reject cross-device resources, call the configured website
  dispatcher, and expose the resulting diagnostic summary job for the stable
  `component-gpu` path.

The split matters because Safari and Firefox can run the browser-safe
components, but currently cannot evaluate jco's JSPI output for
`gpu-analysis-async` or the WASI 0.3 async proof surface.

The GPU split matters for a different reason: we want `wasi:webgpu` to be the
resource vocabulary, while keeping handwritten browser code limited to the
functions this analyzer actually uses. Sync upstream metadata such as
`gpu-texture.width`, `gpu-texture.height`, and `gpu-buffer.size` stays in the
shared sync helper folder because those browser/WebGPU operations are
synchronous in both the stable and async backends. Promise-shaped operations
such as `gpu-queue.on-submitted-work-done` and
`gpu-device.pop-error-scope`, plus `gpu-buffer.map-async`,
`gpu-buffer.get-mapped-range-get-with-copy`, and `gpu-buffer.unmap`, stay in
the async helper folder because they are only exercised by the Chrome/JSPI
  component path. The P1 host workflow now
lets Rust create the analyzer shader module, bind-group layouts, pipeline
layouts, compute pipelines, buffers, bind groups, command encoder/pass, and
queue submission through upstream-shaped `wasi:webgpu` calls. The stable path
still maps the compact diagnostic summary in the website executor, but the
Chrome/JSPI async path now maps the staging buffer and decodes that compact
summary in Rust through upstream `gpu-buffer` calls. That readback is allowed
only for tiny one-way conclusion values: parity, diagnostics, and evaluation.
The reference-guided visual/border diagnostic output and pixel-derived
discovery output must stay GPU-resident in website-owned buffers/textures or
future component output handles, not be reconstructed from CPU table data.
The async workflow verifies more upstream async WebGPU ownership while the
stable default remains unchanged.

The shared-frame workflow has a different ownership rule. The browser
scheduler creates the native encoder, and `src/frame.ts` registers a temporary
WIT projection around that exact object. Rust appends one compute pass
containing the three reference-guided diagnostic dispatches and seven
pixel-derived discovery dispatches, followed by the compact summary copy.

Borrowing restricts the encoder's lifetime; it does not by itself remove
state-changing methods from the generated Rust bindings. The ownership
contract therefore requires frame Rust to leave the encoder open and
unsubmitted. Because the valid frame path never calls `finish()` or obtains
the queue, the current compiled artifact requires neither encoder `finish` nor
`gpu-queue`. The host ownership guard and component-boundary integration test
protect that invariant.
After the component returns, the scheduler appends rendering and performs the
only finish/submit pair. Abort cleanup destroys the unsubmitted summary
resources; successful submission transfers summary buffers to the normal
device-local decoder.
When a folder name already says `async`, inner authored file names should not
repeat `async`; use names like `queue.ts`, `error-scope.ts`, or `webgpu.rs`.
