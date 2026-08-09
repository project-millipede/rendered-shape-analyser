import package::shared_indexing::{tile_index};

// Tiny WESL-only consumer for the first cross-file import experiment.
//
// This intentionally does not replace `shader.wgsl`. It only proves that this
// module can consume the shared `tile_index(...)` helper through WESL imports.

fn frequency_record_index_test(tile: vec2u, tile_count_x: u32) -> u32 {
  return tile_index(tile, tile_count_x);
}
