//! GPU-resident frequency-output projection for pixel-derived edge discovery.
//!
//! This module keeps the existing renderer-facing `edgeDiscovery` buffer, but
//! fills it with frequency-supported records instead of adding a separate
//! transport layer or a CPU-readable diagnostic path.

pub(crate) mod shaders;
