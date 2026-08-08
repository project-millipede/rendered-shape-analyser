//! Command recording for the pixel-derived discovery lane.

use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBindGroup, GpuComputePassEncoder, GpuDevice, GpuTexture,
};

use super::bind_groups::create_edge_discovery_bind_group;
use super::buffers::{
    EdgeDiscoveryIntermediateBuffers, EdgeDiscoveryOutputBuffers, create_edge_discovery_buffers,
};
use super::pipelines::{EdgeDiscoveryPipelines, create_edge_discovery_pipelines};
use super::plan::DiscoveryPlan;

/// Rust-created resources for one pixel-derived discovery workload.
pub(crate) struct EdgeDiscoveryDispatchResources {
    /// Intermediate WIT resource handles retained for the recording lifetime.
    ///
    /// Command recording accesses these buffers indirectly through
    /// `bind_group`, so this field is never read after bind-group creation.
    /// Keeping ownership here prevents the handles from being dropped when
    /// preparation returns, before the caller records the discovery
    /// dispatches. The leading underscore marks this intentional
    /// lifetime-only ownership; it does not indicate a buffer copy or remap.
    _intermediate: EdgeDiscoveryIntermediateBuffers,
    /// Renderer-facing edge-record and indirect-draw buffers.
    pub(crate) output: EdgeDiscoveryOutputBuffers,
    /// Pipelines kept alive with the recorded command buffer.
    pipelines: EdgeDiscoveryPipelines,
    /// Bind group kept alive with the recorded command buffer.
    bind_group: GpuBindGroup,
}

/// Prepare resources for one pixel-derived discovery workload.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `texture` - Captured-pixel texture for the entry.
/// * `plan` - Generated-type-free discovery plan.
///
/// # Returns
///
/// Prepared discovery buffers, pipelines, and bind group.
pub(crate) fn prepare_edge_discovery_dispatch(
    device: &GpuDevice,
    texture: &GpuTexture,
    plan: &DiscoveryPlan,
) -> EdgeDiscoveryDispatchResources {
    let (intermediate, output) = create_edge_discovery_buffers(device, plan);
    let pipelines = create_edge_discovery_pipelines(device, plan);
    let bind_group = create_edge_discovery_bind_group(
        device,
        &pipelines,
        &intermediate,
        &output,
        texture,
        &plan.entry_id,
    );

    EdgeDiscoveryDispatchResources {
        _intermediate: intermediate,
        output,
        pipelines,
        bind_group,
    }
}

/// Record the seven ordered pixel-derived discovery dispatches.
///
/// # Critical compute-pass ownership invariant
///
/// The caller owns the compute-pass lifecycle. This function receives an
/// already-open pass and must return with that same pass still open.
///
/// A borrowed `GpuComputePassEncoder` still exposes `end()`. Leaving the pass
/// open is therefore an explicit architectural contract, not a restriction
/// fully enforced by the Rust or Component Model type.
///
/// This recorder may only select a discovery pipeline, bind discovery-only
/// resources, and dispatch its workgroups. It must not end the compute pass,
/// finish or submit the surrounding encoder, copy the diagnostic summary, or
/// map buffers.
///
/// The seven visible pipeline/bind/dispatch sequences are intentional. F0
/// protects their exact order; shader fusion or dispatch reduction belongs to
/// later optimization work.
pub(crate) fn record_edge_discovery_dispatches(
    pass: &GpuComputePassEncoder,
    resources: &EdgeDiscoveryDispatchResources,
    plan: &DiscoveryPlan,
) {
    pass.set_pipeline(&resources.pipelines.feature);
    bind_discovery_resources(pass, &resources.bind_group);
    pass.dispatch_workgroups(plan.texel_workgroups_x, Some(plan.texel_workgroups_y), None);

    pass.set_pipeline(&resources.pipelines.convolution);
    bind_discovery_resources(pass, &resources.bind_group);
    pass.dispatch_workgroups(plan.texel_workgroups_x, Some(plan.texel_workgroups_y), None);

    pass.set_pipeline(&resources.pipelines.thinning);
    bind_discovery_resources(pass, &resources.bind_group);
    pass.dispatch_workgroups(plan.texel_workgroups_x, Some(plan.texel_workgroups_y), None);

    pass.set_pipeline(&resources.pipelines.tile_stats);
    bind_discovery_resources(pass, &resources.bind_group);
    pass.dispatch_workgroups(plan.tile_workgroups_x, Some(plan.tile_workgroups_y), None);

    pass.set_pipeline(&resources.pipelines.haar_level1);
    bind_discovery_resources(pass, &resources.bind_group);
    pass.dispatch_workgroups(plan.tile_workgroups_x, Some(plan.tile_workgroups_y), None);

    pass.set_pipeline(&resources.pipelines.haar_level2);
    bind_discovery_resources(pass, &resources.bind_group);
    pass.dispatch_workgroups(plan.tile_workgroups_x, Some(plan.tile_workgroups_y), None);

    pass.set_pipeline(&resources.pipelines.frequency_output);
    bind_discovery_resources(pass, &resources.bind_group);
    pass.dispatch_workgroups(plan.tile_workgroups_x, Some(plan.tile_workgroups_y), None);
}

/// Bind the discovery-only resources required by the selected pipeline.
fn bind_discovery_resources(pass: &GpuComputePassEncoder, bind_group: &GpuBindGroup) {
    if pass
        .set_bind_group(0, Some(bind_group), None, None, None)
        .is_err()
    {
        panic!("failed to bind component edge-discovery resources");
    }
}
