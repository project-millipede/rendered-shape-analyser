# Shader-toolchain experiments and adoption gates

> - **Status:** Proposed evidence sequence
> - **Last reviewed:** 2026-08-08
> - **Parent:** [Portable shader authoring and multi-target compilation](../README.md)
> - **Current baseline:** [Current shader implementation](../current-implementation-baseline.md)
> - **Candidate directions:** [WESL at build time](../approaches/wesl-build-time.md) and [Rust-GPU with SPIR-V](../approaches/rust-gpu-and-spir-v.md)

This document keeps the experiments in dependency order and defines the common
evidence required before either candidate may affect production.

## Failure call chains

### Preferred build-time failure

```text
authored module changes
    ↓
WESL link or conditional translation fails
    OR
Naga parse/validation fails
    OR
reflected binding contract differs from Rust
    ↓
build fails with authored-source location
    ↓
no component or package artifact is published
```

### Remaining browser validation failure

```text
validated generated WGSL
    ↓ WIT
GPUDevice.createShaderModule(...)
    ↓
GPUDevice.createComputePipeline(...)
    ↓ browser validation error scope
host publishes the setup failure
    ↓
no workload is submitted
```

Build-time validation reduces browser-only failures but cannot replace real
browser validation because backend implementations and enabled device features
remain runtime facts.

## Proposed experiments

### Experiment 0: preserve the current baseline

1. Record the final generated discovery WGSL.
2. Record entry points, bindings, access modes, and workgroup sizes.
3. Preserve the existing component-boundary dispatch and ownership tests.
4. Add no new runtime or public API.

### Experiment 1: build-time linking of one WESL module

1. Use `frequency_separation` as the smallest real module.
2. Link it through the existing `tile_index` WESL dependency.
3. Parse and validate the output with Naga.
4. Compare the final WGSL with the current preprocessor output.
5. Verify identical entry points, bindings, layouts, and shader behavior.
6. Keep the experiment disposable until the artifact and diagnostic quality are accepted.

### Experiment 2: remove runtime discovery preprocessing

1. Migrate all discovery fragments to build-time linking.
2. Embed one generated final WGSL artifact.
3. Remove the runtime module registry and substitution maps.
4. Preserve Rust ownership of plans, layouts, pipeline creation, and dispatches.
5. Verify all three execution modes use the same artifact.

### Experiment 3: run the same WGSL natively

1. Use a small native `wgpu` harness.
2. Load the same generated WGSL used by the browser path.
3. Use identical texture, buffer, plan, and expected-output fixtures.
4. Compare output records and indirect arguments.
5. Do not modify the shader algorithm for the native harness.

This experiment should precede Rust-GPU. It may establish adequate native
portability without changing the canonical authoring language.

### Experiment 4: isolated Rust-GPU and SPIR-V proof

1. Select a pure mathematical function such as the 2D Haar band calculation.
2. Avoid initially migrating textures, storage resources, atomics, or complete entry points.
3. Compile the restricted Rust kernel to SPIR-V.
4. Translate the module or equivalent kernel to browser-compatible WGSL.
5. Compare numerical behavior against shared conformance vectors.
6. Evaluate source diagnostics and debugging across every transformation.
7. Do not integrate the proof into production.

### Experiment 5: only if the isolated proof succeeds

1. Select one complete compute entry point.
2. Model its resources and bindings.
3. Produce both a native artifact and browser WGSL.
4. Compare reflected layouts with the existing Rust contract.
5. Run the same fixture through browser and native execution.
6. Decide whether the toolchain remains credible for the full analyzer.

## Evaluation criteria

| Criterion | Required evidence |
| --- | --- |
| Browser compatibility | Real browser WebGPU creates pipelines and executes existing fixtures. |
| Native compatibility | Selected native adapter executes the same contract. |
| Semantic parity | Cross-target outputs match defined tolerances or exact integer rules. |
| Resource parity | Bindings, access modes, strides, and workgroup contracts remain equivalent. |
| One source of truth | No manually duplicated production algorithm exists. |
| Build diagnostics | Errors point to useful authored source locations. |
| Runtime simplicity | No runtime linker/preprocessor remains unless explicitly justified. |
| Reproducibility | Tool versions and generated artifacts are deterministic. |
| Debuggability | Browser/native errors can be traced back to canonical source. |
| Feature isolation | GPU-free builds do not inherit unnecessary shader compiler cost. |
| Toolchain stability | Compiler and translation dependencies have an acceptable support policy. |
| Artifact cost | Component/package/native artifacts are measured before adoption. |
| Preparation cost | Cold and warm shader preparation is measured when a runtime choice is made. |

The last two measurements are decision gates, not work started by this document.

## Adoption gates

### WESL build-time linking may be adopted when

1. One real module links and validates reproducibly.
2. Generated WGSL preserves the current shader contract.
3. Authored-source diagnostics are usable.
4. GPU-free builds remain appropriately isolated.
5. Browser and component-boundary behavior remains unchanged.
6. Generated artifacts have a documented review and versioning policy.

### Rust-GPU may advance beyond research when

1. A concrete native target requires capabilities or integration not served cleanly by WESL/WGSL and Naga.
2. The toolchain supports the required resource-heavy compute subset.
3. Browser translation preserves the portable contract.
4. Debugging remains practical across Rust, SPIR-V, and WGSL.
5. The result replaces, rather than duplicates, the canonical production implementation.
6. Toolchain and maintenance risk is explicitly accepted.

## Open questions

1. Is WESL source or linked WGSL the reviewed canonical artifact?
2. Should generated WGSL be checked in, emitted only to `OUT_DIR`, or produced by an explicit xtask?
3. How should Cargo rebuild tracking cover the full shader import graph?
4. How should GPU compiler dependencies remain absent from GPU-free builds?
5. Should Naga reflection generate Rust code or only validate handwritten contracts?
6. Which constants are structural, and which are legitimate pipeline overrides?
7. How are generated-source locations mapped back to WESL modules in browser errors?
8. Is native `wgpu` sufficient for every planned non-browser environment?
9. What is the first concrete native consumer and its required capability profile?
10. Does a future native runtime still use the Component Model boundary, or call a Rust library directly?
11. Which numerical differences across backend shader compilers are acceptable?
12. What device-loss and shader-cache policy applies to native targets?
13. Can one contract generator cover both WIT-backed browser resources and native `wgpu` resources without leaking either representation into analyzer logic?

## Maintenance and staleness policy

1. Keep durable principles separate from time-sensitive tool maturity claims.
2. Date and source claims about WESL, Naga, Rust-GPU, SPIR-V translation, and
   runtime input support.
3. Record exact versions and source revisions in experiment reports rather
   than treating this direction document as a dependency lockfile.
4. Review this document when:
   - the first native target is selected;
   - browser or native shader-input contracts change;
   - WESL, Naga, Rust-GPU, or the selected runtime has a relevant major release;
   - the component WIT shader/resource boundary changes;
   - a production shader changes its entry points, bindings, workgroup sizes,
     or output layouts.
5. If generated artifacts are committed, CI must regenerate and diff them.
6. If generated artifacts are not committed, the build must record generator
   provenance and prove deterministic regeneration.
7. Append dated experiment outcomes and decisions; do not silently rewrite
   earlier evidence after a toolchain changes.
8. Mark superseded conclusions and link to the document that replaces them.
