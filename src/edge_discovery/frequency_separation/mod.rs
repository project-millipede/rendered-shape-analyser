//! Reusable low/high-frequency separation state.
//!
//! This module owns the common frequency-band state that later transforms can
//! reuse. It deliberately avoids renderer, React, ground truth, and
//! algorithm-specific output ownership.

pub(crate) mod layout;

use wgsl_macro::ShaderProcessor;

/// Import path used by the edge-discovery WGSL preprocessor.
const SHADER_IMPORT: &str = "frequency_separation/shader.wgsl";

/// Register the reusable frequency-separation WGSL module.
///
/// # Arguments
///
/// * `processor` - Mutated WGSL preprocessor module registry.
///
/// # Returns
///
/// Nothing. The source is registered under this module's stable import path.
pub(crate) fn register_shader(processor: &mut ShaderProcessor<'static>) {
    processor.add_module(SHADER_IMPORT, include_str!("shader.wgsl"));
}
