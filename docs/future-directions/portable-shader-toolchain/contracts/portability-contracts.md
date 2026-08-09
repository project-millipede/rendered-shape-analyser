# Portable shader contracts

> - **Status:** Cross-target design constraints
> - **Last reviewed:** 2026-08-08
> - **Parent:** [Portable shader authoring and multi-target compilation](../README.md)
> - **Runtime prerequisite:** [GPU compute execution contract](../../../architecture/gpu-compute-execution-contract.md)

This document records the durable rules shared by every shader authoring and
runtime direction. Candidate-specific tooling must satisfy these contracts
rather than redefining them.

## Goals

1. Keep one canonical analyzer implementation across browser and native targets.
2. Preserve readable shader source and useful source-level diagnostics.
3. Resolve shader modules and validate contracts at build time where practical.
4. Keep Rust buffer layouts, bindings, entry points, and shader declarations synchronized.
5. Preserve browser WebGPU as a first-class target.
6. Allow native targets without forcing their runtime details into the browser adapter.
7. Make generated artifacts deterministic and attributable to pinned tool versions.
8. Preserve the current GPU-free default build and optional GPU feature boundary.
9. Avoid runtime shader-toolchain dependencies unless target requirements prove them necessary.

## Portability invariants

1. Each production algorithm has one canonical handwritten source graph.
2. Generated target artifacts and small target adapters are permitted;
   independently maintained algorithm bodies are not.
3. Browser WebGPU remains a first-class target after native targets are added.
4. The portable core uses only capabilities proven on every supported target.
5. Native-only capabilities are explicit, capability-gated, and have a
   documented browser fallback.
6. Bindings, resource kinds, access modes, layouts, entry points, strides,
   constants, and dispatch contracts are generated from or mechanically
   checked against one source of truth.
7. Generated shader artifacts are never edited manually.
8. Shader tooling must not silently add compiler cost or dependencies to the
   GPU-free default build.
9. Successful translation is not semantic evidence; common conformance inputs
   must exercise every supported target.
10. A toolchain experiment changes representation only. Algorithm changes need
    an independently reviewed implementation task.

## Non-goals

1. Selecting a native GPU API before a concrete consumer exists.
2. Treating SPIR-V as a universal runtime format.
3. Replacing readable shaders with a hand-built Naga AST.
4. Sharing arbitrary application Rust with GPU code; shader Rust is a restricted environment.
5. Introducing native-only behavior without an explicit capability profile and browser fallback.
6. Using toolchain novelty as sufficient reason for migration.
7. Maintaining equivalent algorithms in WGSL and Rust-GPU by hand.

## One canonical implementation

The central rule is:

> Multiple generated target artifacts are acceptable. Multiple handwritten
> implementations of the same analyzer algorithm are not.

Acceptable model:

```text
one canonical source
    ↓
validated intermediate representation
    ├── browser WGSL artifact
    ├── native Vulkan artifact
    └── another platform artifact
```

Unacceptable model:

```text
browser-analyzer.wgsl       native-analyzer.rs
          ↓                          ↓
independent fixes, thresholds, bindings, and numerical behavior
```

If a temporary comparison implementation is required for an experiment, it
must be disposable and guarded by common conformance vectors.

## Portable capability profiles

Browser WebGPU is currently the portability floor.

### Core portable profile

1. Runs through browser WebGPU and valid WGSL.
2. Uses resource layouts representable through the current component contract.
3. Preserves dispatch order and output semantics across targets.
4. Uses deterministic numerical rules where the shader contract requires them.
5. Has cross-target conformance tests.

### Optional native profile

1. May use explicitly detected native capabilities.
2. Must not silently change analyzer semantics.
3. Must document whether the feature is an optimization or a new capability.
4. Must define a browser-compatible fallback.
5. Must remain outside the portable core unless every supported target can express it.
