//! Generated-analyzer-type-free planning for reference-guided diagnostics.

use super::layout::{
    BORDER_TRACE_WORKGROUP_SIZE_X, STATISTICS_WORKGROUP_SIZE_X, STATISTICS_WORKGROUP_SIZE_Y,
    SUMMARY_NODE_STRIDE_BYTES, VISUAL_INIT_WORKGROUP_SIZE_X,
};

/// Compute the exact compact-summary byte length for a reference count.
///
/// # Arguments
///
/// * `node_count` - Number of reference records written by the statistics lane.
///
/// # Returns
///
/// Three `u32` summary words per reference, expressed as a `u64` WebGPU buffer
/// size.
fn summary_byte_length(node_count: u32) -> u64 {
    u64::from(node_count) * u64::from(SUMMARY_NODE_STRIDE_BYTES)
}

/// Dimensions and dispatch grids needed by reference-guided diagnostics.
///
/// Callers construct it only from captured-texture dimensions and reference
/// facts before diagnostic preparation or recording; discovery facts never
/// enter it.
pub(crate) struct DiagnosticPlan {
    /// Entry id used only for browser WebGPU debug labels.
    pub(crate) entry_id: String,
    /// Number of valid reference records in the truth buffer.
    pub(crate) node_count: u32,
    /// Workgroups for the visual-record initialization dispatch.
    pub(crate) visual_workgroups_x: u32,
    /// X workgroups for the per-texel statistics dispatch.
    pub(crate) statistics_workgroups_x: u32,
    /// Y workgroups for the per-texel statistics dispatch.
    pub(crate) statistics_workgroups_y: u32,
    /// Workgroups for the reference-guided border-trace dispatch.
    pub(crate) border_workgroups_x: u32,
    /// Exact byte length of the compact per-reference statistics output.
    pub(crate) summary_byte_length: u64,
}

/// Compute an integer ceiling division for Rust-owned dispatch dimensions.
///
/// # Arguments
///
/// * `value` - Number of items or texels the dispatch must cover.
/// * `divisor` - Positive number covered by one workgroup dimension.
///
/// # Returns
///
/// Number of workgroups required to cover `value`.
fn ceil_div(value: u32, divisor: u32) -> u32 {
    value.div_ceil(divisor)
}

impl DiagnosticPlan {
    /// Build a diagnostic-only plan from captured-texture and reference facts.
    ///
    /// # Arguments
    ///
    /// * `entry_id` - Stable entry id used only in WebGPU debug labels.
    /// * `texture_width` - Captured-texture width used to size statistics work.
    /// * `texture_height` - Captured-texture height used to size statistics work.
    /// * `node_count` - Number of valid reference records used by all
    ///   reference-guided lanes and compact-summary sizing.
    ///
    /// # Returns
    ///
    /// A generated-analyzer-type-free plan containing only diagnostic dispatch
    /// grids, reference count, debug identity, and exact summary byte length.
    pub(crate) fn new(
        entry_id: String,
        texture_width: u32,
        texture_height: u32,
        node_count: u32,
    ) -> Self {
        Self {
            entry_id,
            node_count,
            visual_workgroups_x: ceil_div(node_count, VISUAL_INIT_WORKGROUP_SIZE_X),
            statistics_workgroups_x: ceil_div(texture_width, STATISTICS_WORKGROUP_SIZE_X),
            statistics_workgroups_y: ceil_div(texture_height, STATISTICS_WORKGROUP_SIZE_Y),
            border_workgroups_x: ceil_div(node_count, BORDER_TRACE_WORKGROUP_SIZE_X),
            summary_byte_length: summary_byte_length(node_count),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_preserves_compatibility_dispatch_and_summary_math() {
        let plan = DiagnosticPlan::new("fixture".to_string(), 200, 100, 6);

        assert_eq!(plan.visual_workgroups_x, 1);
        assert_eq!(
            (plan.statistics_workgroups_x, plan.statistics_workgroups_y),
            (25, 13)
        );
        assert_eq!(plan.border_workgroups_x, 1);
        assert_eq!(plan.summary_byte_length, 72);
    }

    #[test]
    fn plan_rounds_each_diagnostic_grid_independently() {
        let plan = DiagnosticPlan::new("partial".to_string(), 9, 17, 65);

        assert_eq!(plan.visual_workgroups_x, 2);
        assert_eq!(
            (plan.statistics_workgroups_x, plan.statistics_workgroups_y),
            (2, 3)
        );
        assert_eq!(plan.border_workgroups_x, 2);
        assert_eq!(plan.summary_byte_length, 780);
    }
}
