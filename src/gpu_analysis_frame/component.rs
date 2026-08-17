//! Implementation of the WIT `gpu-analysis-frame` export.

use super::bindings::{
    AnalysisDispatch, AnalysisFrameSummary, EncodeOutcome, EncodedAnalysisFrame,
    GpuAnalysisFrameGuest, GpuBuffer, GpuCommandEncoder, GpuDevice, GpuTexture, Level, log,
};
use crate::gpu_shared::{
    build_compatibility_metadata, create_analysis_border_trace_output,
    create_analysis_visual_output, create_edge_discovery_output, encode_compatibility_dispatch,
    project_diagnostic_plan, project_discovery_plan, validate_analysis_preflight,
};
use crate::shared::Component;
use crate::shared::runtime::install_panic_hook;

impl GpuAnalysisFrameGuest for Component {
    /// Append analyzer compute work to the browser scheduler's encoder.
    fn encode(
        encoder: &GpuCommandEncoder,
        device: &GpuDevice,
        texture: &GpuTexture,
        truth_buffer: &GpuBuffer,
        request: AnalysisDispatch,
    ) -> EncodeOutcome {
        install_panic_hook();

        if let Err(error) = validate_analysis_preflight(texture, truth_buffer, &request) {
            log(
                Level::Warn,
                &format!(
                    "[component-gpu-frame] preflight validation failed: {}",
                    error.message
                ),
            );
            return EncodeOutcome::ValidationError(error);
        }

        let diagnostic_plan = project_diagnostic_plan(&request);
        let discovery_plan = project_discovery_plan(&request);
        let compatibility_plan =
            build_compatibility_metadata(request, &diagnostic_plan, &discovery_plan);
        let compatibility_request = &compatibility_plan.request;
        log(
            Level::Info,
            &format!(
                "[component-gpu-frame] encoding <{}>: {} nodes over {}×{} texels, {}×{} workgroups",
                compatibility_request.display_name,
                compatibility_request.node_count,
                compatibility_request.texture_width,
                compatibility_request.texture_height,
                compatibility_plan.dispatch_workgroups_x,
                compatibility_plan.dispatch_workgroups_y
            ),
        );

        // CRITICAL SCHEDULER-OWNERSHIP INVARIANT:
        //
        // 1. `encoder` was created by the browser frame scheduler.
        // 2. Borrowing prevents Rust from retaining the encoder after this call;
        //    it does not remove state-changing methods. The generated API can
        //    still expose `finish()`, and `device` can still expose its queue.
        // 3. This component must only append analysis commands and return. The
        //    browser remains the sole owner of the later render pass, `finish()`,
        //    and `queue.submit()`.
        // 4. Returned handles may be bound by a render pass appended to this
        //    encoder. Their contents are produced only when the scheduler
        //    submits and the GPU executes the recorded work.
        //
        // The scheduler-owned encoder proof in
        // `tests/component-boundary/integration/gpu-shared-frame.integration.test.ts`
        // guards this contract by asserting that this call performs no finish
        // or submit.
        let (mut diagnostics, discovery_resources) = encode_compatibility_dispatch(
            encoder,
            device,
            texture,
            truth_buffer,
            &diagnostic_plan,
            &discovery_plan,
        );

        let (summary_staging, summary_byte_length) = diagnostics.take_summary_staging();
        let summary = AnalysisFrameSummary {
            plan: compatibility_plan,
            staging_buffer: summary_staging,
            byte_length: summary_byte_length,
        };
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

        EncodeOutcome::Success(EncodedAnalysisFrame {
            summary,
            visual,
            border_trace,
            edge_discovery,
        })
    }
}
