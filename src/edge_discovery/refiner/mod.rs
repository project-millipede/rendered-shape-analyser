//! Internal edge-discovery refiner stages.
//!
//! The refiner is not a separate component output or frontend mode. It runs
//! after pixel-derived feature/evidence stages and writes better records into the
//! existing `edgeDiscovery` GPU buffer.

pub(crate) mod layout;
pub(crate) mod shaders;
