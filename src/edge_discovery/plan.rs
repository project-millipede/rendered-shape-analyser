//! Generated-type-free planning for the pixel-derived discovery lane.

use super::layout::{
    EDGE_DISCOVERY_TILE_WORKGROUP_SIZE_X, EDGE_DISCOVERY_TILE_WORKGROUP_SIZE_Y,
    EDGE_DISCOVERY_WORKGROUP_SIZE_X, EDGE_DISCOVERY_WORKGROUP_SIZE_Y,
};
use super::params::{ceil_div, slot_capacity, tile_count_x, tile_count_y};

/// Dimensions and dispatch grids needed by pixel-derived discovery.
///
/// This deliberately contains no mixed analyzer or Component Model record.
/// Callers construct it only from captured-texture facts before discovery
/// preparation or recording; reference-guided diagnostic facts never enter it.
pub(crate) struct DiscoveryPlan {
    /// Entry id used only for browser WebGPU debug labels.
    pub(crate) entry_id: String,
    /// Width of the captured texture in texels.
    pub(crate) texture_width: u32,
    /// Height of the captured texture in texels.
    pub(crate) texture_height: u32,
    /// X workgroups for full-resolution discovery stages.
    pub(crate) texel_workgroups_x: u32,
    /// Y workgroups for full-resolution discovery stages.
    pub(crate) texel_workgroups_y: u32,
    /// X workgroups for tile-oriented discovery stages.
    pub(crate) tile_workgroups_x: u32,
    /// Y workgroups for tile-oriented discovery stages.
    pub(crate) tile_workgroups_y: u32,
    /// Maximum number of renderer-facing edge records.
    pub(crate) slot_capacity: u32,
}

impl DiscoveryPlan {
    /// Build a discovery-only plan from captured-texture metadata.
    ///
    /// # Arguments
    ///
    /// * `entry_id` - Stable entry id used only in WebGPU debug labels.
    /// * `texture_width` - Captured-texture width used by discovery grids and
    ///   output-capacity sizing.
    /// * `texture_height` - Captured-texture height used by discovery grids and
    ///   output-capacity sizing.
    ///
    /// # Returns
    ///
    /// A generated-analyzer-type-free plan containing only discovery identity,
    /// dimensions, dispatch grids, and renderer-facing output capacity.
    pub(crate) fn new(entry_id: String, texture_width: u32, texture_height: u32) -> Self {
        let tile_count_x = tile_count_x(texture_width);
        let tile_count_y = tile_count_y(texture_height);

        Self {
            entry_id,
            texture_width,
            texture_height,
            texel_workgroups_x: ceil_div(texture_width, EDGE_DISCOVERY_WORKGROUP_SIZE_X),
            texel_workgroups_y: ceil_div(texture_height, EDGE_DISCOVERY_WORKGROUP_SIZE_Y),
            tile_workgroups_x: ceil_div(tile_count_x, EDGE_DISCOVERY_TILE_WORKGROUP_SIZE_X),
            tile_workgroups_y: ceil_div(tile_count_y, EDGE_DISCOVERY_TILE_WORKGROUP_SIZE_Y),
            slot_capacity: slot_capacity(texture_width, texture_height),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_covers_exact_and_partial_workgroup_boundaries() {
        let exact = DiscoveryPlan::new("exact".to_string(), 64, 64);
        assert_eq!((exact.texel_workgroups_x, exact.texel_workgroups_y), (8, 8));
        assert_eq!((exact.tile_workgroups_x, exact.tile_workgroups_y), (1, 1));
        assert_eq!(exact.slot_capacity, 64);

        let partial = DiscoveryPlan::new("partial".to_string(), 65, 17);
        assert_eq!(
            (partial.texel_workgroups_x, partial.texel_workgroups_y),
            (9, 3)
        );
        assert_eq!(
            (partial.tile_workgroups_x, partial.tile_workgroups_y),
            (2, 1)
        );
        assert_eq!(partial.slot_capacity, 27);
    }

    #[test]
    fn plan_covers_representative_non_aligned_dimensions() {
        let plan = DiscoveryPlan::new("representative".to_string(), 100, 200);

        assert_eq!((plan.texel_workgroups_x, plan.texel_workgroups_y), (13, 25));
        assert_eq!((plan.tile_workgroups_x, plan.tile_workgroups_y), (2, 4));
        assert_eq!(plan.slot_capacity, 325);
    }
}
