import {
  requireTestGpuBindGroupLayout,
  requireTestGpuBuffer,
  requireTestGpuTexture,
  storeTestGpuBindGroup,
} from "./registry.js";
import type {
  AnalyzerPipelineRole,
  ForeignGpuBuffer,
  ForeignGpuDevice,
  ForeignGpuTexture,
  GpuBindGroupDescriptor,
  GpuBindGroupEntry,
  GpuBindGroupLayoutDescriptor,
} from "./records.js";
import { GpuBindGroup } from "./resources.js";
import {
  capturedTestGpuBorderTraceCreates,
  capturedTestGpuEdgeDiscoveryCreates,
  capturedTestGpuResultCreates,
  capturedTestGpuVisualCreates,
} from "./state.js";

/**
 * Classify the analyzer lane represented by an exact sparse binding sequence.
 *
 * Binding numbers are WGSL compatibility keys, not array positions. Both the
 * keys and their emitted order belong to the boundary contract established by
 * R2-A and preserved by R2-B; they must not be compacted while porting the
 * existing host.
 *
 * @param descriptor - Bind-group-layout descriptor supplied by Rust through WIT.
 * @returns The analyzer role matching the descriptor's ordered binding keys.
 * @throws If no supported analyzer layout matches the descriptor.
 */
export function classifyTestBindGroupLayout(
  descriptor: GpuBindGroupLayoutDescriptor,
): AnalyzerPipelineRole {
  const { entries } = descriptor;
  if (
    entries.length === 3 &&
    entries[0]?.binding === 1 &&
    entries[1]?.binding === 3 &&
    entries[2]?.binding === 13
  ) {
    return "visual";
  }
  if (
    entries.length === 3 &&
    entries[0]?.binding === 0 &&
    entries[1]?.binding === 1 &&
    entries[2]?.binding === 2
  ) {
    return "stats";
  }
  if (
    entries.length === 4 &&
    entries[0]?.binding === 0 &&
    entries[1]?.binding === 1 &&
    entries[2]?.binding === 4 &&
    entries[3]?.binding === 14
  ) {
    return "border-trace";
  }
  if (
    entries.length === 8 &&
    entries[0]?.binding === 0 &&
    entries[1]?.binding === 5 &&
    entries[2]?.binding === 6 &&
    entries[3]?.binding === 7 &&
    entries[4]?.binding === 12 &&
    entries[5]?.binding === 10 &&
    entries[6]?.binding === 11 &&
    entries[7]?.binding === 13
  ) {
    return "edge-discovery";
  }
  throw new Error("test unsupported analyzer bind-group layout");
}

/**
 * Resolve one required bind-group entry by its sparse WGSL-compatible key.
 *
 * @param entries - Upstream bind-group entries to search.
 * @param binding - Binding key to resolve.
 * @returns The entry carrying that binding key.
 * @throws If the descriptor omitted the required binding.
 */
function requireTestBindGroupEntry(
  entries: GpuBindGroupEntry[],
  binding: number,
): GpuBindGroupEntry {
  const entry = entries.find((candidate) => candidate.binding === binding);
  if (!entry) {
    throw new Error(`test missing bind-group entry ${binding}`);
  }
  return entry;
}

/** Extract the opaque WIT handle from the expected resource variant. */
function requireResourceHandle(
  entry: GpuBindGroupEntry,
  expectedTag: "gpu-buffer" | "gpu-texture",
): object {
  const { resource } = entry;
  if (
    resource.tag !== expectedTag ||
    !("val" in resource) ||
    typeof resource.val !== "object" ||
    resource.val === null
  ) {
    throw new Error(`test binding ${entry.binding} expected ${expectedTag}`);
  }
  return resource.val;
}

/**
 * Resolve one buffer binding to its registered foreign buffer.
 *
 * The binding must exist, carry the `gpu-buffer` variant, and belong to the
 * device creating the bind group.
 *
 * @param device - Foreign device that must own the resolved buffer.
 * @param entries - Sparse upstream bind-group entries.
 * @param binding - WGSL-compatible binding key to resolve.
 * @returns The registered foreign buffer object.
 */
function requireTestGpuBufferResource(
  device: ForeignGpuDevice,
  entries: GpuBindGroupEntry[],
  binding: number,
): ForeignGpuBuffer {
  const entry = requireTestBindGroupEntry(entries, binding);
  const record = requireTestGpuBuffer(
    requireResourceHandle(entry, "gpu-buffer"),
  );
  if (record.device !== device) {
    throw new Error(
      `test binding ${binding} received a buffer from a different device`,
    );
  }
  return record.buffer;
}

/**
 * Resolve one texture binding to its registered foreign texture.
 *
 * The binding must exist, carry the `gpu-texture` variant, and belong to the
 * device creating the bind group.
 *
 * @param device - Foreign device that must own the resolved texture.
 * @param entries - Sparse upstream bind-group entries.
 * @param binding - WGSL-compatible binding key to resolve.
 * @returns The registered foreign texture object.
 */
function requireTestGpuTextureResource(
  device: ForeignGpuDevice,
  entries: GpuBindGroupEntry[],
  binding: number,
): ForeignGpuTexture {
  const entry = requireTestBindGroupEntry(entries, binding);
  const record = requireTestGpuTexture(
    requireResourceHandle(entry, "gpu-texture"),
  );
  if (record.device !== device) {
    throw new Error(
      `test binding ${binding} received a texture from a different device`,
    );
  }
  return record.texture;
}

/**
 * Create and record one analyzer bind group for the compatibility path.
 *
 * 1. Resolve the analyzer layout Rust created earlier and enforce device
 *    ownership.
 * 2. Resolve the sparse resources the fake command recorder must retain for
 *    that lane. Layout classification separately checks the complete binding
 *    order, including entries whose identity is not projected onto the fake
 *    encoder.
 * 3. Capture visual, summary, border-trace, or edge-discovery output buffers.
 * 4. Register the lane resources behind an opaque handle that Rust can pass
 *    directly to `set-bind-group`.
 *
 * @param device - Foreign device creating the bind group.
 * @param descriptor - Upstream layout, label, and sparse resource entries.
 * @returns The registered opaque bind-group handle.
 */
export function createTestGpuBindGroup(
  device: ForeignGpuDevice,
  descriptor: GpuBindGroupDescriptor,
): GpuBindGroup {
  const layoutRecord = requireTestGpuBindGroupLayout(descriptor.layout);
  if (layoutRecord.device !== device) {
    throw new Error(
      "test bind group received a layout from a different device",
    );
  }

  const handle = new GpuBindGroup();
  if (layoutRecord.role === "visual") {
    const truthBuffer = requireTestGpuBufferResource(
      device,
      descriptor.entries,
      1,
    );
    const visualBuffer = requireTestGpuBufferResource(
      device,
      descriptor.entries,
      3,
    );
    const visualIndirectBuffer = requireTestGpuBufferResource(
      device,
      descriptor.entries,
      13,
    );
    capturedTestGpuVisualCreates.push({
      device,
      buffer: visualBuffer,
      indirectBuffer: visualIndirectBuffer,
      label: descriptor.label,
    });
    storeTestGpuBindGroup(handle, {
      kind: "visual",
      device,
      texture: null,
      buffer: truthBuffer,
      summaryBuffer: null,
      visualBuffer,
      visualIndirectBuffer,
      borderTraceBuffer: null,
      borderTraceIndirectBuffer: null,
      edgeDiscoveryBuffer: null,
      edgeDiscoveryIndirectBuffer: null,
    });
    return handle;
  }

  if (layoutRecord.role === "border-trace") {
    const texture = requireTestGpuTextureResource(
      device,
      descriptor.entries,
      0,
    );
    const truthBuffer = requireTestGpuBufferResource(
      device,
      descriptor.entries,
      1,
    );
    const borderTraceBuffer = requireTestGpuBufferResource(
      device,
      descriptor.entries,
      4,
    );
    const borderTraceIndirectBuffer = requireTestGpuBufferResource(
      device,
      descriptor.entries,
      14,
    );
    capturedTestGpuBorderTraceCreates.push({
      device,
      buffer: borderTraceBuffer,
      indirectBuffer: borderTraceIndirectBuffer,
      label: descriptor.label,
    });
    storeTestGpuBindGroup(handle, {
      kind: "border-trace",
      device,
      texture,
      buffer: truthBuffer,
      summaryBuffer: null,
      visualBuffer: null,
      visualIndirectBuffer: null,
      borderTraceBuffer,
      borderTraceIndirectBuffer,
      edgeDiscoveryBuffer: null,
      edgeDiscoveryIndirectBuffer: null,
    });
    return handle;
  }

  if (layoutRecord.role === "edge-discovery") {
    const texture = requireTestGpuTextureResource(
      device,
      descriptor.entries,
      0,
    );
    requireTestGpuBufferResource(device, descriptor.entries, 5);
    requireTestGpuBufferResource(device, descriptor.entries, 6);
    requireTestGpuBufferResource(device, descriptor.entries, 7);
    requireTestGpuBufferResource(device, descriptor.entries, 11);
    const edgeDiscoveryBuffer = requireTestGpuBufferResource(
      device,
      descriptor.entries,
      10,
    );
    const edgeDiscoveryIndirectBuffer = requireTestGpuBufferResource(
      device,
      descriptor.entries,
      13,
    );
    capturedTestGpuEdgeDiscoveryCreates.push({
      device,
      buffer: edgeDiscoveryBuffer,
      indirectBuffer: edgeDiscoveryIndirectBuffer,
      label: descriptor.label,
    });
    storeTestGpuBindGroup(handle, {
      kind: "edge-discovery",
      device,
      texture,
      buffer: null,
      summaryBuffer: null,
      visualBuffer: null,
      visualIndirectBuffer: null,
      borderTraceBuffer: null,
      borderTraceIndirectBuffer: null,
      edgeDiscoveryBuffer,
      edgeDiscoveryIndirectBuffer,
    });
    return handle;
  }

  const texture = requireTestGpuTextureResource(device, descriptor.entries, 0);
  const truthBuffer = requireTestGpuBufferResource(
    device,
    descriptor.entries,
    1,
  );
  const summaryBuffer = requireTestGpuBufferResource(
    device,
    descriptor.entries,
    2,
  );
  capturedTestGpuResultCreates.push({
    device,
    buffer: summaryBuffer,
    label: descriptor.label,
  });
  storeTestGpuBindGroup(handle, {
    kind: "stats",
    device,
    texture,
    buffer: truthBuffer,
    summaryBuffer,
    visualBuffer: null,
    visualIndirectBuffer: null,
    borderTraceBuffer: null,
    borderTraceIndirectBuffer: null,
    edgeDiscoveryBuffer: null,
    edgeDiscoveryIndirectBuffer: null,
  });
  return handle;
}
