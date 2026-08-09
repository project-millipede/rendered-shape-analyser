# GPU compute execution contract

> - **Status:** Accepted architectural requirement
> - **Last reviewed:** 2026-08-08
> - **Applies to:** Every GPU analyser backend and generated shader artifact
> - **Does not apply to:** The browser-safe, CPU-only tree-aggregate component

## Purpose

The GPU analyser is a compute workload. Every supported GPU backend must
directly expose compute shaders, compute pipelines, and workgroup dispatch.
This is an architectural execution requirement, independent of shader
authoring language, compiler, operating system, or packaging model.

The requirement belongs to the selected GPU backend, not to the name or age of
the surrounding platform. A platform is eligible only when it can expose a
backend that satisfies this contract.

## Non-negotiable execution rule

Every production GPU analyser path must:

1. Preserve a compute-stage entry point in its generated shader artifact.
2. Create a compute pipeline for that entry point.
3. Encode the workload in a compute pass or equivalent native compute command
   scope.
4. Dispatch workgroups through the selected GPU API.
5. Execute the same analyser semantics regardless of the shader source
   language or target representation.

A shader compiler, translation layer, or portability library cannot make a
non-compute backend satisfy this contract.

## Backend orientation

The table describes compute eligibility. It does not claim that every eligible
backend already has a production adapter in this repository.

| Backend or platform example  |         Compute shaders | Support status                                        |
| ---------------------------- | ----------------------: | ----------------------------------------------------- |
| WebGL2                       |                      No | Unsupported                                           |
| OpenGL ES 3.0                |                      No | Unsupported                                           |
| OpenGL ES 3.1+               |                     Yes | Potentially supported                                 |
| WebGPU                       |         Core capability | Supported when a conforming adapter is available      |
| Vulkan                       |                     Yes | Compute-capable                                       |
| Metal                        |                     Yes | Compute-capable                                       |
| Direct3D 12                  |                     Yes | Compute-capable                                       |
| Native `wgpu`                |       Backend-dependent | Requires a compute-capable adapter                    |
| Android _(platform example)_ | Depends on selected API | May qualify through WebGPU, Vulkan, or OpenGL ES 3.1+ |

WebGL2 and OpenGL ES 3.0 are categorically outside the GPU analyser support
floor because they cannot execute compute shaders. Their presence as a
rendering fallback does not make them an analyser fallback.

Android is only an example of the platform/backend distinction. The same rule
applies to every desktop, mobile, browser, server, embedded, and headless
environment: support follows the selected compute-capable adapter, not the
operating-system label.

## Browser selection boundary

Basic compute pipelines are part of WebGPU's core API rather than an optional
feature. That does not guarantee that every browser and machine can return a
suitable adapter.

```text
WebGPU API available
    ↓
request an adapter
    ├── no suitable adapter → GPU analyser unavailable
    └── adapter returned
            ↓
        request a device
            ↓
        create compute pipelines
            ↓
        dispatch analyser workgroups
```

The application must handle adapter selection failure and device loss. A
fallback adapter is not guaranteed, and compute-stage execution does not by
itself guarantee a discrete GPU or a particular performance class.

## Native selection boundary

A native portability API may expose adapters that do not satisfy the complete
WebGPU baseline. Adapter existence alone is therefore insufficient.

```text
enumerate native adapters
    ↓
select an adapter with compute-shader support
    ├── no qualifying adapter → GPU analyser unavailable
    └── qualifying adapter
            ↓
        create a device and compute pipelines
            ↓
        dispatch analyser workgroups
```

For native `wgpu`, the adapter gate must require
`DownlevelFlags::COMPUTE_SHADERS` or full WebGPU compliance before using the
analyser. Any additional contract introduced by a future backend must be
checked separately without weakening this compute baseline.

## Unsupported and fallback policy

When no qualifying compute backend is available:

1. The GPU analyser must report that it is unavailable.
2. It must not silently reinterpret compute kernels as vertex or fragment
   shaders.
3. It must not silently route the same API through CPU execution.
4. It must not select a `wgpu` no-op adapter as an execution backend.

A CPU analyser, render-pass implementation, or another non-compute strategy
would be a separately designed backend. It would require its own ownership,
performance, numerical, and semantic-parity contract.

## Generated-artifact preservation

Every shader-toolchain direction must preserve compute semantics in its output:

| Toolchain path             | Required evidence                                                                 |
| -------------------------- | --------------------------------------------------------------------------------- |
| WGSL                       | Every analyser entry point retains `@compute` and its declared `@workgroup_size`. |
| WESL                       | Linked WGSL retains the same compute entry points and workgroup declarations.     |
| Naga translation           | Parsed or emitted entry-point metadata identifies the compute stage.              |
| Rust-GPU to SPIR-V         | SPIR-V declares the compute execution model and local workgroup size.             |
| Native backend translation | The selected platform artifact remains a compute kernel.                          |
| Runtime adapter            | The artifact is installed in a compute pipeline and invoked by a dispatch.        |

Changing authoring language or intermediate representation must never convert
the analyser into a rendering-stage workload as an incidental compatibility
measure.

## Verification requirements

The contract must be protected at several boundaries:

1. **Build-time structure:** Parse or reflect every generated artifact and
   assert its entry-point stage and workgroup declaration.
2. **Component boundary:** Verify that generated component calls create compute
   pipelines, begin compute passes, and issue the expected dispatches.
3. **Real runtime:** Execute a representative fixture on a real browser or
   native compute-capable adapter and verify the expected outputs.
4. **Capability rejection:** Demonstrate that a non-compute or absent adapter
   is rejected before workload execution.
5. **Cross-target parity:** Require every added backend to run common semantic
   fixtures before it becomes supported.

Fake GPU hosts can prove command wiring and ownership, but they cannot prove
that real compute shaders execute on a device.

## Non-goals

This document does not:

1. Define algorithm-specific buffer counts, binding indices, texture formats,
   workload sizes, or performance thresholds.
2. Select WESL, WGSL, Rust-GPU, SPIR-V, Naga, or any other authoring toolchain.
3. Authorize a native backend or a new public package surface.
4. Guarantee physical discrete-GPU execution.
5. Define a CPU or render-pass fallback.
6. Claim that every compute-capable API implementation satisfies every future
   analyser requirement.

Those decisions belong to their respective implementation plans and capability
profiles. None may weaken the compute-execution baseline established here.

## Primary references

- [WebGPU compute pipelines](https://www.w3.org/TR/webgpu/#compute-pipeline)
- [WebGPU adapter selection](https://www.w3.org/TR/webgpu/#adapter-selection)
- [WebGPU limits](https://www.w3.org/TR/webgpu/#limits)
- [WGSL compute entry points](https://www.w3.org/TR/WGSL/#compute-attr)
- [`wgpu` downlevel capabilities](https://docs.rs/wgpu/latest/wgpu/struct.DownlevelCapabilities.html)
- [`wgpu` compute-shader flag](https://docs.rs/wgpu/latest/wgpu/struct.DownlevelFlags.html#associatedconstant.COMPUTE_SHADERS)
