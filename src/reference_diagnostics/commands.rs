//! Lane-selective preparation and recording for reference-guided diagnostics.

use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBindGroup, GpuBindGroupLayout, GpuBuffer, GpuComputePassEncoder, GpuComputePipeline,
    GpuDevice, GpuPipelineLayout, GpuTexture,
};

use super::bind_groups::{
    create_border_bind_group, create_statistics_bind_group, create_visual_bind_group,
};
use super::buffers::{
    BorderResources, StatisticsOutputResources, VisualResources, create_border_resources,
    create_statistics_output_resources, create_visual_resources,
};
use super::pipelines::{
    BorderPipelineResources, DiagnosticShader, StatisticsPipelineResources,
    VisualPipelineResources, create_border_pipeline, create_diagnostic_shader,
    create_statistics_pipeline, create_visual_pipeline,
};
use super::plan::DiagnosticPlan;
use super::readback::{SummaryReadbackResources, prepare_summary_readback};
use super::{DiagnosticResourceSelection, StatisticsSelection};

/// Prepared resources owned only by the visual diagnostic lane.
pub(crate) struct VisualDispatchResources {
    /// Renderer-facing buffers until one variant transfers them to its result.
    /// The pipeline and bind group remain owned by this lane after that transfer.
    output: Option<VisualResources>,
    /// Visual compute pipeline owned until the enclosing dispatch resources
    /// reach their variant-specific drop boundary.
    pipeline: GpuComputePipeline,
    /// Visual bind group owned until the enclosing dispatch resources reach
    /// their variant-specific drop boundary.
    bind_group: GpuBindGroup,
}

/// Prepared resources owned only by the statistics diagnostic lane.
pub(crate) struct StatisticsDispatchResources {
    /// GPU statistics output with three distinct phases:
    ///
    /// 1. Writable storage bound to the statistics `main` dispatch.
    /// 2. Source of the optional post-pass copy into separate readback staging.
    /// 3. Lane-owned resource until the enclosing dispatch resources reach
    ///    their variant-specific drop boundary.
    pub(crate) output: StatisticsOutputResources,
    /// Statistics compute pipeline owned until the enclosing dispatch resources
    /// reach their variant-specific drop boundary.
    pipeline: GpuComputePipeline,
    /// Statistics bind group owned until the enclosing dispatch resources reach
    /// their variant-specific drop boundary.
    bind_group: GpuBindGroup,
}

/// Prepared resources owned only by the border diagnostic lane.
pub(crate) struct BorderDispatchResources {
    /// Renderer-facing buffers until one variant transfers them to its result.
    /// The pipeline and bind group remain owned by this lane after that transfer.
    output: Option<BorderResources>,
    /// Border compute pipeline owned until the enclosing dispatch resources
    /// reach their variant-specific drop boundary.
    pipeline: GpuComputePipeline,
    /// Border bind group owned until the enclosing dispatch resources reach
    /// their variant-specific drop boundary.
    bind_group: GpuBindGroup,
}

/// Compatibility-sensitive ownership of shader and layout Rust/WIT wrappers.
///
/// 1. Bind-group layouts precede the shared shader and pipeline layouts follow
///    it so the compiled component keeps the baseline WebGPU resource-declaration
///    order.
/// 2. Moving these wrappers into the returned aggregate delays their generated
///    resource drops; it does not prove that the corresponding native browser
///    WebGPU objects require the same lifetime.
/// 3. H1—the component-resource lifetime, destruction, and reuse
///    investigation—must establish the necessary wrapper and native-object
///    boundaries before any of these compatibility guards are removed.
/// 4. Relative wrapper drop order at final scope teardown may differ from the
///    baseline and is not evidence of native GPU lifetime.
/// 5. Do not regroup these fields by lane without repeating the byte-for-byte
///    compiled-WIT comparison.
struct DiagnosticShaderLayoutRetention {
    /// Visual bind-group-layout wrapper used to create the visual pipeline
    /// layout and bind group.
    ///
    /// Retained to preserve baseline wrapper scope; `None` means the visual
    /// lane was not selected.
    _visual_bind_group_layout: Option<GpuBindGroupLayout>,
    /// Statistics bind-group-layout wrapper used to create the statistics
    /// pipeline layout and bind group.
    ///
    /// Retained to preserve baseline wrapper scope; `None` means the statistics
    /// lane was not selected.
    _statistics_bind_group_layout: Option<GpuBindGroupLayout>,
    /// Border bind-group-layout wrapper used to create the border pipeline
    /// layout and bind group.
    ///
    /// Retained to preserve baseline wrapper scope; `None` means the border
    /// lane was not selected.
    _border_bind_group_layout: Option<GpuBindGroupLayout>,
    /// Shared shader-module wrapper used to create every selected diagnostic
    /// compute pipeline.
    ///
    /// Retained after pipeline creation to preserve baseline wrapper scope.
    _shader: DiagnosticShader,
    /// Visual pipeline-layout wrapper used to create the visual compute pipeline.
    ///
    /// Retained to preserve baseline wrapper scope; `None` means the visual
    /// lane was not selected.
    _visual_pipeline_layout: Option<GpuPipelineLayout>,
    /// Statistics pipeline-layout wrapper used to create the statistics compute
    /// pipeline.
    ///
    /// Retained to preserve baseline wrapper scope; `None` means the statistics
    /// lane was not selected.
    _statistics_pipeline_layout: Option<GpuPipelineLayout>,
    /// Border pipeline-layout wrapper used to create the border compute pipeline.
    ///
    /// Retained to preserve baseline wrapper scope; `None` means the border
    /// lane was not selected.
    _border_pipeline_layout: Option<GpuPipelineLayout>,
}

/// Lane-selective resources for one reference-guided diagnostic operation.
///
/// # Rust/WIT wrapper lifetime by variant
///
/// 1. Stable retains this aggregate through component submission and diagnostic
///    output extraction, then drops its non-transferred wrappers before the
///    export returns.
/// 2. Async retains it through submission, queue-completion waiting, summary
///    mapping and decoding, and diagnostic output extraction, then drops its
///    non-transferred wrappers before the export returns.
/// 3. Shared-frame retains it through recording and output extraction only.
///    Non-transferred wrappers drop when the export returns, before the browser
///    scheduler later finishes and submits its borrowed encoder.
pub(crate) struct DiagnosticDispatchResources {
    /// Compatibility owner for shared shader and selected layout wrappers.
    ///
    /// Its type documents why wrapper retention does not itself establish a
    /// native WebGPU execution-lifetime requirement.
    _shader_layout_retention: DiagnosticShaderLayoutRetention,
    /// Optional visual lane.
    pub(crate) visual: Option<VisualDispatchResources>,
    /// Optional GPU statistics lane.
    pub(crate) statistics: Option<StatisticsDispatchResources>,
    /// Optional border lane.
    pub(crate) border: Option<BorderDispatchResources>,
    /// Optional CPU-readable staging and exact copy length.
    pub(crate) summary_readback: Option<SummaryReadbackResources>,
}

impl DiagnosticDispatchResources {
    /// Transfer the visual output while retaining its pipeline and bind group.
    ///
    /// # Returns
    ///
    /// The exact visual and indirect buffers bound during command recording.
    ///
    /// # Panics
    ///
    /// Panics if compatibility preparation omitted the visual lane or the output
    /// was already transferred.
    pub(crate) fn take_visual_output(&mut self) -> VisualResources {
        self.visual
            .as_mut()
            .expect("compatibility diagnostics omitted the visual lane")
            .output
            .take()
            .expect("diagnostic visual output was already transferred")
    }

    /// Transfer the border output while retaining its pipeline and bind group.
    ///
    /// # Returns
    ///
    /// The exact border and indirect buffers bound during command recording.
    ///
    /// # Panics
    ///
    /// Panics if compatibility preparation omitted the border lane or the output
    /// was already transferred.
    pub(crate) fn take_border_output(&mut self) -> BorderResources {
        self.border
            .as_mut()
            .expect("compatibility diagnostics omitted the border lane")
            .output
            .take()
            .expect("diagnostic border output was already transferred")
    }

    /// Borrow compact-summary staging for variant-specific async mapping.
    ///
    /// # Returns
    ///
    /// The exact staging buffer targeted by the encoded summary copy and its
    /// copied byte length.
    ///
    /// # Panics
    ///
    /// Panics if compatibility preparation omitted CPU-readable summary staging.
    #[cfg(feature = "gpu-analysis-async")]
    pub(crate) fn summary_staging(&self) -> (&GpuBuffer, u64) {
        let readback = self
            .summary_readback
            .as_ref()
            .expect("compatibility diagnostics omitted summary readback");
        (readback.staging_buffer(), readback.byte_length)
    }

    /// Transfer compact-summary staging while retaining command resources.
    ///
    /// # Returns
    ///
    /// The exact staging buffer targeted by the encoded summary copy and its
    /// copied byte length.
    ///
    /// # Panics
    ///
    /// Panics if compatibility preparation omitted staging or it was already
    /// transferred.
    #[cfg(any(feature = "gpu-analysis", feature = "gpu-analysis-frame"))]
    pub(crate) fn take_summary_staging(&mut self) -> (GpuBuffer, u64) {
        let readback = self
            .summary_readback
            .as_mut()
            .expect("compatibility diagnostics omitted summary readback");
        let byte_length = readback.byte_length;
        (readback.take_staging_buffer(), byte_length)
    }
}

/// Bind and assemble one already-allocated visual lane.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used to create the bind group.
/// * `pipeline_resources` - Visual pipeline plus its two layout wrappers.
/// * `output` - Visual records and indirect arguments allocated earlier.
/// * `truth_buffer` - Component-reference input bound only to this lane.
/// * `entry_id` - Entry id used only for the bind-group debug label.
///
/// # Returns
///
/// Dispatch resources plus the bind-group and pipeline layouts that the outer
/// aggregate retains in compatibility-sensitive order.
fn assemble_visual_lane(
    device: &GpuDevice,
    pipeline_resources: VisualPipelineResources,
    output: VisualResources,
    truth_buffer: &GpuBuffer,
    entry_id: &str,
) -> (
    VisualDispatchResources,
    GpuBindGroupLayout,
    GpuPipelineLayout,
) {
    let bind_group =
        create_visual_bind_group(device, &pipeline_resources, &output, truth_buffer, entry_id);
    let VisualPipelineResources {
        pipeline,
        bind_group_layout,
        pipeline_layout,
    } = pipeline_resources;

    (
        VisualDispatchResources {
            output: Some(output),
            pipeline,
            bind_group,
        },
        bind_group_layout,
        pipeline_layout,
    )
}

/// Bind and assemble one already-allocated statistics lane.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used to create the bind group.
/// * `pipeline_resources` - Statistics pipeline plus its two layout wrappers.
/// * `output` - GPU statistics output allocated earlier.
/// * `texture` - Captured-pixel input bound only to selected pixel-reading lanes.
/// * `truth_buffer` - Component-reference input bound to the statistics lane.
/// * `entry_id` - Entry id used only for the bind-group debug label.
///
/// # Returns
///
/// Dispatch resources plus the bind-group and pipeline layouts that the outer
/// aggregate retains in compatibility-sensitive order.
fn assemble_statistics_lane(
    device: &GpuDevice,
    pipeline_resources: StatisticsPipelineResources,
    output: StatisticsOutputResources,
    texture: &GpuTexture,
    truth_buffer: &GpuBuffer,
    entry_id: &str,
) -> (
    StatisticsDispatchResources,
    GpuBindGroupLayout,
    GpuPipelineLayout,
) {
    let bind_group = create_statistics_bind_group(
        device,
        &pipeline_resources,
        &output,
        texture,
        truth_buffer,
        entry_id,
    );
    let StatisticsPipelineResources {
        pipeline,
        bind_group_layout,
        pipeline_layout,
    } = pipeline_resources;

    (
        StatisticsDispatchResources {
            output,
            pipeline,
            bind_group,
        },
        bind_group_layout,
        pipeline_layout,
    )
}

/// Bind and assemble one already-allocated border lane.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used to create the bind group.
/// * `pipeline_resources` - Border pipeline plus its two layout wrappers.
/// * `output` - Border records and indirect arguments allocated earlier.
/// * `texture` - Captured-pixel input bound only to selected pixel-reading lanes.
/// * `truth_buffer` - Component-reference input bound to the border lane.
/// * `entry_id` - Entry id used only for the bind-group debug label.
///
/// # Returns
///
/// Dispatch resources plus the bind-group and pipeline layouts that the outer
/// aggregate retains in compatibility-sensitive order.
fn assemble_border_lane(
    device: &GpuDevice,
    pipeline_resources: BorderPipelineResources,
    output: BorderResources,
    texture: &GpuTexture,
    truth_buffer: &GpuBuffer,
    entry_id: &str,
) -> (
    BorderDispatchResources,
    GpuBindGroupLayout,
    GpuPipelineLayout,
) {
    let bind_group = create_border_bind_group(
        device,
        &pipeline_resources,
        &output,
        texture,
        truth_buffer,
        entry_id,
    );
    let BorderPipelineResources {
        pipeline,
        bind_group_layout,
        pipeline_layout,
    } = pipeline_resources;

    (
        BorderDispatchResources {
            output: Some(output),
            pipeline,
            bind_group,
        },
        bind_group_layout,
        pipeline_layout,
    )
}

/// Prepare exactly the diagnostic lanes selected by the caller.
///
/// This remains the single cross-lane preparation orchestrator:
///
/// 1. Every selected lane shares one diagnostic shader.
/// 2. Typed selection determines the complete resource set before bind groups
///    are assembled.
/// 3. The deliberate preparation order remains inspectable as one sequence
///    instead of being distributed across lane callers.
/// 4. The three `assemble_*_lane` helpers isolate lane-local bind-group creation
///    and handle assembly; this function contains only selection and cross-lane
///    sequencing.
///
/// Within that boundary, preparation:
///
/// 1. Create one shared diagnostic shader.
/// 2. Create selected pipelines in visual, statistics, then border lane order.
/// 3. Allocate selected buffers in statistics, staging, visual, then border
///    order; staging exists only for `CpuReadable` statistics.
/// 4. Create selected bind groups in visual, statistics, then border order.
/// 5. Keep visual, statistics, border, and readback resources as distinct
///    ownership groups.
/// 6. Retain all selected shader and layout wrappers through the returned
///    dispatch-resource aggregate.
/// 7. Record no pass, dispatch, copy, queue operation, mapping, or submission.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used for selected allocations.
/// * `texture` - Captured-pixel input used only by selected statistics and
///   border lanes.
/// * `truth_buffer` - Component-reference input used by every selected lane.
/// * `plan` - Generated-type-free dimensions, workgroup grids, sizes, and label.
/// * `selection` - Typed lane/readback choice; readback without statistics is
///   unrepresentable.
///
/// # Returns
///
/// Selected lane resources ready to record into a caller-owned compute pass,
/// plus optional readback staging. No GPU work has been encoded yet.
pub(crate) fn prepare_selected_diagnostic_lanes(
    device: &GpuDevice,
    texture: &GpuTexture,
    truth_buffer: &GpuBuffer,
    plan: &DiagnosticPlan,
    selection: DiagnosticResourceSelection,
) -> DiagnosticDispatchResources {
    let shader = create_diagnostic_shader(device, plan);

    // Preserve selected-lane order while allowing independent operations to
    // omit unselected pipelines. The baseline grouped WebGPU object creation
    // differently. R2-A preserves selected resources and command behavior; it
    // does not claim identical native WebGPU object-creation order.
    let visual_pipeline = selection
        .includes_visual()
        .then(|| create_visual_pipeline(device, &shader, plan));
    let statistics_pipeline = match selection.statistics() {
        StatisticsSelection::Omitted => None,
        StatisticsSelection::GpuOnly | StatisticsSelection::CpuReadable => {
            Some(create_statistics_pipeline(device, &shader, plan))
        }
    };
    let border_pipeline = selection
        .includes_border()
        .then(|| create_border_pipeline(device, &shader, plan));

    // Keep statistics output and optional readback distinct. Compatibility
    // allocation order remains statistics, staging, visual, then border.
    let statistics_output = statistics_pipeline
        .as_ref()
        .map(|_| create_statistics_output_resources(device, plan));
    let summary_readback = match selection.statistics() {
        StatisticsSelection::CpuReadable => Some(prepare_summary_readback(device, plan)),
        StatisticsSelection::Omitted | StatisticsSelection::GpuOnly => None,
    };
    let visual_output = visual_pipeline
        .as_ref()
        .map(|_| create_visual_resources(device, plan));
    let border_output = border_pipeline
        .as_ref()
        .map(|_| create_border_resources(device, plan));

    // Create bind groups only after all selected buffers exist. Concrete lane
    // assemblers keep binding details out of this ordering-sensitive function.
    let (visual, visual_bind_group_layout, visual_pipeline_layout) =
        match visual_pipeline.zip(visual_output) {
            Some((pipeline_resources, output)) => {
                let (resources, bind_group_layout, pipeline_layout) = assemble_visual_lane(
                    device,
                    pipeline_resources,
                    output,
                    truth_buffer,
                    &plan.entry_id,
                );
                (
                    Some(resources),
                    Some(bind_group_layout),
                    Some(pipeline_layout),
                )
            }
            None => (None, None, None),
        };
    let (statistics, statistics_bind_group_layout, statistics_pipeline_layout) =
        match statistics_pipeline.zip(statistics_output) {
            Some((pipeline_resources, output)) => {
                let (resources, bind_group_layout, pipeline_layout) = assemble_statistics_lane(
                    device,
                    pipeline_resources,
                    output,
                    texture,
                    truth_buffer,
                    &plan.entry_id,
                );
                (
                    Some(resources),
                    Some(bind_group_layout),
                    Some(pipeline_layout),
                )
            }
            None => (None, None, None),
        };
    let (border, border_bind_group_layout, border_pipeline_layout) =
        match border_pipeline.zip(border_output) {
            Some((pipeline_resources, output)) => {
                let (resources, bind_group_layout, pipeline_layout) = assemble_border_lane(
                    device,
                    pipeline_resources,
                    output,
                    texture,
                    truth_buffer,
                    &plan.entry_id,
                );
                (
                    Some(resources),
                    Some(bind_group_layout),
                    Some(pipeline_layout),
                )
            }
            None => (None, None, None),
        };

    DiagnosticDispatchResources {
        _shader_layout_retention: DiagnosticShaderLayoutRetention {
            _visual_bind_group_layout: visual_bind_group_layout,
            _statistics_bind_group_layout: statistics_bind_group_layout,
            _border_bind_group_layout: border_bind_group_layout,
            _shader: shader,
            _visual_pipeline_layout: visual_pipeline_layout,
            _statistics_pipeline_layout: statistics_pipeline_layout,
            _border_pipeline_layout: border_pipeline_layout,
        },
        visual,
        statistics,
        border,
        summary_readback,
    }
}

/// Record the existing `init_visuals` dispatch.
///
/// # Arguments
///
/// * `pass` - Caller-owned compute pass that is already open.
/// * `resources` - Prepared visual pipeline, bind group, and retained outputs.
/// * `plan` - Diagnostic plan providing the visual workgroup count.
///
/// # Critical compute-pass ownership invariant
///
/// 1. The caller owns the already-open compute-pass lifecycle.
/// 2. This recorder binds only the visual lane's pipeline and resources.
/// 3. It records exactly one existing `init_visuals` dispatch.
/// 4. It returns with the caller's pass still open.
/// 5. It must not call `end()`.
/// 6. It must not encode the diagnostic-summary copy.
/// 7. It must not finish or submit the surrounding command encoder.
/// 8. It must not obtain the device queue.
/// 9. It must not map, unmap, decode, resolve, or publish a summary.
pub(crate) fn record_init_visuals(
    pass: &GpuComputePassEncoder,
    resources: &VisualDispatchResources,
    plan: &DiagnosticPlan,
) {
    pass.set_pipeline(&resources.pipeline);
    bind_lane_resources(
        pass,
        &resources.bind_group,
        "failed to bind component visual resources",
    );
    pass.dispatch_workgroups(plan.visual_workgroups_x, None, None);
}

/// Record the existing per-reference statistics `main` dispatch.
///
/// # Arguments
///
/// * `pass` - Caller-owned compute pass that is already open.
/// * `resources` - Prepared statistics pipeline, bind group, and GPU output.
/// * `plan` - Diagnostic plan providing the two-dimensional statistics grid.
///
/// # Critical compute-pass ownership invariant
///
/// 1. The caller owns the already-open compute-pass lifecycle.
/// 2. This recorder binds only the statistics lane's pipeline and resources.
/// 3. It records exactly one existing `main` dispatch.
/// 4. It returns with the caller's pass still open.
/// 5. It must not call `end()`.
/// 6. It must not encode the diagnostic-summary copy.
/// 7. It must not finish or submit the surrounding command encoder.
/// 8. It must not obtain the device queue.
/// 9. It must not map, unmap, decode, resolve, or publish a summary.
pub(crate) fn record_main(
    pass: &GpuComputePassEncoder,
    resources: &StatisticsDispatchResources,
    plan: &DiagnosticPlan,
) {
    pass.set_pipeline(&resources.pipeline);
    bind_lane_resources(
        pass,
        &resources.bind_group,
        "failed to bind component statistics resources",
    );
    pass.dispatch_workgroups(
        plan.statistics_workgroups_x,
        Some(plan.statistics_workgroups_y),
        None,
    );
}

/// Record the existing `trace_borders` dispatch.
///
/// # Arguments
///
/// * `pass` - Caller-owned compute pass that is already open.
/// * `resources` - Prepared border pipeline, bind group, and retained outputs.
/// * `plan` - Diagnostic plan providing the border workgroup count.
///
/// # Critical compute-pass ownership invariant
///
/// 1. The caller owns the already-open compute-pass lifecycle.
/// 2. This recorder binds only the border lane's pipeline and resources.
/// 3. It records exactly one existing `trace_borders` dispatch.
/// 4. It returns with the caller's pass still open.
/// 5. It must not call `end()`.
/// 6. It must not encode the diagnostic-summary copy.
/// 7. It must not finish or submit the surrounding command encoder.
/// 8. It must not obtain the device queue.
/// 9. It must not map, unmap, decode, resolve, or publish a summary.
pub(crate) fn record_trace_borders(
    pass: &GpuComputePassEncoder,
    resources: &BorderDispatchResources,
    plan: &DiagnosticPlan,
) {
    pass.set_pipeline(&resources.pipeline);
    bind_lane_resources(
        pass,
        &resources.bind_group,
        "failed to bind component border-trace resources",
    );
    pass.dispatch_workgroups(plan.border_workgroups_x, None, None);
}

/// Bind one already-selected diagnostic lane to the caller-owned pass.
fn bind_lane_resources(
    pass: &GpuComputePassEncoder,
    bind_group: &GpuBindGroup,
    failure: &'static str,
) {
    if pass
        .set_bind_group(0, Some(bind_group), None, None, None)
        .is_err()
    {
        panic!("{failure}");
    }
}
