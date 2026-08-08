//! Implementation of the WIT `gpu-analysis` export.

use super::bindings::{
    AnalysisDispatch, AnalysisDispatchResult, GpuAnalysisGuest, GpuBuffer, GpuDevice, GpuTexture,
    Level, log,
};
use crate::gpu_shared::{
    build_compatibility_metadata, create_analysis_border_trace_output,
    create_analysis_summary_readback, create_analysis_visual_output, create_edge_discovery_output,
    project_diagnostic_plan, project_discovery_plan, submit_compatibility_dispatch,
    validate_compatibility_request, validate_texture, validate_truth_buffer,
};
use crate::shared::Component;
use crate::shared::runtime::install_panic_hook;

impl GpuAnalysisGuest for Component {
    /// Record and submit the retained ten-dispatch compatibility workload.
    fn analyze(
        device: &GpuDevice,
        texture: &GpuTexture,
        truth_buffer: &GpuBuffer,
        request: AnalysisDispatch,
    ) -> AnalysisDispatchResult {
        install_panic_hook();

        if let Err(message) = validate_compatibility_request(&request) {
            log(
                Level::Error,
                &format!("[component-gpu] invalid analysis request: {message}"),
            );
            panic!("invalid GPU analysis request: {message}");
        }
        if let Err(message) =
            validate_texture(texture, request.texture_width, request.texture_height)
        {
            log(
                Level::Error,
                &format!("[component-gpu] invalid analysis texture: {message}"),
            );
            panic!("invalid GPU analysis texture: {message}");
        }
        if let Err(message) = validate_truth_buffer(truth_buffer, request.node_count) {
            log(
                Level::Error,
                &format!("[component-gpu] invalid ground-truth buffer: {message}"),
            );
            panic!("invalid GPU analysis ground-truth buffer: {message}");
        }

        let diagnostic_plan = project_diagnostic_plan(&request);
        let discovery_plan = project_discovery_plan(&request);
        let compatibility_plan =
            build_compatibility_metadata(request, &diagnostic_plan, &discovery_plan);
        let compatibility_request = &compatibility_plan.request;

        log(
            Level::Info,
            &format!(
                "[component-gpu] dispatch planned for <{}>: {} nodes over {}×{} texels, {}×{} workgroups",
                compatibility_request.display_name,
                compatibility_request.node_count,
                compatibility_request.texture_width,
                compatibility_request.texture_height,
                compatibility_plan.dispatch_workgroups_x,
                compatibility_plan.dispatch_workgroups_y
            ),
        );

        let (mut diagnostics, discovery_resources, submitted_commands) =
            submit_compatibility_dispatch(
                device,
                texture,
                truth_buffer,
                &diagnostic_plan,
                &discovery_plan,
            );

        let (summary_staging, summary_byte_length) = diagnostics.take_summary_staging();
        let summary = create_analysis_summary_readback(
            summary_staging,
            summary_byte_length,
            submitted_commands,
            compatibility_plan,
        );
        let visual_resources = diagnostics.take_visual_output();
        let visual =
            create_analysis_visual_output(visual_resources.output, visual_resources.indirect);
        let border_resources = diagnostics.take_border_output();
        let border_trace =
            create_analysis_border_trace_output(border_resources.output, border_resources.indirect);
        let edge_discovery = create_edge_discovery_output(
            discovery_resources.output.frequency_output,
            discovery_resources.output.frequency_indirect,
        );

        AnalysisDispatchResult {
            summary,
            visual,
            border_trace,
            edge_discovery,
        }
    }
}
