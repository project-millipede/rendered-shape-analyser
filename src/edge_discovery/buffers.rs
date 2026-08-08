//! GPU buffer allocation for the pixel-derived edge-discovery lane.

use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBuffer, GpuBufferDescriptor, GpuBufferUsage, GpuDevice,
};

use super::frequency_separation::layout::LOW_HIGH_FREQUENCY_STATE_STRIDE_BYTES;
use super::layout::{
    EDGE_DISCOVERY_EVIDENCE_STRIDE_BYTES, EDGE_DISCOVERY_FEATURE_STRIDE_BYTES,
    EDGE_DISCOVERY_RECORD_STRIDE_BYTES,
};
use super::plan::DiscoveryPlan;
use super::refiner::layout::EDGE_REFINER_TILE_STATS_STRIDE_BYTES;

/// GPU-resident working buffers retained by the discovery implementation.
pub(crate) struct EdgeDiscoveryIntermediateBuffers {
    /// GPU-resident per-texel luminance/ink feature buffer.
    pub(crate) feature: GpuBuffer,
    /// GPU-resident per-texel Sobel evidence buffer.
    pub(crate) evidence: GpuBuffer,
    /// GPU-resident per-texel thinned edge evidence after local maximum suppression.
    pub(crate) thinned_evidence: GpuBuffer,
    /// GPU-resident per-tile oriented support statistics.
    pub(crate) tile_stats: GpuBuffer,
    /// GPU-resident per-tile low/high-frequency bands plus derived support.
    pub(crate) frequency_state: GpuBuffer,
}

/// GPU-resident buffers transferred to the renderer-facing output contract.
pub(crate) struct EdgeDiscoveryOutputBuffers {
    /// GPU-resident renderer-facing frequency-supported edge output buffer.
    pub(crate) frequency_output: GpuBuffer,
    /// GPU-written indirect draw arguments for `frequency_output`.
    pub(crate) frequency_indirect: GpuBuffer,
}

/// Compute the byte length for one full-resolution u32 per captured texel.
///
/// # Arguments
///
/// * `plan` - Discovery-only plan containing texture dimensions.
/// * `stride_bytes` - Byte stride of one texel record.
///
/// # Returns
///
/// Exact byte length for the requested per-texel buffer.
fn texel_buffer_byte_length(plan: &DiscoveryPlan, stride_bytes: u32) -> u64 {
    u64::from(plan.texture_width) * u64::from(plan.texture_height) * u64::from(stride_bytes)
}

/// Compute renderer-facing edge-discovery output byte length.
///
/// # Arguments
///
/// * `plan` - Discovery-only plan containing output capacity.
///
/// # Returns
///
/// Exact byte length for the tile output buffer.
fn output_byte_length(plan: &DiscoveryPlan) -> u64 {
    u64::from(plan.slot_capacity) * u64::from(EDGE_DISCOVERY_RECORD_STRIDE_BYTES)
}

/// Compute byte length for one refiner tile-stat record per output slot.
///
/// # Arguments
///
/// * `plan` - Discovery-only plan containing tile-grid slot capacity.
///
/// # Returns
///
/// Exact byte length for the per-tile refiner statistics buffer.
fn tile_stats_byte_length(plan: &DiscoveryPlan) -> u64 {
    u64::from(plan.slot_capacity) * u64::from(EDGE_REFINER_TILE_STATS_STRIDE_BYTES)
}

/// Compute byte length for one frequency-separation state record per output slot.
///
/// # Arguments
///
/// * `plan` - Discovery-only plan containing tile-grid slot capacity.
///
/// # Returns
///
/// Exact byte length for the per-tile frequency-separation state buffer.
fn frequency_state_byte_length(plan: &DiscoveryPlan) -> u64 {
    u64::from(plan.slot_capacity) * u64::from(LOW_HIGH_FREQUENCY_STATE_STRIDE_BYTES)
}

/// Byte length of a WebGPU non-indexed indirect draw argument record.
///
/// The four u32 words are:
///
/// 1. `vertex_count`
/// 2. `instance_count`
/// 3. `first_vertex`
/// 4. `first_instance`
const DRAW_INDIRECT_BYTE_LENGTH: u64 = 16;

/// Create GPU-resident buffers for pixel-derived edge discovery.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `plan` - Rust-owned discovery plan containing texture and edge metadata.
///
/// # Returns
///
/// Five implementation-owned intermediate buffers and two renderer-facing
/// output buffers. None is a CPU-readable staging buffer.
pub(crate) fn create_edge_discovery_buffers(
    device: &GpuDevice,
    plan: &DiscoveryPlan,
) -> (EdgeDiscoveryIntermediateBuffers, EdgeDiscoveryOutputBuffers) {
    let entry_id = &plan.entry_id;
    let feature_byte_length = texel_buffer_byte_length(plan, EDGE_DISCOVERY_FEATURE_STRIDE_BYTES);
    let evidence_byte_length = texel_buffer_byte_length(plan, EDGE_DISCOVERY_EVIDENCE_STRIDE_BYTES);
    let tile_stats_byte_length = tile_stats_byte_length(plan);
    let frequency_state_byte_length = frequency_state_byte_length(plan);
    let output_byte_length = output_byte_length(plan);

    let feature = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!("component-gpu edge feature buffer {entry_id}")),
        mapped_at_creation: None,
        size: feature_byte_length,
        usage: GpuBufferUsage::STORAGE,
    });
    let evidence = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!("component-gpu edge evidence buffer {entry_id}")),
        mapped_at_creation: None,
        size: evidence_byte_length,
        usage: GpuBufferUsage::STORAGE,
    });
    let thinned_evidence = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!(
            "component-gpu edge thinned evidence buffer {entry_id}"
        )),
        mapped_at_creation: None,
        size: evidence_byte_length,
        usage: GpuBufferUsage::STORAGE,
    });
    let tile_stats = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!("component-gpu edge tile stats buffer {entry_id}")),
        mapped_at_creation: None,
        size: tile_stats_byte_length,
        usage: GpuBufferUsage::STORAGE,
    });
    let frequency_state = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!(
            "component-gpu edge low-high frequency state buffer {entry_id}"
        )),
        mapped_at_creation: None,
        size: frequency_state_byte_length,
        usage: GpuBufferUsage::STORAGE,
    });
    let frequency_output = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!(
            "component-gpu frequency-supported edge discovery output {entry_id}"
        )),
        mapped_at_creation: None,
        size: output_byte_length,
        usage: GpuBufferUsage::STORAGE,
    });
    let frequency_indirect = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!(
            "component-gpu frequency-supported edge discovery indirect draw args {entry_id}"
        )),
        mapped_at_creation: None,
        size: DRAW_INDIRECT_BYTE_LENGTH,
        usage: GpuBufferUsage::STORAGE | GpuBufferUsage::INDIRECT,
    });

    (
        EdgeDiscoveryIntermediateBuffers {
            feature,
            evidence,
            thinned_evidence,
            tile_stats,
            frequency_state,
        },
        EdgeDiscoveryOutputBuffers {
            frequency_output,
            frequency_indirect,
        },
    )
}
