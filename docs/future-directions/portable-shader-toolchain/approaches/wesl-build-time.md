# Candidate A: WESL linked at build time

> - **Status:** Preferred next experiment; not accepted for production
> - **Last reviewed:** 2026-08-08
> - **Parent:** [Portable shader authoring and multi-target compilation](../README.md)
> - **Preserves:** [Portable shader contracts](../contracts/portability-contracts.md)
> - **Evaluated by:** [Experiments and adoption gates](../evaluation/experiments-and-adoption-gates.md)

This direction keeps WGSL-like shader source canonical while moving module
linking, validation, reflection, and contract checks into the build.

## Intended build chain

```text
Cargo build for a GPU-enabled component
    ↓
feature-aware build step or explicit shader xtask
    ↓
WESL package root
    ├── base module
    ├── frequency-separation module
    ├── refiner module
    ├── Haar module
    ├── grouping module
    └── diagnostic modules
    ↓
WESL import linking and conditional translation
    ↓
Naga parse and validation
    ↓
Naga reflection
    ├── entry-point manifest
    ├── binding/access manifest
    ├── buffer-layout checks
    └── override-constant manifest
    ↓
generated final WGSL plus contract metadata
    ↓
embed into the GPU-enabled Wasm artifact
```

The build must fail before component generation when linking, parsing,
validation, reflection, or contract comparison fails.

## Browser runtime chain after build-time linking

```text
public stable/async/frame export
    ↓
Rust selects generated shader artifact and typed entry point
    ↓
GpuShaderModuleDescriptor { code: generated WGSL }
    ↓ WIT `code: string`
browser host resource projection
    ↓
GPUDevice.createShaderModule({ code })
    ↓
GPUComputePipeline creation
    ↓
existing diagnostic and discovery dispatch recorders
```

There is no runtime import registry, import expansion, or source substitution
in this chain.

## Native call chain using the same WESL source

One possible future path is:

```text
same WESL modules
    ↓
build-time WESL linking
    ↓
Naga parse, validation, and IR
    ├── emit/retain WGSL for browser WebGPU
    └── emit the artifact accepted by the chosen native portability layer
            ↓
       native device creates shader module
            ↓
       the same entry points and resource contract execute
```

The exact native artifact must be selected only after the native runtime is
known. This document does not assume that every `wgpu` version or backend
accepts the same input forms.

## Advantages

1. Closest to the current implementation.
2. Preserves readable WGSL-like source and editor support.
3. Keeps browser WebGPU as a direct target.
4. Removes runtime module linking and source substitution.
5. Moves syntax and composition failures into the build.
6. Provides a real cross-file module system.
7. Can validate bindings, access modes, entry points, and buffer structures through Naga.
8. Can become the input to future target translation without duplicating algorithms.
9. Extends the WESL import experiment already present in the repository.
10. Allows one generated artifact to be fingerprinted and compared across releases.

## Disadvantages and risks

1. Adds a build-time compiler and its versioning policy.
2. WESL is still evolving.
3. The final browser artifact remains WGSL text.
4. Rust/WGSL contract generation still needs an explicit ownership design.
5. Generated error locations must map back to authored modules.
6. Generated artifacts need a reproducibility and review policy.
7. A normal Cargo build script may impose toolchain cost on the GPU-free build unless carefully isolated.
8. Native-only features can exceed the browser-compatible shader subset.
9. Build-time linking alone does not prove identical execution on different GPU backends.

## Lowest-risk bridge: move the current processor to build time

Before adopting WESL semantics, a smaller experiment could preserve the
current `#import` and constant-replacement behavior while moving
`ShaderProcessor::build()` into an explicit build step.

```text
current WGSL/Rust fragments
    ↓ build-time invocation of the existing processor
current import and substitution rules
    ↓
Naga validation
    ↓
generated final WGSL
    ↓
runtime static shader source
```

This would establish:

1. The build-artifact and invalidation mechanism.
2. Build-time error reporting.
3. Generated-artifact comparison.
4. GPU-feature isolation.
5. Removal of runtime processor allocation.

It would not provide a standardized module language, so it should remain a
bridge rather than a second permanent shader system.
