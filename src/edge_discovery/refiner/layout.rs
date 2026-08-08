//! Layout and threshold constants for edge-discovery refinement.

/// Number of u32 words stored for one per-tile statistics record.
pub(crate) const EDGE_REFINER_TILE_STATS_WORDS: u32 = 4;

/// Byte stride of one per-tile statistics record.
pub(crate) const EDGE_REFINER_TILE_STATS_STRIDE_BYTES: u32 =
    EDGE_REFINER_TILE_STATS_WORDS * u32::BITS / 8;

/// Minimum oriented edge-hit texels for a tile side to count as supported.
pub(crate) const EDGE_REFINER_MIN_TILE_SUPPORT: u32 = 2;

/// Active candidate flag stored in `AnalysisEdgeDiscoveryRecord.info.z`.
pub(crate) const EDGE_REFINER_ACTIVE_CANDIDATE_FLAG: u32 = 1;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tile_stats_record_is_four_words() {
        assert_eq!(EDGE_REFINER_TILE_STATS_WORDS, 4);
        assert_eq!(EDGE_REFINER_TILE_STATS_STRIDE_BYTES, 16);
    }

    #[test]
    fn refiner_thresholds_stay_container_oriented() {
        const { assert!(EDGE_REFINER_MIN_TILE_SUPPORT > 0) };
        assert_eq!(EDGE_REFINER_ACTIVE_CANDIDATE_FLAG, 1);
    }
}
