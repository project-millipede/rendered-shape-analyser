//! Shared component infrastructure used by exported interfaces.

/// Runtime helpers shared by component interface implementations.
pub(crate) mod runtime;

/// The component — implements the `analysis` interface of the
/// `inspector-component` world.
pub(crate) struct Component;
