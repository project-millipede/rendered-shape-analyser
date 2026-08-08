// Haar low/high-frequency transform.
//
// This is the concrete wavelet implementation. It reuses the generic
// `frequency_state` buffer from `frequency_separation`, but all Haar math,
// block alignment, and support scoring lives here.

// These declarations are `wgsl-macro` replacement anchors, not the Haar
// defaults. The numeric source of truth lives in `layout.rs`, where Rust can also use the
// same values for tests, planning, and validation. The `0u` values below are
// intentionally invalid placeholders: if preprocessing ever stopped replacing
// them, the shader would produce obviously wrong output instead of silently
// acting like a tuned Haar transform.
//
// 1. The Haar module registers the real values through `register_constants`.
// 2. `wgsl-macro` replaces each matching `const` declaration before WebGPU sees
//    the final shader source.
// 3. Leaving the declarations in this file keeps the WGSL readable and gives
//    the preprocessor an explicit place to substitute module-owned constants.
// Default: 2 tiles.
const HAAR_LEVEL1_BLOCK_TILES: u32 = 0u;
// Default: 4 tiles.
const HAAR_LEVEL2_BLOCK_TILES: u32 = 0u;
// Default: 5 support units.
const HAAR_MIN_SIDE_SUPPORT: u32 = 0u;
// Default: 24 luminance milli-units per support unit.
const HAAR_DETAIL_MILLI_PER_SUPPORT: u32 = 0u;
// Default: 64 support units.
const HAAR_MAX_SUPPORT: u32 = 0u;

fn safe_tile_stats(tile: vec2u, tile_count_x: u32, tile_count_y: u32) -> vec4u {
  if (tile.x >= tile_count_x || tile.y >= tile_count_y) {
    return vec4u(0u);
  }
  return read_tile_stats(tile, tile_count_x);
}

fn tile_luma_sum_and_count(tile: vec2u, dims: vec2u) -> vec2u {
  let tile_origin = vec2u(tile.x * EDGE_TILE_SIZE, tile.y * EDGE_TILE_SIZE);
  if (tile_origin.x >= dims.x || tile_origin.y >= dims.y) {
    return vec2u(0u, 0u);
  }

  let tile_end = min(tile_origin + vec2u(EDGE_TILE_SIZE, EDGE_TILE_SIZE), dims);
  var sum = 0u;
  var count = 0u;
  for (var y = tile_origin.y; y < tile_end.y; y = y + 1u) {
    for (var x = tile_origin.x; x < tile_end.x; x = x + 1u) {
      sum = sum + (features[texel_index(vec2u(x, y), dims)] & FEATURE_LUMA_MASK);
      count = count + 1u;
    }
  }
  return vec2u(sum, count);
}

fn tile_luma_average(tile: vec2u, dims: vec2u) -> i32 {
  let sum_and_count = tile_luma_sum_and_count(tile, dims);
  if (sum_and_count.y == 0u) {
    return 0;
  }
  return i32(sum_and_count.x / sum_and_count.y);
}

fn aligned_block_origin(tile: vec2u, block_size: u32) -> vec2u {
  return (tile / vec2u(block_size, block_size)) * vec2u(block_size, block_size);
}

fn haar_low_high_frequency_bands_2d(a: i32, b: i32, c: i32, d: i32) -> vec4i {
  // 2D Haar band order:
  //
  // 1. low-low: low frequency across x and y. This is the block average.
  // 2. low-high: low across x, high across y. Top/bottom change.
  // 3. high-low: high across x, low across y. Left/right change.
  // 4. high-high: high across x and y. Diagonal/corner/noise detail.
  return vec4i(
    (a + b + c + d) / 4,
    (a + b - c - d) / 4,
    (a - b + c - d) / 4,
    (a - b - c + d) / 4
  );
}

fn abs_u32(value: i32) -> u32 {
  return u32(abs(value));
}

fn max3_u32(a: u32, b: u32, c: u32) -> u32 {
  return max(max(a, b), c);
}

fn haar_detail_support(detail: i32) -> u32 {
  return abs_u32(detail) / HAAR_DETAIL_MILLI_PER_SUPPORT;
}

// Discovery dispatch 5: concrete Haar level-1 low/high-frequency separation.
//
// This dispatch is intentionally not part of the shared frequency service:
//
// 1. It samples one 2x2 tile block.
// 2. It computes the Haar low-low, low-high, high-low, and high-high bands.
// 3. It writes those bands into the reusable `frequency_state` buffer.
@compute @workgroup_size(8, 8)
fn haar_low_high_frequency_level1(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(captured);
  if (dims.x == 0u || dims.y == 0u) {
    return;
  }

  let tile_count_x = (dims.x + EDGE_TILE_SIZE - 1u) / EDGE_TILE_SIZE;
  let tile_count_y = (dims.y + EDGE_TILE_SIZE - 1u) / EDGE_TILE_SIZE;
  if (id.x >= tile_count_x || id.y >= tile_count_y) {
    return;
  }

  let tile = id.xy;
  let origin = aligned_block_origin(tile, HAAR_LEVEL1_BLOCK_TILES);
  let a = tile_luma_average(origin + vec2u(0u, 0u), dims);
  let b = tile_luma_average(origin + vec2u(1u, 0u), dims);
  let c = tile_luma_average(origin + vec2u(0u, 1u), dims);
  let d = tile_luma_average(origin + vec2u(1u, 1u), dims);

  let record_index = frequency_record_index(tile, tile_count_x);
  frequency_state[record_index].level1_bands = haar_low_high_frequency_bands_2d(a, b, c, d);
  frequency_state[record_index].level2_bands = vec4i(0);
  frequency_state[record_index].support = vec4u(0u);
}

// Discovery dispatch 6: concrete Haar level-2 separation and support scoring.
//
// This dispatch turns the level-1 low-low band into a second low/high-frequency
// hierarchy and combines both levels with measured tile stats. The output is
// still generic frequency support, so downstream grouping does not need to
// know how Haar computed it.
@compute @workgroup_size(8, 8)
fn haar_low_high_frequency_level2(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(captured);
  if (dims.x == 0u || dims.y == 0u) {
    return;
  }

  let tile_count_x = (dims.x + EDGE_TILE_SIZE - 1u) / EDGE_TILE_SIZE;
  let tile_count_y = (dims.y + EDGE_TILE_SIZE - 1u) / EDGE_TILE_SIZE;
  if (id.x >= tile_count_x || id.y >= tile_count_y) {
    return;
  }

  let tile = id.xy;
  let origin = aligned_block_origin(tile, HAAR_LEVEL2_BLOCK_TILES);
  let a = read_level1_frequency_bands(origin + vec2u(0u, 0u), tile_count_x, tile_count_y).x;
  let b = read_level1_frequency_bands(origin + vec2u(2u, 0u), tile_count_x, tile_count_y).x;
  let c = read_level1_frequency_bands(origin + vec2u(0u, 2u), tile_count_x, tile_count_y).x;
  let d = read_level1_frequency_bands(origin + vec2u(2u, 2u), tile_count_x, tile_count_y).x;
  let level1_bands = read_level1_frequency_bands(tile, tile_count_x, tile_count_y);
  let level2_bands = haar_low_high_frequency_bands_2d(a, b, c, d);
  let stats = safe_tile_stats(tile, tile_count_x, tile_count_y);

  let level1_horizontal = haar_detail_support(level1_bands.y);
  let level1_vertical = haar_detail_support(level1_bands.z);
  let level1_noise = haar_detail_support(level1_bands.w);
  let level2_horizontal = haar_detail_support(level2_bands.y);
  let level2_vertical = haar_detail_support(level2_bands.z);
  let level2_noise = haar_detail_support(level2_bands.w);
  let horizontal_support = min(
    HAAR_MAX_SUPPORT,
    stats.x + level1_horizontal + level2_horizontal
  );
  let vertical_support = min(
    HAAR_MAX_SUPPORT,
    stats.y + level1_vertical + level2_vertical
  );
  let max_detail = max3_u32(
    max(abs_u32(level1_bands.y), abs_u32(level1_bands.z)),
    max(abs_u32(level2_bands.y), abs_u32(level2_bands.z)),
    stats.z
  );
  let diagonal_detail = max(level1_noise, level2_noise);

  let record_index = frequency_record_index(tile, tile_count_x);
  frequency_state[record_index].level2_bands = level2_bands;
  frequency_state[record_index].support =
    vec4u(horizontal_support, vertical_support, max_detail, diagonal_detail);
}
