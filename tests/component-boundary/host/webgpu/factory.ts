import { GpuCommandBuffer } from "./commands.js";
import { GpuDevice } from "./device.js";
import {
  storeTestGpuBindGroup,
  storeTestGpuBuffer,
  storeTestGpuCommandBuffer,
  storeTestGpuComputePipeline,
  storeTestGpuDevice,
  storeTestGpuTexture,
} from "./registry.js";
import type {
  BindGroupRecord,
  CommandRecord,
  ComputePipelineRecord,
  ForeignGpuBuffer,
  ForeignGpuDevice,
  ForeignGpuTexture,
} from "./records.js";
import {
  GpuBindGroup,
  GpuBuffer,
  GpuComputePipeline,
  GpuTexture,
} from "./resources.js";

/**
 * Register a caller-owned device for the component-boundary proof.
 *
 * @param device - Foreign object representing the shared browser GPU device.
 * @returns Its opaque upstream `gpu-device` resource handle.
 */
export function registerTestGpuDevice(device: ForeignGpuDevice): GpuDevice {
  const handle = new GpuDevice();
  storeTestGpuDevice(handle, { device, errorScopes: [] });
  return handle;
}

/**
 * Register a captured-pixel texture owned by a foreign device.
 *
 * @param texture - Foreign texture metadata supplied by the caller.
 * @param device - Foreign device that owns the texture.
 * @returns Its opaque upstream `gpu-texture` resource handle.
 */
export function registerTestGpuTexture(
  texture: ForeignGpuTexture,
  device: ForeignGpuDevice,
): GpuTexture {
  const handle = new GpuTexture();
  storeTestGpuTexture(handle, { texture, device });
  return handle;
}

/**
 * Register a caller-supplied or test-prepared buffer owned by a foreign device.
 *
 * @param buffer - Foreign buffer metadata supplied by the caller.
 * @param device - Foreign device that owns the buffer.
 * @returns Its opaque upstream `gpu-buffer` resource handle.
 */
export function registerTestGpuBuffer(
  buffer: ForeignGpuBuffer,
  device: ForeignGpuDevice,
): GpuBuffer {
  const handle = new GpuBuffer();
  storeTestGpuBuffer(handle, { buffer, device, mapped: null });
  return handle;
}

/**
 * Register a completed analyzer command record as an unsubmitted buffer.
 *
 * @param record - Device, lane resources, dispatches, copy, and label.
 * @returns Its opaque upstream `gpu-command-buffer` resource handle.
 */
export function registerTestGpuCommandBuffer(
  record: CommandRecord,
): GpuCommandBuffer {
  const handle = new GpuCommandBuffer();
  storeTestGpuCommandBuffer(handle, { ...record, submission: null });
  return handle;
}

/**
 * Register a fake analyzer compute pipeline.
 *
 * @param record - Owning device, lane role, and exact shader entry point.
 * @returns Its opaque upstream compute-pipeline handle.
 */
export function registerTestGpuComputePipeline(
  record: ComputePipelineRecord,
): GpuComputePipeline {
  const handle = new GpuComputePipeline();
  storeTestGpuComputePipeline(handle, record);
  return handle;
}

/**
 * Register a fake analyzer bind group.
 *
 * @param record - Owning device and lane-specific foreign resources.
 * @returns Its opaque upstream bind-group handle.
 */
export function registerTestGpuBindGroup(
  record: BindGroupRecord,
): GpuBindGroup {
  const handle = new GpuBindGroup();
  storeTestGpuBindGroup(handle, record);
  return handle;
}
