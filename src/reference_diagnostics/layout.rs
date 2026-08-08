//! Binary layouts and kernel constants for reference-guided diagnostics.
//!
//! # Shader binding contract
//!
//! The binding values below are sparse WebGPU `@binding` keys within
//! diagnostic bind group `0`; they are not resource counts, array positions,
//! or resource ids. WGSL declarations, Rust bind-group layouts, and Rust
//! bind-group entries must agree on each value.
//!
//! R2-A preserves the existing compatibility assignments. The source records
//! what each binding does, but it does not establish a historical reason for
//! choosing the sparse indirect-draw bindings. Each lane receives only its
//! required subset: visual references/output/indirect arguments, statistics
//! texture/references/output, or border texture/references/output/indirect
//! arguments.

/// Captured-pixel texture read by statistics and border diagnostics.
pub(super) const CAPTURED_TEXTURE_BINDING: u32 = 0;

/// Component-reference buffer read by every diagnostic lane.
pub(super) const COMPONENT_REFERENCE_BINDING: u32 = 1;

/// Compact per-reference statistics output buffer.
pub(super) const STATISTICS_OUTPUT_BINDING: u32 = 2;

/// GPU-resident reference-rectangle visual output buffer.
pub(super) const VISUAL_OUTPUT_BINDING: u32 = 3;

/// GPU-resident reference-guided border-trace output buffer.
pub(super) const BORDER_TRACE_OUTPUT_BINDING: u32 = 4;

/// GPU-written indirect draw arguments for reference rectangles.
pub(super) const VISUAL_INDIRECT_DRAW_BINDING: u32 = 13;

/// GPU-written indirect draw arguments for border traces.
pub(super) const BORDER_TRACE_INDIRECT_DRAW_BINDING: u32 = 14;

/// Fixed X dimension of the per-reference statistics WGSL workgroup.
pub(crate) const STATISTICS_WORKGROUP_SIZE_X: u32 = 8;

/// Fixed Y dimension of the per-reference statistics WGSL workgroup.
pub(crate) const STATISTICS_WORKGROUP_SIZE_Y: u32 = 8;

/// Number of `u32` summary words written for each ground-truth node.
pub(crate) const SUMMARY_WORDS_PER_NODE: u32 = 3;

/// Byte stride of one compact per-node summary record.
pub(crate) const SUMMARY_NODE_STRIDE_BYTES: u32 = SUMMARY_WORDS_PER_NODE * u32::BITS / 8;

/// Byte stride of one renderer-facing per-node visual record.
pub(crate) const VISUAL_NODE_STRIDE_BYTES: u32 = 32;

/// Byte stride of one renderer-facing per-node 2D border-trace record.
pub(crate) const BORDER_TRACE_NODE_STRIDE_BYTES: u32 = 32;

/// Number of visual records initialized by one visual-output workgroup.
pub(crate) const VISUAL_INIT_WORKGROUP_SIZE_X: u32 = 64;

/// Number of 2D border records traced by one border-trace workgroup.
pub(crate) const BORDER_TRACE_WORKGROUP_SIZE_X: u32 = 64;

/// Byte length of one WebGPU non-indexed indirect draw argument record.
///
/// The four `u32` words are:
///
/// 1. `vertex_count`
/// 2. `instance_count`
/// 3. `first_vertex`
/// 4. `first_instance`
pub(crate) const DRAW_INDIRECT_BYTE_LENGTH: u64 = 16;

/// Byte length of the committed ground-truth buffer header.
pub(crate) const GROUND_TRUTH_HEADER_BYTES: u64 = 16;

/// Byte length of one committed ground-truth node record.
pub(crate) const GROUND_TRUTH_NODE_BYTES: u64 = 32;
