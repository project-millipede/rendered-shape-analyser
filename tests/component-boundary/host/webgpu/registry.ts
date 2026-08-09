/**
 * Opaque upstream-resource registry for the generated-component WebGPU test
 * host.
 *
 * `storeTestGpu*` associates a WIT-facing handle with its typed host-side
 * record in the current registry epoch. `requireTestGpu*` resolves that
 * association and rejects unknown or reset-invalidated handles. Handle
 * creation and resource-ownership decisions remain with the calling factory,
 * device, command, pipeline, or binding helper.
 */

import type {
  BindGroupLayoutRecord,
  BindGroupRecord,
  BufferRecord,
  CommandBufferRecord,
  CommandEncoderRecord,
  CommandRecord,
  ComputePassRecord,
  ComputePipelineRecord,
  DeviceRecord,
  PipelineLayoutRecord,
  QueueRecord,
  ShaderModuleRecord,
  TextureRecord,
} from "./records.js";
import {
  bindGroupLayoutRecords,
  bindGroupRecords,
  bufferRecords,
  commandBufferRecords,
  commandEncoderRecords,
  computePassRecords,
  computePipelineRecords,
  deviceRecords,
  pipelineLayoutRecords,
  queueRecords,
  shaderModuleRecords,
  textureRecords,
} from "./state.js";

export function storeTestGpuDevice(handle: object, record: DeviceRecord): void {
  deviceRecords.set(handle, record);
}

export function storeTestGpuTexture(
  handle: object,
  record: TextureRecord,
): void {
  textureRecords.set(handle, record);
}

export function storeTestGpuBuffer(handle: object, record: BufferRecord): void {
  bufferRecords.set(handle, record);
}

export function storeTestGpuQueue(handle: object, record: QueueRecord): void {
  queueRecords.set(handle, record);
}

export function storeTestGpuCommandBuffer(
  handle: object,
  record: CommandBufferRecord,
): void {
  commandBufferRecords.set(handle, record);
}

export function storeTestGpuCommandEncoder(
  handle: object,
  record: CommandEncoderRecord,
): void {
  commandEncoderRecords.set(handle, record);
}

export function storeTestGpuComputePass(
  handle: object,
  record: ComputePassRecord,
): void {
  computePassRecords.set(handle, record);
}

export function storeTestGpuShaderModule(
  handle: object,
  record: ShaderModuleRecord,
): void {
  shaderModuleRecords.set(handle, record);
}

export function storeTestGpuBindGroupLayout(
  handle: object,
  record: BindGroupLayoutRecord,
): void {
  bindGroupLayoutRecords.set(handle, record);
}

export function storeTestGpuPipelineLayout(
  handle: object,
  record: PipelineLayoutRecord,
): void {
  pipelineLayoutRecords.set(handle, record);
}

export function storeTestGpuComputePipeline(
  handle: object,
  record: ComputePipelineRecord,
): void {
  computePipelineRecords.set(handle, record);
}

export function storeTestGpuBindGroup(
  handle: object,
  record: BindGroupRecord,
): void {
  bindGroupRecords.set(handle, record);
}

/**
 * Resolve an opaque upstream device handle.
 *
 * @param handle - Device handle registered in the current test-host epoch.
 * @returns The foreign device and its fake error-scope stack.
 */
export function requireTestGpuDevice(handle: object): DeviceRecord {
  const record = deviceRecords.get(handle);
  if (!record) {
    throw new Error("test wasi:webgpu received an unknown device handle");
  }
  return record;
}

/**
 * Resolve an opaque upstream texture handle.
 *
 * @param handle - Texture handle registered in the current test-host epoch.
 * @returns The foreign texture and its owning device.
 */
export function requireTestGpuTexture(handle: object): TextureRecord {
  const record = textureRecords.get(handle);
  if (!record) {
    throw new Error("test wasi:webgpu received an unknown texture handle");
  }
  return record;
}

/**
 * Resolve an opaque upstream buffer handle.
 *
 * @param handle - Buffer handle registered in the current test-host epoch.
 * @returns The foreign buffer, its device, and current synthetic mapping.
 */
export function requireTestGpuBuffer(handle: object): BufferRecord {
  const record = bufferRecords.get(handle);
  if (!record) {
    throw new Error("test wasi:webgpu received an unknown buffer handle");
  }
  return record;
}

/**
 * Resolve an opaque upstream queue handle.
 *
 * @param handle - Queue handle registered in the current test-host epoch.
 * @returns The fake queue record and its owning device.
 */
export function requireTestGpuQueue(handle: object): QueueRecord {
  const record = queueRecords.get(handle);
  if (!record) {
    throw new Error("test wasi:webgpu received an unknown queue handle");
  }
  return record;
}

/**
 * Resolve an opaque upstream command-buffer handle.
 *
 * @param handle - Command-buffer handle registered in the current host epoch.
 * @returns The completed command record and optional submission snapshot.
 */
export function requireTestGpuCommandBuffer(
  handle: object,
): CommandBufferRecord {
  const record = commandBufferRecords.get(handle);
  if (!record) {
    throw new Error(
      "test wasi:webgpu received an unknown command-buffer handle",
    );
  }
  return record;
}

/**
 * Resolve an opaque upstream command-encoder handle.
 *
 * @param handle - Command-encoder handle registered in the current host epoch.
 * @returns The in-progress resource, dispatch, and summary-copy state.
 */
export function requireTestGpuCommandEncoder(
  handle: object,
): CommandEncoderRecord {
  const record = commandEncoderRecords.get(handle);
  if (!record) {
    throw new Error(
      "test wasi:webgpu received an unknown command-encoder handle",
    );
  }
  return record;
}

/**
 * Resolve an opaque upstream compute-pass handle.
 *
 * @param handle - Compute-pass handle registered in the current host epoch.
 * @returns The parent encoder and active-pipeline state for the pass.
 */
export function requireTestGpuComputePass(handle: object): ComputePassRecord {
  const record = computePassRecords.get(handle);
  if (!record) {
    throw new Error("test wasi:webgpu received an unknown compute-pass handle");
  }
  return record;
}

/**
 * Resolve an opaque upstream shader-module handle.
 *
 * @param handle - Shader-module handle registered in the current host epoch.
 * @returns The owning device and original shader-module descriptor.
 */
export function requireTestGpuShaderModule(handle: object): ShaderModuleRecord {
  const record = shaderModuleRecords.get(handle);
  if (!record) {
    throw new Error(
      "test wasi:webgpu received an unknown shader-module handle",
    );
  }
  return record;
}

/**
 * Resolve an opaque upstream bind-group-layout handle.
 *
 * @param handle - Layout handle registered in the current test-host epoch.
 * @returns Its device, classified analyzer role, and original descriptor.
 */
export function requireTestGpuBindGroupLayout(
  handle: object,
): BindGroupLayoutRecord {
  const record = bindGroupLayoutRecords.get(handle);
  if (!record) {
    throw new Error(
      "test wasi:webgpu received an unknown bind-group-layout handle",
    );
  }
  return record;
}

/**
 * Resolve an opaque upstream pipeline-layout handle.
 *
 * @param handle - Layout handle registered in the current test-host epoch.
 * @returns Its device, propagated analyzer role, and original descriptor.
 */
export function requireTestGpuPipelineLayout(
  handle: object,
): PipelineLayoutRecord {
  const record = pipelineLayoutRecords.get(handle);
  if (!record) {
    throw new Error(
      "test wasi:webgpu received an unknown pipeline-layout handle",
    );
  }
  return record;
}

/**
 * Resolve an opaque upstream compute-pipeline handle.
 *
 * @param handle - Pipeline handle registered in the current test-host epoch.
 * @returns Its device, analyzer role, and exact shader entry point.
 */
export function requireTestGpuComputePipeline(
  handle: object,
): ComputePipelineRecord {
  const record = computePipelineRecords.get(handle);
  if (!record) {
    throw new Error(
      "test wasi:webgpu received an unknown compute-pipeline handle",
    );
  }
  return record;
}

/**
 * Resolve an opaque upstream bind-group handle.
 *
 * @param handle - Bind-group handle registered in the current test-host epoch.
 * @returns The owning device and lane-specific foreign resource record.
 */
export function requireTestGpuBindGroup(handle: object): BindGroupRecord {
  const record = bindGroupRecords.get(handle);
  if (!record) {
    throw new Error("test wasi:webgpu received an unknown bind-group handle");
  }
  return record;
}

/**
 * Resolve the submission snapshot recorded by `gpu-queue.submit`.
 *
 * @param handle - Opaque upstream command-buffer handle.
 * @returns The analyzer command record captured at submission time.
 * @throws If the handle is unknown or the command buffer was never submitted.
 */
export function requireTestSubmittedGpuCommandBuffer(
  handle: object,
): CommandRecord {
  const record = requireTestGpuCommandBuffer(handle);
  if (!record.submission) {
    throw new Error("test wasi:webgpu command buffer was not submitted");
  }
  return record.submission;
}
