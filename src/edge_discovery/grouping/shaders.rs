//! WGSL entry point for projecting frequency support into edge-discovery output.

/// Frequency-output WGSL appended after the refiner entry points.
///
/// The dispatch reads the internal low/high-frequency support buffer and writes
/// visible tile records into `edge_outputs`. This keeps the public
/// `edgeDiscovery` output lane unchanged while making frequency-separated
/// support inspectable through the existing GPU-resident overlay.
pub(crate) const EDGE_DISCOVERY_GROUPING_SHADER: &str = r#"
// Final renderer-facing edge-discovery records.
@group(0) @binding(10) var<storage, read_write> edge_outputs: array<EdgeDiscoveryRecord>;

const EDGE_FREQUENCY_HORIZONTAL_TRACE_FLAG: u32 = 2u;
const EDGE_FREQUENCY_VERTICAL_TRACE_FLAG: u32 = 4u;

fn frequency_output_strength(support: vec4u, stats: vec4u) -> u32 {
  // Frequency output is a local-edge visibility probe:
  //
  // 1. x/y contain derived horizontal and vertical side support.
  // 2. z contains the strongest local low/high-frequency or Sobel detail.
  // 3. `stats` contains the current tile's local oriented edge hits.
  // 4. Coarse support must not activate a tile by itself. Block-level support
  //    is intentionally shared across a block, so using it as the draw gate
  //    floods whole regions.
  // 5. Local evidence opens the gate; frequency support only raises confidence
  //    for those already-edge-like tiles.
  let side_support = max(support.x, support.y);
  let local_oriented_support = max(stats.x, stats.y);
  let local_detail_support = min(
    HAAR_MAX_SUPPORT,
    max(stats.z, support.z) / HAAR_DETAIL_MILLI_PER_SUPPORT
  );
  let local_support = max(local_oriented_support, local_detail_support);
  if (local_support < EDGE_REFINER_MIN_TILE_SUPPORT) {
    return 0u;
  }

  let frequency_bonus = min(
    HAAR_MAX_SUPPORT,
    side_support / max(HAAR_LEVEL1_BLOCK_TILES, 1u)
  );
  return min(HAAR_MAX_SUPPORT, local_support + frequency_bonus);
}

fn frequency_output_orientation_flags(support: vec4u, stats: vec4u) -> u32 {
  // The renderer must draw what the analyzer actually found:
  //
  // 1. `stats.x` is the local Sobel horizontal-edge support in this tile.
  // 2. `stats.y` is the local Sobel vertical-edge support in this tile.
  // 3. `support.x`/`support.y` are the low/high-frequency reinforced
  //    horizontal/vertical support values for the same tile.
  // 4. These flags are not a style choice. They encode the dominant detected
  //    orientation so the overlay can draw a horizontal or vertical strip
  //    instead of filling the full tile.
  let horizontal_support = max(
    stats.x,
    support.x / max(HAAR_LEVEL1_BLOCK_TILES, 1u)
  );
  let vertical_support = max(
    stats.y,
    support.y / max(HAAR_LEVEL1_BLOCK_TILES, 1u)
  );

  var flags = EDGE_ACTIVE_CANDIDATE_FLAG;
  if (
    horizontal_support >= EDGE_REFINER_MIN_TILE_SUPPORT &&
    horizontal_support >= vertical_support
  ) {
    flags = flags | EDGE_FREQUENCY_HORIZONTAL_TRACE_FLAG;
  }
  if (
    vertical_support >= EDGE_REFINER_MIN_TILE_SUPPORT &&
    vertical_support >= horizontal_support
  ) {
    flags = flags | EDGE_FREQUENCY_VERTICAL_TRACE_FLAG;
  }

  // Strong detail can pass the visibility gate even when orientation support is
  // close to the threshold. In that case preserve visibility by assigning the
  // stronger orientation, but still derive it from the measured support pair.
  if ((flags & (EDGE_FREQUENCY_HORIZONTAL_TRACE_FLAG | EDGE_FREQUENCY_VERTICAL_TRACE_FLAG)) == 0u) {
    flags = flags | select(
      EDGE_FREQUENCY_VERTICAL_TRACE_FLAG,
      EDGE_FREQUENCY_HORIZONTAL_TRACE_FLAG,
      horizontal_support >= vertical_support
    );
  }

  return flags;
}

fn frequency_output_record(
  record_index: u32,
  tile: vec2u,
  dims: vec2u,
  strength: u32,
  flags: u32
) -> EdgeDiscoveryRecord {
  var record = empty_record(record_index);
  let origin = vec2u(tile.x * EDGE_TILE_SIZE, tile.y * EDGE_TILE_SIZE);
  let end = min(origin + vec2u(EDGE_TILE_SIZE, EDGE_TILE_SIZE), dims);
  let confidence = min(1000u, strength * 1000u / max(HAAR_MAX_SUPPORT, 1u));

  record.bounds = vec4f(
    f32(origin.x),
    f32(origin.y),
    f32(end.x - origin.x),
    f32(end.y - origin.y)
  );
  record.info = vec4u(
    record_index,
    confidence,
    flags,
    strength
  );
  return record;
}

// Discovery dispatch 7: compact internal frequency support into the existing renderer-facing
// edgeDiscovery output buffer.
//
// This is intentionally not a second transport layer and not a CPU readback:
// active records are appended into the existing `edgeDiscovery` buffer, while
// the GPU-written indirect draw arguments carry the active instance count.
// The record carries orientation flags derived from the same tile stats and
// frequency support that made it active, so the website can draw a measured
// horizontal or vertical trace without inventing one.
@compute @workgroup_size(8, 8)
fn edge_project_frequency_support(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(captured);
  if (dims.x == 0u || dims.y == 0u) {
    return;
  }

  let tile_count_x = (dims.x + EDGE_TILE_SIZE - 1u) / EDGE_TILE_SIZE;
  let tile_count_y = (dims.y + EDGE_TILE_SIZE - 1u) / EDGE_TILE_SIZE;
  if (id.x >= tile_count_x || id.y >= tile_count_y) {
    return;
  }

  let support = read_frequency_support(id.xy, tile_count_x);
  let stats = read_tile_stats(id.xy, tile_count_x);
  let strength = frequency_output_strength(support, stats);
  if (strength < HAAR_MIN_SIDE_SUPPORT) {
    return;
  }

  let output_index = atomicAdd(&edge_draw_args[1], 1u);
  let flags = frequency_output_orientation_flags(support, stats);
  edge_outputs[output_index] =
    frequency_output_record(output_index, id.xy, dims, strength, flags);
}
"#;
