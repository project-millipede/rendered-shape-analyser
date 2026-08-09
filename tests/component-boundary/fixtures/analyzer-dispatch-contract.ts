/**
 * Protected command-recording order of the shared Rust compatibility
 * orchestrator, `encode_compatibility_dispatch`.
 *
 * Stable, async, and shared-frame worlds route through this orchestrator.
 * Pipeline creation and command recording are independent, so this fixture
 * describes dispatch order only: the first three entry points are diagnostic
 * lanes and the remaining seven are discovery stages. Retaining every entry
 * point makes accidental reordering visible even though the seven discovery
 * stages belong to the same discovery workload. Each world's distinct encoder
 * lifecycle ownership is tested separately.
 */
export const CURRENT_ANALYZER_DISPATCH_ENTRY_POINTS = [
  "init_visuals",
  "main",
  "trace_borders",
  "edge_feature",
  "edge_convolution",
  "edge_thin",
  "edge_tile_stats",
  "haar_low_high_frequency_level1",
  "haar_low_high_frequency_level2",
  "edge_project_frequency_support",
] as const;
