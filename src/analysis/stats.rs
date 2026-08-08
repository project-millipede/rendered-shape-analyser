//! Pure tree-statistics computation.
//!
//! Deliberately independent of the WIT-generated types so the math is
//! unit-testable on the host architecture — `cargo test` runs no wasm.
//! The thin adapter in `analysis/component.rs` maps the ABI records onto
//! [`LayoutNode`].

/// `parent` sentinel marking a root node.
///
/// Mirrors `NO_PARENT` in the inspector's `ground-truth/layout-record.ts`;
/// the value is the encoded form of "no index", not a valid position.
pub const NO_PARENT: u32 = 0xffff_ffff;

/// Bit 0 of `flags`: the node is laid out but paints nothing ("ghost").
///
/// Mirrors `GHOST_FLAG` in `ground-truth/layout-record.ts`.
pub const GHOST_FLAG: u32 = 0b1;

/// One layout node, the subset of the boundary's `node-record` that the
/// aggregate math consumes (`name-hash` carries identity, not geometry,
/// and stays at the boundary).
pub struct LayoutNode {
    /// x, y, width, height in texel space (unsnapped; may exceed the
    /// texture — overflow is information, not an error).
    pub bounds: (f32, f32, f32, f32),
    /// Composite nesting level; 1 = direct child of the captured root.
    pub depth: u32,
    /// Index of the parent within the same list, or [`NO_PARENT`].
    pub parent: u32,
    /// Bit flags; see [`GHOST_FLAG`].
    pub flags: u32,
}

/// Aggregates computed over one node tree by [`analyze_tree`].
pub struct TreeAggregates {
    /// Number of nodes received.
    pub node_count: u32,
    /// Maximum `depth` seen (0 for an empty tree).
    pub max_depth: u32,
    /// Number of nodes with [`GHOST_FLAG`] set.
    pub ghost_count: u32,
    /// Sum of all node areas (width × height), in texels².
    pub total_area: f64,
    /// Sum of root-node areas divided by the texture area; 0 when the
    /// texture is empty.
    pub coverage: f64,
}

/// Compute [`TreeAggregates`] over one node list.
///
/// # Arguments
///
/// * `nodes` - The complete tree in DFS order (ordering is not required
///   for these aggregates, but it is what the inspector emits).
/// * `texture_width` - Texel width the node bounds refer to.
/// * `texture_height` - Texel height the node bounds refer to.
///
/// # Returns
///
/// The aggregates; all-zero for an empty `nodes` slice.
pub fn analyze_tree(
    nodes: &[LayoutNode],
    texture_width: u32,
    texture_height: u32,
) -> TreeAggregates {
    let mut max_depth = 0u32;
    let mut ghost_count = 0u32;
    let mut total_area = 0f64;
    let mut root_area = 0f64;

    for node in nodes {
        let (_, _, width, height) = node.bounds;
        // f32 → f64 before multiplying: texel areas of large captures
        // overflow f32 precision long before they trouble f64.
        let area = f64::from(width) * f64::from(height);
        total_area += area;
        if node.parent == NO_PARENT {
            root_area += area;
        }
        max_depth = max_depth.max(node.depth);
        if node.flags & GHOST_FLAG != 0 {
            ghost_count += 1;
        }
    }

    let texture_area = f64::from(texture_width) * f64::from(texture_height);
    // Guard: an empty texture yields coverage 0 rather than NaN/inf,
    // which would poison every consumer across the ABI.
    let coverage = if texture_area > 0.0 {
        root_area / texture_area
    } else {
        0.0
    };

    TreeAggregates {
        node_count: nodes.len() as u32,
        max_depth,
        ghost_count,
        total_area,
        coverage,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The shared boundary fixture: identical (values and order) to
    /// `tests/component-boundary/fixtures/analysis-tree.ts` and the website
    /// package's `self-test.ts`, so all three layers assert the same
    /// hand-computed numbers.
    fn fixture() -> Vec<LayoutNode> {
        vec![
            // 1. root: 100×80 = 8000 texels²
            LayoutNode {
                bounds: (0.0, 0.0, 100.0, 80.0),
                depth: 1,
                parent: NO_PARENT,
                flags: 0,
            },
            // 2. child of node 0: 40×30 = 1200
            LayoutNode {
                bounds: (10.0, 10.0, 40.0, 30.0),
                depth: 2,
                parent: 0,
                flags: 0,
            },
            // 3. ghost child of node 0: 30×20 = 600
            LayoutNode {
                bounds: (50.0, 40.0, 30.0, 20.0),
                depth: 2,
                parent: 0,
                flags: GHOST_FLAG,
            },
            // 4. grandchild (deepest): 20×10 = 200
            LayoutNode {
                bounds: (12.0, 12.0, 20.0, 10.0),
                depth: 3,
                parent: 1,
                flags: 0,
            },
            // 5. second root: 50×10 = 500
            LayoutNode {
                bounds: (0.0, 90.0, 50.0, 10.0),
                depth: 1,
                parent: NO_PARENT,
                flags: 0,
            },
            // 6. ghost child of node 4: 10×5 = 50
            LayoutNode {
                bounds: (5.0, 92.0, 10.0, 5.0),
                depth: 2,
                parent: 4,
                flags: GHOST_FLAG,
            },
        ]
    }

    #[test]
    fn aggregates_match_hand_computed_fixture_values() {
        let aggregates = analyze_tree(&fixture(), 200, 100);
        assert_eq!(aggregates.node_count, 6);
        assert_eq!(aggregates.max_depth, 3);
        assert_eq!(aggregates.ghost_count, 2);
        // 8000 + 1200 + 600 + 200 + 500 + 50
        assert_eq!(aggregates.total_area, 10550.0);
        // roots: (8000 + 500) / (200 × 100)
        assert_eq!(aggregates.coverage, 0.425);
    }

    #[test]
    fn empty_tree_yields_all_zero_aggregates() {
        let aggregates = analyze_tree(&[], 200, 100);
        assert_eq!(aggregates.node_count, 0);
        assert_eq!(aggregates.max_depth, 0);
        assert_eq!(aggregates.ghost_count, 0);
        assert_eq!(aggregates.total_area, 0.0);
        assert_eq!(aggregates.coverage, 0.0);
    }

    #[test]
    fn empty_texture_yields_zero_coverage_not_nan() {
        let aggregates = analyze_tree(&fixture(), 0, 0);
        assert_eq!(aggregates.coverage, 0.0);
        assert_eq!(aggregates.total_area, 10550.0);
    }
}
