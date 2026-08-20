//! Generated compatibility helpers for stable, async, and shared-frame worlds.
//!
//! This temporary module validates and translates generated analyzer records,
//! preserves the mixed ten-dispatch result shape, composes the two independent
//! cores in the protected order, and owns the stable/async self-submission
//! compatibility path. Workload planning, resources, and recording stay in the
//! generated-type-free `reference_diagnostics` and `edge_discovery` cores.

mod buffers;
mod commands;
mod plan;
mod validation;

#[cfg(feature = "gpu-analysis")]
pub(crate) use buffers::create_analysis_summary_readback;
pub(crate) use buffers::{
    create_analysis_border_trace_output, create_analysis_visual_output,
    create_edge_discovery_output,
};
#[cfg(feature = "gpu-analysis-frame")]
pub(crate) use commands::encode_compatibility_dispatch;
#[cfg(any(feature = "gpu-analysis", feature = "gpu-analysis-async"))]
pub(crate) use commands::submit_compatibility_dispatch;
#[cfg(any(feature = "gpu-analysis", feature = "gpu-analysis-frame"))]
pub(crate) use plan::build_compatibility_metadata;
pub(crate) use plan::{project_diagnostic_plan, project_discovery_plan};
pub(crate) use validation::validate_analysis_preflight;
