# Component Loader Source Layout

Status: remaining production-loader layout deferred; WASI async boundary-proof
colocation implemented.

This note preserves the agreed source-layout cleanup for a later, dedicated
path-only refactor. It must not change runtime behavior, public package
subpaths, capability contracts, loading policy, or resource ownership.

## Target layout

```text
component-loader/src/
├── index.ts
├── caught-error.ts
│
├── capability/
│   ├── loader.ts
│   └── state.ts
│
├── platform-support/
│   ├── jspi.ts
│   └── webassembly.ts
│
├── generated-provider/
│   └── require-capability.ts
│
├── boundary-proofs/
│   └── wasi-async/
│       ├── entry.ts
│       └── generated-provider.ts
│
├── gpu-analysis/
│   ├── entry.ts
│   ├── capability.ts
│   ├── generated-provider.ts
│   └── summary-readback.ts
│
├── gpu-analysis-async/
│   ├── entry.ts
│   ├── capability.ts
│   └── generated-provider.ts
│
├── gpu-analysis-frame/
│   ├── entry.ts
│   ├── capability.ts
│   ├── generated-provider.ts
│   └── pending-summary.ts
│
├── gpu-analysis-request.ts
├── gpu-analysis-invocation-observer.ts
├── gpu-analysis-standalone-call-scope.ts
│
└── host/
    ├── gpu-output-set.ts
    ├── gpu-output.ts
    ├── gpu-types.ts
    ├── log.ts
    └── webgpu/
        ├── index.ts
        ├── async/
        │   ├── buffer.ts
        │   ├── clean-scope-sentinel.ts
        │   ├── error-scope.ts
        │   └── queue.ts
        └── sync/
            └── metadata.ts
```

## File moves

```text
capability.ts                         -> capability/loader.ts
capability-state.ts                   -> capability/state.ts
errors.ts                             -> caught-error.ts
support-jspi.ts                       -> platform-support/jspi.ts
support-webassembly.ts                -> platform-support/webassembly.ts
providers/shared.ts                   -> generated-provider/require-capability.ts

gpu-analysis.ts                       -> gpu-analysis/entry.ts
gpu-analysis-capability.ts            -> gpu-analysis/capability.ts
providers/gpu-analysis.ts             -> gpu-analysis/generated-provider.ts
host/gpu-summary-stable.ts            -> gpu-analysis/summary-readback.ts

gpu-analysis-async.ts                 -> gpu-analysis-async/entry.ts
gpu-analysis-async-capability.ts      -> gpu-analysis-async/capability.ts
providers/gpu-analysis-async.ts       -> gpu-analysis-async/generated-provider.ts

gpu-analysis-frame.ts                 -> gpu-analysis-frame/entry.ts
gpu-analysis-frame-capability.ts      -> gpu-analysis-frame/capability.ts
providers/gpu-analysis-frame.ts       -> gpu-analysis-frame/generated-provider.ts
host/gpu-summary-frame.ts             -> gpu-analysis-frame/pending-summary.ts

gpu-analysis-dispatch.ts              -> gpu-analysis-request.ts
gpu-analysis-observer.ts              -> gpu-analysis-invocation-observer.ts
gpu-analysis-runtime.ts               -> gpu-analysis-standalone-call-scope.ts
```

`createComponentGpuAnalysisDispatch` should become
`createComponentGpuAnalysisRequest`. Renaming the public authored
`AnalysisDispatch` type is a separate API decision and is not required by the
layout move.

The WASI async proof is already colocated under
`boundary-proofs/wasi-async/`; it is not part of the remaining path-only
refactor.

## Build entries

Keep the emitted entry names and package exports unchanged. Only the source
targets change:

```ts
entry: {
  index: "component-loader/src/index.ts",
  "gpu-analysis": "component-loader/src/gpu-analysis/entry.ts",
  "gpu-analysis-async": "component-loader/src/gpu-analysis-async/entry.ts",
  "gpu-analysis-frame": "component-loader/src/gpu-analysis-frame/entry.ts",
  "boundary-proofs/wasi-async":
    "component-loader/src/boundary-proofs/wasi-async/entry.ts",
  "host/log": "component-loader/src/host/log.ts",
  "host/webgpu": "component-loader/src/host/webgpu/index.ts",
}
```

The remaining production feature directories stay exactly one level below
`src` and retain the existing `../../../pkg/generated/...` import depth. The
already-nested boundary-proof provider uses its explicit four-parent source to
three-parent emitted-runtime path mapping.

## Required invariants

- Move all three GPU variants together; do not leave a mixed layout.
- Keep each generated provider isolated to its matching generated world.
- Preserve selected-only dynamic imports and one-shot loader preparation.
- Keep stable and JSPI on the standalone asynchronous call scope.
- Keep frame encoding synchronous and outside that scope because its borrowed
  encoder remains scheduler-owned.
- Keep cross-variant host output and WebGPU registry code under `host/`.
- Add no compatibility re-export files or `index.ts` barrels for moved modules.
- Do not combine this move with the deferred public type/re-export redesign.
- Update private source imports, tests, and source-path documentation together.
- Validate with loader typechecking, loader build, component-boundary tests,
  emitted entry inspection, and selected-world loading checks.
