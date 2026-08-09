# Portable shader authoring and multi-target compilation

> - **Status:** Future-direction investigation
> - **Last reviewed:** 2026-08-08
> - **Decision state:** No production migration accepted
> - **Review owner:** Shader-toolchain and GPU-runtime maintainers
> - **Current preference:** WESL linking and shader validation at build time
> - **Deferred research direction:** Rust-GPU and SPIR-V for native targets
> - **Revisit when:** The first concrete non-browser target is selected, the
>   shader input contract changes, or a candidate toolchain has a relevant
>   major release

This document compares shader-authoring and compilation directions for the
Rendered Shape Analyser. It records why build-time WESL is the best fit for the
current browser implementation, how Rust-GPU and SPIR-V might become relevant
when native targets are concrete, and which boundaries must remain portable.

> **Runtime prerequisite:** Every direction evaluated here must preserve the
> repository's [GPU compute execution contract](../../architecture/gpu-compute-execution-contract.md).
> Toolchain changes cannot broaden support to non-compute backends or silently
> substitute render-pass or CPU execution.

It does not authorize:

1. A production shader rewrite.
2. A Rust-GPU dependency or nightly compiler requirement.
3. A new public WIT surface.
4. A native GPU backend.
5. Parallel handwritten browser and native analyzer kernels.
6. Performance or portability claims without target-specific evidence.
7. Algorithm, binding, layout, entry-point, dispatch-order, workgroup-size, or
   result-contract changes hidden inside a toolchain experiment.
8. A promise of bit-identical floating-point behavior across GPU vendors and
   backend compilers without explicit evidence.

## Executive summary

1. Move shader linking, validation, and contract checking out of workload
   preparation and into a build-time step.
2. Prefer WESL plus Naga for the first experiment because it preserves the
   existing WGSL algorithms and browser WebGPU contract.
3. Test the same generated WGSL through native `wgpu` before changing the
   canonical authoring language.
4. Keep Rust-GPU and SPIR-V as a research path for a concrete native requirement
   that the WESL/WGSL direction cannot satisfy cleanly.
5. Permit multiple generated target artifacts, but never multiple handwritten
   production implementations of the same analyzer kernel.
6. Preserve the final WGSL-string boundary for browser WebGPU while allowing a
   future native adapter to select a different prepared artifact.

## Why this direction needs an explicit record

Browser WebGPU is the current runtime, but it is not expected to be the only
runtime forever. Likely future environments include native `wgpu`, direct
Vulkan, headless GPU workers, and platform-specific Metal or Direct3D paths.

The shader toolchain therefore has to answer two different questions:

1. How should shader source be authored, divided into modules, validated, and
   kept synchronized with Rust-owned contracts?
2. How should one canonical shader implementation become the artifact required
   by each runtime target?

WESL, Naga, Rust-GPU, SPIR-V, and WebGPU live at different layers. Treating
them as interchangeable alternatives hides the real decisions.

## Document map

| Document | Question answered | Decision state |
| --- | --- | --- |
| [Current implementation baseline](current-implementation-baseline.md) | What does the existing browser path do, and what must a representation-only experiment preserve? | Descriptive evidence |
| [Portable shader contracts](contracts/portability-contracts.md) | Which source-of-truth, portability, semantic, and capability rules apply to every direction? | Required constraints |
| [Target artifacts and runtime boundaries](contracts/target-artifacts-and-runtime-boundaries.md) | Which artifact does each runtime consume, and where is translation unavoidable? | Required constraints |
| [WESL linked at build time](approaches/wesl-build-time.md) | How would the preferred incremental direction work, and what are its risks? | Preferred next experiment |
| [Rust-GPU and SPIR-V](approaches/rust-gpu-and-spir-v.md) | How would Rust shader authoring reach native and browser targets, and what are its risks? | Deferred research |
| [Shader contract ownership](contracts/shader-contract-ownership.md) | How could Rust and shader artifacts share constants, bindings, and entry-point facts? | Unresolved cross-cutting design |
| [Experiments and adoption gates](evaluation/experiments-and-adoption-gates.md) | What must be tested, measured, and proven before either direction advances? | Evidence sequence |

Recommended reading order:

```text
current implementation baseline
    ↓
portable contracts + target/runtime boundaries
    ↓
WESL direction or Rust-GPU/SPIR-V direction
    ↓
shared shader-contract ownership
    ↓
experiments and adoption gates
```

## These candidates are not direct equivalents

| Concern | WESL build-time direction | Rust-GPU/SPIR-V direction |
| --- | --- | --- |
| Canonical authoring language | WGSL-like WESL | Restricted Rust |
| Immediate browser fit | High | Low; requires translation |
| Migration from current shaders | Incremental | Rewrite |
| Native Vulkan fit | Through translation or portability layer | Direct SPIR-V direction |
| Module system | WESL imports/packages | Rust crate/module model within shader restrictions |
| Compile-time validation | WESL plus Naga | Rust-GPU plus SPIR-V/Naga validation |
| Runtime string-free browser | Impossible | Impossible |
| Current repository evidence | Tiny dormant import experiment | None |
| Current recommendation | Preferred next experiment | Deferred research |

## Current direction

1. Prefer WESL linking and Naga validation at build time as the next shader-source experiment.
2. Preserve browser WGSL and the current Rust-owned workload contract.
3. Try the same generated WGSL through a native portability layer before changing authoring languages.
4. Treat Rust-GPU and SPIR-V as a future native-target investigation, not an approved rewrite.
5. Introduce Rust-GPU only if concrete native requirements are not met cleanly by the WESL/WGSL and Naga direction.
6. Never maintain independent handwritten browser and native analyzer kernels.
7. Revisit the choice when the first non-browser target and its capability requirements are concrete.

## References

- [WebGPU shader-module contract](https://www.w3.org/TR/webgpu/#dictdef-gpushadermoduledescriptor)
- [WGSL specification](https://www.w3.org/TR/WGSL/)
- [WGSL override declarations](https://www.w3.org/TR/WGSL/#override-decls)
- [WESL Rust build-time workflow](https://wesl-lang.dev/docs/Getting-Started-Rust)
- [WESL specification and design](https://github.com/wgsl-tooling-wg/wesl-spec)
- [Naga](https://github.com/gfx-rs/wgpu/tree/trunk/naga)
- [Rust-GPU](https://github.com/Rust-GPU/rust-gpu)
- [Rust procedural macros](https://doc.rust-lang.org/reference/procedural-macros.html)
