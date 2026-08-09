import type {
  BindGroupLayoutRecord,
  BindGroupRecord,
  BufferMapObservation,
  BufferRecord,
  BufferUnmapObservation,
  CommandBufferRecord,
  CommandEncoderRecord,
  CommandRecord,
  ComputePassRecord,
  ComputePipelineRecord,
  DeviceRecord,
  IndirectOutputCreateObservation,
  OutputCreateObservation,
  PipelineCreateObservation,
  PipelineLayoutRecord,
  QueueRecord,
  QueueSubmitObservation,
  ShaderModuleRecord,
  TextureRecord,
} from "./records.js";

/** Registered upstream resource records. Reset replaces every weak registry. */
export let deviceRecords = new WeakMap<object, DeviceRecord>();
export let textureRecords = new WeakMap<object, TextureRecord>();
export let bufferRecords = new WeakMap<object, BufferRecord>();
export let queueRecords = new WeakMap<object, QueueRecord>();
export let commandBufferRecords = new WeakMap<object, CommandBufferRecord>();
export let commandEncoderRecords = new WeakMap<object, CommandEncoderRecord>();
export let computePassRecords = new WeakMap<object, ComputePassRecord>();
export let shaderModuleRecords = new WeakMap<object, ShaderModuleRecord>();
export let bindGroupLayoutRecords = new WeakMap<
  object,
  BindGroupLayoutRecord
>();
export let pipelineLayoutRecords = new WeakMap<object, PipelineLayoutRecord>();
export let computePipelineRecords = new WeakMap<
  object,
  ComputePipelineRecord
>();
export let bindGroupRecords = new WeakMap<object, BindGroupRecord>();

/** Captured upstream queue submissions, in call order. */
export const capturedTestGpuQueueSubmits: QueueSubmitObservation[] = [];

/** Captured upstream command encodes, in call order. */
export const capturedTestGpuCommandEncodes: CommandRecord[] = [];

/** Captured upstream compute-pipeline creates, in call order. */
export const capturedTestGpuPipelineCreates: PipelineCreateObservation[] = [];

/** Captured upstream summary-buffer bind-group creates, in call order. */
export const capturedTestGpuResultCreates: OutputCreateObservation[] = [];

/** Captured upstream visual-buffer bind-group creates, in call order. */
export const capturedTestGpuVisualCreates: IndirectOutputCreateObservation[] =
  [];

/** Captured upstream border-trace-buffer bind-group creates, in call order. */
export const capturedTestGpuBorderTraceCreates: IndirectOutputCreateObservation[] =
  [];

/** Captured upstream edge-discovery-buffer bind-group creates, in call order. */
export const capturedTestGpuEdgeDiscoveryCreates: IndirectOutputCreateObservation[] =
  [];

/** Captured upstream staging-buffer map requests, in call order. */
export const capturedTestGpuBufferMaps: BufferMapObservation[] = [];

/** Captured upstream mapped-range copies, in call order. */
export const capturedTestGpuMappedRangeCopies: BufferMapObservation[] = [];

/** Captured upstream staging-buffer unmaps, in call order. */
export const capturedTestGpuBufferUnmaps: BufferUnmapObservation[] = [];

/**
 * Clear WebGPU observations and invalidate every previously registered handle.
 *
 * Vitest files call the aggregate `resetTestHostState()` before importing or
 * exercising a generated world. Resetting registries means handles created by
 * an earlier test must never be reused after this function returns.
 */
export function resetTestWebGpuState(): void {
  capturedTestGpuQueueSubmits.length = 0;
  capturedTestGpuCommandEncodes.length = 0;
  capturedTestGpuPipelineCreates.length = 0;
  capturedTestGpuResultCreates.length = 0;
  capturedTestGpuVisualCreates.length = 0;
  capturedTestGpuBorderTraceCreates.length = 0;
  capturedTestGpuEdgeDiscoveryCreates.length = 0;
  capturedTestGpuBufferMaps.length = 0;
  capturedTestGpuMappedRangeCopies.length = 0;
  capturedTestGpuBufferUnmaps.length = 0;

  deviceRecords = new WeakMap<object, DeviceRecord>();
  textureRecords = new WeakMap<object, TextureRecord>();
  bufferRecords = new WeakMap<object, BufferRecord>();
  queueRecords = new WeakMap<object, QueueRecord>();
  commandBufferRecords = new WeakMap<object, CommandBufferRecord>();
  commandEncoderRecords = new WeakMap<object, CommandEncoderRecord>();
  computePassRecords = new WeakMap<object, ComputePassRecord>();
  shaderModuleRecords = new WeakMap<object, ShaderModuleRecord>();
  bindGroupLayoutRecords = new WeakMap<object, BindGroupLayoutRecord>();
  pipelineLayoutRecords = new WeakMap<object, PipelineLayoutRecord>();
  computePipelineRecords = new WeakMap<object, ComputePipelineRecord>();
  bindGroupRecords = new WeakMap<object, BindGroupRecord>();
}
