//! Generated-analyzer-type-free reference-guided diagnostic workload.
//!
//! This module owns the current visual, per-reference statistics, border-trace,
//! and optional compact-summary-copy implementation. It intentionally uses
//! only the shared upstream `wasi:webgpu` resource vocabulary; generated
//! analyzer request and result records remain in `gpu_shared` and the three
//! variant wrappers.

mod bind_groups;
mod buffers;
mod commands;
mod layout;
mod pipelines;
mod plan;
mod readback;

pub(crate) use commands::{
    DiagnosticDispatchResources, prepare_selected_diagnostic_lanes, record_init_visuals,
    record_main, record_trace_borders,
};
pub(crate) use layout::{
    GROUND_TRUTH_HEADER_BYTES, GROUND_TRUTH_NODE_BYTES, SUMMARY_NODE_STRIDE_BYTES,
};
#[cfg(any(test, feature = "gpu-analysis", feature = "gpu-analysis-frame"))]
pub(crate) use layout::{
    STATISTICS_WORKGROUP_SIZE_X, STATISTICS_WORKGROUP_SIZE_Y, SUMMARY_WORDS_PER_NODE,
};
pub(crate) use plan::DiagnosticPlan;
pub(crate) use readback::encode_summary_copy;

/// Statistics-output and compact-summary-readback selection.
///
/// Keeping readback as a statistics mode makes a staging buffer without its
/// GPU statistics source unrepresentable.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
// Compatibility currently requests every lane, so the narrower selections are
// exercised only by unit tests until an independent caller needs them.
#[allow(dead_code)]
pub(crate) enum StatisticsSelection {
    /// Do not prepare or dispatch the statistics lane.
    Omitted,
    /// Prepare GPU statistics output without CPU-readable staging.
    GpuOnly,
    /// Prepare statistics output plus separate staging and copy resources.
    CpuReadable,
}

/// Typed resource selection for one reference-guided diagnostic operation.
///
/// This is an internal preparation choice, not a public capability or an
/// execution-family mode. The temporary compatibility caller requests every
/// lane; independent callers may select a narrow operation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct DiagnosticResourceSelection {
    visual: bool,
    statistics: StatisticsSelection,
    border: bool,
}

// Compatibility uses only `compatibility`; the other constructors keep each
// independent diagnostic operation representable and are protected below.
#[allow(dead_code)]
impl DiagnosticResourceSelection {
    /// Select only the reference-rectangle visual lane.
    pub(crate) const fn visual_overlay() -> Self {
        Self {
            visual: true,
            statistics: StatisticsSelection::Omitted,
            border: false,
        }
    }

    /// Select only the reference-guided border lane.
    pub(crate) const fn border_overlay() -> Self {
        Self {
            visual: false,
            statistics: StatisticsSelection::Omitted,
            border: true,
        }
    }

    /// Select GPU statistics output without CPU-readable staging.
    pub(crate) const fn statistics_without_readback() -> Self {
        Self {
            visual: false,
            statistics: StatisticsSelection::GpuOnly,
            border: false,
        }
    }

    /// Select statistics output plus compact CPU-readable summary staging.
    pub(crate) const fn cpu_readable_summary() -> Self {
        Self {
            visual: false,
            statistics: StatisticsSelection::CpuReadable,
            border: false,
        }
    }

    /// Select every current diagnostic lane for mixed compatibility execution.
    pub(crate) const fn compatibility() -> Self {
        Self {
            visual: true,
            statistics: StatisticsSelection::CpuReadable,
            border: true,
        }
    }

    /// Whether visual-lane resources are required.
    pub(crate) const fn includes_visual(self) -> bool {
        self.visual
    }

    /// Which statistics and readback resources are required.
    pub(crate) const fn statistics(self) -> StatisticsSelection {
        self.statistics
    }

    /// Whether border-lane resources are required.
    pub(crate) const fn includes_border(self) -> bool {
        self.border
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn visual_overlay_selects_visual_resources_only() {
        let selection = DiagnosticResourceSelection::visual_overlay();

        assert!(selection.includes_visual());
        assert_eq!(selection.statistics(), StatisticsSelection::Omitted);
        assert!(!selection.includes_border());
    }

    #[test]
    fn border_overlay_selects_border_resources_only() {
        let selection = DiagnosticResourceSelection::border_overlay();

        assert!(!selection.includes_visual());
        assert_eq!(selection.statistics(), StatisticsSelection::Omitted);
        assert!(selection.includes_border());
    }

    #[test]
    fn statistics_without_readback_selects_only_gpu_output() {
        let selection = DiagnosticResourceSelection::statistics_without_readback();

        assert!(!selection.includes_visual());
        assert_eq!(selection.statistics(), StatisticsSelection::GpuOnly);
        assert!(!selection.includes_border());
    }

    #[test]
    fn cpu_readable_summary_selects_statistics_and_readback() {
        let selection = DiagnosticResourceSelection::cpu_readable_summary();

        assert!(!selection.includes_visual());
        assert_eq!(selection.statistics(), StatisticsSelection::CpuReadable);
        assert!(!selection.includes_border());
    }

    #[test]
    fn compatibility_selects_all_lanes_and_readback() {
        let selection = DiagnosticResourceSelection::compatibility();

        assert!(selection.includes_visual());
        assert_eq!(selection.statistics(), StatisticsSelection::CpuReadable);
        assert!(selection.includes_border());
    }
}
