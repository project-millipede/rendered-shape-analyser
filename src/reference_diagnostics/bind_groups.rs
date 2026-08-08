//! Rust-owned bind-group creation for reference-guided diagnostics.
//!
//! # Diagnostic bind-group ownership
//!
//! 1. Rust constructs each upstream descriptor from the exact resources it
//!    created or received.
//! 2. The host shim only translates those upstream handles into browser
//!    `GPUBindingResource` entries.
//! 3. The visual bind group contains only component references, GPU-resident
//!    visual output, and GPU-written visual indirect draw arguments.
//! 4. The statistics bind group contains only captured pixels, component
//!    references, and compact statistics output.
//! 5. The border bind group contains only captured pixels, component
//!    references, separate border output, and GPU-written border indirect draw
//!    arguments, allowing it to evolve independently from the rectangle overlay.
//! 6. Generated request and plan metadata stays in the compatibility shell and
//!    variant summary-resolution paths; bind groups carry GPU resources, not
//!    workflow records.
//! 7. Named binding indices live in `layout` and mirror the sparse WGSL
//!    compatibility contract.

use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBindGroup, GpuBindGroupDescriptor, GpuBindGroupEntry, GpuBindingResource, GpuBuffer,
    GpuDevice, GpuTexture,
};

use super::buffers::{BorderResources, StatisticsOutputResources, VisualResources};
use super::layout::{
    BORDER_TRACE_INDIRECT_DRAW_BINDING, BORDER_TRACE_OUTPUT_BINDING, CAPTURED_TEXTURE_BINDING,
    COMPONENT_REFERENCE_BINDING, STATISTICS_OUTPUT_BINDING, VISUAL_INDIRECT_DRAW_BINDING,
    VISUAL_OUTPUT_BINDING,
};
use super::pipelines::{
    BorderPipelineResources, StatisticsPipelineResources, VisualPipelineResources,
};

/// Create the visual initializer bind group through upstream WebGPU.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `pipeline` - Rust-created visual pipeline and layout.
/// * `resources` - Rust-created visual output and indirect buffers.
/// * `truth_buffer` - Component-reference buffer.
/// * `entry_id` - Entry id used only for browser debug labels.
///
/// # Returns
///
/// Upstream bind group for the `init_visuals` compute dispatch.
pub(super) fn create_visual_bind_group(
    device: &GpuDevice,
    pipeline: &VisualPipelineResources,
    resources: &VisualResources,
    truth_buffer: &GpuBuffer,
    entry_id: &str,
) -> GpuBindGroup {
    device.create_bind_group(&GpuBindGroupDescriptor {
        label: Some(format!("component-gpu visual bind group {entry_id}")),
        layout: &pipeline.bind_group_layout,
        entries: vec![
            GpuBindGroupEntry {
                binding: COMPONENT_REFERENCE_BINDING,
                resource: GpuBindingResource::GpuBuffer(truth_buffer),
            },
            GpuBindGroupEntry {
                binding: VISUAL_OUTPUT_BINDING,
                resource: GpuBindingResource::GpuBuffer(&resources.output),
            },
            GpuBindGroupEntry {
                binding: VISUAL_INDIRECT_DRAW_BINDING,
                resource: GpuBindingResource::GpuBuffer(&resources.indirect),
            },
        ],
    })
}

/// Create the per-texel statistics bind group through upstream WebGPU.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `pipeline` - Rust-created statistics pipeline and layout.
/// * `resources` - Rust-created statistics output buffer.
/// * `texture` - Captured-pixel texture.
/// * `truth_buffer` - Component-reference buffer.
/// * `entry_id` - Entry id used only for browser debug labels.
///
/// # Returns
///
/// Upstream bind group for the `main` per-component statistics dispatch.
pub(super) fn create_statistics_bind_group(
    device: &GpuDevice,
    pipeline: &StatisticsPipelineResources,
    resources: &StatisticsOutputResources,
    texture: &GpuTexture,
    truth_buffer: &GpuBuffer,
    entry_id: &str,
) -> GpuBindGroup {
    device.create_bind_group(&GpuBindGroupDescriptor {
        label: Some(format!("component-gpu stats bind group {entry_id}")),
        layout: &pipeline.bind_group_layout,
        entries: vec![
            GpuBindGroupEntry {
                binding: CAPTURED_TEXTURE_BINDING,
                resource: GpuBindingResource::GpuTexture(texture),
            },
            GpuBindGroupEntry {
                binding: COMPONENT_REFERENCE_BINDING,
                resource: GpuBindingResource::GpuBuffer(truth_buffer),
            },
            GpuBindGroupEntry {
                binding: STATISTICS_OUTPUT_BINDING,
                resource: GpuBindingResource::GpuBuffer(&resources.output),
            },
        ],
    })
}

/// Create the border-trace bind group through upstream WebGPU.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `pipeline` - Rust-created border pipeline and layout.
/// * `resources` - Rust-created border output and indirect buffers.
/// * `texture` - Captured-pixel texture.
/// * `truth_buffer` - Component-reference buffer.
/// * `entry_id` - Entry id used only for browser debug labels.
///
/// # Returns
///
/// Upstream bind group for the `trace_borders` compute dispatch.
pub(super) fn create_border_bind_group(
    device: &GpuDevice,
    pipeline: &BorderPipelineResources,
    resources: &BorderResources,
    texture: &GpuTexture,
    truth_buffer: &GpuBuffer,
    entry_id: &str,
) -> GpuBindGroup {
    device.create_bind_group(&GpuBindGroupDescriptor {
        label: Some(format!("component-gpu border trace bind group {entry_id}")),
        layout: &pipeline.bind_group_layout,
        entries: vec![
            GpuBindGroupEntry {
                binding: CAPTURED_TEXTURE_BINDING,
                resource: GpuBindingResource::GpuTexture(texture),
            },
            GpuBindGroupEntry {
                binding: COMPONENT_REFERENCE_BINDING,
                resource: GpuBindingResource::GpuBuffer(truth_buffer),
            },
            GpuBindGroupEntry {
                binding: BORDER_TRACE_OUTPUT_BINDING,
                resource: GpuBindingResource::GpuBuffer(&resources.output),
            },
            GpuBindGroupEntry {
                binding: BORDER_TRACE_INDIRECT_DRAW_BINDING,
                resource: GpuBindingResource::GpuBuffer(&resources.indirect),
            },
        ],
    })
}
