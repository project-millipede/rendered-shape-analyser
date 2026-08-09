// Shared indexing helpers for edge-discovery shader modules.
//
// This is intentionally tiny for the first WESL experiment. The goal is to
// prove one real cross-file dependency (`tile_index`) without moving the full
// base shader, refiner, grouping, or constants system yet.

@publish
fn tile_index(tile: vec2u, tile_count_x: u32) -> u32 {
  return tile.x + tile.y * tile_count_x;
}
