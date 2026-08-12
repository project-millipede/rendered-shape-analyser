//! GPU-free Component Model guest (iteration "C0") for the millipede
//! webgpu-inspector.
//!
//! The boundary contract lives in `wit/`: production worlds are declared in
//! `wit/world.wit`, while the isolated proof world is declared in
//! `wit/boundary-proofs-wasi-async.wit`. This crate is their implementation.
//! The default guest exports the real `analysis` interface. The
//! `wasi-async-proofs` feature instead selects the isolated WASI async
//! boundary-proof world. GPU-analysis features select separate browser-safe
//! sync and Chrome/JSPI async worlds. No wasm-bindgen — by design.

#![warn(missing_docs)]

#[cfg(all(
    not(feature = "wasi-async-proofs"),
    not(feature = "gpu-analysis"),
    not(feature = "gpu-analysis-async"),
    not(feature = "gpu-analysis-frame")
))]
mod analysis;
#[cfg(feature = "wasi-async-proofs")]
mod boundary_proofs;

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

use crate::wit::generated as bindings;
use shared::Component;

bindings::export!(Component with_types_in bindings);
