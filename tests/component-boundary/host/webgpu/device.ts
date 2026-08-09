import { createTestGpuBindGroup } from "./bindings.js";
import { GpuCommandEncoder, GpuQueue } from "./commands.js";
import {
  createTestGpuBindGroupLayout,
  createTestGpuComputePipeline,
  createTestGpuPipelineLayout,
  createTestGpuShaderModule,
} from "./pipelines.js";
import {
  requireTestGpuDevice,
  storeTestGpuBuffer,
  storeTestGpuCommandEncoder,
  storeTestGpuQueue,
} from "./registry.js";
import type {
  GpuBindGroupDescriptor,
  GpuBindGroupLayoutDescriptor,
  GpuBufferDescriptor,
  GpuCommandEncoderDescriptor,
  GpuComputePipelineDescriptor,
  GpuPipelineLayoutDescriptor,
  GpuShaderModuleDescriptor,
} from "./records.js";
import {
  GpuBindGroup,
  GpuBindGroupLayout,
  GpuBuffer,
  GpuComputePipeline,
  GpuError,
  GpuPipelineLayout,
  GpuShaderModule,
} from "./resources.js";

/** Opaque upstream resource for the registered foreign GPU device. */
export class GpuDevice {
  /**
   * Create a fake upstream buffer owned by the registered foreign device.
   *
   * @param descriptor - Buffer metadata supplied by Rust through WIT.
   * @returns An opaque upstream buffer handle for the registered record.
   */
  public createBuffer(descriptor: GpuBufferDescriptor): GpuBuffer {
    const { device } = requireTestGpuDevice(this);
    const handle = new GpuBuffer();
    storeTestGpuBuffer(handle, {
      buffer: {
        label: descriptor.label ?? "test buffer",
        mappedAtCreation: descriptor.mappedAtCreation ?? false,
        size: Number(descriptor.size),
        usage: descriptor.usage,
      },
      device,
      mapped: null,
    });
    return handle;
  }

  /**
   * Create a fake upstream shader module owned by this device.
   *
   * @param descriptor - Shader source and metadata supplied by Rust through WIT.
   * @returns An opaque upstream shader-module handle.
   */
  public createShaderModule(
    descriptor: GpuShaderModuleDescriptor,
  ): GpuShaderModule {
    const { device } = requireTestGpuDevice(this);
    return createTestGpuShaderModule(device, descriptor);
  }

  /**
   * Create a fake upstream analyzer bind-group layout.
   *
   * @param descriptor - Sparse analyzer layout entries supplied by Rust.
   * @returns An opaque layout handle carrying its classified analyzer role.
   */
  public createBindGroupLayout(
    descriptor: GpuBindGroupLayoutDescriptor,
  ): GpuBindGroupLayout {
    const { device } = requireTestGpuDevice(this);
    return createTestGpuBindGroupLayout(device, descriptor);
  }

  /**
   * Create a fake upstream analyzer bind group.
   *
   * @param descriptor - Exact layout, label, and sparse binding resources.
   * @returns A lane-classified opaque bind-group handle.
   */
  public createBindGroup(descriptor: GpuBindGroupDescriptor): GpuBindGroup {
    const { device } = requireTestGpuDevice(this);
    return createTestGpuBindGroup(device, descriptor);
  }

  /**
   * Create a fake upstream pipeline layout.
   *
   * @param descriptor - Ordered analyzer bind-group layouts supplied by Rust.
   * @returns An opaque pipeline-layout handle carrying the analyzer role.
   */
  public createPipelineLayout(
    descriptor: GpuPipelineLayoutDescriptor,
  ): GpuPipelineLayout {
    const { device } = requireTestGpuDevice(this);
    return createTestGpuPipelineLayout(device, descriptor);
  }

  /**
   * Create a fake upstream compute pipeline.
   *
   * @param descriptor - Explicit layout, shader module, entry point, and label.
   * @returns An opaque pipeline retaining its analyzer role and entry point.
   */
  public createComputePipeline(
    descriptor: GpuComputePipelineDescriptor,
  ): GpuComputePipeline {
    const { device } = requireTestGpuDevice(this);
    return createTestGpuComputePipeline(device, descriptor);
  }

  /**
   * Create an empty fake command encoder owned by this device.
   *
   * @param descriptor - Optional upstream command-encoder label.
   * @returns The registered opaque command-encoder handle.
   */
  public createCommandEncoder(
    descriptor: GpuCommandEncoderDescriptor | undefined,
  ): GpuCommandEncoder {
    const { device } = requireTestGpuDevice(this);
    const handle = new GpuCommandEncoder();
    storeTestGpuCommandEncoder(handle, {
      device,
      label: descriptor?.label ?? "test command encoder",
      computePassBegins: 0,
      computePassEnds: 0,
      computePassOpen: false,
      texture: null,
      buffer: null,
      summaryBuffer: null,
      visualBuffer: null,
      visualIndirectBuffer: null,
      borderTraceBuffer: null,
      borderTraceIndirectBuffer: null,
      edgeDiscoveryBuffer: null,
      edgeDiscoveryIndirectBuffer: null,
      dispatches: [],
      copiedSummary: false,
    });
    return handle;
  }

  /**
   * Return a fresh fake queue through upstream `gpu-device.queue`.
   *
   * 1. Resolve this opaque device handle to its registered foreign device.
   * 2. Register a fresh queue resource owned by that same device.
   * 3. Mirror the browser-host method used by Rust's analyzer lifecycle.
   *
   * @returns An opaque upstream queue handle.
   */
  public queue(): GpuQueue {
    const { device } = requireTestGpuDevice(this);
    const handle = new GpuQueue();
    storeTestGpuQueue(handle, { queue: {}, device });
    return handle;
  }

  /**
   * Push a WebGPU error filter onto this device's fake scope stack.
   *
   * @param filter - Error filter requested by Rust.
   */
  public pushErrorScope(filter: string): void {
    requireTestGpuDevice(this).errorScopes.push(filter);
  }

  /**
   * Pop the latest fake WebGPU error scope through the upstream async API.
   *
   * The promise resolves on the next microtask with an empty-message error,
   * representing a clean WebGPU scope.
   *
   * @returns The clean-scope error resource.
   */
  public async popErrorScope(): Promise<GpuError> {
    requireTestGpuDevice(this).errorScopes.pop();
    await Promise.resolve();
    return new GpuError("");
  }
}
