//! Implementation of the WIT `analysis` export.

use std::sync::Mutex;

use super::bindings::{AnalysisGuest, Level, NodeRecord, TreeStats, emit, log};
use super::stats;
use crate::shared::Component;
use crate::shared::runtime::install_panic_hook;

/// The most recent JSON document passed to `set-params`.
///
/// Iteration one stores it verbatim (forward-compatible catch-all); the
/// first real analysis kernel will parse what it needs.
static ANALYSIS_PARAMETERS: Mutex<Option<String>> = Mutex::new(None);

/// Serialize [`stats::TreeAggregates`] as a compact JSON object.
///
/// Hand-rolled on purpose: five numeric fields do not justify a serde
/// dependency in a size-conscious, committed-artifact crate.
///
/// # Arguments
///
/// * `aggregates` - The computed aggregates.
///
/// # Returns
///
/// A JSON object string with camelCase keys (the host-side convention).
fn aggregates_to_json(aggregates: &stats::TreeAggregates) -> String {
    format!(
        r#"{{"nodeCount":{},"maxDepth":{},"ghostCount":{},"totalArea":{},"coverage":{}}}"#,
        aggregates.node_count,
        aggregates.max_depth,
        aggregates.ghost_count,
        aggregates.total_area,
        aggregates.coverage,
    )
}

impl AnalysisGuest for Component {
    /// Liveness + version check; see `wit/world.wit`.
    fn ping(msg: String) -> String {
        install_panic_hook();
        log(Level::Debug, &format!("[analysis] ping received: {msg}"));
        format!("inspector-component {}: {}", env!("CARGO_PKG_VERSION"), msg)
    }

    /// Store the parameter document verbatim; see `wit/world.wit`.
    fn set_params(params_json: String) {
        install_panic_hook();
        log(
            Level::Info,
            &format!("[analysis] parameters set ({} bytes)", params_json.len()),
        );
        // A poisoned mutex is unreachable here (no panicking section holds
        // the lock), but unwrapping would turn a future mistake into an
        // opaque trap — log instead.
        match ANALYSIS_PARAMETERS.lock() {
            Ok(mut slot) => *slot = Some(params_json),
            Err(_) => log(
                Level::Error,
                "[analysis] parameter store unavailable (poisoned lock)",
            ),
        }
    }

    /// Compute aggregates and push them to the host event stream;
    /// see `wit/world.wit`.
    fn analyze_tree(nodes: Vec<NodeRecord>, tex_w: u32, tex_h: u32) -> TreeStats {
        install_panic_hook();

        // 1. Map the ABI records onto the pure-math node type
        //    (`name-hash` carries identity, not geometry — it stays here
        //    at the boundary).
        let layout_nodes: Vec<stats::LayoutNode> = nodes
            .iter()
            .map(|record| stats::LayoutNode {
                bounds: record.bounds,
                depth: record.depth,
                parent: record.parent,
                flags: record.flags,
            })
            .collect();

        // 2. Run the unit-tested aggregate math.
        let aggregates = stats::analyze_tree(&layout_nodes, tex_w, tex_h);

        // 3. Report through both guest→host channels: a log line for
        //    humans, an event for page scripts.
        log(
            Level::Info,
            &format!(
                "[analysis] analyzed {} nodes over {tex_w}×{tex_h} texels",
                aggregates.node_count
            ),
        );
        emit("analysis-done", &aggregates_to_json(&aggregates));

        // 4. Return the typed result across the boundary.
        TreeStats {
            node_count: aggregates.node_count,
            max_depth: aggregates.max_depth,
            ghost_count: aggregates.ghost_count,
            total_area: aggregates.total_area,
            coverage: aggregates.coverage,
        }
    }
}
