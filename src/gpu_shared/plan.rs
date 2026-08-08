//! Compatibility projection between generated analyzer records and core plans.

use crate::wit::generated::millipede::inspector::host_gpu::AnalysisDispatch;
#[cfg(any(test, feature = "gpu-analysis", feature = "gpu-analysis-frame"))]
use crate::wit::generated::millipede::inspector::host_gpu::{AnalysisKernel, AnalysisPlan};

use crate::edge_discovery::DiscoveryPlan;
#[cfg(any(test, feature = "gpu-analysis", feature = "gpu-analysis-frame"))]
use crate::edge_discovery::layout::{EDGE_DISCOVERY_THRESHOLD_MILLI, EDGE_DISCOVERY_TILE_SIZE};
use crate::reference_diagnostics::DiagnosticPlan;
#[cfg(any(test, feature = "gpu-analysis", feature = "gpu-analysis-frame"))]
use crate::reference_diagnostics::{
    STATISTICS_WORKGROUP_SIZE_X, STATISTICS_WORKGROUP_SIZE_Y, SUMMARY_NODE_STRIDE_BYTES,
    SUMMARY_WORDS_PER_NODE,
};

/// Project generated request facts into the diagnostic-core plan.
///
/// # Arguments
///
/// * `request` - Validated compatibility request supplying only the fields
///   documented by `DiagnosticPlan::new`.
///
/// # Returns
///
/// A generated-analyzer-type-free diagnostic plan whose constructor remains
/// the sole owner of diagnostic dispatch and compact-summary arithmetic.
pub(crate) fn project_diagnostic_plan(request: &AnalysisDispatch) -> DiagnosticPlan {
    DiagnosticPlan::new(
        request.entry_id.clone(),
        request.texture_width,
        request.texture_height,
        request.node_count,
    )
}

/// Project generated request facts into the discovery-core plan.
///
/// # Arguments
///
/// * `request` - Validated compatibility request supplying only entry identity
///   and captured-texture dimensions to discovery.
///
/// # Returns
///
/// A generated-analyzer-type-free discovery plan whose constructor remains
/// the sole owner of discovery grid and output-capacity arithmetic.
pub(crate) fn project_discovery_plan(request: &AnalysisDispatch) -> DiscoveryPlan {
    DiscoveryPlan::new(
        request.entry_id.clone(),
        request.texture_width,
        request.texture_height,
    )
}

/// Project independent core facts into the public compatibility record.
///
/// # Arguments
///
/// * `request` - Generated request retained as public result metadata.
/// * `diagnostic_plan` - Diagnostic plan built from this same request.
/// * `discovery_plan` - Discovery plan built from this same request.
///
/// # Returns
///
/// The unchanged generated `AnalysisPlan`, published by stable/shared-frame and
/// read for compatibility logging. It never drives resource preparation or
/// command recording, and no dispatch or buffer size is recomputed here. Debug
/// builds verify the request facts retained directly by each projected plan:
/// diagnostic identity and reference count, plus discovery identity and
/// captured-texture dimensions.
#[cfg(any(test, feature = "gpu-analysis", feature = "gpu-analysis-frame"))]
pub(crate) fn build_compatibility_metadata(
    request: AnalysisDispatch,
    diagnostic_plan: &DiagnosticPlan,
    discovery_plan: &DiscoveryPlan,
) -> AnalysisPlan {
    debug_assert_eq!(&diagnostic_plan.entry_id, &request.entry_id);
    debug_assert_eq!(diagnostic_plan.node_count, request.node_count);
    debug_assert_eq!(&discovery_plan.entry_id, &request.entry_id);
    debug_assert_eq!(discovery_plan.texture_width, request.texture_width);
    debug_assert_eq!(discovery_plan.texture_height, request.texture_height);

    AnalysisPlan {
        dispatch_workgroups_x: diagnostic_plan.statistics_workgroups_x,
        dispatch_workgroups_y: diagnostic_plan.statistics_workgroups_y,
        kernel: AnalysisKernel::PerComponentStatsV1,
        request,
        summary_node_stride_bytes: SUMMARY_NODE_STRIDE_BYTES,
        summary_words_per_node: SUMMARY_WORDS_PER_NODE,
        workgroup_size_x: STATISTICS_WORKGROUP_SIZE_X,
        workgroup_size_y: STATISTICS_WORKGROUP_SIZE_Y,
        edge_discovery_tile_size: EDGE_DISCOVERY_TILE_SIZE,
        edge_discovery_threshold_milli: EDGE_DISCOVERY_THRESHOLD_MILLI,
        edge_discovery_slot_capacity: discovery_plan.slot_capacity,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_INSPECTOR_ENTRY_ID: &str = "plan-test-entry";
    const TEST_COMPONENT_DISPLAY_NAME: &str = "PlanTestComponent";

    /// Build the smallest valid request accepted by both workload planners.
    ///
    /// Arithmetic boundaries belong to the individual plan modules. This
    /// fixture keeps the compatibility test focused on field projection and
    /// composition rather than repeating their workgroup calculations.
    fn minimal_compatibility_request() -> AnalysisDispatch {
        AnalysisDispatch {
            entry_id: TEST_INSPECTOR_ENTRY_ID.to_string(),
            display_name: TEST_COMPONENT_DISPLAY_NAME.to_string(),
            texture_width: 1,
            texture_height: 1,
            node_count: 1,
        }
    }

    #[test]
    fn compatibility_projection_connects_independent_plans() {
        let request = minimal_compatibility_request();
        let diagnostic_plan = project_diagnostic_plan(&request);
        let discovery_plan = project_discovery_plan(&request);

        // Each projected core plan retains only its own facts. In particular,
        // discovery has no reference-count field and diagnostics retains no
        // generated request record.
        assert_eq!(diagnostic_plan.entry_id, request.entry_id);
        assert_eq!(diagnostic_plan.node_count, request.node_count);
        assert_eq!(discovery_plan.entry_id, request.entry_id);
        assert_eq!(
            (discovery_plan.texture_width, discovery_plan.texture_height),
            (request.texture_width, request.texture_height)
        );

        let compatibility_plan =
            build_compatibility_metadata(request, &diagnostic_plan, &discovery_plan);

        // Composition publishes the unchanged generated request, while every
        // derived value is copied from the plan that owns its arithmetic.
        assert_eq!(compatibility_plan.request.entry_id, TEST_INSPECTOR_ENTRY_ID);
        assert_eq!(
            compatibility_plan.request.display_name,
            TEST_COMPONENT_DISPLAY_NAME
        );
        assert_eq!(
            (
                compatibility_plan.request.texture_width,
                compatibility_plan.request.texture_height,
                compatibility_plan.request.node_count,
            ),
            (1, 1, 1)
        );
        assert_eq!(
            (
                compatibility_plan.dispatch_workgroups_x,
                compatibility_plan.dispatch_workgroups_y,
            ),
            (
                diagnostic_plan.statistics_workgroups_x,
                diagnostic_plan.statistics_workgroups_y,
            )
        );
        assert_eq!(
            compatibility_plan.edge_discovery_slot_capacity,
            discovery_plan.slot_capacity
        );
        assert_eq!(
            diagnostic_plan.summary_byte_length,
            u64::from(compatibility_plan.request.node_count)
                * u64::from(compatibility_plan.summary_node_stride_bytes)
        );
    }
}
