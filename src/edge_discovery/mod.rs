//! pixel-derived WebGPU edge-discovery analyzer lane.
//!
//! This module is intentionally separate from `gpu_shared`: per-component
//! statistics and border tracing are ground-truth-guided, while edge discovery
//! starts from captured-pixel texture and writes GPU-resident low/high-frequency
//! state plus renderer-facing edge records.

pub(crate) mod bind_groups;
pub(crate) mod buffers;
pub(crate) mod commands;
pub(crate) mod frequency_separation;
pub(crate) mod grouping;
pub(crate) mod layout;
pub(crate) mod params;
pub(crate) mod pipelines;
pub(crate) mod plan;
pub(crate) mod refiner;
pub(crate) mod shaders;
pub(crate) mod wavelet;

pub(crate) use commands::{
    EdgeDiscoveryDispatchResources, prepare_edge_discovery_dispatch,
    record_edge_discovery_dispatches,
};
pub(crate) use plan::DiscoveryPlan;
