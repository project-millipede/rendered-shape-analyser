# Target artifacts and runtime boundaries

> - **Status:** Cross-target design constraints
> - **Last reviewed:** 2026-08-08
> - **Parent:** [Portable shader authoring and multi-target compilation](../README.md)
> - **Runtime prerequisite:** [GPU compute execution contract](../../../architecture/gpu-compute-execution-contract.md)

This document separates shader authoring, intermediate representations,
generated target artifacts, and runtime adapters. It records the browser
boundary that every candidate must preserve and the target-specific
translation that future native adapters may require.

## Terminology and layers

| Term | Role |
| --- | --- |
| WGSL | Human-readable shader language required by browser WebGPU. |
| WESL | A modular superset of WGSL that is linked into ordinary WGSL. |
| Naga | Shader parser, validator, intermediate representation, reflection source, and translator. |
| Rust-GPU | A compiler toolchain for writing shaders in a restricted Rust environment. |
| SPIR-V | A typed binary intermediate representation used naturally by Vulkan and shader toolchains. |
| WebGPU | Browser-facing GPU API; shader modules receive WGSL source text. |
| `wgpu` | Native Rust portability layer that selects platform GPU backends. |

The durable architecture has four layers:

```text
Canonical shader authoring source
    ↓
Linking, validation, reflection, and intermediate representation
    ↓
Target shader artifact
    ↓
Runtime GPU adapter
```

Candidate mappings are:

```text
WESL modules
    → WESL linker
    → WGSL and/or Naga IR
    → browser WebGPU or a native portability layer
```

```text
Restricted Rust shader source
    → Rust-GPU
    → SPIR-V
    → Vulkan directly or translation for another target
```

## Non-negotiable browser boundary

An end-to-end string-free browser path is not currently possible.

The vendored WebGPU WIT contract declares
`gpu-shader-module-descriptor.code` as a `string` in
[`webgpu.wit`](../../../../wkg/vendor/wasi-webgpu/wit/webgpu.wit). The authored
browser host forwards that value to `GPUDevice.createShaderModule()` in
[`component-loader/src/host/webgpu/index.ts`](../../../../component-loader/src/host/webgpu/index.ts).
The WebGPU specification likewise defines `GPUShaderModuleDescriptor.code` as
WGSL source text.

A macro or build compiler can remove:

1. WGSL embedded in Rust raw-string literals.
2. Runtime shader-file reads.
3. Runtime module linking.
4. Runtime source substitution.
5. Shader syntax failures discovered only during workload preparation.

It cannot remove the final WGSL text supplied to browser WebGPU. Moving shader
creation into TypeScript would only move that text boundary out of Rust; it
would not eliminate it.

## Target matrix

| Runtime target | Natural shader input | WESL/WGSL direction | Rust-GPU/SPIR-V direction |
| --- | --- | --- | --- |
| Browser WebGPU | WGSL text | Direct after build-time linking | Translate SPIR-V to WGSL before runtime |
| Native `wgpu` | Backend-selected portable representation | Use linked WGSL or Naga-backed translation | Use a supported SPIR-V or translated path, subject to the selected API/version |
| Vulkan | SPIR-V | Parse linked WGSL and emit a Vulkan-compatible artifact | Natural Rust-GPU output |
| Metal | Platform Metal representation | Translate through Naga/`wgpu` where supported | Translate SPIR-V; it is not consumed directly by browser-style WebGPU |
| Direct3D 12 | Platform Direct3D representation | Translate through Naga/`wgpu` where supported | Translate SPIR-V to the selected Direct3D artifact |
| Headless/server GPU | Not selected | Likely native `wgpu` using the same portable shader | Depends on deployment backend and capability requirements |

SPIR-V is natural for Vulkan, not universal. Metal, Direct3D, and browser
WebGPU require another artifact or a portability layer.

## Target-neutral internal boundary

The current browser Component Model boundary carries WGSL text because that is
what browser WebGPU needs. It should not automatically become the universal
contract for every future native backend.

A future internal boundary may separate:

```text
shader program identity and resource contract
    ↓
target artifact selection
    ↓
target adapter creates the native shader module
```

For example, a target-neutral internal plan might select a shader program and
entry point without exposing whether its prepared artifact is WGSL, SPIR-V, or
another backend representation. This is a future design constraint, not a
proposed public type or WIT change.
