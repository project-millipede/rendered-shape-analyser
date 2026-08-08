//! Rust-owned pipeline creation for reference-guided diagnostics.
//!
//! # Diagnostic pipeline ownership
//!
//! 1. Rust owns the three-entry-point diagnostic WGSL selected for this kernel.
//! 2. One shader module is shared by every selected lane in an operation.
//! 3. Rust creates one intentionally narrow bind-group layout and pipeline
//!    layout per selected lane instead of accepting broad browser pipelines.
//! 4. The host shim only translates upstream descriptors into browser WebGPU
//!    objects; shader and pipeline policy remains in this core.

use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBindGroupLayout, GpuBindGroupLayoutDescriptor, GpuBindGroupLayoutEntry,
    GpuBufferBindingLayout, GpuBufferBindingType, GpuComputePipeline, GpuComputePipelineDescriptor,
    GpuDevice, GpuLayoutMode, GpuPipelineLayout, GpuPipelineLayoutDescriptor, GpuProgrammableStage,
    GpuShaderModule, GpuShaderModuleDescriptor, GpuShaderStage, GpuTextureBindingLayout,
    GpuTextureSampleType, GpuTextureViewDimension,
};

use super::layout::{
    BORDER_TRACE_INDIRECT_DRAW_BINDING, BORDER_TRACE_OUTPUT_BINDING, CAPTURED_TEXTURE_BINDING,
    COMPONENT_REFERENCE_BINDING, STATISTICS_OUTPUT_BINDING, VISUAL_INDIRECT_DRAW_BINDING,
    VISUAL_OUTPUT_BINDING,
};
use super::plan::DiagnosticPlan;

/// WGSL source for the shared visual, statistics, and border diagnostic kernel.
///
/// The visual and statistics subset preserves the executable contract of the
/// P0 TypeScript `PER_COMPONENT_STATS_SHADER`; border tracing is the component
/// diagnostic extension. Until the shader is shared as a generated package
/// artifact, keep this copy in sync with the P0 oracle and retain the raw WGSL
/// binding declarations byte-for-byte. The contract test below checks those
/// declarations against Rust's named binding constants.
const REFERENCE_DIAGNOSTICS_SHADER: &str = r#"
struct GroundTruthHeader {
  // Number of valid GroundTruthNode records following this header.
  count: u32,
  // Upload sequence number written by the JavaScript ground-truth writer.
  seq: u32,
  // Width of the captured texture used when the buffer was encoded.
  tex_w: u32,
  // Height of the captured texture used when the buffer was encoded.
  tex_h: u32,
};

struct GroundTruthNode {
  // Texel-space rectangle: x, y, width, height.
  bounds: vec4f,
  // DOM/fiber nesting depth. The deepest containing node owns a texel.
  depth: u32,
  // Parent node index, kept for future hierarchy-aware kernels.
  parent: u32,
  // Encoded node flags from the ground-truth layout.
  flags: u32,
  // Stable-ish hashed display name, useful for future debug/result joins.
  name_hash: u32,
};

struct GroundTruth {
  // Header metadata, followed by a runtime-sized array of nodes.
  header: GroundTruthHeader,
  nodes: array<GroundTruthNode>,
};

struct AnalysisVisualRecord {
  // Texel-space rectangle: x, y, width, height.
  bounds: vec4f,
  // node index, depth, flags, name hash. Named 'info' because 'meta' is
  // reserved by WGSL in current Chromium builds.
  info: vec4u,
};

struct AnalysisBorderTraceRecord {
  // Texel-space rectangle traced for this node: x, y, width, height.
  bounds: vec4f,
  // node index, depth, positive border samples, total border samples.
  info: vec4u,
};

// Captured-pixel input: exact rendered pixels for one inspector entry.
@group(0) @binding(0) var captured: texture_2d<f32>;
// Component-reference input: privileged measured layout. Binding this enables
// training/evaluation mode.
@group(0) @binding(1) var<storage, read> truth: GroundTruth;
// Summary buffer: three atomic u32 counters per ground-truth node.
@group(0) @binding(2) var<storage, read_write> summaries: array<atomic<u32>>;
// Visual buffer: GPU-resident records for the analysis overlay/heatmap lane.
@group(0) @binding(3) var<storage, read_write> visuals: array<AnalysisVisualRecord>;
// Visual indirect draw args: vertex count, instance count, first vertex, first instance.
@group(0) @binding(13) var<storage, read_write> visual_draw_args: array<u32>;
// Border trace buffer: separate GPU-resident records for border-following output.
@group(0) @binding(4) var<storage, read_write> border_traces: array<AnalysisBorderTraceRecord>;
// Border indirect draw args: vertex count, instance count, first vertex, first instance.
@group(0) @binding(14) var<storage, read_write> border_trace_draw_args: array<u32>;

// Must match SUMMARY_WORDS_PER_NODE in webgpu-execution/summary.ts.
const SUMMARY_WORDS_PER_NODE: u32 = 3u;
const VISUAL_VERTICES_PER_RECORD: u32 = 6u;
const BORDER_TRACE_VERTICES_PER_RECORD: u32 = 24u;

// Copy one ground-truth node into GPU-resident visual-output storage.
@compute @workgroup_size(64, 1)
fn init_visuals(@builtin(global_invocation_id) id: vec3u) {
  if (id.x == 0u) {
    // GPU-driven rendering contract:
    //
    // 1. The render pass reads these four words via `drawIndirect`.
    // 2. JavaScript does not pass a visual active-instance value into `draw`.
    // 3. `truth.header.count` is still read on the GPU from the
    //    component-reference buffer, which is the
    //    same source used to write the visual records below.
    visual_draw_args[0] = VISUAL_VERTICES_PER_RECORD;
    visual_draw_args[1] = truth.header.count;
    visual_draw_args[2] = 0u;
    visual_draw_args[3] = 0u;
  }

  // One invocation owns one node record. Extra rounded-up lanes do no work.
  if (id.x >= truth.header.count) {
    return;
  }

  let node = truth.nodes[id.x];
  visuals[id.x].bounds = node.bounds;
  visuals[id.x].info = vec4u(id.x, node.depth, node.flags, node.name_hash);
}

// Test the node's half-open texel-space rectangle against a texel center.
// Half-open bounds avoid double-counting texels on shared right/bottom edges.
fn contains_pixel(node: GroundTruthNode, pixel: vec2f) -> bool {
  // Convert the encoded origin/size rectangle into min/max corners.
  let min_xy = node.bounds.xy;
  let max_xy = node.bounds.xy + node.bounds.zw;
  // Inclusive left/top, exclusive right/bottom: [min, max).
  return pixel.x >= min_xy.x &&
    pixel.y >= min_xy.y &&
    pixel.x < max_xy.x &&
    pixel.y < max_xy.y;
}

// Analyze one captured texel and accumulate it into the deepest matching node.
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  // The dispatch is rounded up to workgroup boundaries. Skip padded lanes and
  // skip empty ground-truth buffers before reading any node data.
  let dims = textureDimensions(captured);
  if (id.x >= dims.x || id.y >= dims.y || truth.header.count == 0u) {
    return;
  }

  // Work in texel-center coordinates because ground truth was encoded in the
  // same coordinate system. This keeps edge ownership stable at integer bounds.
  let pixel = vec2f(f32(id.x) + 0.5, f32(id.y) + 0.5);
  // 0xffffffffu is a sentinel meaning "no containing node found yet".
  var best_index = 0xffffffffu;
  var best_depth = 0u;

  // Linear scan is acceptable for the first analyzer because node counts are
  // small and clarity matters. Later kernels can replace this with a spatial
  // index without changing the summary contract.
  for (var i = 0u; i < truth.header.count; i = i + 1u) {
    let node = truth.nodes[i];
    // The >= comparison means later nodes with equal depth win. That keeps
    // ownership deterministic when overlapping siblings are encoded in source order.
    if (contains_pixel(node, pixel) && node.depth >= best_depth) {
      best_index = i;
      best_depth = node.depth;
    }
  }

  // Texels outside all known ground-truth nodes do not contribute to summaries.
  if (best_index == 0xffffffffu) {
    return;
  }

  // Read exactly one texel from mip level 0. There is no sampler, filtering,
  // or format conversion beyond WebGPU's normal textureLoad return value.
  let rgba = textureLoad(captured, vec2i(i32(id.x), i32(id.y)), 0);
  // Rec. 709 luminance weights give a simple scalar brightness signal.
  let luminance = clamp(dot(rgba.rgb, vec3f(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  // Store luminance in milli-units so the shader can use integer atomics.
  let luminance_milli = u32(luminance * 1000.0 + 0.5);
  // First-pass "ink" heuristic: visible alpha and not near-white.
  let ink = rgba.a > 0.01 && luminance < 0.98;
  // Each node owns three u32 words: texels, ink texels, luminance milli-sum.
  let offset = best_index * SUMMARY_WORDS_PER_NODE;

  // Coverage: every texel owned by the selected node increments slot 0.
  atomicAdd(&summaries[offset + 0u], 1u);
  if (ink) {
    // Ink: only visible/non-white texels increment slot 1.
    atomicAdd(&summaries[offset + 1u], 1u);
  }
  // Luminance: all owned texels contribute their fixed-point luminance to slot 2.
  atomicAdd(&summaries[offset + 2u], luminance_milli);
}

// Read a captured texel as clamped Rec. 709 luminance.
fn luminance_at(coord: vec2u, dims: vec2u) -> f32 {
  let max_coord = dims - vec2u(1u, 1u);
  let clamped = min(coord, max_coord);
  let rgba = textureLoad(captured, vec2i(i32(clamped.x), i32(clamped.y)), 0);
  return clamp(dot(rgba.rgb, vec3f(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
}

// Return one ordered sample point on the rectangle perimeter.
fn border_sample_point(bounds: vec4f, sample_index: u32, sample_count: u32) -> vec2f {
  let width = max(bounds.z, 1.0);
  let height = max(bounds.w, 1.0);
  let perimeter = (width + height) * 2.0;
  let distance = (f32(sample_index) + 0.5) * perimeter / f32(sample_count);

  if (distance < width) {
    return vec2f(bounds.x + distance, bounds.y);
  }

  if (distance < width + height) {
    return vec2f(bounds.x + width, bounds.y + distance - width);
  }

  if (distance < width + height + width) {
    return vec2f(bounds.x + width - (distance - width - height), bounds.y + height);
  }

  return vec2f(bounds.x, bounds.y + height - (distance - width - height - width));
}

// Return the one-texel inward direction for a perimeter point.
fn inward_normal(bounds: vec4f, point: vec2f) -> vec2f {
  let left_distance = abs(point.x - bounds.x);
  let right_distance = abs(point.x - (bounds.x + bounds.z));
  let top_distance = abs(point.y - bounds.y);
  let bottom_distance = abs(point.y - (bounds.y + bounds.w));

  if (left_distance <= right_distance &&
      left_distance <= top_distance &&
      left_distance <= bottom_distance) {
    return vec2f(1.0, 0.0);
  }

  if (right_distance <= top_distance && right_distance <= bottom_distance) {
    return vec2f(-1.0, 0.0);
  }

  if (top_distance <= bottom_distance) {
    return vec2f(0.0, 1.0);
  }

  return vec2f(0.0, -1.0);
}

// Trace one node rectangle border against existing captured texels.
@compute @workgroup_size(64, 1)
fn trace_borders(@builtin(global_invocation_id) id: vec3u) {
  if (id.x == 0u) {
    // GPU-driven rendering contract:
    //
    // 1. The render pass reads these four words via `drawIndirect`.
    // 2. JavaScript does not pass a border-trace active-instance value into `draw`.
    // 3. `truth.header.count` remains the GPU-side instance count because this
    //    reference-guided lane emits one record per known node.
    border_trace_draw_args[0] = BORDER_TRACE_VERTICES_PER_RECORD;
    border_trace_draw_args[1] = truth.header.count;
    border_trace_draw_args[2] = 0u;
    border_trace_draw_args[3] = 0u;
  }

  // This is a separate lane from the existing visual rectangle output:
  //
  // 1. One invocation owns one node.
  // 2. The shader samples only along that node's 2D border.
  // 3. Each sample compares border, one texel inward, and one texel outward.
  // 4. The result remains GPU-resident in border_traces.
  // 5. No per-sample or per-pixel border data is copied back to the CPU.
  if (id.x >= truth.header.count) {
    return;
  }

  let dims = textureDimensions(captured);
  let node = truth.nodes[id.x];
  let sample_count = 64u;
  var hits = 0u;
  var samples = 0u;

  if (dims.x > 0u && dims.y > 0u && node.bounds.z > 0.0 && node.bounds.w > 0.0) {
    for (var i = 0u; i < sample_count; i = i + 1u) {
      let point = border_sample_point(node.bounds, i, sample_count);
      let normal = inward_normal(node.bounds, point);
      let border_coord = vec2u(max(point, vec2f(0.0)));
      let inside_coord = vec2u(max(point + normal, vec2f(0.0)));
      let outside_coord = vec2u(max(point - normal, vec2f(0.0)));

      let border_luma = luminance_at(border_coord, dims);
      let inside_luma = luminance_at(inside_coord, dims);
      let outside_luma = luminance_at(outside_coord, dims);
      let contrast = abs(inside_luma - outside_luma);

      samples = samples + 1u;
      if (contrast > 0.08 || border_luma < 0.96) {
        hits = hits + 1u;
      }
    }
  }

  border_traces[id.x].bounds = node.bounds;
  border_traces[id.x].info = vec4u(id.x, node.depth, hits, samples);
}
"#;

/// One shared diagnostic shader module retained for the selected operation.
pub(crate) struct DiagnosticShader {
    module: GpuShaderModule,
}

/// Pipeline resources owned only by the visual lane.
pub(crate) struct VisualPipelineResources {
    /// Pipeline for the reference-guided rectangle initialization dispatch.
    pub(crate) pipeline: GpuComputePipeline,
    /// Bind-group layout used to create the matching visual bind group.
    pub(crate) bind_group_layout: GpuBindGroupLayout,
    /// Pipeline layout retained with the visual pipeline.
    pub(crate) pipeline_layout: GpuPipelineLayout,
}

/// Pipeline resources owned only by the statistics lane.
pub(crate) struct StatisticsPipelineResources {
    /// Pipeline for the per-texel diagnostic statistics dispatch.
    pub(crate) pipeline: GpuComputePipeline,
    /// Bind-group layout used to create the matching statistics bind group.
    pub(crate) bind_group_layout: GpuBindGroupLayout,
    /// Pipeline layout retained with the statistics pipeline.
    pub(crate) pipeline_layout: GpuPipelineLayout,
}

/// Pipeline resources owned only by the border lane.
pub(crate) struct BorderPipelineResources {
    /// Pipeline for the reference-guided border-trace dispatch.
    pub(crate) pipeline: GpuComputePipeline,
    /// Bind-group layout used to create the matching border bind group.
    pub(crate) bind_group_layout: GpuBindGroupLayout,
    /// Pipeline layout retained with the border pipeline.
    pub(crate) pipeline_layout: GpuPipelineLayout,
}

/// Create a storage-buffer binding layout.
///
/// # Arguments
///
/// * `binding_type` - Upstream WebGPU buffer-binding type.
///
/// # Returns
///
/// WIT descriptor for one non-dynamic storage buffer binding.
fn storage_buffer_layout(binding_type: GpuBufferBindingType) -> GpuBufferBindingLayout {
    GpuBufferBindingLayout {
        type_: Some(binding_type),
        has_dynamic_offset: None,
        min_binding_size: None,
    }
}

/// Create the visual initializer bind-group layout.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `entry_id` - Entry id used only for browser debug labels.
///
/// # Returns
///
/// Upstream bind-group layout for component references, GPU-resident visual
/// output, and visual indirect draw arguments.
fn create_visual_bind_group_layout(device: &GpuDevice, entry_id: &str) -> GpuBindGroupLayout {
    device.create_bind_group_layout(&GpuBindGroupLayoutDescriptor {
        label: Some(format!("component-gpu visual bind group layout {entry_id}")),
        entries: vec![
            GpuBindGroupLayoutEntry {
                binding: COMPONENT_REFERENCE_BINDING,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::ReadOnlyStorage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: VISUAL_OUTPUT_BINDING,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: VISUAL_INDIRECT_DRAW_BINDING,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
        ],
    })
}

/// Create the statistics bind-group layout.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `entry_id` - Entry id used only for browser debug labels.
///
/// # Returns
///
/// Upstream bind-group layout for captured pixels, component references, and summary output.
fn create_stats_bind_group_layout(device: &GpuDevice, entry_id: &str) -> GpuBindGroupLayout {
    device.create_bind_group_layout(&GpuBindGroupLayoutDescriptor {
        label: Some(format!("component-gpu stats bind group layout {entry_id}")),
        entries: vec![
            GpuBindGroupLayoutEntry {
                binding: CAPTURED_TEXTURE_BINDING,
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
                binding: COMPONENT_REFERENCE_BINDING,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::ReadOnlyStorage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: STATISTICS_OUTPUT_BINDING,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
        ],
    })
}

/// Create the border-trace bind-group layout.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `entry_id` - Entry id used only for browser debug labels.
///
/// # Returns
///
/// Upstream bind-group layout for captured pixels, component references,
/// border-trace output, and border indirect draw arguments.
fn create_border_trace_bind_group_layout(device: &GpuDevice, entry_id: &str) -> GpuBindGroupLayout {
    device.create_bind_group_layout(&GpuBindGroupLayoutDescriptor {
        label: Some(format!(
            "component-gpu border trace bind group layout {entry_id}"
        )),
        entries: vec![
            GpuBindGroupLayoutEntry {
                binding: CAPTURED_TEXTURE_BINDING,
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
                binding: COMPONENT_REFERENCE_BINDING,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::ReadOnlyStorage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: BORDER_TRACE_OUTPUT_BINDING,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
            GpuBindGroupLayoutEntry {
                binding: BORDER_TRACE_INDIRECT_DRAW_BINDING,
                visibility: GpuShaderStage::COMPUTE,
                buffer: Some(storage_buffer_layout(GpuBufferBindingType::Storage)),
                sampler: None,
                texture: None,
                storage_texture: None,
            },
        ],
    })
}

/// Create one pipeline layout from one bind-group layout.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `label` - Browser debug label.
/// * `bind_group_layout` - Upstream bind-group layout used by the pipeline.
///
/// # Returns
///
/// Upstream pipeline layout for one analyzer compute entry point.
fn create_pipeline_layout(
    device: &GpuDevice,
    label: String,
    bind_group_layout: &GpuBindGroupLayout,
) -> GpuPipelineLayout {
    device.create_pipeline_layout(&GpuPipelineLayoutDescriptor {
        label: Some(label),
        bind_group_layouts: vec![Some(bind_group_layout)],
        immediate_size: None,
    })
}

/// Create one compute pipeline for an analyzer entry point.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device handle.
/// * `label` - Browser debug label.
/// * `shader` - Shared analyzer shader module.
/// * `layout` - Pipeline layout with the entry point's narrow binding shape.
/// * `entry_point` - WGSL entry point to execute.
///
/// # Returns
///
/// Upstream compute pipeline resource.
fn create_compute_pipeline(
    device: &GpuDevice,
    label: String,
    shader: &GpuShaderModule,
    layout: &GpuPipelineLayout,
    entry_point: &'static str,
) -> GpuComputePipeline {
    device.create_compute_pipeline(GpuComputePipelineDescriptor {
        label: Some(label),
        layout: GpuLayoutMode::Specific(layout),
        compute: GpuProgrammableStage {
            module: shader,
            entry_point: Some(entry_point.to_string()),
            constants: None,
        },
    })
}

/// Create the shared reference-diagnostic shader through upstream WebGPU.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used to create the module.
/// * `plan` - Diagnostic plan providing the entry id used in the debug label.
///
/// # Returns
///
/// One shader-module wrapper shared by every selected diagnostic pipeline.
pub(crate) fn create_diagnostic_shader(
    device: &GpuDevice,
    plan: &DiagnosticPlan,
) -> DiagnosticShader {
    let entry_id = &plan.entry_id;
    let module = device.create_shader_module(&GpuShaderModuleDescriptor {
        label: Some(format!(
            "component-gpu per-component stats shader {entry_id}"
        )),
        code: REFERENCE_DIAGNOSTICS_SHADER.to_string(),
        compilation_hints: None,
    });

    DiagnosticShader { module }
}

/// Create only the visual-lane pipeline resources.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used for layout and pipeline creation.
/// * `shader` - Shared diagnostic shader containing `init_visuals`.
/// * `plan` - Diagnostic plan providing the entry id used in debug labels.
///
/// # Returns
///
/// The narrow visual bind-group layout, its pipeline layout, and the
/// `init_visuals` compute pipeline. No buffers or bind groups are created.
pub(crate) fn create_visual_pipeline(
    device: &GpuDevice,
    shader: &DiagnosticShader,
    plan: &DiagnosticPlan,
) -> VisualPipelineResources {
    let entry_id = &plan.entry_id;
    let visual_bind_group_layout = create_visual_bind_group_layout(device, entry_id);
    let visual_pipeline_layout = create_pipeline_layout(
        device,
        format!("component-gpu visual pipeline layout {entry_id}"),
        &visual_bind_group_layout,
    );
    let pipeline = create_compute_pipeline(
        device,
        format!("component-gpu visual init pipeline {entry_id}"),
        &shader.module,
        &visual_pipeline_layout,
        "init_visuals",
    );

    VisualPipelineResources {
        pipeline,
        bind_group_layout: visual_bind_group_layout,
        pipeline_layout: visual_pipeline_layout,
    }
}

/// Create only the statistics-lane pipeline resources.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used for layout and pipeline creation.
/// * `shader` - Shared diagnostic shader containing the statistics `main` entry point.
/// * `plan` - Diagnostic plan providing the entry id used in debug labels.
///
/// # Returns
///
/// The narrow statistics bind-group layout, its pipeline layout, and the
/// `main` compute pipeline. No buffers or bind groups are created.
pub(crate) fn create_statistics_pipeline(
    device: &GpuDevice,
    shader: &DiagnosticShader,
    plan: &DiagnosticPlan,
) -> StatisticsPipelineResources {
    let entry_id = &plan.entry_id;
    let bind_group_layout = create_stats_bind_group_layout(device, entry_id);
    let pipeline_layout = create_pipeline_layout(
        device,
        format!("component-gpu stats pipeline layout {entry_id}"),
        &bind_group_layout,
    );
    let pipeline = create_compute_pipeline(
        device,
        format!("component-gpu per-component stats pipeline {entry_id}"),
        &shader.module,
        &pipeline_layout,
        "main",
    );

    StatisticsPipelineResources {
        pipeline,
        bind_group_layout,
        pipeline_layout,
    }
}

/// Create only the border-lane pipeline resources.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used for layout and pipeline creation.
/// * `shader` - Shared diagnostic shader containing `trace_borders`.
/// * `plan` - Diagnostic plan providing the entry id used in debug labels.
///
/// # Returns
///
/// The narrow border bind-group layout, its pipeline layout, and the
/// `trace_borders` compute pipeline. No buffers or bind groups are created.
pub(crate) fn create_border_pipeline(
    device: &GpuDevice,
    shader: &DiagnosticShader,
    plan: &DiagnosticPlan,
) -> BorderPipelineResources {
    let entry_id = &plan.entry_id;
    let bind_group_layout = create_border_trace_bind_group_layout(device, entry_id);
    let pipeline_layout = create_pipeline_layout(
        device,
        format!("component-gpu border trace pipeline layout {entry_id}"),
        &bind_group_layout,
    );
    let pipeline = create_compute_pipeline(
        device,
        format!("component-gpu border trace pipeline {entry_id}"),
        &shader.module,
        &pipeline_layout,
        "trace_borders",
    );

    BorderPipelineResources {
        pipeline,
        bind_group_layout,
        pipeline_layout,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_wgsl_binding(binding: u32, expected_variable: &str) {
        let prefix = format!("@group(0) @binding({binding}) ");
        let mut declarations = REFERENCE_DIAGNOSTICS_SHADER
            .lines()
            .filter(|line| line.starts_with(&prefix));
        let declaration = declarations
            .next()
            .unwrap_or_else(|| panic!("missing WGSL declaration for binding {binding}"));

        assert!(
            declaration.contains(expected_variable),
            "binding {binding} declares `{declaration}`, expected `{expected_variable}`"
        );
        assert!(
            declarations.next().is_none(),
            "binding {binding} has more than one WGSL declaration"
        );
    }

    #[test]
    fn rust_binding_constants_match_wgsl_declarations() {
        let expected = [
            (CAPTURED_TEXTURE_BINDING, "var captured:"),
            (COMPONENT_REFERENCE_BINDING, "var<storage, read> truth:"),
            (
                STATISTICS_OUTPUT_BINDING,
                "var<storage, read_write> summaries:",
            ),
            (VISUAL_OUTPUT_BINDING, "var<storage, read_write> visuals:"),
            (
                BORDER_TRACE_OUTPUT_BINDING,
                "var<storage, read_write> border_traces:",
            ),
            (
                VISUAL_INDIRECT_DRAW_BINDING,
                "var<storage, read_write> visual_draw_args:",
            ),
            (
                BORDER_TRACE_INDIRECT_DRAW_BINDING,
                "var<storage, read_write> border_trace_draw_args:",
            ),
        ];
        let declaration_count = REFERENCE_DIAGNOSTICS_SHADER
            .lines()
            .filter(|line| {
                let line = line.trim_start();
                line.starts_with("@group(") && line.contains(" @binding(")
            })
            .count();

        assert_eq!(
            declaration_count,
            expected.len(),
            "WGSL and Rust expose different diagnostic binding sets"
        );
        for (binding, variable) in expected {
            assert_wgsl_binding(binding, variable);
        }
    }
}
