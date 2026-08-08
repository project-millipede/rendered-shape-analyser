//! Binary layouts for the pixel-derived edge-discovery lane.

/// Texel width and height covered by one edge-discovery output record.
pub(crate) const EDGE_DISCOVERY_TILE_SIZE: u32 = 8;

/// Workgroup width used by per-texel feature and Sobel stages.
pub(crate) const EDGE_DISCOVERY_WORKGROUP_SIZE_X: u32 = 8;

/// Workgroup height used by per-texel feature and Sobel stages.
pub(crate) const EDGE_DISCOVERY_WORKGROUP_SIZE_Y: u32 = 8;

/// Workgroup width used by tile-oriented discovery stages.
pub(crate) const EDGE_DISCOVERY_TILE_WORKGROUP_SIZE_X: u32 = 8;

/// Workgroup height used by tile-oriented discovery stages.
pub(crate) const EDGE_DISCOVERY_TILE_WORKGROUP_SIZE_Y: u32 = 8;

/// Number of u32 words written by one edge-discovery record.
pub(crate) const EDGE_DISCOVERY_RECORD_WORDS: u32 = 8;

/// Byte stride of one renderer-facing edge-discovery record.
pub(crate) const EDGE_DISCOVERY_RECORD_STRIDE_BYTES: u32 =
    EDGE_DISCOVERY_RECORD_WORDS * u32::BITS / 8;

/// Minimum color-aware Sobel evidence for counting one texel as an edge hit.
pub(crate) const EDGE_DISCOVERY_THRESHOLD_MILLI: u32 = 60;

/// Byte stride of one intermediate luminance feature texel.
pub(crate) const EDGE_DISCOVERY_FEATURE_STRIDE_BYTES: u32 = u32::BITS / 8;

/// Byte stride of one intermediate Sobel evidence texel.
pub(crate) const EDGE_DISCOVERY_EVIDENCE_STRIDE_BYTES: u32 = u32::BITS / 8;

/// Bit stored in packed evidence when the x-gradient dominates.
pub(crate) const EDGE_DISCOVERY_VERTICAL_EVIDENCE_FLAG: u32 = 0x4000_0000;

/// Bit stored in packed evidence when the y-gradient dominates.
pub(crate) const EDGE_DISCOVERY_HORIZONTAL_EVIDENCE_FLAG: u32 = 0x8000_0000;

/// Low evidence bits available after orientation flags are packed.
pub(crate) const EDGE_DISCOVERY_EVIDENCE_MAGNITUDE_MASK: u32 = 0x3fff_ffff;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edge_discovery_record_layout_is_renderer_aligned() {
        assert_eq!(EDGE_DISCOVERY_RECORD_WORDS, 8);
        assert_eq!(EDGE_DISCOVERY_RECORD_STRIDE_BYTES, 32);
    }

    #[test]
    fn evidence_flags_leave_low_bits_for_magnitude() {
        assert_eq!(
            EDGE_DISCOVERY_VERTICAL_EVIDENCE_FLAG & EDGE_DISCOVERY_EVIDENCE_MAGNITUDE_MASK,
            0
        );
        assert_eq!(
            EDGE_DISCOVERY_HORIZONTAL_EVIDENCE_FLAG & EDGE_DISCOVERY_EVIDENCE_MAGNITUDE_MASK,
            0
        );
        assert_ne!(
            EDGE_DISCOVERY_VERTICAL_EVIDENCE_FLAG,
            EDGE_DISCOVERY_HORIZONTAL_EVIDENCE_FLAG
        );
    }

    #[test]
    fn edge_discovery_tile_size_matches_first_pass_workgroup() {
        assert_eq!(EDGE_DISCOVERY_TILE_SIZE, EDGE_DISCOVERY_WORKGROUP_SIZE_X);
        assert_eq!(EDGE_DISCOVERY_TILE_SIZE, EDGE_DISCOVERY_WORKGROUP_SIZE_Y);
    }
}
