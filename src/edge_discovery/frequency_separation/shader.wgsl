// Low/high-frequency separation state appended before concrete transforms.
//
// This file intentionally does not implement a wavelet. It provides only the
// common state and access helpers that concrete transforms can reuse:
//
// 1. `level1_bands` stores low-low, low-high, high-low, high-high data.
// 2. `level2_bands` stores the same band order for a second transform level.
// 3. `support` stores transform-derived support used by downstream grouping.
//
// Haar, Daubechies, or any later transform must live outside this folder and
// write into this shared state explicitly.

struct LowHighFrequencyState {
  // Level 1: low-low, low-high, high-low, high-high.
  level1_bands: vec4i,

  // Level 2: low-low, low-high, high-low, high-high.
  level2_bands: vec4i,

  // Derived support: horizontal, vertical, max high-frequency detail, diagonal/noise.
  support: vec4u,
};

// Per-tile frequency state.
//
// One storage buffer keeps the active layout below WebGPU's default
// storage-buffer limit while still preserving frequency-separated channels for
// future frequency transforms.
@group(0) @binding(11) var<storage, read_write> frequency_state: array<LowHighFrequencyState>;

fn frequency_record_index(tile: vec2u, tile_count_x: u32) -> u32 {
  return tile_index(tile, tile_count_x);
}

fn read_level1_frequency_bands(tile: vec2u, tile_count_x: u32, tile_count_y: u32) -> vec4i {
  if (tile.x >= tile_count_x || tile.y >= tile_count_y) {
    return vec4i(0);
  }
  return frequency_state[frequency_record_index(tile, tile_count_x)].level1_bands;
}

fn read_level2_frequency_bands(tile: vec2u, tile_count_x: u32, tile_count_y: u32) -> vec4i {
  if (tile.x >= tile_count_x || tile.y >= tile_count_y) {
    return vec4i(0);
  }
  return frequency_state[frequency_record_index(tile, tile_count_x)].level2_bands;
}

fn read_frequency_support(tile: vec2u, tile_count_x: u32) -> vec4u {
  return frequency_state[frequency_record_index(tile, tile_count_x)].support;
}
