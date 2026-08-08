//! GPU-free Component Model guest (iteration "C0") for the millipede
//! webgpu-inspector.
//!
//! The boundary contract lives in `wit/` — start at `wit/world.wit`, then
//! follow the split interface files. This crate is its implementation. The
//! guest always exports the real `analysis` interface. With the
//! `wasi-async-proofs` feature enabled it also exports the isolated async
//! learning harness. GPU-analysis features are split into browser-safe sync
//! and Chrome/JSPI async worlds. No wasm-bindgen — by design.

#![warn(missing_docs)]

#[cfg(all(
    not(feature = "gpu-analysis"),
    not(feature = "gpu-analysis-async"),
    not(feature = "gpu-analysis-frame")
))]
mod analysis;

#[cfg(any(
    feature = "gpu-analysis",
    feature = "gpu-analysis-async",
    feature = "gpu-analysis-frame"
))]
mod edge_discovery;
#[cfg(feature = "gpu-analysis")]
mod gpu_analysis;
#[cfg(feature = "gpu-analysis-async")]
mod gpu_analysis_async;
#[cfg(feature = "gpu-analysis-frame")]
mod gpu_analysis_frame;
#[cfg(any(
    feature = "gpu-analysis",
    feature = "gpu-analysis-async",
    feature = "gpu-analysis-frame"
))]
mod gpu_shared;
#[cfg(any(
    feature = "gpu-analysis",
    feature = "gpu-analysis-async",
    feature = "gpu-analysis-frame"
))]
mod reference_diagnostics;
mod shared;
mod wit;

#[cfg(feature = "wasi-async-proofs")]
mod wasi;

use crate::wit::generated as bindings;
use shared::Component;

bindings::export!(Component with_types_in bindings);
