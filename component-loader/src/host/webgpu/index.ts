/**
 * Minimal browser host projection for upstream `wasi:webgpu/webgpu` resources.
 *
 * This module owns resource identity plus the tiny upstream surfaces the Rust
 * component currently consumes. It does not implement the full WebGPU WIT
 * interface yet; it implements only the upstream-shaped operations needed by
 * summary, visual, border-trace, and pixel-derived edge-discovery lanes.
 */

import type * as GeneratedWebGpu from "../../../../pkg/generated/gpu-analysis/interfaces/wasi-webgpu-webgpu";
import type * as GeneratedAsyncWebGpu from "../../../../pkg/generated/gpu-analysis-async/interfaces/wasi-webgpu-webgpu";
import type * as GeneratedFrameWebGpu from "../../../../pkg/generated/gpu-analysis-frame/interfaces/wasi-webgpu-webgpu";
import {
  copyMappedBrowserBufferRange,
  mapBrowserBufferForRead,
  type UpstreamGpuMapMode,
  unmapBrowserBuffer,
} from "./async/buffer";
import {
  createPopErrorScopeError,
  popBrowserErrorScopeMessage,
  pushBrowserErrorScope,
} from "./async/error-scope";
import { CLEAN_ERROR_SCOPE_MESSAGE } from "./async/clean-scope-sentinel";
import { awaitBrowserQueueSubmittedWork } from "./async/queue";
import {
  readBrowserBufferSize,
  readBrowserTextureHeight,
  readBrowserTextureWidth,
} from "./sync/metadata";
import type { ComponentGpuAnalysisCommandBuffer } from "../gpu-types";
import {
  createComponentGpuOutputSet,
  forEachComponentGpuOutput,
  forEachComponentGpuOutputValue,
  isCompleteComponentGpuOutputSet,
  type ComponentGpuOutputSet,
} from "../gpu-output-set";

/** Opaque upstream `wasi:webgpu` resource for a browser `GPUDevice`. */
export class GpuDevice {
  /**
   * Create an upstream buffer backed by the browser `GPUDevice`.
   *
   * 1. Resolves this opaque device handle to the inspector's shared device.
   * 2. Converts upstream `gpu-buffer-usage` flags into browser WebGPU flags.
   * 3. Registers the real browser `GPUBuffer` as an opaque upstream handle.
   *
   * @param descriptor - Upstream buffer descriptor selected by Rust.
   * @returns Opaque upstream `gpu-buffer` resource handle.
   */
  createBuffer(descriptor: GeneratedWebGpu.GpuBufferDescriptor): GpuBuffer {
    const { device } = requireRegisteredDevice(this);
    const size = gpuSize64ToNumber(descriptor.size);
    if (size === undefined) {
      throw new Error("[analysis][component-gpu] buffer size is required");
    }
    const buffer = device.createBuffer({
      label: descriptor.label,
      mappedAtCreation: descriptor.mappedAtCreation ?? false,
      size,
      usage: gpuBufferUsageToBrowser(descriptor.usage),
    });
    return registerGpuBuffer(buffer, device);
  }

  /**
   * Create an upstream shader module backed by the browser `GPUDevice`.
   *
   * 1. Resolves this opaque device handle to the inspector's shared device.
   * 2. Accepts only plain WGSL source because the analyzer does not use
   *    pipeline-constant hints yet.
   * 3. Registers the real browser `GPUShaderModule` as an opaque upstream
   *    resource for later Rust-created compute pipelines.
   *
   * @param descriptor - Upstream shader-module descriptor selected by Rust.
   * @returns Opaque upstream `gpu-shader-module` resource handle.
   */
  createShaderModule(
    descriptor: GeneratedWebGpu.GpuShaderModuleDescriptor,
  ): GpuShaderModule {
    if (descriptor.compilationHints) {
      throw new Error(
        "[analysis][component-gpu] shader compilation hints are not used by the analyzer",
      );
    }
    const { device } = requireRegisteredDevice(this);
    const handle = new GpuShaderModule();
    shaderModuleRecords.set(handle, {
      device,
      module: device.createShaderModule({
        label: descriptor.label,
        code: descriptor.code,
      }),
    });
    return handle;
  }

  /**
   * Create an upstream bind-group layout backed by the browser `GPUDevice`.
   *
   * 1. Resolves this opaque device handle to the inspector's shared device.
   * 2. Converts the narrow upstream layout entries Rust needs for the analyzer.
   * 3. Classifies the layout as `visual`, `stats`, `border-trace`, or
   *    `edge-discovery` so later bind-group creation can reject a
   *    pipeline/layout mix-up before WebGPU validation.
   *
   * @param descriptor - Upstream bind-group-layout descriptor selected by Rust.
   * @returns Opaque upstream `gpu-bind-group-layout` resource handle.
   */
  createBindGroupLayout(
    descriptor: GeneratedWebGpu.GpuBindGroupLayoutDescriptor,
  ): GpuBindGroupLayout {
    const { device } = requireRegisteredDevice(this);
    const role = classifyBindGroupLayout(descriptor);
    const handle = new GpuBindGroupLayout();
    bindGroupLayoutRecords.set(handle, {
      device,
      role,
      bindGroupLayout: device.createBindGroupLayout({
        label: descriptor.label,
        entries: descriptor.entries.map(gpuBindGroupLayoutEntryToBrowser),
      }),
    });
    return handle;
  }

  /**
   * Create an upstream pipeline layout backed by the browser `GPUDevice`.
   *
   * 1. Resolves this opaque device handle to the inspector's shared device.
   * 2. Supports the analyzer's single bind-group-layout pipeline shape only.
   * 3. Carries the layout role forward so compute pipeline creation can ensure
   *    the WGSL entry point matches the layout it will use.
   *
   * @param descriptor - Upstream pipeline-layout descriptor selected by Rust.
   * @returns Opaque upstream `gpu-pipeline-layout` resource handle.
   */
  createPipelineLayout(
    descriptor: GeneratedWebGpu.GpuPipelineLayoutDescriptor,
  ): GpuPipelineLayout {
    if (descriptor.immediateSize !== undefined) {
      throw new Error(
        "[analysis][component-gpu] immediate pipeline-layout data is not used by the analyzer",
      );
    }
    if (descriptor.bindGroupLayouts.length !== 1) {
      throw new Error(
        "[analysis][component-gpu] analyzer pipelines use exactly one bind-group layout",
      );
    }
    const { device } = requireRegisteredDevice(this);
    const layoutHandle = descriptor.bindGroupLayouts[0];
    if (!layoutHandle) {
      throw new Error(
        "[analysis][component-gpu] analyzer pipeline layout requires a bind-group layout",
      );
    }
    const layoutRecord = requireRegisteredBindGroupLayout(layoutHandle);
    if (layoutRecord.device !== device) {
      throw new Error(
        "[analysis][component-gpu] different device bind-group layout passed to pipeline layout",
      );
    }
    const handle = new GpuPipelineLayout();
    pipelineLayoutRecords.set(handle, {
      device,
      role: layoutRecord.role,
      pipelineLayout: device.createPipelineLayout({
        label: descriptor.label,
        bindGroupLayouts: [layoutRecord.bindGroupLayout],
      }),
      bindGroupLayout: layoutRecord.bindGroupLayout,
    });
    return handle;
  }

  /**
   * Create an upstream bind group backed by the browser `GPUDevice`.
   *
   * 1. Resolves the upstream bind-group layout and binding resources Rust
   *    selected for this analyzer pass.
   * 2. Supports only the narrow analyzer shapes: visual initialization
   *    (`component references + visual`), statistics
   *    (`captured pixels + component references + summary`), border tracing
   *    (`captured pixels + component references + border-trace`), and edge
   *    discovery (`captured pixels + feature/evidence + frequency state + edge output`).
   * 3. Registers the real browser `GPUBindGroup` plus its bound GPU resources
   *    so command encoding can prove Rust bound the expected resource set.
   *
   * @param descriptor - Upstream bind-group descriptor selected by Rust.
   * @returns Opaque upstream `gpu-bind-group` resource handle.
   */
  createBindGroup(
    descriptor: GeneratedWebGpu.GpuBindGroupDescriptor,
  ): GpuBindGroup {
    const { device } = requireRegisteredDevice(this);
    const layoutRecord = requireRegisteredBindGroupLayout(descriptor.layout);
    if (layoutRecord.device !== device) {
      throw new Error(
        "[analysis][component-gpu] different device bind-group layout passed to bind group",
      );
    }

    const browserEntries = descriptor.entries.map((entry) =>
      gpuBindGroupEntryToBrowser(device, entry),
    );
    const bindGroup = device.createBindGroup({
      label: descriptor.label,
      layout: layoutRecord.bindGroupLayout,
      entries: browserEntries,
    });

    if (layoutRecord.role === "visual") {
      return registerGpuBindGroup(
        createVisualBindGroupRecord(device, bindGroup, descriptor),
      );
    }
    if (layoutRecord.role === "stats") {
      return registerGpuBindGroup(
        createStatsBindGroupRecord(device, bindGroup, descriptor),
      );
    }
    if (layoutRecord.role === "edge-discovery") {
      return registerGpuBindGroup(
        createEdgeDiscoveryBindGroupRecord(device, bindGroup, descriptor),
      );
    }
    return registerGpuBindGroup(
      createBorderTraceBindGroupRecord(device, bindGroup, descriptor),
    );
  }

  /**
   * Create an upstream compute pipeline backed by the browser `GPUDevice`.
   *
   * 1. Resolves Rust-created shader-module and pipeline-layout handles.
   * 2. Supports only the analyzer's WGSL entry points: `init_visuals`,
   *    `main`, `trace_borders`, `edge_feature`, `edge_convolution`,
   *    `edge_thin`, `edge_tile_stats`, `haar_low_high_frequency_level1`,
   *    `haar_low_high_frequency_level2`, and `edge_project_frequency_support`.
   * 3. Opens a browser validation scope around pipeline creation and carries
   *    that promise into later command validation so shader/layout errors are
   *    reported before invalid-pipeline fallout.
   *
   * @param descriptor - Upstream compute-pipeline descriptor selected by Rust.
   * @returns Opaque upstream `gpu-compute-pipeline` resource handle.
   */
  createComputePipeline(
    descriptor: GeneratedWebGpu.GpuComputePipelineDescriptor,
  ): GpuComputePipeline {
    const { device } = requireRegisteredDevice(this);
    const shaderRecord = requireRegisteredShaderModule(
      descriptor.compute.module,
    );
    const layoutHandle = readSpecificPipelineLayout(descriptor.layout);
    const layoutRecord = requireRegisteredPipelineLayout(layoutHandle);
    if (shaderRecord.device !== device || layoutRecord.device !== device) {
      throw new Error(
        "[analysis][component-gpu] different device shader/layout passed to compute pipeline",
      );
    }
    if (descriptor.compute.constants) {
      throw new Error(
        "[analysis][component-gpu] pipeline constants are not used by the analyzer",
      );
    }
    const entryPoint = descriptor.compute.entryPoint;
    if (
      entryPoint !== "init_visuals" &&
      entryPoint !== "main" &&
      entryPoint !== "trace_borders" &&
      entryPoint !== "edge_feature" &&
      entryPoint !== "edge_convolution" &&
      entryPoint !== "edge_thin" &&
      entryPoint !== "edge_tile_stats" &&
      entryPoint !== "haar_low_high_frequency_level1" &&
      entryPoint !== "haar_low_high_frequency_level2" &&
      entryPoint !== "edge_project_frequency_support"
    ) {
      throw new Error(
        `[analysis][component-gpu] unsupported analyzer entry point: ${entryPoint ?? "<missing>"}`,
      );
    }
    let role: AnalysisPipelineRole = "edge-discovery";
    if (entryPoint === "init_visuals") role = "visual";
    if (entryPoint === "main") role = "stats";
    if (entryPoint === "trace_borders") role = "border-trace";
    if (layoutRecord.role !== role) {
      throw new Error(
        `[analysis][component-gpu] ${entryPoint} pipeline received ${layoutRecord.role} layout`,
      );
    }

    device.pushErrorScope("validation");
    let pipeline: GPUComputePipeline;
    try {
      pipeline = device.createComputePipeline({
        label: descriptor.label,
        layout: layoutRecord.pipelineLayout,
        compute: {
          module: shaderRecord.module,
          entryPoint,
        },
      });
    } catch (caught) {
      void device.popErrorScope();
      throw caught;
    }
    const setupValidation = device.popErrorScope();

    return registerGpuComputePipeline({
      device,
      role,
      pipeline,
      bindGroupLayout: layoutRecord.bindGroupLayout,
      setupValidation,
    });
  }

  /**
   * Create an upstream command encoder backed by the browser `GPUDevice`.
   *
   * 1. Resolves this opaque device handle to the inspector's shared device.
   * 2. Opens a WebGPU validation scope that is closed when Rust later calls
   *    `gpu-command-encoder.finish(...)`.
   * 3. Stores command metadata incrementally as Rust binds analyzer resources.
   *
   * @param descriptor - Optional upstream command-encoder descriptor.
   * @returns Opaque upstream command-encoder resource handle.
   */
  createCommandEncoder(
    descriptor?: GeneratedWebGpu.GpuCommandEncoderDescriptor,
  ): GpuCommandEncoder {
    const { device } = requireRegisteredDevice(this);
    const label = descriptor?.label ?? "component-gpu analysis command encoder";
    device.pushErrorScope("validation");
    const handle = new GpuCommandEncoder();
    commandEncoderRecords.set(handle, {
      device,
      encoder: device.createCommandEncoder({ label }),
      ownership: "component",
      validationPhase: label,
      setupValidation: null,
      resources: createCommandResources(),
    });
    return handle;
  }

  /**
   * Return the device queue through the upstream `gpu-device` API.
   *
   * 1. Resolves this opaque WIT handle back to its host-owned browser device.
   * 2. Wraps the browser `GPUQueue` as a separate upstream `gpu-queue` handle.
   * 3. Lets the async Rust export await submitted work through `wasi:webgpu`.
   *
   * @returns Opaque upstream `gpu-queue` resource handle.
   */
  queue(): GpuQueue {
    const { device } = requireRegisteredDevice(this);
    const handle = new GpuQueue();
    queueRecords.set(handle, { queue: device.queue, device });
    return handle;
  }

  /**
   * Push a browser WebGPU error scope through the upstream `gpu-device` API.
   *
   * 1. Resolves this opaque WIT handle back to its host-owned browser device.
   * 2. Delegates to the async-only WebGPU helper because error scopes are part
   *    of the JSPI async diagnostic path.
   * 3. Leaves the matching async `popErrorScope()` to finish the diagnostic.
   *
   * @param filter - Upstream WebGPU error filter requested by the component.
   * @returns Nothing.
   */
  pushErrorScope(filter: GeneratedAsyncWebGpu.GpuErrorFilter): void {
    pushBrowserErrorScope(requireRegisteredDevice(this).device, filter);
  }

  /**
   * Pop a browser WebGPU error scope through the upstream async API.
   *
   * 1. Resolves this opaque WIT handle back to its host-owned browser device.
   * 2. Awaits the browser `GPUDevice.popErrorScope()` promise through the
   *    async-only helper.
   * 3. Returns an empty-message error as the clean-scope sentinel.
   *
   * @returns Wrapped WebGPU error, with an empty message when the scope is clean.
   */
  async popErrorScope(): Promise<GpuError | undefined> {
    try {
      const message = await popBrowserErrorScopeMessage(
        requireRegisteredDevice(this).device,
      );
      return new GpuError(message ?? CLEAN_ERROR_SCOPE_MESSAGE);
    } catch (caught) {
      if (caught instanceof Error) {
        throw createPopErrorScopeError(caught.message);
      }
      throw createPopErrorScopeError("failed to pop WebGPU error scope");
    }
  }
}

/** Opaque upstream `wasi:webgpu` resource for a browser `GPUQueue`. */
export class GpuQueue {
  /**
   * Submit browser command buffers through the upstream `gpu-queue.submit` API.
   *
   * 1. Resolves this opaque queue plus each upstream command-buffer handle.
   * 2. Rejects command buffers encoded for a different browser `GPUDevice`.
   * 3. Submits the real browser command buffers to the shared queue.
   * 4. Stores the submission marker on each command-buffer record so later
   *    summary resolution can prove Rust submitted before readback.
   *
   * @param commandBuffers - Upstream command buffers to submit on this queue.
   * @returns Nothing.
   */
  submit(commandBuffers: GpuCommandBuffer[]): void {
    const queueRecord = requireRegisteredQueue(this);
    const records = commandBuffers.map(requireRegisteredCommandBuffer);

    for (const record of records) {
      if (record.device !== queueRecord.device) {
        throw new Error(
          "[analysis][component-gpu] different device command buffer passed to queue.submit",
        );
      }
      if (record.submission) {
        throw new Error(
          "[analysis][component-gpu] command buffer submitted more than once",
        );
      }
    }

    let validationPhase = "submit component-gpu command buffer";
    if (records.length !== 1) {
      validationPhase = `submit ${records.length} command buffers`;
    }

    queueRecord.device.pushErrorScope("validation");
    try {
      queueRecord.queue.submit(
        records.map((record) => record.commandBuffer.commandBuffer),
      );
      const validation = queueRecord.device.popErrorScope();
      for (const record of records) {
        record.submission = {
          commandValidation: record.commandBuffer.validation,
          commandValidationPhase: record.commandBuffer.validationPhase,
          validation,
          validationPhase,
        };
      }
    } catch (caught) {
      void queueRecord.device.popErrorScope();
      throw caught;
    }
  }

  /**
   * Await submitted browser queue work through the upstream `gpu-queue` API.
   *
   * 1. Resolves this opaque WIT handle back to its host-owned browser queue.
   * 2. Delegates to the async-only queue helper.
   * 3. Keeps the async proof in the JSPI component path only.
   *
   * @returns Promise that resolves when submitted queue work is done.
   */
  async onSubmittedWorkDone(): Promise<void> {
    await awaitBrowserQueueSubmittedWork(requireRegisteredQueue(this).queue);
  }
}

/** Opaque upstream `wasi:webgpu` resource for a browser `GPUError`. */
export class GpuError {
  readonly #message: string;

  /**
   * Create a wrapped upstream `gpu-error` resource.
   *
   * @param message - Browser WebGPU error message.
   * @returns Opaque upstream `gpu-error` resource instance.
   */
  constructor(message: string) {
    this.#message = message;
  }

  /**
   * Return the browser WebGPU error message through the upstream API.
   *
   * @returns WebGPU validation, internal, or out-of-memory error message.
   */
  message(): string {
    return this.#message;
  }
}

/** Opaque upstream `wasi:webgpu` resource for a browser `GPUTexture`. */
export class GpuTexture {
  /**
   * Return the browser texture width through the upstream `gpu-texture` API.
   *
   * 1. Resolves this opaque WIT handle back to its host-owned browser record.
   * 2. Delegates to the sync metadata helper because texture dimensions are
   *    synchronous WebGPU properties.
   * 3. Gives Rust a direct upstream-shaped validation path before dispatch.
   *
   * @returns Width of the registered browser `GPUTexture`, in texels.
   */
  width(): number {
    return readBrowserTextureWidth(requireRegisteredTexture(this).texture);
  }

  /**
   * Return the browser texture height through the upstream `gpu-texture` API.
   *
   * 1. Resolves this opaque WIT handle back to its host-owned browser record.
   * 2. Delegates to the sync metadata helper because texture dimensions are
   *    synchronous WebGPU properties.
   * 3. Gives Rust a direct upstream-shaped validation path before dispatch.
   *
   * @returns Height of the registered browser `GPUTexture`, in texels.
   */
  height(): number {
    return readBrowserTextureHeight(requireRegisteredTexture(this).texture);
  }
}

/** Opaque upstream `wasi:webgpu` resource for a browser `GPUBuffer`. */
export class GpuBuffer {
  /**
   * Return the browser buffer size through the upstream `gpu-buffer` API.
   *
   * 1. Resolves this opaque WIT handle back to its host-owned browser record.
   * 2. Delegates to the sync metadata helper because buffer size is a
   *    synchronous WebGPU property.
   * 3. Gives Rust a direct upstream-shaped validation path for
   *    component-reference capacity.
   *
   * @returns Size of the registered browser `GPUBuffer`, in bytes.
   */
  size(): bigint {
    return readBrowserBufferSize(requireRegisteredBuffer(this).buffer);
  }

  /**
   * Await browser `GPUBuffer.mapAsync(...)` through upstream WebGPU.
   *
   * 1. Resolves this opaque WIT handle back to its host-owned browser buffer.
   * 2. Delegates to the JSPI async-world helper.
   * 3. Supports only read mappings for the compact diagnostic summary staging
   *    buffer; visual output remains GPU-resident and is never mapped.
   *
   * @param mode - Upstream map-mode flags selected by Rust.
   * @param offset - Optional byte offset to map.
   * @param size - Optional byte length to map.
   * @returns Promise that resolves when the browser buffer is mapped.
   */
  async mapAsync(
    mode: UpstreamGpuMapMode,
    offset: bigint | undefined,
    size: bigint | undefined,
  ): Promise<void> {
    await mapBrowserBufferForRead(
      requireRegisteredBuffer(this).buffer,
      mode,
      offset,
      size,
    );
  }

  /**
   * Copy bytes from the mapped browser buffer range.
   *
   * 1. Resolves this opaque WIT handle back to its mapped browser buffer.
   * 2. Copies the requested range into a fresh `Uint8Array`.
   * 3. Returns owned bytes to Rust for one-way diagnostic summary decoding.
   *
   * @param offset - Optional mapped-range byte offset.
   * @param size - Optional mapped-range byte length.
   * @returns Copied mapped-range bytes.
   */
  getMappedRangeGetWithCopy(
    offset: bigint | undefined,
    size: bigint | undefined,
  ): Uint8Array {
    return copyMappedBrowserBufferRange(
      requireRegisteredBuffer(this).buffer,
      offset,
      size,
    );
  }

  /**
   * Unmap the browser buffer through upstream WebGPU.
   *
   * @returns Nothing.
   */
  unmap(): void {
    unmapBrowserBuffer(requireRegisteredBuffer(this).buffer);
  }
}

/**
 * Generated stable and frame worlds expose the synchronous `size` subset,
 * while the async world also exposes mapping operations for the same upstream
 * `gpu-buffer` resource. Runtime identity is still the same class from this
 * host module, so host resource lookups accept every generated shape at the
 * boundary.
 */
export type RegisteredGpuBufferHandle =
  | GpuBuffer
  | GeneratedWebGpu.GpuBuffer
  | GeneratedAsyncWebGpu.GpuBuffer;

/** Opaque upstream `wasi:webgpu` resource for a browser `GPUCommandBuffer`. */
export class GpuCommandBuffer {}

/** Opaque upstream `wasi:webgpu` resource for a browser `GPUCommandEncoder`. */
export class GpuCommandEncoder {
  /**
   * Begin a browser compute pass through the upstream command-encoder API.
   *
   * 1. Resolves this command encoder to the browser `GPUCommandEncoder`.
   * 2. Creates one browser `GPUComputePassEncoder`.
   * 3. Links the pass to its parent so later `set-bind-group(...)` calls can
   *    attach analyzer metadata before `finish(...)` registers the command.
   *
   * @param descriptor - Optional upstream compute-pass descriptor.
   * @returns Opaque upstream compute-pass encoder resource handle.
   */
  beginComputePass(
    descriptor?: GeneratedWebGpu.GpuComputePassDescriptor,
  ): GpuComputePassEncoder {
    const encoderRecord = requireRegisteredCommandEncoder(this);
    const label =
      descriptor?.label ??
      `component-gpu compute pass ${encoderRecord.validationPhase}`;
    const pass = new GpuComputePassEncoder();
    computePassEncoderRecords.set(pass, {
      device: encoderRecord.device,
      pass: encoderRecord.encoder.beginComputePass({ label }),
      commandEncoder: this,
      activePipelineRole: null,
    });
    return pass;
  }

  /**
   * Copy one browser buffer into another through upstream WebGPU.
   *
   * 1. Resolves source and destination `gpu-buffer` handles.
   * 2. Rejects cross-device copies before the browser sees them.
   * 3. Delegates to `GPUCommandEncoder.copyBufferToBuffer(...)`.
   *
   * @param source - Upstream source buffer handle.
   * @param sourceOffset - Optional byte offset in `source`.
   * @param destination - Upstream destination buffer handle.
   * @param destinationOffset - Optional byte offset in `destination`.
   * @param size - Optional byte length to copy.
   * @returns Nothing.
   */
  copyBufferToBuffer(
    source: GpuBuffer,
    sourceOffset: bigint | undefined,
    destination: GpuBuffer,
    destinationOffset: bigint | undefined,
    size: bigint | undefined,
  ): void {
    const encoderRecord = requireRegisteredCommandEncoder(this);
    const sourceRecord = requireRegisteredBuffer(source);
    const destinationRecord = requireRegisteredBuffer(destination);
    if (
      sourceRecord.device !== encoderRecord.device ||
      destinationRecord.device !== encoderRecord.device
    ) {
      throw new Error(
        "[analysis][component-gpu] different device buffer passed to copy-buffer-to-buffer",
      );
    }
    const sourceOffsetBytes = gpuSize64ToNumber(sourceOffset) ?? 0;
    const destinationOffsetBytes = gpuSize64ToNumber(destinationOffset) ?? 0;
    const copyByteLength = gpuSize64ToNumber(size);
    if (copyByteLength === undefined) {
      throw new Error(
        "[analysis][component-gpu] copy-buffer-to-buffer size is required",
      );
    }
    encoderRecord.encoder.copyBufferToBuffer(
      sourceRecord.buffer,
      sourceOffsetBytes,
      destinationRecord.buffer,
      destinationOffsetBytes,
      copyByteLength,
    );
  }

  /**
   * Finish command encoding and register the command buffer as upstream WebGPU.
   *
   * 1. Requires that Rust has bound analyzer resources during the compute pass.
   * 2. Finishes the real browser `GPUCommandEncoder`.
   * 3. Closes the validation scope opened by `gpu-device.create-command-encoder`.
   * 4. Registers the result as a `gpu-command-buffer` so Rust can submit it.
   *
   * @param descriptor - Optional upstream command-buffer descriptor.
   * @returns Opaque upstream command-buffer resource handle.
   */
  finish(
    descriptor?: GeneratedWebGpu.GpuCommandBufferDescriptor,
  ): GpuCommandBuffer {
    const record = requireRegisteredCommandEncoder(this);
    if (record.ownership !== "component") {
      // The current frame artifact omits `finish` because its valid path never
      // calls it, but borrowing alone does not prevent future Rust code from
      // expanding that import surface. This runtime guard is therefore the
      // final protection for the scheduler-owned native encoder.
      throw new Error(
        "[analysis][component-gpu-frame] borrowed frame encoder cannot be finished by the component",
      );
    }
    const resources = requireCompleteCommandResources(record.resources);
    if (!resources) {
      throw new Error(
        "[analysis][component-gpu] command encoder finished before analyzer bind groups were set",
      );
    }

    let commandBuffer: GPUCommandBuffer;
    try {
      commandBuffer = record.encoder.finish({
        label: descriptor?.label ?? "component-gpu command buffer",
      });
    } catch (caught) {
      void record.device.popErrorScope();
      throw caught;
    }
    const encodeValidation = record.device.popErrorScope();
    const validation = firstValidationError(
      record.setupValidation,
      encodeValidation,
    );
    commandEncoderRecords.delete(this);

    return registerGpuCommandBuffer({
      device: record.device,
      resources,
      commandBuffer: {
        commandBuffer,
        validation,
        validationPhase: record.validationPhase,
      },
    });
  }
}

/** Opaque upstream `wasi:webgpu` resource for a browser compute pass encoder. */
export class GpuComputePassEncoder {
  /**
   * Set the active compute pipeline through upstream WebGPU.
   *
   * @param pipeline - Upstream compute pipeline handle.
   * @returns Nothing.
   */
  setPipeline(pipeline: GpuComputePipeline): void {
    const passRecord = requireRegisteredComputePassEncoder(this);
    const pipelineRecord = requireRegisteredComputePipeline(pipeline);
    if (pipelineRecord.device !== passRecord.device) {
      throw new Error(
        "[analysis][component-gpu] different device pipeline passed to compute pass",
      );
    }
    passRecord.pass.setPipeline(pipelineRecord.pipeline);
    passRecord.activePipelineRole = pipelineRecord.role;
    const encoderRecord = requireRegisteredCommandEncoder(
      passRecord.commandEncoder,
    );
    encoderRecord.setupValidation = firstValidationError(
      encoderRecord.setupValidation,
      pipelineRecord.setupValidation,
    );
  }

  /**
   * Set the active bind group through upstream WebGPU.
   *
   * 1. Resolves the upstream bind-group handle to the browser `GPUBindGroup`.
   * 2. Rejects cross-device binding before command encoding continues.
   * 3. Copies analyzer metadata onto the parent command encoder so `finish`
   *    can register the resulting command buffer for summary resolution.
   *
   * @param index - Bind-group slot to update.
   * @param bindGroup - Optional upstream bind-group handle.
   * @param dynamicOffsetsData - Optional dynamic offsets; unsupported here.
   * @param dynamicOffsetsDataStart - Optional dynamic-offset start; unsupported here.
   * @param dynamicOffsetsDataLength - Optional dynamic-offset length; unsupported here.
   * @returns Nothing.
   */
  setBindGroup(
    index: number,
    bindGroup: GpuBindGroup | undefined,
    dynamicOffsetsData: Uint32Array | undefined,
    dynamicOffsetsDataStart: bigint | undefined,
    dynamicOffsetsDataLength: number | undefined,
  ): void {
    if (
      dynamicOffsetsData ||
      dynamicOffsetsDataStart !== undefined ||
      dynamicOffsetsDataLength !== undefined
    ) {
      throw new Error(
        "[analysis][component-gpu] dynamic bind-group offsets are not used by the analyzer",
      );
    }
    if (index !== 0) {
      throw new Error(
        "[analysis][component-gpu] analyzer bind groups are only bound at group 0",
      );
    }
    const passRecord = requireRegisteredComputePassEncoder(this);
    if (!bindGroup) {
      passRecord.pass.setBindGroup(index, null);
      return;
    }
    const bindGroupRecord = requireRegisteredBindGroup(bindGroup);
    if (bindGroupRecord.device !== passRecord.device) {
      throw new Error(
        "[analysis][component-gpu] different device bind group passed to compute pass",
      );
    }
    if (passRecord.activePipelineRole !== bindGroupRecord.role) {
      throw new Error(
        `[analysis][component-gpu] ${bindGroupRecord.role} bind group set while ${passRecord.activePipelineRole ?? "no"} pipeline is active`,
      );
    }
    passRecord.pass.setBindGroup(index, bindGroupRecord.bindGroup);

    const encoderRecord = requireRegisteredCommandEncoder(
      passRecord.commandEncoder,
    );
    mergeCommandResources(encoderRecord.resources, bindGroupRecord.resources);
  }

  /**
   * Dispatch compute workgroups through upstream WebGPU.
   *
   * @param workgroupCountX - Number of workgroups in X.
   * @param workgroupCountY - Optional number of workgroups in Y.
   * @param workgroupCountZ - Optional number of workgroups in Z.
   * @returns Nothing.
   */
  dispatchWorkgroups(
    workgroupCountX: number,
    workgroupCountY?: number,
    workgroupCountZ?: number,
  ): void {
    requireRegisteredComputePassEncoder(this).pass.dispatchWorkgroups(
      workgroupCountX,
      workgroupCountY,
      workgroupCountZ,
    );
  }

  /**
   * End the browser compute pass through upstream WebGPU.
   *
   * @returns Nothing.
   */
  end(): void {
    requireRegisteredComputePassEncoder(this).pass.end();
  }
}

/** Opaque upstream `wasi:webgpu` resource for a browser compute pipeline. */
export class GpuComputePipeline {}

/** Opaque upstream `wasi:webgpu` resource for a browser shader module. */
export class GpuShaderModule {}

/** Opaque upstream `wasi:webgpu` resource for a browser bind-group layout. */
export class GpuBindGroupLayout {}

/** Opaque upstream `wasi:webgpu` resource for a browser pipeline layout. */
export class GpuPipelineLayout {}

/**
 * Opaque upstream `wasi:webgpu` resource for pipeline constant records.
 *
 * 1. jco imports this resource when compute-pipeline descriptors are present.
 * 2. The analyzer does not use pipeline constants, so no methods are exposed.
 * 3. Keeping the class here satisfies generated imports without widening the
 *    supported analyzer surface.
 */
export class RecordGpuPipelineConstantValue {}

/** Opaque upstream `wasi:webgpu` resource for a browser bind group. */
export class GpuBindGroup {}

/**
 * Opaque upstream `wasi:webgpu` resource for a browser sampler.
 *
 * 1. The upstream bind-group descriptor variant imports this resource type.
 * 2. The analyzer currently never binds samplers.
 * 3. Keeping this as an empty resource class satisfies generated imports
 *    without widening the supported operation surface.
 */
export class GpuSampler {}

/**
 * Opaque upstream `wasi:webgpu` resource for a browser texture view.
 *
 * 1. The upstream bind-group descriptor variant imports this resource type.
 * 2. The analyzer binds captured textures by `gpu-texture` handle today.
 * 3. The host creates the browser texture view internally when binding the
 *    captured texture slot.
 */
export class GpuTextureView {}

/**
 * Opaque upstream `wasi:webgpu` resource for a browser query set.
 *
 * 1. jco statically imports every resource class exposed by the selected
 *    upstream WebGPU world, even when the analyzer never creates or calls this
 *    resource.
 * 2. This host does not implement query-set operations because the analyzer
 *    currently uses compute buffers, command encoders, passes, queues, and
 *    error scopes only.
 * 3. Keeping this as an empty resource class lets bundlers resolve the
 *    generated import without expanding the supported operation surface.
 */
export class GpuQuerySet {}

/**
 * Host-owned record for an upstream `gpu-device` resource handle.
 */
export interface DeviceRecord {
  /** Browser WebGPU device represented by the WIT resource. */
  device: GPUDevice;
}

/**
 * Host-owned record for an upstream `gpu-texture` resource handle.
 */
export interface TextureRecord {
  /** Captured browser texture represented by the WIT resource. */
  texture: GPUTexture;
  /** Device that owns `texture`. */
  device: GPUDevice;
}

/**
 * Host-owned record for an upstream `gpu-buffer` resource handle.
 */
export interface BufferRecord {
  /** Browser WebGPU buffer represented by the WIT resource. */
  buffer: GPUBuffer;
  /** Device that owns `buffer`. */
  device: GPUDevice;
}

/**
 * Host-owned record for an upstream `gpu-queue` resource handle.
 */
export interface QueueRecord {
  /** Browser WebGPU queue represented by the WIT resource. */
  queue: GPUQueue;
  /** Device that owns `queue`. */
  device: GPUDevice;
}

/**
 * GPU resources accumulated while Rust encodes analyzer commands.
 */
export interface CommandResources {
  /** Captured-pixel texture bound by the statistics bind group. */
  texture: GPUTexture | null;
  /**
   * Component-reference buffer bound by the visual, statistics, and
   * border-trace bind groups.
   */
  truthBuffer: GPUBuffer | null;
  /** Compact diagnostic summary buffer bound by the statistics bind group. */
  summaryBuffer: GPUBuffer | null;
  /** Renderer-facing buffers accumulated across analyzer bind groups. */
  outputs: ComponentGpuOutputSet<GPUBuffer | null>;
}

/**
 * Complete resource set required by one submitted analyzer command buffer.
 */
export interface CompleteCommandResources {
  /** Captured-pixel texture bound by the statistics bind group. */
  texture: GPUTexture;
  /**
   * Component-reference buffer bound by the visual, statistics, and
   * border-trace bind groups.
   */
  truthBuffer: GPUBuffer;
  /** Compact diagnostic summary buffer bound by the statistics bind group. */
  summaryBuffer: GPUBuffer;
  /** Complete renderer-facing buffers accumulated across analyzer bind groups. */
  outputs: ComponentGpuOutputSet<GPUBuffer>;
}

/** Create an empty resource accumulator for one analyzer command encoder. */
const createCommandResources = (): CommandResources => ({
  texture: null,
  truthBuffer: null,
  summaryBuffer: null,
  outputs: createComponentGpuOutputSet<GPUBuffer | null>(null),
});

/**
 * Host-owned queue submission metadata before `analysis-plan` is reattached.
 */
export interface QueueSubmissionRecord {
  /** Validation promise inherited from command encoding. */
  commandValidation: Promise<GPUError | null>;
  /** Human-readable command-validation phase label used in diagnostics. */
  commandValidationPhase: string;
  /** Validation promise covering queue submission work. */
  validation: Promise<GPUError | null>;
  /** Human-readable validation phase label used in diagnostics. */
  validationPhase: string;
}

/**
 * Host-owned record for an upstream `gpu-command-buffer` resource handle.
 */
export interface CommandBufferRecord {
  /** Browser device this command buffer was encoded for. */
  device: GPUDevice;
  /** Browser resources proven during Rust-owned command encoding. */
  resources: CompleteCommandResources;
  /** Website-owned encoded command buffer. */
  commandBuffer: ComponentGpuAnalysisCommandBuffer;
  /** Submission marker created by upstream `gpu-queue.submit`, if submitted. */
  submission: QueueSubmissionRecord | null;
}

/** Host-owned record for an upstream `gpu-command-encoder` handle. */
export interface CommandEncoderRecord {
  /** Browser device this encoder belongs to. */
  device: GPUDevice;
  /** Browser WebGPU command encoder represented by the WIT resource. */
  encoder: GPUCommandEncoder;
  /** Which side is allowed to finish and submit the native encoder. */
  ownership: "component" | "scheduler-borrowed";
  /** Human-readable validation phase label used in diagnostics. */
  validationPhase: string;
  /** First pipeline-setup validation promise associated with this command. */
  setupValidation: Promise<GPUError | null> | null;
  /** Browser resources accumulated from analyzer bind groups. */
  resources: CommandResources;
}

/** Host-owned record for an upstream `gpu-compute-pass-encoder` handle. */
export interface ComputePassEncoderRecord {
  /** Browser device this compute pass belongs to. */
  device: GPUDevice;
  /** Browser compute pass encoder represented by the WIT resource. */
  pass: GPUComputePassEncoder;
  /** Parent command encoder handle that owns this pass. */
  commandEncoder: GpuCommandEncoder;
  /** Analyzer pipeline role most recently set on this pass. */
  activePipelineRole: AnalysisPipelineRole | null;
}

/**
 * Metadata recovered after Rust has appended work to a borrowed frame encoder.
 */
export interface ExternalGpuCommandEncoding {
  /** Shared browser device that owns the native encoder and bound resources. */
  device: GPUDevice;
  /** Browser resources proven by the bind groups Rust encoded. */
  resources: CompleteCommandResources;
  /** First asynchronous pipeline-creation validation result, if any. */
  setupValidation: Promise<GPUError | null> | null;
  /** Human-readable phase label used by browser diagnostics. */
  validationPhase: string;
}

/** Analyzer pipeline role inferred from the narrow bind-group layout. */
type AnalysisPipelineRole =
  | "visual"
  | "stats"
  | "border-trace"
  | "edge-discovery";

/** Host-owned record for an upstream `gpu-shader-module` handle. */
export interface ShaderModuleRecord {
  /** Browser device this shader module belongs to. */
  device: GPUDevice;
  /** Browser shader module represented by the WIT resource. */
  module: GPUShaderModule;
}

/** Host-owned record for an upstream `gpu-bind-group-layout` handle. */
export interface BindGroupLayoutRecord {
  /** Browser device this bind-group layout belongs to. */
  device: GPUDevice;
  /** Analyzer role this narrow layout supports. */
  role: AnalysisPipelineRole;
  /** Browser bind-group layout represented by the WIT resource. */
  bindGroupLayout: GPUBindGroupLayout;
}

/** Host-owned record for an upstream `gpu-pipeline-layout` handle. */
export interface PipelineLayoutRecord {
  /** Browser device this pipeline layout belongs to. */
  device: GPUDevice;
  /** Analyzer role this pipeline layout supports. */
  role: AnalysisPipelineRole;
  /** Browser pipeline layout represented by the WIT resource. */
  pipelineLayout: GPUPipelineLayout;
  /** Single bind-group layout used by matching analyzer bind groups. */
  bindGroupLayout: GPUBindGroupLayout;
}

/** Host-owned record for an upstream `gpu-compute-pipeline` handle. */
export interface ComputePipelineRecord {
  /** Browser device this pipeline belongs to. */
  device: GPUDevice;
  /** Analyzer role this pipeline supports. */
  role: AnalysisPipelineRole;
  /** Browser compute pipeline represented by the WIT resource. */
  pipeline: GPUComputePipeline;
  /** Bind-group layout used to create matching bind groups. */
  bindGroupLayout: GPUBindGroupLayout;
  /** Pipeline setup validation promise carried into command validation. */
  setupValidation: Promise<GPUError | null>;
}

/** Host-owned record for an upstream `gpu-bind-group` handle. */
export interface BindGroupRecord {
  /** Browser device this bind group belongs to. */
  device: GPUDevice;
  /** Analyzer role this bind group supports. */
  role: AnalysisPipelineRole;
  /** Browser bind group represented by the WIT resource. */
  bindGroup: GPUBindGroup;
  /** Browser resources referenced by this bind group. */
  resources: CommandResources;
}

const deviceRecords = new WeakMap<GpuDevice, DeviceRecord>();
const textureRecords = new WeakMap<GpuTexture, TextureRecord>();
const bufferRecords = new WeakMap<object, BufferRecord>();
const queueRecords = new WeakMap<GpuQueue, QueueRecord>();
const commandBufferRecords = new WeakMap<
  GpuCommandBuffer,
  CommandBufferRecord
>();
const commandEncoderRecords = new WeakMap<
  GpuCommandEncoder,
  CommandEncoderRecord
>();
const computePassEncoderRecords = new WeakMap<
  GpuComputePassEncoder,
  ComputePassEncoderRecord
>();
const shaderModuleRecords = new WeakMap<GpuShaderModule, ShaderModuleRecord>();
const bindGroupLayoutRecords = new WeakMap<
  GpuBindGroupLayout,
  BindGroupLayoutRecord
>();
const pipelineLayoutRecords = new WeakMap<
  GpuPipelineLayout,
  PipelineLayoutRecord
>();
const computePipelineRecords = new WeakMap<
  GpuComputePipeline,
  ComputePipelineRecord
>();
const bindGroupRecords = new WeakMap<GpuBindGroup, BindGroupRecord>();

/**
 * Convert an upstream `gpu-size64` value into the browser WebGPU number shape.
 *
 * @param value - Optional WIT `u64` value lowered by jco as `bigint`.
 * @returns JavaScript number accepted by browser WebGPU.
 */
const gpuSize64ToNumber = (value: bigint | undefined): number | undefined => {
  if (value === undefined) return undefined;
  return Number(value);
};

/**
 * Convert upstream `gpu-buffer-usage` flags into browser `GPUBufferUsage`.
 *
 * @param usage - WIT flags lowered by jco as a plain object.
 * @returns Browser WebGPU bitset for `GPUDevice.createBuffer(...)`.
 */
const gpuBufferUsageToBrowser = (
  usage: GeneratedWebGpu.GpuBufferUsage,
): GPUBufferUsageFlags => {
  let flags = 0;
  if (usage.mapRead) flags |= GPUBufferUsage.MAP_READ;
  if (usage.mapWrite) flags |= GPUBufferUsage.MAP_WRITE;
  if (usage.copySrc) flags |= GPUBufferUsage.COPY_SRC;
  if (usage.copyDst) flags |= GPUBufferUsage.COPY_DST;
  if (usage.index) flags |= GPUBufferUsage.INDEX;
  if (usage.vertex) flags |= GPUBufferUsage.VERTEX;
  if (usage.uniform) flags |= GPUBufferUsage.UNIFORM;
  if (usage.storage) flags |= GPUBufferUsage.STORAGE;
  if (usage.indirect) flags |= GPUBufferUsage.INDIRECT;
  if (usage.queryResolve) flags |= GPUBufferUsage.QUERY_RESOLVE;
  if (flags === 0) {
    throw new Error("[analysis][component-gpu] buffer usage must not be empty");
  }
  return flags;
};

/**
 * Convert upstream `gpu-shader-stage` flags into browser WebGPU flags.
 *
 * @param stage - WIT flags lowered by jco as a plain object.
 * @returns Browser `GPUShaderStage` bitset.
 */
const gpuShaderStageToBrowser = (
  stage: GeneratedWebGpu.GpuShaderStage,
): GPUShaderStageFlags => {
  let flags = 0;
  if (stage.vertex) flags |= GPUShaderStage.VERTEX;
  if (stage.fragment) flags |= GPUShaderStage.FRAGMENT;
  if (stage.compute) flags |= GPUShaderStage.COMPUTE;
  if (flags === 0) {
    throw new Error(
      "[analysis][component-gpu] bind-group-layout entry visibility must not be empty",
    );
  }
  return flags;
};

/**
 * Convert an upstream buffer-binding layout into a browser layout.
 *
 * 1. Supports only the storage-buffer shapes used by the analyzer.
 * 2. Rejects dynamic offsets because the compute dispatch never uses them.
 * 3. Preserves optional minimum binding size if Rust starts supplying it.
 *
 * @param layout - Upstream buffer-binding layout selected by Rust.
 * @returns Browser `GPUBufferBindingLayout`.
 */
const gpuBufferBindingLayoutToBrowser = (
  layout: GeneratedWebGpu.GpuBufferBindingLayout,
): GPUBufferBindingLayout => {
  if (layout.hasDynamicOffset) {
    throw new Error(
      "[analysis][component-gpu] dynamic buffer binding offsets are not used by the analyzer",
    );
  }
  return {
    type: layout.type,
    hasDynamicOffset: layout.hasDynamicOffset,
    minBindingSize: gpuSize64ToNumber(layout.minBindingSize),
  };
};

/**
 * Convert an upstream texture view dimension into browser WebGPU spelling.
 *
 * @param dimension - Upstream WIT texture view dimension.
 * @returns Browser `GPUTextureViewDimension`.
 */
const gpuTextureViewDimensionToBrowser = (
  dimension: GeneratedWebGpu.GpuTextureViewDimension | undefined,
): GPUTextureViewDimension | undefined => {
  switch (dimension) {
    case undefined:
      return undefined;
    case "d1":
      return "1d";
    case "d2":
      return "2d";
    case "d2-array":
      return "2d-array";
    case "d3":
      return "3d";
    case "cube":
    case "cube-array":
      return dimension;
  }
};

/**
 * Convert an upstream texture-binding layout into a browser layout.
 *
 * @param layout - Upstream texture-binding layout selected by Rust.
 * @returns Browser `GPUTextureBindingLayout`.
 */
const gpuTextureBindingLayoutToBrowser = (
  layout: GeneratedWebGpu.GpuTextureBindingLayout,
): GPUTextureBindingLayout => ({
  sampleType: layout.sampleType,
  viewDimension: gpuTextureViewDimensionToBrowser(layout.viewDimension),
  multisampled: layout.multisampled,
});

/**
 * Convert one upstream bind-group-layout entry into browser WebGPU.
 *
 * @param entry - Upstream bind-group-layout entry selected by Rust.
 * @returns Browser `GPUBindGroupLayoutEntry`.
 */
const gpuBindGroupLayoutEntryToBrowser = (
  entry: GeneratedWebGpu.GpuBindGroupLayoutEntry,
): GPUBindGroupLayoutEntry => {
  if (entry.sampler || entry.storageTexture) {
    throw new Error(
      "[analysis][component-gpu] sampler and storage-texture bindings are not used by the analyzer",
    );
  }
  let buffer: GPUBufferBindingLayout | undefined;
  if (entry.buffer) {
    buffer = gpuBufferBindingLayoutToBrowser(entry.buffer);
  }
  let texture: GPUTextureBindingLayout | undefined;
  if (entry.texture) {
    texture = gpuTextureBindingLayoutToBrowser(entry.texture);
  }
  return {
    binding: entry.binding,
    visibility: gpuShaderStageToBrowser(entry.visibility),
    buffer,
    texture,
  };
};

/**
 * Resolve a whole-buffer upstream binding resource.
 *
 * 1. Accepts only the `gpu-buffer` variant Rust currently emits.
 * 2. Rejects ranged `gpu-buffer-binding` until the analyzer actually needs
 *    offset/size slices.
 * 3. Verifies same-device ownership before returning the browser buffer.
 *
 * @param device - Browser device that will create the bind group.
 * @param resource - Upstream binding resource selected by Rust.
 * @param binding - Binding index used for diagnostics.
 * @returns Browser buffer represented by `resource`.
 */
const gpuBufferBindingResourceToBrowser = (
  device: GPUDevice,
  resource: GeneratedWebGpu.GpuBindingResource,
  binding: number,
): GPUBuffer => {
  if (resource.tag !== "gpu-buffer") {
    throw new Error(
      `[analysis][component-gpu] binding ${binding} requires a whole gpu-buffer resource`,
    );
  }
  const record = requireRegisteredBuffer(resource.val);
  if (record.device !== device) {
    throw new Error(
      `[analysis][component-gpu] binding ${binding} received a buffer from a different device`,
    );
  }
  return record.buffer;
};

/**
 * Resolve a captured-texture upstream binding resource.
 *
 * 1. Accepts only the `gpu-texture` variant Rust currently emits.
 * 2. Creates a browser texture view locally because WebGPU bind groups bind
 *    texture views while upstream WIT can model the texture as the resource.
 * 3. Verifies same-device ownership before returning the browser texture.
 *
 * @param device - Browser device that will create the bind group.
 * @param resource - Upstream binding resource selected by Rust.
 * @param binding - Binding index used for diagnostics.
 * @returns Browser texture represented by `resource`.
 */
const gpuTextureBindingResourceToBrowser = (
  device: GPUDevice,
  resource: GeneratedWebGpu.GpuBindingResource,
  binding: number,
): GPUTexture => {
  if (resource.tag !== "gpu-texture") {
    throw new Error(
      `[analysis][component-gpu] binding ${binding} requires a gpu-texture resource`,
    );
  }
  const record = requireRegisteredTexture(resource.val);
  if (record.device !== device) {
    throw new Error(
      `[analysis][component-gpu] binding ${binding} received a texture from a different device`,
    );
  }
  return record.texture;
};

/**
 * Convert one upstream bind-group entry into browser WebGPU.
 *
 * 1. Converts whole buffers to browser `{ buffer }` entries.
 * 2. Converts captured textures to a freshly created browser texture view.
 * 3. Rejects every other upstream binding resource until the analyzer needs it.
 *
 * @param device - Browser device that will create the bind group.
 * @param entry - Upstream bind-group entry selected by Rust.
 * @returns Browser `GPUBindGroupEntry`.
 */
const gpuBindGroupEntryToBrowser = (
  device: GPUDevice,
  entry: GeneratedWebGpu.GpuBindGroupEntry,
): GPUBindGroupEntry => {
  switch (entry.resource.tag) {
    case "gpu-buffer":
      return {
        binding: entry.binding,
        resource: {
          buffer: gpuBufferBindingResourceToBrowser(
            device,
            entry.resource,
            entry.binding,
          ),
        },
      };
    case "gpu-texture":
      return {
        binding: entry.binding,
        resource: gpuTextureBindingResourceToBrowser(
          device,
          entry.resource,
          entry.binding,
        ).createView(),
      };
    case "gpu-buffer-binding":
    case "gpu-sampler":
    case "gpu-texture-view":
      throw new Error(
        `[analysis][component-gpu] unsupported analyzer binding resource: ${entry.resource.tag}`,
      );
  }
};

/**
 * Find one upstream bind-group entry by binding index.
 *
 * @param entries - Upstream bind-group entries selected by Rust.
 * @param binding - Binding number to resolve.
 * @returns Matching upstream bind-group entry.
 */
const requireBindGroupEntry = (
  entries: GeneratedWebGpu.GpuBindGroupEntry[],
  binding: number,
): GeneratedWebGpu.GpuBindGroupEntry => {
  const entry = entries.find((candidate) => candidate.binding === binding);
  if (!entry) {
    throw new Error(
      `[analysis][component-gpu] missing analyzer bind-group entry ${binding}`,
    );
  }
  return entry;
};

/**
 * Build a host record for the analyzer visual bind group.
 *
 * @param device - Browser device that created the bind group.
 * @param bindGroup - Browser bind group represented by the upstream handle.
 * @param descriptor - Upstream bind-group descriptor selected by Rust.
 * @returns Host bind-group record carrying only resource identity.
 */
const createVisualBindGroupRecord = (
  device: GPUDevice,
  bindGroup: GPUBindGroup,
  descriptor: GeneratedWebGpu.GpuBindGroupDescriptor,
): BindGroupRecord => {
  const resources = createCommandResources();
  resources.truthBuffer = gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 1).resource,
    1,
  );
  resources.outputs.visual.buffer = gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 3).resource,
    3,
  );
  resources.outputs.visual.indirectBuffer = gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 13).resource,
    13,
  );
  return { device, role: "visual", bindGroup, resources };
};

/**
 * Build a host record for the analyzer statistics bind group.
 *
 * @param device - Browser device that created the bind group.
 * @param bindGroup - Browser bind group represented by the upstream handle.
 * @param descriptor - Upstream bind-group descriptor selected by Rust.
 * @returns Host bind-group record carrying only resource identity.
 */
const createStatsBindGroupRecord = (
  device: GPUDevice,
  bindGroup: GPUBindGroup,
  descriptor: GeneratedWebGpu.GpuBindGroupDescriptor,
): BindGroupRecord => {
  const resources = createCommandResources();
  resources.texture = gpuTextureBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 0).resource,
    0,
  );
  resources.truthBuffer = gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 1).resource,
    1,
  );
  resources.summaryBuffer = gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 2).resource,
    2,
  );
  return { device, role: "stats", bindGroup, resources };
};

/**
 * Build a host record for the analyzer border-trace bind group.
 *
 * @param device - Browser device that created the bind group.
 * @param bindGroup - Browser bind group represented by the upstream handle.
 * @param descriptor - Upstream bind-group descriptor selected by Rust.
 * @returns Host bind-group record carrying only resource identity.
 */
const createBorderTraceBindGroupRecord = (
  device: GPUDevice,
  bindGroup: GPUBindGroup,
  descriptor: GeneratedWebGpu.GpuBindGroupDescriptor,
): BindGroupRecord => {
  const resources = createCommandResources();
  resources.texture = gpuTextureBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 0).resource,
    0,
  );
  resources.truthBuffer = gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 1).resource,
    1,
  );
  resources.outputs.borderTrace.buffer = gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 4).resource,
    4,
  );
  resources.outputs.borderTrace.indirectBuffer =
    gpuBufferBindingResourceToBrowser(
      device,
      requireBindGroupEntry(descriptor.entries, 14).resource,
      14,
    );
  return { device, role: "border-trace", bindGroup, resources };
};

/**
 * Build a host record for the analyzer edge-discovery bind group.
 *
 * - binding 0: requires captured-pixel texture.
 * - binding 5: accepts feature intermediate storage.
 * - binding 6: accepts evidence intermediate storage.
 * - binding 12: accepts thinned edge-evidence storage.
 * - binding 7: accepts refiner-only tile-stats storage.
 * - binding 10: tracks the renderer-facing frequency-supported output buffer because
 *   that is the product resource the command buffer must keep visible after
 *   submit.
 * - binding 11: validates the internal low/high-frequency state buffer, but
 *   does not record it as output because it is an intermediate GPU-only signal.
 * - binding 13: tracks GPU-written indirect draw arguments. This is the active
 *   draw-instance handoff for the renderer; JavaScript does not compute or pass
 *   that value anymore.
 *
 * Dormant rectangle-candidate buffers are not accepted in this active layout,
 * keeping the compute-stage storage-buffer count under WebGPU's default limit
 * of eight. Ground truth is also not accepted or recorded because edge
 * discovery is pixel-derived.
 *
 * @param device - Browser device that created the bind group.
 * @param bindGroup - Browser bind group represented by the upstream handle.
 * @param descriptor - Upstream bind-group descriptor selected by Rust.
 * @returns Host bind-group record carrying edge-discovery resource identity.
 */
const createEdgeDiscoveryBindGroupRecord = (
  device: GPUDevice,
  bindGroup: GPUBindGroup,
  descriptor: GeneratedWebGpu.GpuBindGroupDescriptor,
): BindGroupRecord => {
  gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 5).resource,
    5,
  );
  gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 6).resource,
    6,
  );
  gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 7).resource,
    7,
  );
  gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 12).resource,
    12,
  );
  gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 11).resource,
    11,
  );

  const resources = createCommandResources();
  resources.texture = gpuTextureBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 0).resource,
    0,
  );
  resources.outputs.edgeDiscovery.buffer = gpuBufferBindingResourceToBrowser(
    device,
    requireBindGroupEntry(descriptor.entries, 10).resource,
    10,
  );
  resources.outputs.edgeDiscovery.indirectBuffer =
    gpuBufferBindingResourceToBrowser(
      device,
      requireBindGroupEntry(descriptor.entries, 13).resource,
      13,
    );
  return { device, role: "edge-discovery", bindGroup, resources };
};

/**
 * Merge one bind-group resource set into a command encoder resource set.
 *
 * 1. Accepts `null` fields because visual and statistics bind groups each
 *    contribute only the resources they use.
 * 2. Rejects conflicting non-null resources, especially mismatched
 *    component-reference buffers.
 * 3. Leaves plan metadata out of this path; resolve imports the authoritative
 *    plan later.
 *
 * @param target - Command encoder resource accumulator to mutate.
 * @param source - Bind-group resources to merge.
 * @returns Nothing.
 */
const mergeCommandBufferResource = (
  current: GPUBuffer | null,
  incoming: GPUBuffer | null,
  description: string,
): GPUBuffer | null => {
  if (!incoming) return current;
  if (current && current !== incoming) {
    throw new Error(
      `[analysis][component-gpu] conflicting ${description} buffers bound`,
    );
  }
  return incoming;
};

const mergeCommandResources = (
  target: CommandResources,
  source: CommandResources,
): void => {
  if (source.texture) {
    if (target.texture && target.texture !== source.texture) {
      throw new Error(
        "[analysis][component-gpu] conflicting captured textures bound",
      );
    }
    target.texture = source.texture;
  }
  target.truthBuffer = mergeCommandBufferResource(
    target.truthBuffer,
    source.truthBuffer,
    "ground-truth",
  );
  target.summaryBuffer = mergeCommandBufferResource(
    target.summaryBuffer,
    source.summaryBuffer,
    "summary",
  );
  forEachComponentGpuOutput(source.outputs, (sourceOutput, outputName) => {
    const targetOutput = target.outputs[outputName];
    targetOutput.buffer = mergeCommandBufferResource(
      targetOutput.buffer,
      sourceOutput.buffer,
      `${outputName} output`,
    );
    targetOutput.indirectBuffer = mergeCommandBufferResource(
      targetOutput.indirectBuffer,
      sourceOutput.indirectBuffer,
      `${outputName} indirect`,
    );
  });
};

/**
 * Convert accumulated nullable resources into the complete command shape.
 *
 * @param resources - Command encoder resources accumulated from bind groups.
 * @returns Complete resource set, or `null` when a required binding is missing.
 */
const requireCompleteCommandResources = (
  resources: CommandResources,
): CompleteCommandResources | null => {
  const { texture, truthBuffer, summaryBuffer, outputs } = resources;
  if (
    !texture ||
    !truthBuffer ||
    !summaryBuffer ||
    !isCompleteComponentGpuOutputSet(outputs)
  ) {
    return null;
  }
  return { texture, truthBuffer, summaryBuffer, outputs };
};

/**
 * Determine whether an upstream bind-group layout is the analyzer visual shape.
 *
 * @param descriptor - Upstream bind-group-layout descriptor selected by Rust.
 * @returns Whether the descriptor matches component references plus visual-output and indirect storage.
 */
const isVisualBindGroupLayout = (
  descriptor: GeneratedWebGpu.GpuBindGroupLayoutDescriptor,
): boolean =>
  descriptor.entries.length === 3 &&
  descriptor.entries[0]?.binding === 1 &&
  descriptor.entries[0]?.buffer?.type === "read-only-storage" &&
  descriptor.entries[1]?.binding === 3 &&
  descriptor.entries[1]?.buffer?.type === "storage" &&
  descriptor.entries[2]?.binding === 13 &&
  descriptor.entries[2]?.buffer?.type === "storage";

/**
 * Determine whether an upstream bind-group layout is the analyzer stats shape.
 *
 * @param descriptor - Upstream bind-group-layout descriptor selected by Rust.
 * @returns Whether the descriptor matches captured-pixel, component-reference, and summary-output bindings.
 */
const isStatsBindGroupLayout = (
  descriptor: GeneratedWebGpu.GpuBindGroupLayoutDescriptor,
): boolean =>
  descriptor.entries.length === 3 &&
  descriptor.entries[0]?.binding === 0 &&
  descriptor.entries[0]?.texture?.sampleType === "float" &&
  descriptor.entries[0]?.texture?.viewDimension === "d2" &&
  descriptor.entries[1]?.binding === 1 &&
  descriptor.entries[1]?.buffer?.type === "read-only-storage" &&
  descriptor.entries[2]?.binding === 2 &&
  descriptor.entries[2]?.buffer?.type === "storage";

/**
 * Determine whether an upstream bind-group layout is the analyzer border-trace shape.
 *
 * @param descriptor - Upstream bind-group-layout descriptor selected by Rust.
 * @returns Whether the descriptor matches captured-pixel, component-reference, border-trace output, and indirect bindings.
 */
const isBorderTraceBindGroupLayout = (
  descriptor: GeneratedWebGpu.GpuBindGroupLayoutDescriptor,
): boolean =>
  descriptor.entries.length === 4 &&
  descriptor.entries[0]?.binding === 0 &&
  descriptor.entries[0]?.texture?.sampleType === "float" &&
  descriptor.entries[0]?.texture?.viewDimension === "d2" &&
  descriptor.entries[1]?.binding === 1 &&
  descriptor.entries[1]?.buffer?.type === "read-only-storage" &&
  descriptor.entries[2]?.binding === 4 &&
  descriptor.entries[2]?.buffer?.type === "storage" &&
  descriptor.entries[3]?.binding === 14 &&
  descriptor.entries[3]?.buffer?.type === "storage";

/**
 * Determine whether an upstream bind-group layout is the edge-discovery shape.
 *
 * - binding 0: captured-pixel texture.
 * - binding 5: feature storage.
 * - binding 6: evidence storage.
 * - binding 12: thinned evidence storage.
 * - binding 7: refiner tile-stats storage.
 * - binding 10: renderer-facing frequency-supported edge output storage.
 * - binding 11: internal low/high-frequency state storage.
 * - binding 13: GPU-written indirect draw arguments buffer.
 *
 * Dormant rectangle-candidate buffers are not part of the active layout, so
 * this stays under WebGPU's default eight-storage-buffer compute limit. No
 * ground-truth binding is allowed in this pixel-derived discovery layout.
 *
 * @param descriptor - Upstream bind-group-layout descriptor selected by Rust.
 * @returns Whether the descriptor matches the pixel-derived edge-discovery bindings.
 */
const isEdgeDiscoveryBindGroupLayout = (
  descriptor: GeneratedWebGpu.GpuBindGroupLayoutDescriptor,
): boolean =>
  descriptor.entries.length === 8 &&
  descriptor.entries[0]?.binding === 0 &&
  descriptor.entries[0]?.texture?.sampleType === "float" &&
  descriptor.entries[0]?.texture?.viewDimension === "d2" &&
  descriptor.entries[1]?.binding === 5 &&
  descriptor.entries[1]?.buffer?.type === "storage" &&
  descriptor.entries[2]?.binding === 6 &&
  descriptor.entries[2]?.buffer?.type === "storage" &&
  descriptor.entries[3]?.binding === 7 &&
  descriptor.entries[3]?.buffer?.type === "storage" &&
  descriptor.entries[4]?.binding === 12 &&
  descriptor.entries[4]?.buffer?.type === "storage" &&
  descriptor.entries[5]?.binding === 10 &&
  descriptor.entries[5]?.buffer?.type === "storage" &&
  descriptor.entries[6]?.binding === 11 &&
  descriptor.entries[6]?.buffer?.type === "storage" &&
  descriptor.entries[7]?.binding === 13 &&
  descriptor.entries[7]?.buffer?.type === "storage";

/**
 * Classify the analyzer bind-group layout Rust requested.
 *
 * @param descriptor - Upstream bind-group-layout descriptor selected by Rust.
 * @returns Analyzer pipeline role supported by the layout.
 */
const classifyBindGroupLayout = (
  descriptor: GeneratedWebGpu.GpuBindGroupLayoutDescriptor,
): AnalysisPipelineRole => {
  if (isVisualBindGroupLayout(descriptor)) return "visual";
  if (isStatsBindGroupLayout(descriptor)) return "stats";
  if (isBorderTraceBindGroupLayout(descriptor)) return "border-trace";
  if (isEdgeDiscoveryBindGroupLayout(descriptor)) return "edge-discovery";
  throw new Error(
    "[analysis][component-gpu] unsupported analyzer bind-group layout",
  );
};

/**
 * Read the concrete pipeline-layout handle from upstream `gpu-layout-mode`.
 *
 * @param layout - Upstream layout mode selected by Rust.
 * @returns Specific upstream pipeline-layout handle.
 */
const readSpecificPipelineLayout = (
  layout: GeneratedWebGpu.GpuLayoutMode,
): GpuPipelineLayout => {
  if (layout.tag !== "specific") {
    throw new Error(
      "[analysis][component-gpu] analyzer compute pipelines require explicit layouts",
    );
  }
  return layout.val;
};

/**
 * Compose WebGPU validation promises in causal order.
 *
 * 1. Prefers an earlier setup error over later invalid-resource fallout.
 * 2. Allows command validation to include pipeline setup failures without the
 *    Rust side knowing about browser validation scopes.
 * 3. Returns `null` only when every supplied phase is clean.
 *
 * @param first - Earlier validation phase, or `null` when no phase exists.
 * @param second - Later validation phase.
 * @returns Promise resolving to the first validation error, if any.
 */
const firstValidationError = async (
  first: Promise<GPUError | null> | null,
  second: Promise<GPUError | null>,
): Promise<GPUError | null> => {
  if (!first) return await second;
  const firstError = await first;
  if (firstError) return firstError;
  return await second;
};

/**
 * Register a browser `GPUDevice` as an upstream `wasi:webgpu` resource.
 *
 * 1. Allocates a jco-compatible resource instance.
 * 2. Stores the real browser object in a host-owned WeakMap.
 * 3. Returns only the opaque handle to callers and the component.
 *
 * @param device - Existing inspector WebGPU device; never created by Rust.
 * @returns Opaque upstream `gpu-device` resource handle.
 */
export function registerGpuDevice(device: GPUDevice): GpuDevice {
  const handle = new GpuDevice();
  deviceRecords.set(handle, { device });
  return handle;
}

/**
 * Register a captured browser `GPUTexture` as an upstream resource.
 *
 * 1. Associates the texture with the shared inspector device that owns it.
 * 2. Preserves same-device validation for the eventual analyzer workflow.
 * 3. Avoids copying or reading texture pixels into JavaScript.
 *
 * @param texture - Captured-pixel texture for one inspector entry.
 * @param device - Device that owns `texture`.
 * @returns Opaque upstream `gpu-texture` resource handle.
 */
export function registerGpuTexture(
  texture: GPUTexture,
  device: GPUDevice,
): GpuTexture {
  const handle = new GpuTexture();
  textureRecords.set(handle, { texture, device });
  return handle;
}

/**
 * Register a browser `GPUBuffer` as an upstream resource.
 *
 * 1. Associates the buffer with the shared inspector device that owns it.
 * 2. Allows the component to bind component-reference data without receiving
 *    serialized labels.
 * 3. Keeps the host responsible for browser WebGPU object lifetimes.
 *
 * @param buffer - Browser buffer represented by an upstream WIT resource.
 * @param device - Device that owns `buffer`.
 * @returns Opaque upstream `gpu-buffer` resource handle.
 */
export function registerGpuBuffer(
  buffer: GPUBuffer,
  device: GPUDevice,
): GpuBuffer {
  const handle = new GpuBuffer();
  bufferRecords.set(handle, { buffer, device });
  return handle;
}

/**
 * Register the scheduler's already-created native command encoder for a
 * single synchronous component call.
 *
 * The returned WIT resource is only a borrowed projection. Releasing the
 * projection never finishes or invalidates the native encoder; the scheduler
 * continues using that exact object for the render pass and final submit.
 *
 * @param encoder - Still-open command encoder owned by the frame scheduler.
 * @param device - Shared inspector device that created `encoder`.
 * @returns Opaque upstream command-encoder handle lent to Rust.
 */
export function registerExternalGpuCommandEncoder(
  encoder: GPUCommandEncoder,
  device: GPUDevice,
): GpuCommandEncoder {
  const handle = new GpuCommandEncoder();
  commandEncoderRecords.set(handle, {
    device,
    encoder,
    ownership: "scheduler-borrowed",
    validationPhase: "encode component-gpu-frame commands",
    setupValidation: null,
    resources: createCommandResources(),
  });
  return handle;
}

/**
 * Close one borrowed WIT projection without touching its native encoder.
 *
 * This is the counterpart to {@link registerExternalGpuCommandEncoder}. It
 * also proves that Rust bound every analyzer output before the loader exposes
 * those buffers to the browser backend.
 *
 * @param handle - Borrowed command-encoder handle used for one component call.
 * @returns Complete encoded-resource metadata needed for summary resolution.
 */
export function takeExternalGpuCommandEncoding(
  handle: GpuCommandEncoder,
): ExternalGpuCommandEncoding {
  const record = requireRegisteredCommandEncoder(handle);
  if (record.ownership !== "scheduler-borrowed") {
    throw new Error(
      "[analysis][component-gpu-frame] component-owned encoder used as scheduler borrow",
    );
  }
  const resources = requireCompleteCommandResources(record.resources);
  if (!resources) {
    throw new Error(
      "[analysis][component-gpu-frame] Rust returned before binding the complete analyzer resource set",
    );
  }
  commandEncoderRecords.delete(handle);
  return {
    device: record.device,
    resources,
    setupValidation: record.setupValidation,
    validationPhase: record.validationPhase,
  };
}

/**
 * Discard one failed borrowed-encoder projection without touching the encoder.
 *
 * This abort path removes only the temporary WIT projection and destroys every
 * component-owned output already recorded on it. Caller-owned textures,
 * reference buffers, and the native scheduler encoder are not destroyed. It
 * does not roll back commands already appended to that encoder and does not
 * make the encoder reusable. After any component frame-encoding failure, the
 * scheduler must abandon the whole encoder/frame without finishing or
 * submitting it. The frame adapter uses the returned native-buffer identities
 * only to avoid destroying a returned output twice during local cleanup.
 *
 * @param handle - Borrowed command-encoder projection whose extraction failed.
 * @returns Native component-owned buffers destroyed during the discard.
 */
export function discardExternalGpuCommandEncodingProjection(
  handle: GpuCommandEncoder,
): ReadonlySet<GPUBuffer> {
  const destroyedBuffers = new Set<GPUBuffer>();
  const record = commandEncoderRecords.get(handle);
  if (!record) return destroyedBuffers;
  if (record.ownership !== "scheduler-borrowed") {
    throw new Error(
      "[analysis][component-gpu-frame] component-owned encoder cannot be discarded as scheduler borrow",
    );
  }

  commandEncoderRecords.delete(handle);
  const destroyComponentOwnedBuffer = (buffer: GPUBuffer | null): void => {
    if (!buffer) return;
    if (destroyedBuffers.has(buffer)) return;
    try {
      buffer.destroy();
      destroyedBuffers.add(buffer);
    } catch {
      // Cleanup must preserve the component failure that led here.
    }
  };
  destroyComponentOwnedBuffer(record.resources.summaryBuffer);
  forEachComponentGpuOutputValue(
    record.resources.outputs,
    destroyComponentOwnedBuffer,
  );
  return destroyedBuffers;
}

/**
 * Register an encoded browser command buffer as an upstream resource.
 *
 * 1. Associates the command buffer with the shared inspector device.
 * 2. Preserves the bound captured-pixel, component-reference, summary, and
 *    visual resources for summary resolution.
 * 3. Leaves actual submission to `gpu-queue.submit`, matching upstream WIT.
 *
 * @param record - Host-owned command-buffer metadata to register.
 * @returns Opaque upstream `gpu-command-buffer` resource handle.
 */
export function registerGpuCommandBuffer(
  record: Omit<CommandBufferRecord, "submission">,
): GpuCommandBuffer {
  const handle = new GpuCommandBuffer();
  commandBufferRecords.set(handle, { ...record, submission: null });
  return handle;
}

/**
 * Register a browser compute pipeline as an upstream resource.
 *
 * 1. Associates the pipeline with the shared inspector device.
 * 2. Stores the matching bind-group layout for later analyzer bind groups.
 * 3. Carries setup validation forward into command-buffer validation.
 *
 * @param record - Host-owned compute-pipeline metadata.
 * @returns Opaque upstream `gpu-compute-pipeline` resource handle.
 */
export function registerGpuComputePipeline(
  record: ComputePipelineRecord,
): GpuComputePipeline {
  const handle = new GpuComputePipeline();
  computePipelineRecords.set(handle, record);
  return handle;
}

/**
 * Register a browser bind group as an upstream resource.
 *
 * 1. Associates the bind group with the GPU resources it binds.
 * 2. Lets Rust bind it explicitly through `gpu-compute-pass-encoder`.
 * 3. Keeps metadata available until `gpu-command-encoder.finish(...)`.
 *
 * @param record - Host-owned bind-group metadata.
 * @returns Opaque upstream `gpu-bind-group` resource handle.
 */
export function registerGpuBindGroup(record: BindGroupRecord): GpuBindGroup {
  const handle = new GpuBindGroup();
  bindGroupRecords.set(handle, record);
  return handle;
}

/**
 * Release a registered upstream WebGPU resource handle.
 *
 * 1. Removes host WeakMap state for the opaque handle.
 * 2. Leaves the real WebGPU object lifetime with the inspector engine.
 * 3. Accepts unregistered resource objects so cleanup paths can stay simple.
 *
 * @param handle - Opaque WebGPU resource handle to release.
 * @returns Nothing.
 */
export function releaseWebGpuHandle(
  handle:
    | GpuDevice
    | GpuTexture
    | RegisteredGpuBufferHandle
    | GpuCommandBuffer
    | GpuCommandEncoder
    | GpuComputePassEncoder
    | GpuShaderModule
    | GpuBindGroupLayout
    | GpuPipelineLayout
    | GpuComputePipeline
    | GpuBindGroup
    | GpuSampler
    | GpuTextureView
    | RecordGpuPipelineConstantValue
    | GpuQuerySet
    | null
    | undefined,
): void {
  if (!handle) return;
  if (handle instanceof GpuDevice) deviceRecords.delete(handle);
  if (handle instanceof GpuTexture) textureRecords.delete(handle);
  if (handle instanceof GpuBuffer) bufferRecords.delete(handle);
  if (handle instanceof GpuCommandBuffer) commandBufferRecords.delete(handle);
  if (handle instanceof GpuCommandEncoder) commandEncoderRecords.delete(handle);
  if (handle instanceof GpuComputePassEncoder)
    computePassEncoderRecords.delete(handle);
  if (handle instanceof GpuShaderModule) shaderModuleRecords.delete(handle);
  if (handle instanceof GpuBindGroupLayout)
    bindGroupLayoutRecords.delete(handle);
  if (handle instanceof GpuPipelineLayout) pipelineLayoutRecords.delete(handle);
  if (handle instanceof GpuComputePipeline)
    computePipelineRecords.delete(handle);
  if (handle instanceof GpuBindGroup) bindGroupRecords.delete(handle);
}

/**
 * Resolve a registered upstream `gpu-device` handle.
 *
 * 1. Looks up the opaque WIT resource in the host-owned device table.
 * 2. Throws before dispatch if the component passed an unregistered handle.
 * 3. Returns the browser object record without transferring ownership.
 *
 * @param handle - Opaque upstream WIT resource handle.
 * @returns Browser device record represented by `handle`.
 */
export function requireRegisteredDevice(handle: GpuDevice): DeviceRecord {
  const record = deviceRecords.get(handle);
  if (!record) {
    throw new Error("[analysis][component-gpu] unregistered GPU device handle");
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-texture` handle.
 *
 * 1. Looks up the opaque WIT resource in the host-owned texture table.
 * 2. Throws before dispatch if the component passed an unregistered handle.
 * 3. Returns both the browser texture and its owning device for validation.
 *
 * @param handle - Opaque upstream WIT resource handle.
 * @returns Browser texture record represented by `handle`.
 */
export function requireRegisteredTexture(handle: GpuTexture): TextureRecord {
  const record = textureRecords.get(handle);
  if (!record) {
    throw new Error(
      "[analysis][component-gpu] unregistered GPU texture handle",
    );
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-buffer` handle.
 *
 * 1. Looks up the opaque WIT resource in the host-owned buffer table.
 * 2. Throws before dispatch if the component passed an unregistered handle.
 * 3. Returns both the browser buffer and its owning device for validation.
 *
 * @param handle - Opaque upstream WIT resource handle.
 * @returns Browser buffer record represented by `handle`.
 */
export function requireRegisteredBuffer(
  handle: RegisteredGpuBufferHandle,
): BufferRecord {
  const record = bufferRecords.get(handle);
  if (!record) {
    throw new Error("[analysis][component-gpu] unregistered GPU buffer handle");
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-queue` handle.
 *
 * 1. Looks up the opaque WIT resource in the host-owned queue table.
 * 2. Throws before awaiting work if the component passed an unknown handle.
 * 3. Returns both the browser queue and its owning device for diagnostics.
 *
 * @param handle - Opaque upstream WIT queue resource handle.
 * @returns Browser queue record represented by `handle`.
 */
export function requireRegisteredQueue(handle: GpuQueue): QueueRecord {
  const record = queueRecords.get(handle);
  if (!record) {
    throw new Error(
      "[analysis][component-gpu-async] unregistered GPU queue handle",
    );
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-command-buffer` handle.
 *
 * 1. Looks up the opaque WIT resource in the host-owned command-buffer table.
 * 2. Throws before submit/resolve if the component passed an unknown handle.
 * 3. Returns the browser command buffer and analyzer metadata.
 *
 * @param handle - Opaque upstream WIT command-buffer resource handle.
 * @returns Browser command-buffer record represented by `handle`.
 */
export function requireRegisteredCommandBuffer(
  handle: GpuCommandBuffer,
): CommandBufferRecord {
  const record = commandBufferRecords.get(handle);
  if (!record) {
    throw new Error(
      "[analysis][component-gpu] unregistered GPU command-buffer handle",
    );
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-command-encoder` handle.
 *
 * @param handle - Opaque upstream command-encoder resource handle.
 * @returns Browser command-encoder record represented by `handle`.
 */
export function requireRegisteredCommandEncoder(
  handle: GpuCommandEncoder,
): CommandEncoderRecord {
  const record = commandEncoderRecords.get(handle);
  if (!record) {
    throw new Error(
      "[analysis][component-gpu] unregistered GPU command-encoder handle",
    );
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-compute-pass-encoder` handle.
 *
 * @param handle - Opaque upstream compute-pass encoder resource handle.
 * @returns Browser compute-pass record represented by `handle`.
 */
export function requireRegisteredComputePassEncoder(
  handle: GpuComputePassEncoder,
): ComputePassEncoderRecord {
  const record = computePassEncoderRecords.get(handle);
  if (!record) {
    throw new Error(
      "[analysis][component-gpu] unregistered GPU compute-pass handle",
    );
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-shader-module` handle.
 *
 * @param handle - Opaque upstream shader-module resource handle.
 * @returns Browser shader-module record represented by `handle`.
 */
export function requireRegisteredShaderModule(
  handle: GpuShaderModule,
): ShaderModuleRecord {
  const record = shaderModuleRecords.get(handle);
  if (!record) {
    throw new Error(
      "[analysis][component-gpu] unregistered GPU shader-module handle",
    );
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-bind-group-layout` handle.
 *
 * @param handle - Opaque upstream bind-group-layout resource handle.
 * @returns Browser bind-group-layout record represented by `handle`.
 */
export function requireRegisteredBindGroupLayout(
  handle: GpuBindGroupLayout,
): BindGroupLayoutRecord {
  const record = bindGroupLayoutRecords.get(handle);
  if (!record) {
    throw new Error(
      "[analysis][component-gpu] unregistered GPU bind-group-layout handle",
    );
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-pipeline-layout` handle.
 *
 * @param handle - Opaque upstream pipeline-layout resource handle.
 * @returns Browser pipeline-layout record represented by `handle`.
 */
export function requireRegisteredPipelineLayout(
  handle: GpuPipelineLayout,
): PipelineLayoutRecord {
  const record = pipelineLayoutRecords.get(handle);
  if (!record) {
    throw new Error(
      "[analysis][component-gpu] unregistered GPU pipeline-layout handle",
    );
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-compute-pipeline` handle.
 *
 * @param handle - Opaque upstream compute-pipeline resource handle.
 * @returns Browser compute-pipeline record represented by `handle`.
 */
export function requireRegisteredComputePipeline(
  handle: GpuComputePipeline,
): ComputePipelineRecord {
  const record = computePipelineRecords.get(handle);
  if (!record) {
    throw new Error(
      "[analysis][component-gpu] unregistered GPU compute-pipeline handle",
    );
  }
  return record;
}

/**
 * Resolve a registered upstream `gpu-bind-group` handle.
 *
 * @param handle - Opaque upstream bind-group resource handle.
 * @returns Browser bind-group record represented by `handle`.
 */
export function requireRegisteredBindGroup(
  handle: GpuBindGroup,
): BindGroupRecord {
  const record = bindGroupRecords.get(handle);
  if (!record) {
    throw new Error(
      "[analysis][component-gpu] unregistered GPU bind-group handle",
    );
  }
  return record;
}

/**
 * Resolve a command buffer that has passed through `gpu-queue.submit`.
 *
 * @param handle - Opaque upstream WIT command-buffer resource handle.
 * @returns Browser command-buffer record with a non-null submission marker.
 */
export function requireSubmittedCommandBuffer(
  handle: GpuCommandBuffer,
): CommandBufferRecord & { submission: QueueSubmissionRecord } {
  const record = requireRegisteredCommandBuffer(handle);
  const { submission } = record;
  if (!submission) {
    throw new Error(
      "[analysis][component-gpu] analysis command buffer was not submitted",
    );
  }
  return { ...record, submission };
}

type AssertAssignable<Actual extends Expected, Expected> = true;

// These classes are runtime host resources, not a second WIT definition.
// They must remain assignable to the generated `wasi:webgpu` resource types.
type GpuDeviceMatchesGenerated = AssertAssignable<
  GpuDevice,
  GeneratedWebGpu.GpuDevice
> &
  AssertAssignable<GpuDevice, GeneratedAsyncWebGpu.GpuDevice>;

type GpuTextureMatchesGenerated = AssertAssignable<
  GpuTexture,
  GeneratedWebGpu.GpuTexture
> &
  AssertAssignable<GeneratedWebGpu.GpuTexture, GpuTexture> &
  AssertAssignable<GpuTexture, GeneratedAsyncWebGpu.GpuTexture> &
  AssertAssignable<GeneratedAsyncWebGpu.GpuTexture, GpuTexture>;

type GpuBufferMatchesGenerated = AssertAssignable<
  GpuBuffer,
  GeneratedWebGpu.GpuBuffer
> &
  AssertAssignable<GpuBuffer, GeneratedAsyncWebGpu.GpuBuffer>;

type GpuQueueMatchesGenerated = AssertAssignable<
  GpuQueue,
  GeneratedWebGpu.GpuQueue
> &
  AssertAssignable<GpuQueue, GeneratedAsyncWebGpu.GpuQueue>;

type GpuCommandBufferMatchesGenerated = AssertAssignable<
  GpuCommandBuffer,
  GeneratedWebGpu.GpuCommandBuffer
> &
  AssertAssignable<GpuCommandBuffer, GeneratedAsyncWebGpu.GpuCommandBuffer>;

type GpuCommandEncoderMatchesGenerated = AssertAssignable<
  GpuCommandEncoder,
  GeneratedWebGpu.GpuCommandEncoder
> &
  AssertAssignable<GpuCommandEncoder, GeneratedAsyncWebGpu.GpuCommandEncoder> &
  AssertAssignable<GpuCommandEncoder, GeneratedFrameWebGpu.GpuCommandEncoder>;

type GpuComputePassEncoderMatchesGenerated = AssertAssignable<
  GpuComputePassEncoder,
  GeneratedWebGpu.GpuComputePassEncoder
> &
  AssertAssignable<
    GpuComputePassEncoder,
    GeneratedAsyncWebGpu.GpuComputePassEncoder
  >;

type GpuShaderModuleMatchesGenerated = AssertAssignable<
  GpuShaderModule,
  GeneratedWebGpu.GpuShaderModule
> &
  AssertAssignable<GpuShaderModule, GeneratedAsyncWebGpu.GpuShaderModule>;

type GpuBindGroupLayoutMatchesGenerated = AssertAssignable<
  GpuBindGroupLayout,
  GeneratedWebGpu.GpuBindGroupLayout
> &
  AssertAssignable<GpuBindGroupLayout, GeneratedAsyncWebGpu.GpuBindGroupLayout>;

type GpuPipelineLayoutMatchesGenerated = AssertAssignable<
  GpuPipelineLayout,
  GeneratedWebGpu.GpuPipelineLayout
> &
  AssertAssignable<GpuPipelineLayout, GeneratedAsyncWebGpu.GpuPipelineLayout>;

type GpuComputePipelineMatchesGenerated = AssertAssignable<
  GpuComputePipeline,
  GeneratedWebGpu.GpuComputePipeline
> &
  AssertAssignable<GpuComputePipeline, GeneratedAsyncWebGpu.GpuComputePipeline>;

type GpuBindGroupMatchesGenerated = AssertAssignable<
  GpuBindGroup,
  GeneratedWebGpu.GpuBindGroup
> &
  AssertAssignable<GpuBindGroup, GeneratedAsyncWebGpu.GpuBindGroup>;

type GpuSamplerMatchesGenerated = AssertAssignable<
  GpuSampler,
  GeneratedWebGpu.GpuSampler
> &
  AssertAssignable<GpuSampler, GeneratedAsyncWebGpu.GpuSampler>;

type GpuTextureViewMatchesGenerated = AssertAssignable<
  GpuTextureView,
  GeneratedWebGpu.GpuTextureView
> &
  AssertAssignable<GpuTextureView, GeneratedAsyncWebGpu.GpuTextureView>;

type GpuErrorMatchesGenerated = AssertAssignable<
  GpuError,
  GeneratedAsyncWebGpu.GpuError
>;
