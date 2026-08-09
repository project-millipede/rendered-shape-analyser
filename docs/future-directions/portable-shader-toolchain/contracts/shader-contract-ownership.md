# Shader contract ownership

> - **Status:** Cross-cutting future design
> - **Last reviewed:** 2026-08-08
> - **Parent:** [Portable shader authoring and multi-target compilation](../README.md)
> - **Candidate directions:** [WESL at build time](../approaches/wesl-build-time.md) and [Rust-GPU with SPIR-V](../approaches/rust-gpu-and-spir-v.md)

This document records how Rust and generated shader artifacts might share
constants, bindings, entry points, and layout facts without introducing a
second shader language or duplicating the contract by hand.

## Rust-owned constants and pipeline overrides

The current discovery preprocessor replaces declarations such as:

```wgsl
const HAAR_LEVEL1_BLOCK_TILES: u32 = 0u;
const HAAR_MAX_SUPPORT: u32 = 0u;
```

with values owned by Rust layout modules. A more WebGPU-native option for
genuinely tunable algorithm values is:

```wgsl
override HAAR_LEVEL1_BLOCK_TILES: u32;
override HAAR_MAX_SUPPORT: u32;
```

### Potential override call chain

```text
Rust layout/plan constant
    ↓
typed pipeline-constant record for one entry point
    ↓ GpuProgrammableStage.constants
Component Model / WIT
    ↓
browser host translates the record
    ↓
GPUComputePipelineDescriptor.compute.constants
    ↓
WebGPU specializes and validates the pipeline
```

The WIT contract already models pipeline constants, but the current browser
host deliberately rejects them. Supporting this path would require:

1. A real host implementation of the pipeline-constant record.
2. Translation into the browser `constants` dictionary.
3. Fake-host and component-boundary coverage.
4. Resource-lifecycle rules for the WIT record.
5. A per-entry-point policy because the seven discovery pipelines use different subsets.

Pipeline overrides are complementary to WESL; they do not provide a module
system. They should be considered only for tunable values.

Structural values should remain build-time contracts, including:

1. Binding indices.
2. Resource kinds and access modes.
3. Buffer record strides.
4. Bit masks and packed record layouts.
5. Entry-point identities.
6. Workgroup layouts when changing them would alter dispatch planning.

## Declarative shader contract generation

A small neutral schema or macro could define cross-language facts once:

```rust
shader_contract! {
    binding CAPTURED_TEXTURE = 0;
    binding FREQUENCY_STATE = 11;

    constant EDGE_TILE_SIZE: u32 = 8;
    constant HAAR_LEVEL1_BLOCK_TILES: u32 = 2;
    constant HAAR_MAX_SUPPORT: u32 = 64;

    entry EDGE_FEATURE = "edge_feature";
    entry HAAR_LEVEL1 = "haar_low_high_frequency_level1";
}
```

The schema could generate or verify:

1. Rust constants and typed entry-point identifiers.
2. WGSL/WESL declarations.
3. Rust bind-group layout entries.
4. Binding access and resource-kind expectations.
5. Buffer-stride assertions.
6. Per-entry-point pipeline-override maps.

A procedural macro cannot evaluate arbitrary existing Rust constant paths
before Rust type checking and const evaluation. Therefore the durable source
of truth must be one of:

1. Literals inside the contract schema.
2. A neutral data file consumed by Rust and shader generation.
3. A small shader-contract crate consumed by the main crate and build tooling.
4. Pipeline overrides supplied at pipeline creation.

The contract generator must not become a second general-purpose shader
language.
