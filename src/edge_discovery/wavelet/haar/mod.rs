//! Haar wavelet implementation for the shared low/high-frequency state.
//!
//! Haar is the first concrete transform because its low/high split is compact
//! enough to run as a small WebGPU compute experiment. It is deliberately kept
//! outside `frequency_separation`, so later wavelet families can reuse the same
//! state contract without inheriting Haar-specific block math.

pub(crate) mod layout;

use layout::{
    HAAR_DETAIL_MILLI_PER_SUPPORT, HAAR_LEVEL1_BLOCK_TILES, HAAR_LEVEL2_BLOCK_TILES,
    HAAR_MAX_SUPPORT, HAAR_MIN_SIDE_SUPPORT,
};
use wgsl_macro::{ShaderConstant, ShaderConstants, ShaderProcessor};

/// Import path used by the edge-discovery WGSL preprocessor.
const SHADER_IMPORT: &str = "wavelet/haar/shader.wgsl";

/// Register the Haar WGSL module.
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

/// Register Haar-owned constants for WGSL preprocessing.
///
/// # Arguments
///
/// * `constants` - Mutated WGSL preprocessor constant table.
///
/// # Returns
///
/// Nothing. The function only registers constants owned by the Haar transform.
pub(crate) fn register_constants(constants: &mut ShaderConstants) {
    constants.set(
        "HAAR_LEVEL1_BLOCK_TILES",
        ShaderConstant::U32(HAAR_LEVEL1_BLOCK_TILES),
    );
    constants.set(
        "HAAR_LEVEL2_BLOCK_TILES",
        ShaderConstant::U32(HAAR_LEVEL2_BLOCK_TILES),
    );
    constants.set(
        "HAAR_MIN_SIDE_SUPPORT",
        ShaderConstant::U32(HAAR_MIN_SIDE_SUPPORT),
    );
    constants.set(
        "HAAR_DETAIL_MILLI_PER_SUPPORT",
        ShaderConstant::U32(HAAR_DETAIL_MILLI_PER_SUPPORT),
    );
    constants.set("HAAR_MAX_SUPPORT", ShaderConstant::U32(HAAR_MAX_SUPPORT));
}
