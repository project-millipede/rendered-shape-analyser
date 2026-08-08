//! Scheduler-owned shared-frame GPU analysis implementation.
//!
//! This module is feature-isolated from the stable and JSPI worlds. It reuses
//! the analyzer kernels, plans, and buffer layouts, but it never creates,
//! finishes, or submits a command encoder.

mod bindings;
mod component;
