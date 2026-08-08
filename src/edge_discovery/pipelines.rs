//! Pipeline creation for the pixel-derived edge-discovery lane.

use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBindGroupLayout, GpuBindGroupLayoutDescriptor, GpuBindGroupLayoutEntry,
    GpuBufferBindingLayout, GpuBufferBindingType, GpuComputePipeline, GpuComputePipelineDescriptor,
    GpuDevice, GpuLayoutMode, GpuPipelineLayout, GpuPipelineLayoutDescriptor, GpuProgrammableStage,
    GpuShaderModule, GpuShaderModuleDescriptor, GpuShaderStage, GpuTextureBindingLayout,
    GpuTextureSampleType, GpuTextureViewDimension,
};

use super::plan::DiscoveryPlan;
use super::shaders::edge_discovery_shader_source;

/// Rust-created pipeline resources for one pixel-derived edge-discovery dispatch.
pub(crate) struct EdgeDiscoveryPipelines {
    /// Feature-stage pipeline: captured-pixel texture to packed luminance/ink data.
    pub(crate) feature: GpuComputePipeline,
    /// Convolution-stage pipeline: feature data to Sobel-style edge evidence.
    pub(crate) convolution: GpuComputePipeline,
    /// Thinning-stage pipeline: suppress non-maximum edge evidence.
    pub(crate) thinning: GpuComputePipeline,
    /// Tile-stats pipeline: evidence data to oriented per-tile support.
    pub(crate) tile_stats: GpuComputePipeline,
    /// Haar level-1 pipeline: tile averages to explicit low/high bands.
    pub(crate) haar_level1: GpuComputePipeline,
    /// Haar level-2/support pipeline: low-low hierarchy to support.
    pub(crate) haar_level2: GpuComputePipeline,
    /// Frequency-output pipeline: support buffer to renderer-facing records.
    pub(crate) frequency_output: GpuComputePipeline,
    /// Bind-group layout shared by the active edge-discovery dispatches.
    pub(crate) bind_group_layout: GpuBindGroupLayout,
    /// Shader module kept alive with the pipelines and submitted command buffer.
    _shader: GpuShaderModule,
    /// Pipeline layout kept alive with the edge-discovery compute pipelines.
    _pipeline_layout: GpuPipelineLayout,
}

/// Create a storage-buffer binding layout used by edge-discovery buffers.
///
/// # Arguments
///
/// * `binding_type` - Upstream WebGPU storage binding type.
///
/// # Returns
///
/// Non-dynamic storage-buffer layout for one edge-discovery binding.
fn storage_buffer_layout(binding_type: GpuBufferBindingType) -> GpuBufferBindingLayout {
    GpuBufferBindingLayout {
        type_: Some(binding_type),
        has_dynamic_offset: None,
        min_binding_size: None,
    }
}

/// Create the bind-group layout for pixel-derived edge-discovery.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `entry_id` - Entry id used only for browser debug labels.
///
/// # Returns
///
/// Upstream bind-group layout for captured pixels plus edge-discovery GPU buffers.
fn create_edge_discovery_bind_group_layout(
    device: &GpuDevice,
    entry_id: &str,
) -> GpuBindGroupLayout {
    // Edge-discovery layout separation:
    //
    // - binding 0: captured-pixel texture. This is the only discovery input.
    // - binding 5: intermediate feature buffer.
    // - binding 6: intermediate Sobel/evidence buffer.
    // - binding 12: thinned evidence buffer after non-maximum suppression.
    // - binding 7: refiner per-tile statistics buffer.
    // - binding 10: renderer-facing frequency-supported edge output buffer.
    // - binding 11: reusable low/high-frequency band/support state buffer.
    // - binding 13: GPU-written indirect draw-arguments buffer.
    //
    // Dormant rectangle-candidate buffers are intentionally not in this layout.
    // Chrome's default compute-stage storage-buffer limit is 8, and the active
    // path must stay portable without requesting larger device limits.
    //
    // There is deliberately no component-reference binding here. Evaluation
    // may get a separate layout later, but v1 discovery cannot be
    // reference-guided.
    device.create_bind_group_layout(&GpuBindGroupLayoutDescriptor {
        label: Some(format!(
            "component-gpu edge discovery bind group layout {entry_id}"
        )),
        entries: vec![
            GpuBindGroupLayoutEntry {
                binding: 0,
                visibility: GpuShaderStage::COMPUTE,
                buffer: None,
                sampler: None,
                texture: Some(GpuTextureBindingLayout {
                    sample_type: Some(GpuTextureSampleType::Float),
                    view_dimension: Some(GpuTextureViewDimension::D2),
                    multisampled: None,
                }),
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: 5,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: 6,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: 7,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: 12,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: 10,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: 11,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: 13,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
        ],
    })
}

/// Create one edge-discovery pipeline layout.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `entry_id` - Entry id used only for browser debug labels.
/// * `bind_group_layout` - Narrow edge-discovery layout.
///
/// # Returns
///
/// Pipeline layout shared by all edge-discovery compute entry points.
fn create_pipeline_layout(
    device: &GpuDevice,
    entry_id: &str,
    bind_group_layout: &GpuBindGroupLayout,
) -> GpuPipelineLayout {
    device.create_pipeline_layout(&GpuPipelineLayoutDescriptor {
        label: Some(format!(
            "component-gpu edge discovery pipeline layout {entry_id}"
        )),
        bind_group_layouts: vec![Some(bind_group_layout)],
        immediate_size: None,
    })
}

/// Create one edge-discovery compute pipeline.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `entry_id` - Entry id used only for browser debug labels.
/// * `shader` - Edge-discovery shader module.
/// * `layout` - Edge-discovery pipeline layout.
/// * `entry_point` - WGSL entry point to compile.
///
/// # Returns
///
/// Upstream compute pipeline for the requested edge-discovery stage.
fn create_compute_pipeline(
    device: &GpuDevice,
    entry_id: &str,
    shader: &GpuShaderModule,
    layout: &GpuPipelineLayout,
    entry_point: &'static str,
) -> GpuComputePipeline {
    device.create_compute_pipeline(GpuComputePipelineDescriptor {
        label: Some(format!(
            "component-gpu edge discovery {entry_point} pipeline {entry_id}"
        )),
        layout: GpuLayoutMode::Specific(layout),
        compute: GpuProgrammableStage {
            module: shader,
            entry_point: Some(entry_point.to_string()),
            constants: None,
        },
    })
}

/// Create all edge-discovery compute pipelines through upstream WebGPU.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `plan` - Discovery-only plan containing entry metadata.
///
/// # Returns
///
/// Pipeline resources Rust can set on the compute pass directly.
pub(crate) fn create_edge_discovery_pipelines(
    device: &GpuDevice,
    plan: &DiscoveryPlan,
) -> EdgeDiscoveryPipelines {
    let entry_id = &plan.entry_id;
    let shader = device.create_shader_module(&GpuShaderModuleDescriptor {
        label: Some(format!("component-gpu edge discovery shader {entry_id}")),
        code: edge_discovery_shader_source(),
        compilation_hints: None,
    });
    let bind_group_layout = create_edge_discovery_bind_group_layout(device, entry_id);
    let pipeline_layout = create_pipeline_layout(device, entry_id, &bind_group_layout);
    let feature =
        create_compute_pipeline(device, entry_id, &shader, &pipeline_layout, "edge_feature");
    let convolution = create_compute_pipeline(
        device,
        entry_id,
        &shader,
        &pipeline_layout,
        "edge_convolution",
    );
    let thinning =
        create_compute_pipeline(device, entry_id, &shader, &pipeline_layout, "edge_thin");
    let tile_stats = create_compute_pipeline(
        device,
        entry_id,
        &shader,
        &pipeline_layout,
        "edge_tile_stats",
    );
    let haar_level1 = create_compute_pipeline(
        device,
        entry_id,
        &shader,
        &pipeline_layout,
        "haar_low_high_frequency_level1",
    );
    let haar_level2 = create_compute_pipeline(
        device,
        entry_id,
        &shader,
        &pipeline_layout,
        "haar_low_high_frequency_level2",
    );
    let frequency_output = create_compute_pipeline(
        device,
        entry_id,
        &shader,
        &pipeline_layout,
        "edge_project_frequency_support",
    );

    EdgeDiscoveryPipelines {
        feature,
        convolution,
        thinning,
        tile_stats,
        haar_level1,
        haar_level2,
        frequency_output,
        bind_group_layout,
        _shader: shader,
        _pipeline_layout: pipeline_layout,
    }
}
