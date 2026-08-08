//! WGSL entry points for edge-discovery refinement.

/// Refiner WGSL appended to the pixel-derived edge-discovery shader module.
///
/// The active refiner consumes only GPU-resident feature/evidence buffers
/// produced from captured-pixel texture and reduces them into per-tile support.
/// Earlier rectangle-candidate experiments used extra storage buffers at
/// bindings `8` and `9`; those are intentionally not part of this active
/// shader source because WebGPU's default compute-stage storage-buffer limit
/// is eight, and the current frequency-supported output path does not need them.
pub(crate) const EDGE_DISCOVERY_REFINER_SHADER: &str = r#"
fn empty_record(index: u32) -> EdgeDiscoveryRecord {
  var record: EdgeDiscoveryRecord;
  record.bounds = vec4f(0.0, 0.0, 0.0, 0.0);
  record.info = vec4u(index, 0u, 0u, 0u);
  return record;
}

// Discovery dispatch 4: reduce each 8x8 tile into oriented support statistics.
@compute @workgroup_size(8, 8)
fn edge_tile_stats(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(captured);
  if (dims.x == 0u || dims.y == 0u) {
    return;
  }

  let tile_count_x = (dims.x + EDGE_TILE_SIZE - 1u) / EDGE_TILE_SIZE;
  let tile_count_y = (dims.y + EDGE_TILE_SIZE - 1u) / EDGE_TILE_SIZE;
  if (id.x >= tile_count_x || id.y >= tile_count_y) {
    return;
  }

  let tile_origin = vec2u(id.x * EDGE_TILE_SIZE, id.y * EDGE_TILE_SIZE);
  let tile_end = min(tile_origin + vec2u(EDGE_TILE_SIZE, EDGE_TILE_SIZE), dims);
  let record_index = tile_index(id.xy, tile_count_x);

  var horizontal_support = 0u;
  var vertical_support = 0u;
  var max_evidence = 0u;
  var ink_texels = 0u;

  for (var y = tile_origin.y; y < tile_end.y; y = y + 1u) {
    for (var x = tile_origin.x; x < tile_end.x; x = x + 1u) {
      let texel = vec2u(x, y);
      let packed_feature = features[texel_index(texel, dims)];
      let packed_evidence = thinned_evidence[texel_index(texel, dims)];
      let magnitude = packed_evidence & EDGE_EVIDENCE_MAGNITUDE_MASK;
      max_evidence = max(max_evidence, magnitude);

      if ((packed_feature & FEATURE_INK_BIT) != 0u) {
        ink_texels = ink_texels + 1u;
      }
      if (magnitude >= EDGE_THRESHOLD_MILLI) {
        if ((packed_evidence & EDGE_EVIDENCE_HORIZONTAL_FLAG) != 0u) {
          horizontal_support = horizontal_support + 1u;
        }
        if ((packed_evidence & EDGE_EVIDENCE_VERTICAL_FLAG) != 0u) {
          vertical_support = vertical_support + 1u;
        }
      }
    }
  }

  tile_stats[record_index].stats =
    vec4u(horizontal_support, vertical_support, max_evidence, ink_texels);
}
"#;
