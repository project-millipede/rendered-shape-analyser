//! Implementation of the WIT `gpu-analysis-async` export.

use super::bindings::{
    AnalysisDispatch, AnalysisOutcome, AnalysisResult, GpuAnalysisAsyncGuest, GpuBuffer, GpuDevice,
    GpuTexture, Level, log,
};
use super::summary::read_diagnostic_summary;
use super::webgpu::{await_submitted_work, pop_validation_scope, push_validation_scope};
use crate::gpu_shared::{
    create_analysis_border_trace_output, create_analysis_visual_output,
    create_edge_discovery_output, project_diagnostic_plan, project_discovery_plan,
    submit_compatibility_dispatch, validate_analysis_preflight,
};
use crate::shared::Component;
use crate::shared::runtime::install_panic_hook;

impl GpuAnalysisAsyncGuest for Component {
    /// Record, submit, and await the retained ten-dispatch compatibility workload.
    async fn analyze(
        device: &GpuDevice,
        texture: &GpuTexture,
        truth_buffer: &GpuBuffer,
        request: AnalysisDispatch,
    ) -> AnalysisOutcome {
        install_panic_hook();

        if let Err(error) = validate_analysis_preflight(texture, truth_buffer, &request) {
            log(
                Level::Warn,
                &format!(
                    "[component-gpu-async] preflight validation failed: {}",
                    error.message
                ),
            );
            return AnalysisOutcome::ValidationError(error);
        }

        let diagnostic_plan = project_diagnostic_plan(&request);
        let discovery_plan = project_discovery_plan(&request);

        log(
            Level::Info,
            &format!(
                "[component-gpu-async] async dispatch planned for <{}>: {} nodes over {}×{} texels, {}×{} workgroups",
                request.display_name,
                request.node_count,
                request.texture_width,
                request.texture_height,
                diagnostic_plan.statistics_workgroups_x,
                diagnostic_plan.statistics_workgroups_y
            ),
        );

        push_validation_scope(device);
        // ASYNC COMMAND-BUFFER RETENTION:
        //
        // 1. Keep the submitted command-buffer resource in this async scope
        //    until queue completion and summary readback have finished.
        // 2. This binding owns the wrapper; it is not a borrowed alias.
        // 3. The leading underscore only records that Rust does not otherwise
        //    read the wrapper.
        // 4. Wrapper retention does not establish native WebGPU lifetime; that
        //    remains part of the separate H1 investigation.
        let (mut diagnostics, discovery_resources, _submitted_commands) =
            submit_compatibility_dispatch(
                device,
                texture,
                truth_buffer,
                &diagnostic_plan,
                &discovery_plan,
            );
        if let Err(message) = pop_validation_scope(device).await {
            fail(format!(
                "async GPU analysis WebGPU validation error: {message}"
            ));
        }

        await_submitted_work(device).await;
        let (summary_staging, summary_byte_length) = diagnostics.summary_staging();
        let summary = read_diagnostic_summary(summary_staging, summary_byte_length, &request)
            .await
            .unwrap_or_else(|message| fail(message));

        log(
            Level::Info,
            &format!(
                "[component-gpu-async] async dispatch completed for <{}>: {} nodes",
                request.display_name, summary.node_count
            ),
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

        AnalysisOutcome::Success(AnalysisResult {
            summary,
            visual,
            border_trace,
            edge_discovery,
        })
    }
}

/// Reject the Chrome/JSPI async export by trapping with a logged message.
///
/// 1. Keeps the async WIT surface away from `result<large-record, string>`
///    until that JSPI lowering shape is stable for this analyzer output.
/// 2. Still gives the browser caller the failed `await analyze(...)` behavior
///    required for post-allocation failures and device loss.
///
/// # Arguments
///
/// * `message` - Human-readable failure reason for host logs and the trap.
///
/// # Returns
///
/// This function does not return.
fn fail(message: String) -> ! {
    log(Level::Error, &format!("[component-gpu-async] {message}"));
    panic!("{message}");
}
