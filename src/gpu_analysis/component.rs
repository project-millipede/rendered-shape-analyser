//! Implementation of the WIT `gpu-analysis` export.

use super::bindings::{
    AnalysisDispatch, AnalysisDispatchResult, AnalysisValidationError, GpuAnalysisGuest, GpuBuffer,
    GpuDevice, GpuTexture, Level, log,
};
use crate::gpu_shared::{
    build_compatibility_metadata, create_analysis_border_trace_output,
    create_analysis_summary_readback, create_analysis_visual_output, create_edge_discovery_output,
    project_diagnostic_plan, project_discovery_plan, submit_compatibility_dispatch,
    validate_analysis_preflight,
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
    ) -> Result<AnalysisDispatchResult, AnalysisValidationError> {
        install_panic_hook();

        match validate_analysis_preflight(texture, truth_buffer, &request) {
            Ok(()) => {}
            Err(error) => return Err(error),
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

        Ok(AnalysisDispatchResult {
            summary,
            visual,
            border_trace,
            edge_discovery,
        })
    }
}
