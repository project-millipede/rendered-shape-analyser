/**
 * Typed Node test double for the exact `wasi:webgpu/webgpu` surface used by
 * the generated R2 GPU components.
 *
 * This suite has no browser WebGPU. It proves resource identity and the narrow
 * metadata, command-buffer, queue-submission, error-scope, and asynchronous
 * readback surfaces Rust consumes. Foreign input objects and test-host-created
 * GPU resources are wrapped as opaque upstream WIT handles, pass through Rust,
 * and resolve back to their registered records in the project host imports.
 *
 * Shader execution, texel contents, and native GPU results remain browser-test
 * responsibilities.
 */

export { GpuDevice } from "./device.js";
export {
  GpuCommandBuffer,
  GpuCommandEncoder,
  GpuComputePassEncoder,
  GpuQueue,
} from "./commands.js";
export {
  GpuBindGroup,
  GpuBindGroupLayout,
  GpuBuffer,
  GpuComputePipeline,
  GpuError,
  GpuPipelineLayout,
  GpuQuerySet,
  GpuSampler,
  GpuShaderModule,
  GpuTexture,
  GpuTextureView,
  RecordGpuPipelineConstantValue,
} from "./resources.js";
export {
  registerTestGpuBindGroup,
  registerTestGpuBuffer,
  registerTestGpuCommandBuffer,
  registerTestGpuComputePipeline,
  registerTestGpuDevice,
  registerTestGpuTexture,
} from "./factory.js";
export {
  requireTestGpuBindGroup,
  requireTestGpuBindGroupLayout,
  requireTestGpuBuffer,
  requireTestGpuCommandBuffer,
  requireTestGpuCommandEncoder,
  requireTestGpuComputePass,
  requireTestGpuComputePipeline,
  requireTestGpuDevice,
  requireTestGpuPipelineLayout,
  requireTestGpuQueue,
  requireTestGpuShaderModule,
  requireTestGpuTexture,
  requireTestSubmittedGpuCommandBuffer,
} from "./registry.js";
export {
  capturedTestGpuBorderTraceCreates,
  capturedTestGpuBufferMaps,
  capturedTestGpuBufferUnmaps,
  capturedTestGpuCommandEncodes,
  capturedTestGpuEdgeDiscoveryCreates,
  capturedTestGpuMappedRangeCopies,
  capturedTestGpuPipelineCreates,
  capturedTestGpuQueueSubmits,
  capturedTestGpuResultCreates,
  capturedTestGpuVisualCreates,
  resetTestWebGpuState,
} from "./state.js";
export type * from "./records.js";
