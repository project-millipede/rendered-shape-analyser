//! WGSL source assembly for the pixel-derived edge-discovery compute pipeline.
//!
//! WGSL is the browser/runtime shader contract. `wgsl-macro` is used here only
//! as a source preprocessor: it expands `#import` directives and replaces
//! declared constants before the browser receives plain WGSL.

use super::frequency_separation;
use super::grouping::shaders::EDGE_DISCOVERY_GROUPING_SHADER;
use super::layout::{
    EDGE_DISCOVERY_EVIDENCE_MAGNITUDE_MASK, EDGE_DISCOVERY_HORIZONTAL_EVIDENCE_FLAG,
    EDGE_DISCOVERY_THRESHOLD_MILLI, EDGE_DISCOVERY_TILE_SIZE,
    EDGE_DISCOVERY_VERTICAL_EVIDENCE_FLAG,
};
use super::refiner::layout::{EDGE_REFINER_ACTIVE_CANDIDATE_FLAG, EDGE_REFINER_MIN_TILE_SUPPORT};
use super::refiner::shaders::EDGE_DISCOVERY_REFINER_SHADER;
use super::wavelet::haar;
use wgsl_macro::{ShaderConstant, ShaderConstants, ShaderProcessor};

/// `wgsl-macro` root for the final edge-discovery shader source.
///
/// Base and refiner constants remain declared here while those fragments still
/// live as transitional Rust strings. Haar owns its constants in
/// `wavelet/haar/shader.wgsl`, so those details do not leak into this root.
const EDGE_DISCOVERY_SHADER_ROOT: &str = r#"
const EDGE_TILE_SIZE: u32 = 0u;
const EDGE_THRESHOLD_MILLI: u32 = 0u;
const EDGE_EVIDENCE_VERTICAL_FLAG: u32 = 0u;
const EDGE_EVIDENCE_HORIZONTAL_FLAG: u32 = 0u;
const EDGE_EVIDENCE_MAGNITUDE_MASK: u32 = 0u;
const EDGE_ACTIVE_CANDIDATE_FLAG: u32 = 0u;
const EDGE_REFINER_MIN_TILE_SUPPORT: u32 = 0u;

#import base/shader.wgsl
#import frequency_separation/shader.wgsl
#import refiner/shader.wgsl
#import wavelet/haar/shader.wgsl
#import grouping/shader.wgsl
"#;

/// Base WGSL shared by all pixel-derived edge-discovery stages.
///
/// This fragment owns:
///
/// 1. The shared record structs used by Rust-created buffers.
/// 2. The active bind-group resources for captured-pixel texture and GPU-resident
///    intermediate buffers.
/// 3. The first three discovery dispatches: feature extraction, Sobel evidence, and
///    non-maximum thinning.
///
/// It deliberately contains no component-reference binding and no CPU-readable
/// diagnostic path.
const EDGE_DISCOVERY_BASE_SHADER: &str = r#"
// Shared renderer-facing edge record. Bounds are texel-space x/y/w/h.
struct EdgeDiscoveryRecord {
    bounds: vec4f,
    info: vec4u
}

// Per-tile edge statistics consumed by later refiner/frequency stages.
struct EdgeTileStats {
    stats: vec4u
}

// Binding 0 is the captured-pixel texture. Edge discovery must not bind
// component-reference data.
@group(0) @binding(0)
var captured: texture_2d<f32>;

// Binding 5 stores per-texel luminance plus an ink bit.
@group(0) @binding(5)
var<storage, read_write> features: array<u32>;

// Binding 6 stores packed Sobel/color edge magnitude plus orientation flags.
@group(0) @binding(6)
var<storage, read_write> evidence: array<u32>;

// Binding 12 stores the thinned evidence after local non-maximum suppression.
@group(0) @binding(12)
var<storage, read_write> thinned_evidence: array<u32>;

// Binding 7 stores one compact statistics record per 8x8 tile.
@group(0) @binding(7)
var<storage, read_write> tile_stats: array<EdgeTileStats>;

// Binding 13 is the GPU-written indirect draw arguments buffer.
@group(0) @binding(13)
var<storage, read_write> edge_draw_args: array<atomic<u32>>;

const FEATURE_INK_BIT: u32 = 0x80000000u;
const FEATURE_LUMA_MASK: u32 = 0x7fffffffu;

fn texel_index(coord: vec2u, dims: vec2u) -> u32 {
    return coord.x + coord.y * dims.x;
}

fn tile_index(tile: vec2u, tile_count_x: u32) -> u32 {
    return tile.x + tile.y * tile_count_x;
}

fn read_tile_stats(tile: vec2u, tile_count_x: u32) -> vec4u {
    return tile_stats[tile_index(tile, tile_count_x)].stats;
}

fn clamped_coord(coord: vec2i, dims: vec2u) -> vec2u {
    let max_coord = vec2i(i32(dims.x) - 1, i32(dims.y) - 1);
    return vec2u(clamp(coord, vec2i(0, 0), max_coord));
}

fn read_luminance_milli(coord: vec2i, dims: vec2u) -> i32 {
    let sample_coord = clamped_coord(coord, dims);
    let packed = features[texel_index(sample_coord, dims)];
    return i32(packed & FEATURE_LUMA_MASK);
}

fn read_rgb_milli(coord: vec2i, dims: vec2u) -> vec3i {
    let sample_coord = clamped_coord(coord, dims);
    let rgba = textureLoad(captured, vec2i(sample_coord), 0);
    let rgb = clamp(rgba.rgb, vec3f(0.0), vec3f(1.0));
    return vec3i(rgb * 1000.0 + vec3f(0.5));
}

fn max_abs_channel(value: vec3i) -> i32 {
    let absolute = abs(value);
    return max(max(absolute.x, absolute.y), absolute.z);
}

fn read_evidence_magnitude(coord: vec2i, dims: vec2u) -> u32 {
    let sample_coord = clamped_coord(coord, dims);
    return evidence[texel_index(sample_coord, dims)] & EDGE_EVIDENCE_MAGNITUDE_MASK;
}

// Discovery dispatch 1: convert captured pixels into compact luminance/ink features.
@compute @workgroup_size(8, 8)
fn edge_feature(@builtin(global_invocation_id) id: vec3u) {
    let dims = textureDimensions(captured);

    // The first invocation resets indirect draw args for this analysis run:
    // vertexCount, instanceCount, firstVertex, firstInstance.
    if (id.x == 0u && id.y == 0u) {
        atomicStore(&edge_draw_args[0], (24u));
        atomicStore(&edge_draw_args[1], 0u);
        atomicStore(&edge_draw_args[2], 0u);
        atomicStore(&edge_draw_args[3], 0u);
    }

    if (id.x >= dims.x || id.y >= dims.y) {
        return;
    }

    let rgba = textureLoad(captured, vec2i(i32(id.x), i32(id.y)), 0);
    let luminance = clamp(dot(rgba.rgb, vec3f(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    let luminance_milli = u32(luminance * 1000.0 + 0.5);
    let ink = rgba.a > 0.01 && luminance < 0.98;
    let packed = luminance_milli | select(0u, FEATURE_INK_BIT, ink);
    features[texel_index(id.xy, dims)] = packed;
}

// Discovery dispatch 2: compute color-aware Sobel evidence from the feature buffer.
@compute @workgroup_size(8, 8)
fn edge_convolution(@builtin(global_invocation_id) id: vec3u) {
    let dims = textureDimensions(captured);
    if (id.x >= dims.x || id.y >= dims.y || dims.x == 0u || dims.y == 0u) {
        return;
    }

    let p = vec2i(i32(id.x), i32(id.y));
    let tl_luma = read_luminance_milli(p + vec2i(-1, -1), dims);
    let tc_luma = read_luminance_milli(p + vec2i(0, -1), dims);
    let tr_luma = read_luminance_milli(p + vec2i(1, -1), dims);
    let ml_luma = read_luminance_milli(p + vec2i(-1, 0), dims);
    let mr_luma = read_luminance_milli(p + vec2i(1, 0), dims);
    let bl_luma = read_luminance_milli(p + vec2i(-1, 1), dims);
    let bc_luma = read_luminance_milli(p + vec2i(0, 1), dims);
    let br_luma = read_luminance_milli(p + vec2i(1, 1), dims);

    let tl_rgb = read_rgb_milli(p + vec2i(-1, -1), dims);
    let tc_rgb = read_rgb_milli(p + vec2i(0, -1), dims);
    let tr_rgb = read_rgb_milli(p + vec2i(1, -1), dims);
    let ml_rgb = read_rgb_milli(p + vec2i(-1, 0), dims);
    let mr_rgb = read_rgb_milli(p + vec2i(1, 0), dims);
    let bl_rgb = read_rgb_milli(p + vec2i(-1, 1), dims);
    let bc_rgb = read_rgb_milli(p + vec2i(0, 1), dims);
    let br_rgb = read_rgb_milli(p + vec2i(1, 1), dims);

    let luma_gx = -tl_luma - 2 * ml_luma - bl_luma + tr_luma + 2 * mr_luma + br_luma;
    let luma_gy = -tl_luma - 2 * tc_luma - tr_luma + bl_luma + 2 * bc_luma + br_luma;
    let rgb_gx = -tl_rgb - ml_rgb * 2 - bl_rgb + tr_rgb + mr_rgb * 2 + br_rgb;
    let rgb_gy = -tl_rgb - tc_rgb * 2 - tr_rgb + bl_rgb + bc_rgb * 2 + br_rgb;

    let abs_gx = max(abs(luma_gx), max_abs_channel(rgb_gx));
    let abs_gy = max(abs(luma_gy), max_abs_channel(rgb_gy));
    let magnitude = min(u32(abs_gx + abs_gy) / 8u, EDGE_EVIDENCE_MAGNITUDE_MASK);
    let vertical_flag = select(0u, EDGE_EVIDENCE_VERTICAL_FLAG, abs_gx >= abs_gy);
    let horizontal_flag = select(0u, EDGE_EVIDENCE_HORIZONTAL_FLAG, abs_gy >= abs_gx);
    evidence[texel_index(id.xy, dims)] = magnitude | vertical_flag | horizontal_flag;
}

// Discovery dispatch 3: keep local peaks along the dominant edge orientation.
@compute @workgroup_size(8, 8)
fn edge_thin(@builtin(global_invocation_id) id: vec3u) {
    let dims = textureDimensions(captured);
    if (id.x >= dims.x || id.y >= dims.y || dims.x == 0u || dims.y == 0u) {
        return;
    }

    let index = texel_index(id.xy, dims);
    let packed = evidence[index];
    let magnitude = packed & EDGE_EVIDENCE_MAGNITUDE_MASK;
    if (magnitude < EDGE_THRESHOLD_MILLI) {
        thinned_evidence[index] = 0u;
        return;
    }

    let p = vec2i(i32(id.x), i32(id.y));
    let is_vertical = (packed & EDGE_EVIDENCE_VERTICAL_FLAG) != 0u;
    let is_horizontal = (packed & EDGE_EVIDENCE_HORIZONTAL_FLAG) != 0u;
    let vertical_peak = is_vertical && magnitude >= read_evidence_magnitude(p + vec2i(-1, 0), dims) && magnitude >= read_evidence_magnitude(p + vec2i(1, 0), dims);
    let horizontal_peak = is_horizontal && magnitude >= read_evidence_magnitude(p + vec2i(0, -1), dims) && magnitude >= read_evidence_magnitude(p + vec2i(0, 1), dims);
    thinned_evidence[index] = select(0u, packed, vertical_peak || horizontal_peak);
}
"#;

/// Register the base edge-discovery WGSL module.
///
/// # Arguments
///
/// * `processor` - Mutated WGSL preprocessor module registry.
fn register_base_shader(processor: &mut ShaderProcessor<'static>) {
    processor.add_module("base/shader.wgsl", EDGE_DISCOVERY_BASE_SHADER);
}

/// Register the transitional refiner WGSL module.
///
/// # Arguments
///
/// * `processor` - Mutated WGSL preprocessor module registry.
fn register_refiner_shader(processor: &mut ShaderProcessor<'static>) {
    processor.add_module("refiner/shader.wgsl", EDGE_DISCOVERY_REFINER_SHADER);
}

/// Register the transitional grouping WGSL module.
///
/// # Arguments
///
/// * `processor` - Mutated WGSL preprocessor module registry.
fn register_grouping_shader(processor: &mut ShaderProcessor<'static>) {
    processor.add_module("grouping/shader.wgsl", EDGE_DISCOVERY_GROUPING_SHADER);
}

/// Return the Rust-owned constants used by edge-discovery WGSL.
///
/// # Returns
///
/// A `wgsl-macro` constant map. This root owns only the constants needed by
/// the still-transitional base/refiner fragments; Haar registers its own
/// constants from the Haar module.
fn edge_discovery_shader_constants() -> ShaderConstants {
    let mut constants = ShaderConstants::new();
    constants.set(
        "EDGE_TILE_SIZE",
        ShaderConstant::U32(EDGE_DISCOVERY_TILE_SIZE),
    );
    constants.set(
        "EDGE_THRESHOLD_MILLI",
        ShaderConstant::U32(EDGE_DISCOVERY_THRESHOLD_MILLI),
    );
    constants.set(
        "EDGE_EVIDENCE_VERTICAL_FLAG",
        ShaderConstant::U32(EDGE_DISCOVERY_VERTICAL_EVIDENCE_FLAG),
    );
    constants.set(
        "EDGE_EVIDENCE_HORIZONTAL_FLAG",
        ShaderConstant::U32(EDGE_DISCOVERY_HORIZONTAL_EVIDENCE_FLAG),
    );
    constants.set(
        "EDGE_EVIDENCE_MAGNITUDE_MASK",
        ShaderConstant::U32(EDGE_DISCOVERY_EVIDENCE_MAGNITUDE_MASK),
    );
    constants.set(
        "EDGE_ACTIVE_CANDIDATE_FLAG",
        ShaderConstant::U32(EDGE_REFINER_ACTIVE_CANDIDATE_FLAG),
    );
    constants.set(
        "EDGE_REFINER_MIN_TILE_SUPPORT",
        ShaderConstant::U32(EDGE_REFINER_MIN_TILE_SUPPORT),
    );
    haar::register_constants(&mut constants);
    constants
}

/// Return the WGSL module registry for edge-discovery.
///
/// # Returns
///
/// A fresh preprocessor registry. Migrated modules register themselves; the
/// remaining Rust-string fragments are registered here until they move to WGSL
/// files in later scoped discovery stages.
fn edge_discovery_shader_processor() -> ShaderProcessor<'static> {
    let mut processor = ShaderProcessor::new();
    register_base_shader(&mut processor);
    frequency_separation::register_shader(&mut processor);
    register_refiner_shader(&mut processor);
    haar::register_shader(&mut processor);
    register_grouping_shader(&mut processor);
    processor
}

/// Return the WGSL source used to create the edge-discovery shader module.
///
/// # Returns
///
/// Plain WGSL containing the base pixel-derived feature/evidence stages, reusable
/// low/high-frequency state, Haar transform, tile refiner, and output
/// projection entry points. The returned string has already had `#import`
/// directives expanded and Rust-owned constants substituted.
pub(crate) fn edge_discovery_shader_source() -> String {
    let constants = edge_discovery_shader_constants();
    let mut processor = edge_discovery_shader_processor();
    processor
        .build(EDGE_DISCOVERY_SHADER_ROOT, &constants)
        .expect("edge-discovery WGSL preprocessing should succeed")
}
