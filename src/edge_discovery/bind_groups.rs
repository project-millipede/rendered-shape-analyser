//! Bind-group creation for the pixel-derived edge-discovery lane.

use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBindGroup, GpuBindGroupDescriptor, GpuBindGroupEntry, GpuBindingResource, GpuDevice,
    GpuTexture,
};

use super::buffers::{EdgeDiscoveryIntermediateBuffers, EdgeDiscoveryOutputBuffers};
use super::pipelines::EdgeDiscoveryPipelines;

/// Create the pixel-derived edge-discovery bind group through upstream WebGPU.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `pipelines` - Rust-created edge-discovery pipeline resources.
/// * `intermediate` - Rust-created discovery working buffers.
/// * `output` - Rust-created renderer-facing buffers.
/// * `texture` - Captured-pixel texture for the entry.
/// * `entry_id` - Entry id used only for browser debug labels.
///
/// # Returns
///
/// Upstream bind group used by all edge-discovery compute dispatches.
pub(crate) fn create_edge_discovery_bind_group(
    device: &GpuDevice,
    pipelines: &EdgeDiscoveryPipelines,
    intermediate: &EdgeDiscoveryIntermediateBuffers,
    output: &EdgeDiscoveryOutputBuffers,
    texture: &GpuTexture,
    entry_id: &str,
) -> GpuBindGroup {
    // Edge-discovery bind-group ownership:
    //
    // - binding 0: captured-pixel texture.
    // - binding 5: intermediate feature data.
    // - binding 6: intermediate edge evidence.
    // - binding 12: thinned edge evidence.
    // - binding 7: per-tile refiner stats.
    // - binding 10: renderer-facing frequency-supported edge output.
    // - binding 11: reusable low/high-frequency band/support state.
    // - binding 13: GPU-written indirect draw arguments.
    //
    // No dormant rectangle-candidate buffers are bound here. Keeping them out
    // of the active layout stays below the default WebGPU limit of eight
    // storage buffers per compute stage.
    //
    // No ground-truth buffer is present, which keeps this discovery lane
    // mechanically independent from reference-guided border tracing.
    device.create_bind_group(&GpuBindGroupDescriptor {
        label: Some(format!(
            "component-gpu edge discovery bind group {entry_id}"
        )),
        layout: &pipelines.bind_group_layout,
        entries: vec![
            GpuBindGroupEntry {
                binding: 0,
                resource: GpuBindingResource::GpuTexture(texture),
            },
            GpuBindGroupEntry {
                binding: 5,
                resource: GpuBindingResource::GpuBuffer(&intermediate.feature),
            },
            GpuBindGroupEntry {
                binding: 6,
                resource: GpuBindingResource::GpuBuffer(&intermediate.evidence),
            },
            GpuBindGroupEntry {
                binding: 7,
                resource: GpuBindingResource::GpuBuffer(&intermediate.tile_stats),
            },
            GpuBindGroupEntry {
                binding: 12,
                resource: GpuBindingResource::GpuBuffer(&intermediate.thinned_evidence),
            },
            GpuBindGroupEntry {
                binding: 10,
                resource: GpuBindingResource::GpuBuffer(&output.frequency_output),
            },
            GpuBindGroupEntry {
                binding: 11,
                resource: GpuBindingResource::GpuBuffer(&intermediate.frequency_state),
            },
            GpuBindGroupEntry {
                binding: 13,
                resource: GpuBindingResource::GpuBuffer(&output.frequency_indirect),
            },
        ],
    })
}
