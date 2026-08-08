//! Ordering-only compatibility command sequencing for GPU analysis worlds.
//!
//! # Compatibility boundary
//!
//! The temporary adapter below composes two independently planned and prepared
//! cores solely to preserve the current public ten-dispatch behavior:
//!
//! 1. Stable, async, and shared-frame use the same diagnostic and discovery
//!    preparation and recording implementations.
//! 2. Neither core receives generated mixed `AnalysisPlan` metadata.
//! 3. No named or general-purpose mixed resource owner replaces the two core
//!    resource types. Compatibility helpers return them together only as tuples
//!    that callers immediately destructure.
//! 4. Stable and async own encoder creation, finishing, and submission;
//!    shared-frame retains scheduler ownership of those lifecycle steps.
//!
//! # Preserved evidence
//!
//! 1. Stable, async, and shared-frame compiled WIT remains byte-for-byte
//!    identical to the R2-A baseline.
//! 2. Component-boundary integration coverage observes the protected
//!    ten-dispatch order, output handles, compact-summary bytes, and each
//!    variant's finish/submission behavior.
//! 3. Source boundaries and pure unit tests establish generated-type-free
//!    diagnostic and discovery separation plus typed resource-selection
//!    decisions.
//!
//! # Evidence limits
//!
//! This source separation and its component-boundary integration coverage do
//! not establish:
//!
//! 1. Identical native WebGPU object-creation or wrapper-destruction order.
//! 2. Native-object or physical-allocation lifetime after a Rust/WIT wrapper
//!    drops.
//! 3. Omitted native allocations or dispatches for independently selected
//!    lanes; compatibility invokes every lane.
//! 4. GPU completion when encoded or submitted handles are returned.
//!
//! H1, the separate component-resource lifetime, disposal, and reuse
//! investigation, owns the native-lifetime questions. Direct measurement of
//! isolated operation shapes remains a separate optimization decision.

#[cfg(any(feature = "gpu-analysis", feature = "gpu-analysis-async"))]
use crate::wit::generated::wasi::webgpu::webgpu::GpuCommandBuffer;
use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBuffer, GpuCommandEncoder, GpuDevice, GpuTexture,
};

use crate::edge_discovery::{
    DiscoveryPlan, EdgeDiscoveryDispatchResources, prepare_edge_discovery_dispatch,
    record_edge_discovery_dispatches,
};
use crate::reference_diagnostics::{
    DiagnosticDispatchResources, DiagnosticPlan, DiagnosticResourceSelection, encode_summary_copy,
    prepare_selected_diagnostic_lanes, record_init_visuals, record_main, record_trace_borders,
};

/// Append the temporary compatibility workload to an existing encoder.
///
/// This is the ordering-only adapter behind both submission regimes:
///
/// 1. Stable and async worlds call `submit_compatibility_dispatch()`, which
///    creates their encoder, calls this adapter, and then finishes and submits
///    that encoder.
/// 2. Shared-frame receives the scheduler's borrowed encoder, calls this
///    adapter directly, and returns without finishing or submitting it.
///
/// # Arguments
///
/// * `encoder` - Still-open encoder owned by the caller.
/// * `device` - Shared inspector WebGPU device handle.
/// * `texture` - Captured-pixel texture used by both current workloads.
/// * `truth_buffer` - Component-reference input used only by diagnostics.
/// * `diagnostic_plan` - Generated-type-free diagnostic grids and sizes.
/// * `discovery_plan` - Generated-type-free discovery grids and capacity.
///
/// # Returns
///
/// A tuple containing the existing diagnostic and discovery resource types, in
/// that order. Compatibility callers immediately destructure it, retain both
/// through variant-specific result handling, and remain solely responsible for
/// finishing and submitting the same encoder. No replacement mixed owner is
/// introduced.
///
/// # Critical two-level ownership invariant
///
/// This compatibility orchestrator owns the compute-pass lifecycle. It begins
/// one pass, records the three reference-guided diagnostic dispatches, lends
/// the still-open pass to the seven-dispatch discovery recorder, and ends the
/// pass exactly once. It then records the compact diagnostic-summary copy.
///
/// It does not own the command-encoder lifecycle. A borrowed
/// `GpuCommandEncoder` still exposes `finish()`; borrowing is not a capability
/// restriction. Stable/async completion belongs to
/// `submit_compatibility_dispatch()`, while shared-frame completion belongs to
/// the browser scheduler.
pub(crate) fn encode_compatibility_dispatch(
    encoder: &GpuCommandEncoder,
    device: &GpuDevice,
    texture: &GpuTexture,
    truth_buffer: &GpuBuffer,
    diagnostic_plan: &DiagnosticPlan,
    discovery_plan: &DiscoveryPlan,
) -> (DiagnosticDispatchResources, EdgeDiscoveryDispatchResources) {
    let diagnostics = prepare_selected_diagnostic_lanes(
        device,
        texture,
        truth_buffer,
        diagnostic_plan,
        DiagnosticResourceSelection::compatibility(),
    );
    let discovery_resources = prepare_edge_discovery_dispatch(device, texture, discovery_plan);

    // CRITICAL R2 COMPATIBILITY OWNERSHIP INVARIANT:
    //
    // 1. The native device, captured texture, and encoder remain host WebGPU
    //    objects. This orchestrator does not own the encoder lifecycle;
    //    completion remains with the stable/async submission wrapper or browser
    //    scheduler.
    // 2. This orchestrator begins and owns exactly one compute pass.
    // 3. Each diagnostic recorder and the R1 discovery recorder receives that
    //    already-open pass and must return without ending it.
    // 4. The protected order is exactly:
    //    a. `init_visuals`,
    //    b. statistics `main`,
    //    c. `trace_borders`,
    //    d. the R1 recorder's seven ordered discovery dispatches.
    // 5. This orchestrator ends the pass exactly once after that sequence.
    // 6. It records the diagnostic-summary copy only after the pass ends. The
    //    compatibility path always prepares that copy; the underlying helper is
    //    optional only for independently invoked diagnostic operations.
    // 7. Only compact diagnostic-summary staging is CPU-readable. Visual,
    //    border, and discovery outputs remain GPU-resident.
    // 8. It must not retain or finish the encoder, obtain the device queue,
    //    submit a command buffer, map a buffer, resolve a summary, or claim GPU
    //    completion.
    // 9. Returned GPU handles identify recorded targets, not completed contents.
    //    They may be bound while recording later commands, but GPU execution
    //    begins only after the lifecycle owner finishes the encoder and submits
    //    the resulting command buffer.
    let pass = encoder.begin_compute_pass(None);

    record_init_visuals(
        &pass,
        diagnostics
            .visual
            .as_ref()
            .expect("compatibility diagnostics omitted the visual lane"),
        diagnostic_plan,
    );
    record_main(
        &pass,
        diagnostics
            .statistics
            .as_ref()
            .expect("compatibility diagnostics omitted the statistics lane"),
        diagnostic_plan,
    );
    record_trace_borders(
        &pass,
        diagnostics
            .border
            .as_ref()
            .expect("compatibility diagnostics omitted the border lane"),
        diagnostic_plan,
    );
    record_edge_discovery_dispatches(&pass, &discovery_resources, discovery_plan);
    pass.end();

    encode_summary_copy(
        encoder,
        &diagnostics
            .statistics
            .as_ref()
            .expect("compatibility diagnostics omitted the statistics lane")
            .output,
        diagnostics
            .summary_readback
            .as_ref()
            .expect("compatibility diagnostics omitted summary readback"),
    );

    (diagnostics, discovery_resources)
}

/// Encode and submit the compatibility workload for a self-submitting world.
///
/// Stable and async have the same encoder ownership, recording, finishing, and
/// submission lifecycle. Keeping that lifecycle here reuses one concrete path;
/// shared-frame still calls `encode_compatibility_dispatch()` directly with its
/// scheduler-owned encoder.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used to create the encoder and
///   obtain the submission queue.
/// * `texture` - Captured-pixel texture used by both current workloads.
/// * `truth_buffer` - Component-reference input used only by diagnostics.
/// * `diagnostic_plan` - Generated-type-free diagnostic grids and sizes.
/// * `discovery_plan` - Generated-type-free discovery grids and capacity.
///
/// # Returns
///
/// Diagnostic resources, discovery resources, and the submitted command-buffer
/// wrapper, in that order. Callers immediately destructure this tuple, which
/// exists only for compatibility; no named mixed resource owner is introduced.
/// Normal `queue.submit()` return does not mean GPU work or summary mapping has
/// completed.
///
/// # Critical encoder-ownership invariant
///
/// This is the only Rust GPU-analysis helper permitted to create, finish, and
/// submit the analyzer command encoder. The shared-frame path must never call
/// this function because its encoder belongs to the browser scheduler.
#[cfg(any(feature = "gpu-analysis", feature = "gpu-analysis-async"))]
pub(crate) fn submit_compatibility_dispatch(
    device: &GpuDevice,
    texture: &GpuTexture,
    truth_buffer: &GpuBuffer,
    diagnostic_plan: &DiagnosticPlan,
    discovery_plan: &DiscoveryPlan,
) -> (
    DiagnosticDispatchResources,
    EdgeDiscoveryDispatchResources,
    GpuCommandBuffer,
) {
    let encoder = device.create_command_encoder(None);
    let (diagnostics, discovery_resources) = encode_compatibility_dispatch(
        &encoder,
        device,
        texture,
        truth_buffer,
        diagnostic_plan,
        discovery_plan,
    );
    let commands = encoder.finish(None);
    let queue = device.queue();
    queue.submit(&[&commands]);

    (diagnostics, discovery_resources, commands)
}
