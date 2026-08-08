//! Parameter helpers for pixel-derived edge discovery.

use super::layout::EDGE_DISCOVERY_TILE_SIZE;

/// Integer ceil division for texture and tile dimensions.
///
/// # Arguments
///
/// * `value` - Dividend.
/// * `divisor` - Positive divisor.
///
/// # Returns
///
/// `ceil(value / divisor)`.
pub(crate) fn ceil_div(value: u32, divisor: u32) -> u32 {
    value.div_ceil(divisor)
}

/// Compute the number of edge-discovery tiles in X.
///
/// # Arguments
///
/// * `texture_width` - Captured texture width in texels.
///
/// # Returns
///
/// Number of 8-texel-wide tiles needed to cover the texture.
pub(crate) fn tile_count_x(texture_width: u32) -> u32 {
    ceil_div(texture_width, EDGE_DISCOVERY_TILE_SIZE)
}

/// Compute the number of edge-discovery tiles in Y.
///
/// # Arguments
///
/// * `texture_height` - Captured texture height in texels.
///
/// # Returns
///
/// Number of 8-texel-tall tiles needed to cover the texture.
pub(crate) fn tile_count_y(texture_height: u32) -> u32 {
    ceil_div(texture_height, EDGE_DISCOVERY_TILE_SIZE)
}

/// Compute the renderer-facing edge-discovery slot capacity.
///
/// # Arguments
///
/// * `texture_width` - Captured texture width in texels.
/// * `texture_height` - Captured texture height in texels.
///
/// # Returns
///
/// Maximum output slots needed for one record per tile covering the texture.
pub(crate) fn slot_capacity(texture_width: u32, texture_height: u32) -> u32 {
    tile_count_x(texture_width) * tile_count_y(texture_height)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slot_capacity_uses_full_texture_coverage() {
        assert_eq!(slot_capacity(0, 0), 0);
        assert_eq!(slot_capacity(1, 1), 1);
        assert_eq!(slot_capacity(8, 8), 1);
        assert_eq!(slot_capacity(9, 8), 2);
        assert_eq!(slot_capacity(9, 9), 4);
    }
}
