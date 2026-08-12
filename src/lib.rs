//! Component Model guest for the millipede webgpu-inspector.
//!
//! The boundary contract lives in `wit/`: production worlds are declared in
//! `wit/world.wit`, while the isolated proof world is declared in
//! `wit/boundary-proofs-wasi-async.wit`. This crate is their implementation.
//! Each build explicitly selects one world feature. `gpu-analysis` selects the
//! browser-safe stable product world, while `wasi-async-proofs` selects the
//! isolated WASI async boundary-proof world. The other GPU-analysis features
//! select the Chrome/JSPI async and scheduler-owned frame worlds. No
//! wasm-bindgen — by design.

#![warn(missing_docs)]

#[cfg(all(
    feature = "wasi-async-proofs",
    not(feature = "gpu-analysis"),
    not(feature = "gpu-analysis-async"),
    not(feature = "gpu-analysis-frame")
))]
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
