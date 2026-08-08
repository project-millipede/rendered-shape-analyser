//! GPU buffer allocation for reference-guided diagnostic lanes.
//!
//! # Diagnostic buffer ownership
//!
//! 1. Rust owns every diagnostic byte length because each is derived from the
//!    Rust-built [`DiagnosticPlan`].
//! 2. Statistics output is GPU-writable and copyable. CPU readback is possible
//!    only when the separate readback module allocates staging explicitly.
//! 3. Visual and border outputs have no staging resource, so neither can
//!    accidentally become a CPU feedback path.
//! 4. Visual and border lanes each own GPU-written indirect draw arguments.
//!    JavaScript binds those buffers for `drawIndirect` instead of supplying a
//!    CPU-side active-instance count to the render pass.

use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBuffer, GpuBufferDescriptor, GpuBufferUsage, GpuDevice,
};

use super::layout::{
    BORDER_TRACE_NODE_STRIDE_BYTES, DRAW_INDIRECT_BYTE_LENGTH, VISUAL_NODE_STRIDE_BYTES,
};
use super::plan::DiagnosticPlan;

/// GPU-resident resources owned only by the reference-rectangle visual lane.
pub(crate) struct VisualResources {
    /// Renderer-facing reference-rectangle records.
    pub(crate) output: GpuBuffer,
    /// GPU-written indirect draw arguments for `output`.
    pub(crate) indirect: GpuBuffer,
}

/// GPU-resident output owned only by the per-reference statistics lane.
pub(crate) struct StatisticsOutputResources {
    /// Three compact atomic `u32` counters per reference node.
    pub(crate) output: GpuBuffer,
}

/// GPU-resident resources owned only by the reference-guided border lane.
pub(crate) struct BorderResources {
    /// Renderer-facing reference-guided border records.
    pub(crate) output: GpuBuffer,
    /// GPU-written indirect draw arguments for `output`.
    pub(crate) indirect: GpuBuffer,
}

/// Compute the reference-rectangle byte length for a plan.
///
/// # Arguments
///
/// * `plan` - Diagnostic plan containing the valid reference count.
///
/// # Returns
///
/// Exact byte length for one renderer-facing visual record per reference node.
fn visual_byte_length(plan: &DiagnosticPlan) -> u64 {
    u64::from(plan.node_count) * u64::from(VISUAL_NODE_STRIDE_BYTES)
}

/// Compute the reference-guided border-trace byte length for a plan.
///
/// # Arguments
///
/// * `plan` - Diagnostic plan containing the valid reference count.
///
/// # Returns
///
/// Exact byte length for one renderer-facing border-trace record per reference
/// node.
fn border_trace_byte_length(plan: &DiagnosticPlan) -> u64 {
    u64::from(plan.node_count) * u64::from(BORDER_TRACE_NODE_STRIDE_BYTES)
}

/// Create only the GPU resources required by the visual lane.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used for both allocations.
/// * `plan` - Diagnostic plan providing the entry label and reference count.
///
/// # Returns
///
/// A renderer-facing visual-record buffer plus its GPU-written indirect draw
/// arguments. No statistics, border, or readback buffer is allocated.
pub(super) fn create_visual_resources(
    device: &GpuDevice,
    plan: &DiagnosticPlan,
) -> VisualResources {
    let entry_id = &plan.entry_id;
    let output = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!("component-gpu visual output {entry_id}")),
        mapped_at_creation: None,
        size: visual_byte_length(plan),
        usage: GpuBufferUsage::STORAGE | GpuBufferUsage::COPY_SRC,
    });
    let indirect = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!(
            "component-gpu visual indirect draw args {entry_id}"
        )),
        mapped_at_creation: None,
        size: DRAW_INDIRECT_BYTE_LENGTH,
        usage: GpuBufferUsage::STORAGE | GpuBufferUsage::INDIRECT,
    });

    VisualResources { output, indirect }
}

/// Create only the GPU output required by the statistics lane.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used for the allocation.
/// * `plan` - Diagnostic plan providing the entry label and exact summary size.
///
/// # Returns
///
/// GPU-writable statistics output. CPU-readable staging remains a separate,
/// explicitly selected resource.
pub(super) fn create_statistics_output_resources(
    device: &GpuDevice,
    plan: &DiagnosticPlan,
) -> StatisticsOutputResources {
    let output = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!("component-gpu summary output {}", plan.entry_id)),
        mapped_at_creation: None,
        size: plan.summary_byte_length,
        usage: GpuBufferUsage::STORAGE | GpuBufferUsage::COPY_SRC | GpuBufferUsage::COPY_DST,
    });

    StatisticsOutputResources { output }
}

/// Create only the GPU resources required by the border lane.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used for both allocations.
/// * `plan` - Diagnostic plan providing the entry label and reference count.
///
/// # Returns
///
/// A renderer-facing border-trace buffer plus its GPU-written indirect draw
/// arguments. No visual, statistics, or readback buffer is allocated.
pub(super) fn create_border_resources(
    device: &GpuDevice,
    plan: &DiagnosticPlan,
) -> BorderResources {
    let entry_id = &plan.entry_id;
    let output = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!("component-gpu border trace output {entry_id}")),
        mapped_at_creation: None,
        size: border_trace_byte_length(plan),
        usage: GpuBufferUsage::STORAGE | GpuBufferUsage::COPY_SRC,
    });
    let indirect = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!(
            "component-gpu border trace indirect draw args {entry_id}"
        )),
        mapped_at_creation: None,
        size: DRAW_INDIRECT_BYTE_LENGTH,
        usage: GpuBufferUsage::STORAGE | GpuBufferUsage::INDIRECT,
    });

    BorderResources { output, indirect }
}
