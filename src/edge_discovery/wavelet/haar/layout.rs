//! Haar-specific block sizes and support thresholds.

/// Number of tiles covered by the first Haar low/high-frequency block.
pub(crate) const HAAR_LEVEL1_BLOCK_TILES: u32 = 2;

/// Number of tiles covered by the second Haar low/high-frequency block.
pub(crate) const HAAR_LEVEL2_BLOCK_TILES: u32 = 4;

/// Minimum support that lets Haar evidence reinforce a weak tile.
pub(crate) const HAAR_MIN_SIDE_SUPPORT: u32 = 5;

/// Luminance-detail divisor used to convert milli-units into side support.
pub(crate) const HAAR_DETAIL_MILLI_PER_SUPPORT: u32 = 24;

/// Maximum per-tile support after combining local and cross-scale Haar cues.
pub(crate) const HAAR_MAX_SUPPORT: u32 = 64;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn haar_blocks_are_small_gpu_tiles() {
        assert_eq!(HAAR_LEVEL1_BLOCK_TILES, 2);
        assert_eq!(HAAR_LEVEL2_BLOCK_TILES, 4);
        const { assert!(HAAR_LEVEL2_BLOCK_TILES > HAAR_LEVEL1_BLOCK_TILES) };
    }

    #[test]
    fn haar_thresholds_are_support_bonuses_not_hard_outputs() {
        const { assert!(HAAR_MIN_SIDE_SUPPORT > 0) };
        const { assert!(HAAR_DETAIL_MILLI_PER_SUPPORT > 0) };
        const { assert!(HAAR_MAX_SUPPORT >= HAAR_MIN_SIDE_SUPPORT) };
    }
}
