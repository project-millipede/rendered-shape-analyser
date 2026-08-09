# Candidate B: Rust-GPU and SPIR-V

> - **Status:** Deferred research direction
> - **Last reviewed:** 2026-08-08
> - **Parent:** [Portable shader authoring and multi-target compilation](../README.md)
> - **Preserves:** [Portable shader contracts](../contracts/portability-contracts.md)
> - **Evaluated by:** [Experiments and adoption gates](../evaluation/experiments-and-adoption-gates.md)

Rust-GPU changes the canonical authoring language rather than only changing
module linking.

## Native Vulkan call chain

```text
restricted Rust shader crate
    ↓ Rust-GPU compiler backend
SPIR-V module
    ↓ reflection and contract checks
Vulkan shader module
    ↓
native compute pipelines
    ↓
analyzer dispatches
```

This is the most direct potential use of SPIR-V because Vulkan treats it as a
natural shader-module representation.

## Browser call chain from Rust-GPU

```text
restricted Rust shader crate
    ↓ Rust-GPU
SPIR-V
    ↓ Naga SPIR-V input
Naga IR and validation
    ↓ WGSL output
generated WGSL
    ↓ WIT `code: string`
browser GPUDevice.createShaderModule({ code })
```

The browser chain retains WGSL and adds a translation stage. The portable
shader language becomes the intersection of:

1. The Rust subset accepted by Rust-GPU.
2. SPIR-V semantics emitted by the compiler.
3. Naga's accepted SPIR-V input and WGSL output.
4. WGSL and browser WebGPU validation rules.

## Metal or Direct3D call chain from Rust-GPU

```text
restricted Rust shader source
    ↓
SPIR-V
    ↓ selected translation/portability layer
platform shader representation
    ↓
Metal or Direct3D pipeline creation
```

SPIR-V is an intermediate artifact in this chain, not the platform's direct
public shader input.

## Advantages

1. Shader logic is authored in Rust syntax.
2. Some carefully selected types and pure mathematical functions may be shareable.
3. SPIR-V is a strong intermediate representation for Vulkan-oriented native execution.
4. Compiler reflection may reduce repeated binding and entry-point metadata.
5. A Rust-first shader ecosystem could align with future native analyzer crates.
6. Native targets may avoid carrying WGSL as their canonical artifact.

## Disadvantages and risks

1. Shader Rust is a restricted environment, not normal application Rust.
2. Rust-GPU remains an early and changing toolchain.
3. Browser WebGPU cannot consume SPIR-V directly.
4. Browser support requires SPIR-V-to-WGSL translation.
5. Texture, storage-buffer, atomic, and resource-attribute code requires a substantial rewrite.
6. Source-level debugging crosses Rust, SPIR-V, translated WGSL, and browser diagnostics.
7. Toolchain pinning and build complexity increase substantially.
8. The portable feature set may be smaller than either native SPIR-V or WGSL independently.
9. Maintaining WGSL and Rust-GPU implementations in parallel would create algorithm drift.
10. A successful small mathematical kernel does not prove the full resource-heavy analyzer is a suitable Rust-GPU target.
