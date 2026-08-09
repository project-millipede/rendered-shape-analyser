# Current shader implementation baseline

> - **Status:** Descriptive baseline
> - **Last reviewed:** 2026-08-08
> - **Scope:** Current browser shader preparation and runtime call chains
> - **Parent:** [Portable shader authoring and multi-target compilation](README.md)

This document records the implementation that future shader-toolchain
experiments must preserve. It is descriptive evidence, not a proposed target
architecture.

## Current implementation baseline

The current discovery shader path is hybrid:

1. [`frequency_separation/shader.wgsl`](../../../src/edge_discovery/frequency_separation/shader.wgsl)
   and [`wavelet/haar/shader.wgsl`](../../../src/edge_discovery/wavelet/haar/shader.wgsl)
   are standalone WGSL files embedded with `include_str!`.
2. The base, refiner, and grouping fragments remain Rust string constants.
3. Reference-guided diagnostics remain one large Rust string in
   [`reference_diagnostics/pipelines.rs`](../../../src/reference_diagnostics/pipelines.rs).
4. `wgsl-macro` 0.4 is an ordinary runtime preprocessor, despite its name; it
   is not a Rust declarative or procedural macro.
5. [`edge_discovery_shader_source()`](../../../src/edge_discovery/shaders.rs)
   creates module and constant maps, expands imports, substitutes values, and
   allocates the final `String` during workload preparation.
6. [`wesl.toml`](../../../wesl.toml),
   [`shared_indexing.wesl`](../../../src/edge_discovery/shared_indexing.wesl),
   and
   [`shader-test.wesl`](../../../src/edge_discovery/frequency_separation/shader-test.wesl)
   form a dormant import experiment; no Cargo or package script invokes them.
7. Rust-GPU and Naga are not current dependencies or build inputs.

`include_str!` performs no runtime file I/O. It embeds UTF-8 source in the Wasm
artifact at Rust compilation time. The avoidable runtime work is module
assembly and textual substitution, not file loading.

### Current discovery call chain

```text
stable `analyze` or async `analyze`
    ↓
gpu_shared::submit_compatibility_dispatch(...)
    ↓
gpu_shared::encode_compatibility_dispatch(...)
```

```text
shared-frame `encode`
    ↓
gpu_shared::encode_compatibility_dispatch(...)
```

Both branches then continue through:

```text
    ↓
edge_discovery::prepare_edge_discovery_dispatch(...)
    ↓
edge_discovery::create_edge_discovery_pipelines(...)
    ↓
edge_discovery_shader_source()
    ├── edge_discovery_shader_constants()
    ├── edge_discovery_shader_processor()
    └── ShaderProcessor::build(...)
            ↓
       newly allocated final WGSL `String`
            ↓
GpuDevice::create_shader_module(GpuShaderModuleDescriptor { code, ... })
    ↓ Component Model / WIT
component-loader GpuDevice.createShaderModule(...)
    ↓
browser GPUDevice.createShaderModule({ code })
    ↓
browser shader validation and backend compilation
```

`create_edge_discovery_pipelines()` creates seven pipelines from that shader
module. `record_edge_discovery_dispatches()` protects this order:

```text
edge_feature
    → edge_convolution
    → edge_thin
    → edge_tile_stats
    → haar_low_high_frequency_level1
    → haar_low_high_frequency_level2
    → edge_project_frequency_support
```

Changing shader authoring or target artifacts must not implicitly change this
runtime contract.

### Current diagnostic call chain

```text
prepare_selected_diagnostic_lanes(...)
    ↓
create_diagnostic_shader(...)
    ↓
REFERENCE_DIAGNOSTICS_SHADER.to_string()
    ↓
GpuDevice::create_shader_module(...)
    ↓ Component Model / WIT
browser GPUDevice.createShaderModule({ code })
```
