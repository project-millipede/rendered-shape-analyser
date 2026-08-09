/**
 * Host implementation of `millipede:inspector/host-gpu`.
 *
 * Upstream `wasi:webgpu` resource identity lives in `host/webgpu/`. This
 * module owns only the inspector analyzer workflow import and the host-side
 * analysis job table.
 */

import {
  GpuBindGroup,
  GpuBuffer,
  GpuCommandBuffer,
  GpuCommandEncoder,
  GpuComputePipeline,
  GpuDevice,
  GpuTexture,
  type ExternalGpuCommandEncoding,
  type RegisteredGpuBufferHandle,
  releaseWebGpuHandle,
  requireRegisteredBuffer,
  requireRegisteredDevice,
  requireSubmittedCommandBuffer,
  registerExternalGpuCommandEncoder,
  registerGpuBuffer,
  takeExternalGpuCommandEncoding,
} from "./webgpu";
import type * as GeneratedHostGpu from "../../../pkg/generated/gpu-analysis/interfaces/millipede-inspector-host-gpu";
import type * as GeneratedGpuAnalysisFrame from "../../../pkg/generated/gpu-analysis-frame/interfaces/millipede-inspector-gpu-analysis-frame";
import type {
  AnalysisDispatch,
  AnalysisSummaryResult,
  AnalysisKernel,
  AnalysisPlan,
  ComponentGpuAnalysisInput,
  ComponentGpuAnalysisCommandBuffer,
  ComponentGpuAnalysisSummaryBuffers,
  ComponentGpuAnalysisVisualBuffers,
  ComponentGpuAnalysisVisualOutput,
  ComponentGpuAnalysisBorderTraceOutput,
  ComponentGpuAnalysisEdgeDiscoveryOutput,
  ComponentGpuAnalysisSubmission,
  ComponentGpuAnalysisOutput,
  ComponentGpuFrameEncodedOutput,
  ComponentGpuFramePendingSummary,
  ComponentGpuFrameSubmission,
  ComponentGpuSummaryResolver,
} from "./gpu-types";

const SUPPORTED_KERNEL = "per-component-stats-v1";
const WORKGROUP_SIZE_X = 8;
const WORKGROUP_SIZE_Y = 8;
const SUMMARY_WORDS_PER_NODE = 3;
const SUMMARY_NODE_STRIDE_BYTES =
  SUMMARY_WORDS_PER_NODE * Uint32Array.BYTES_PER_ELEMENT;
const VISUAL_RECORD_STRIDE_BYTES = 32;
const BORDER_TRACE_RECORD_STRIDE_BYTES = 32;
const EDGE_DISCOVERY_TILE_SIZE = 8;
const EDGE_DISCOVERY_THRESHOLD_MILLI = 60;
const EDGE_DISCOVERY_RECORD_STRIDE_BYTES = 32;

export {
  GpuBindGroup,
  GpuBuffer,
  GpuCommandBuffer,
  GpuCommandEncoder,
  GpuComputePipeline,
  GpuDevice,
  GpuTexture,
};
export type { RegisteredGpuBufferHandle };
export {
  registerGpuBuffer,
  registerGpuDevice,
  registerGpuTexture,
} from "./webgpu";
export type {
  AnalysisDispatch,
  AnalysisSummaryResult,
  AnalysisKernel,
  AnalysisPlan,
  AnalysisSummaryNodeStats,
  ComponentGpuAnalysisCommandBuffer,
  ComponentGpuAnalysisSummaryBuffers,
  ComponentGpuAnalysisSubmission,
  ComponentGpuAnalysisInput,
  ComponentGpuSummaryResolveInput,
  ComponentGpuSummaryResolver,
  ComponentGpuAnalysisVisualBuffers,
  ComponentGpuAnalysisVisualOutput,
  ComponentGpuAnalysisBorderTraceOutput,
  ComponentGpuAnalysisEdgeDiscoveryOutput,
  ComponentGpuAnalysisOutput,
  ComponentGpuFrameEncodedOutput,
  ComponentGpuFramePendingSummary,
  ComponentGpuFrameSubmission,
} from "./gpu-types";

let analysisSummaryResolver: ComponentGpuSummaryResolver | null = null;

/**
 * Integer ceil division for Rust-planned dispatch dimensions.
 *
 * @param value - Positive dividend.
 * @param divisor - Positive divisor.
 * @returns `ceil(value / divisor)`.
 */
const ceilDiv = (value: number, divisor: number): number =>
  Math.ceil(value / divisor);

/**
 * Assert the Rust-selected plan matches the host-supported P1 kernel.
 *
 * 1. Compares the Rust-forwarded texture dimensions with the host-owned
 *    browser `GPUTexture` dimensions.
 * 2. Confirms the kernel, workgroup size, dispatch grid, and summary layout
 *    are the currently supported P0 parity plan.
 * 3. Fails before analyzer dispatch so mismatched handles cannot produce a
 *    plausible but incorrectly correlated summary.
 * 4. Uses the caller-provided log prefix so stable and async P1 paths stay
 *    implementation-isolated while sharing the same invariant.
 *
 * @param prefix - Log/error prefix identifying the stable or async component path.
 * @param texture - Browser texture resolved from the upstream WIT resource handle.
 * @param plan - Rust-owned analyzer execution plan.
 * @returns Nothing; throws when the plan is unsupported or stale.
 */
export function assertSupportedAnalysisPlan(
  prefix: string,
  texture: GPUTexture,
  plan: AnalysisPlan,
): void {
  const { request } = plan;

  if (
    texture.width !== request.textureWidth ||
    texture.height !== request.textureHeight
  ) {
    throw new Error(
      `${prefix} texture dimensions do not match request metadata: texture=${texture.width}×${texture.height}, request=${request.textureWidth}×${request.textureHeight}`,
    );
  }

  if (plan.kernel !== SUPPORTED_KERNEL) {
    throw new Error(`${prefix} unsupported analysis kernel: ${plan.kernel}`);
  }

  if (
    plan.workgroupSizeX !== WORKGROUP_SIZE_X ||
    plan.workgroupSizeY !== WORKGROUP_SIZE_Y
  ) {
    throw new Error(
      `${prefix} unsupported workgroup size: ${plan.workgroupSizeX}×${plan.workgroupSizeY}`,
    );
  }

  const expectedWorkgroupsX = ceilDiv(request.textureWidth, WORKGROUP_SIZE_X);
  const expectedWorkgroupsY = ceilDiv(request.textureHeight, WORKGROUP_SIZE_Y);
  if (
    plan.dispatchWorkgroupsX !== expectedWorkgroupsX ||
    plan.dispatchWorkgroupsY !== expectedWorkgroupsY
  ) {
    throw new Error(
      `${prefix} dispatch grid does not match request dimensions: planned=${plan.dispatchWorkgroupsX}×${plan.dispatchWorkgroupsY}, expected=${expectedWorkgroupsX}×${expectedWorkgroupsY}`,
    );
  }

  if (
    plan.summaryWordsPerNode !== SUMMARY_WORDS_PER_NODE ||
    plan.summaryNodeStrideBytes !== SUMMARY_NODE_STRIDE_BYTES
  ) {
    throw new Error(
      `${prefix} unsupported summary layout: wordsPerNode=${plan.summaryWordsPerNode}, strideBytes=${plan.summaryNodeStrideBytes}`,
    );
  }

  const expectedEdgeSlotCapacity = expectedEdgeDiscoverySlotCapacity(
    request.textureWidth,
    request.textureHeight,
  );
  if (
    plan.edgeDiscoveryTileSize !== EDGE_DISCOVERY_TILE_SIZE ||
    plan.edgeDiscoveryThresholdMilli !== EDGE_DISCOVERY_THRESHOLD_MILLI ||
    plan.edgeDiscoverySlotCapacity !== expectedEdgeSlotCapacity
  ) {
    throw new Error(
      `${prefix} unsupported edge-discovery layout: tileSize=${plan.edgeDiscoveryTileSize}, thresholdMilli=${plan.edgeDiscoveryThresholdMilli}, capacity=${plan.edgeDiscoverySlotCapacity}`,
    );
  }
}

/**
 * Assert that two Rust-selected plans describe the same executable workflow.
 *
 * 1. Keeps dispatch tied to the pipeline or Rust-created buffers that Rust
 *    explicitly requested.
 * 2. Compares every field instead of relying on object identity because WIT
 *    records cross the boundary by value.
 * 3. Uses the caller's prefix so stable and async component errors stay
 *    filterable.
 *
 * @param prefix - Log/error prefix identifying the stable or async component path.
 * @param ensured - Plan stored with a host-owned analyzer workflow resource.
 * @param requested - Plan supplied to the dispatch import.
 * @returns Nothing; throws when dispatch does not match the resource plan.
 */
export function assertSameAnalysisPlan(
  prefix: string,
  ensured: AnalysisPlan,
  requested: AnalysisPlan,
): void {
  const mismatch =
    ensured.kernel !== requested.kernel ||
    ensured.workgroupSizeX !== requested.workgroupSizeX ||
    ensured.workgroupSizeY !== requested.workgroupSizeY ||
    ensured.dispatchWorkgroupsX !== requested.dispatchWorkgroupsX ||
    ensured.dispatchWorkgroupsY !== requested.dispatchWorkgroupsY ||
    ensured.summaryWordsPerNode !== requested.summaryWordsPerNode ||
    ensured.summaryNodeStrideBytes !== requested.summaryNodeStrideBytes ||
    ensured.edgeDiscoveryTileSize !== requested.edgeDiscoveryTileSize ||
    ensured.edgeDiscoveryThresholdMilli !==
      requested.edgeDiscoveryThresholdMilli ||
    ensured.edgeDiscoverySlotCapacity !==
      requested.edgeDiscoverySlotCapacity ||
    ensured.request.entryId !== requested.request.entryId ||
    ensured.request.displayName !== requested.request.displayName ||
    ensured.request.textureWidth !== requested.request.textureWidth ||
    ensured.request.textureHeight !== requested.request.textureHeight ||
    ensured.request.nodeCount !== requested.request.nodeCount;

  if (mismatch) {
    throw new Error(`${prefix} dispatch plan does not match resource plan`);
  }
}

/**
 * Configure the host-side implementation for component GPU summary resolution.
 *
 * 1. Lets the website map/decode the compact summary buffer.
 * 2. Keeps the stable component path JSPI-free by resolving the Rust-returned
 *    staging-buffer descriptor outside the component boundary.
 * 3. Accepts `null` so device teardown can clear stale readback targets.
 *
 * @param resolver - Host function that resolves one submitted analyzer summary.
 * @returns Nothing.
 */
export function configureGpuAnalysisSummaryResolver(
  resolver: ComponentGpuSummaryResolver | null,
): void {
  analysisSummaryResolver = resolver;
}

/**
 * Release a host-side GPU handle.
 *
 * 1. Removes WebGPU resource state through the upstream resource registry.
 * 2. Accepts stale or empty values so cleanup paths can stay simple.
 *
 * @param handle - Opaque resource previously returned by a registration call.
 * @returns Nothing.
 */
export function releaseGpuHandle(
  handle:
    | GpuDevice
    | GpuTexture
    | RegisteredGpuBufferHandle
    | GpuCommandBuffer
    | GpuCommandEncoder
    | GpuComputePipeline
    | GpuBindGroup
    | null
    | undefined,
): void {
  if (!handle) return;
  if (
    handle instanceof GpuDevice ||
    handle instanceof GpuTexture ||
    handle instanceof GpuBuffer ||
    handle instanceof GpuCommandBuffer ||
    handle instanceof GpuCommandEncoder ||
    handle instanceof GpuComputePipeline ||
    handle instanceof GpuBindGroup
  ) {
    releaseWebGpuHandle(handle);
  }
}

export {
  registerExternalGpuCommandEncoder,
  takeExternalGpuCommandEncoding,
};

/**
 * Compute the expected diagnostic summary byte length for a Rust plan.
 *
 * @param plan - Rust-owned execution plan supplied by the component.
 * @returns Expected byte length for the summary output and staging buffers.
 */
export const expectedSummaryByteLength = (plan: AnalysisPlan): number =>
  plan.request.nodeCount * plan.summaryNodeStrideBytes;

/**
 * Compute the expected GPU-resident visual byte length for a Rust plan.
 *
 * @param plan - Rust-owned execution plan supplied by the component.
 * @returns Expected byte length for one visual record per ground-truth node.
 */
const expectedVisualByteLength = (plan: AnalysisPlan): number =>
  plan.request.nodeCount * VISUAL_RECORD_STRIDE_BYTES;

/**
 * Compute the expected GPU-resident border-trace byte length for a Rust plan.
 *
 * @param capacity - Number of GPU record slots expected in the buffer.
 * @returns Expected byte length for one border-trace record per ground-truth node.
 */
const expectedBorderTraceByteLength = (capacity: number): number =>
  capacity * BORDER_TRACE_RECORD_STRIDE_BYTES;

/**
 * Compute the renderer-facing edge-discovery slot capacity for a texture.
 *
 * @param textureWidth - Captured texture width in texels.
 * @param textureHeight - Captured texture height in texels.
 * @returns Number of fixed-size edge-discovery tile slots covering the texture.
 */
export const expectedEdgeDiscoverySlotCapacity = (
  textureWidth: number,
  textureHeight: number,
): number =>
  ceilDiv(textureWidth, EDGE_DISCOVERY_TILE_SIZE) *
  ceilDiv(textureHeight, EDGE_DISCOVERY_TILE_SIZE);

/**
 * Compute the expected GPU-resident edge-discovery byte length for a plan.
 *
 * @param capacity - Number of GPU record slots expected in the buffer.
 * @returns Expected byte length for the edge-discovery output buffer.
 */
const expectedEdgeDiscoveryByteLength = (capacity: number): number =>
  capacity * EDGE_DISCOVERY_RECORD_STRIDE_BYTES;

/** Byte length of one WebGPU non-indexed indirect draw argument record. */
const DRAW_INDIRECT_BYTE_LENGTH = 16;

/**
 * Assert a Rust-created upstream buffer has the expected byte length.
 *
 * @param prefix - Log/error prefix identifying the component path.
 * @param label - Human-readable buffer role for the error message.
 * @param buffer - Browser buffer resolved from the upstream handle.
 * @param expectedByteLength - Exact byte length required by the plan.
 * @returns Nothing; throws when the buffer is stale or incorrectly sized.
 */
export const assertBufferByteLength = (
  prefix: string,
  label: string,
  buffer: GPUBuffer,
  expectedByteLength: number,
): void => {
  if (buffer.size !== expectedByteLength) {
    throw new Error(
      `${prefix} ${label} buffer has size ${buffer.size}, expected ${expectedByteLength}`,
    );
  }
};

/**
 * Build the resolver-facing summary shape from Rust-created buffers.
 *
 * @param plan - Rust-owned execution plan supplied by the component.
 * @param summaryBuffer - Browser buffer bound as the kernel summary output.
 * @param summaryStagingBuffer - Browser staging buffer used for readback.
 * @param summaryByteLength - Byte length Rust copied into staging.
 * @returns Summary-buffer shape consumed by the shared WebGPU executor.
 */
export const createSummaryBuffersView = (
  plan: AnalysisPlan,
  summaryBuffer: GPUBuffer,
  summaryStagingBuffer: GPUBuffer,
  summaryByteLength: number,
): ComponentGpuAnalysisSummaryBuffers => ({
  plan,
  summaryBuffer,
  summaryStagingBuffer,
  summaryByteLength,
});

/**
 * Destroy stable-path summary readback buffers before resolver ownership starts.
 *
 * 1. Runs only for early validation failures inside
 *    `resolveAnalysisSummaryReadback(...)`.
 * 2. Destroys Rust-created summary buffers that would otherwise never reach the
 *    website resolver's normal `finally` cleanup.
 * 3. Unmaps the staging buffer first when a browser error left it mapped.
 *
 * @param summaryBuffer - Rust-created GPU summary output buffer, if resolved.
 * @param summaryStagingBuffer - Rust-created CPU-readable staging buffer, if resolved.
 * @returns Nothing.
 */
const destroyUnclaimedSummaryReadbackBuffers = (
  summaryBuffer: GPUBuffer | null,
  summaryStagingBuffer: GPUBuffer | null,
): void => {
  if (summaryStagingBuffer?.mapState === "mapped") {
    summaryStagingBuffer.unmap();
  }
  summaryStagingBuffer?.destroy();
  summaryBuffer?.destroy();
};

/**
 * Build the overlay-facing visual shape from a Rust-created buffer.
 *
 * @param plan - Rust-owned execution plan supplied by the component.
 * @param visualBuffer - Browser buffer written by the visual initializer.
 * @returns Visual-buffer shape consumed by overlay/heatmap renderers.
 */
export const createVisualBuffersView = (
  plan: AnalysisPlan,
  visualBuffer: GPUBuffer,
): ComponentGpuAnalysisVisualBuffers => ({
  plan,
  visualBuffer,
  visualByteLength: expectedVisualByteLength(plan),
  visualSlotCapacity: plan.request.nodeCount,
});

/**
 * Resolve a Rust-returned visual output handle into the website executor shape.
 *
 * 1. Reads only host resource identity and buffer metadata; it never maps or
 *    copies visual data.
 * 2. Checks the allocated byte length against the dispatch
 *    expectation so stale artifacts cannot masquerade as valid visual output.
 * 3. Returns the existing executor-facing visual-buffer view so the website
 *    overlay path can consume the GPU buffer directly.
 *
 * @param prefix - Log/error prefix identifying the component backend.
 * @param expectedSlotCapacity - Number of visual record slots expected for the entry.
 * @param visual - Rust-returned upstream visual output resource.
 * @returns Website executor view over the GPU-resident visual buffer.
 */
export function resolveAnalysisVisualOutput(
  prefix: string,
  expectedSlotCapacity: number,
  visual: GeneratedHostGpu.AnalysisVisualOutput,
): ComponentGpuAnalysisVisualOutput {
  const visualBufferRecord = requireRegisteredBuffer(visual.buffer);
  const indirectBufferRecord = requireRegisteredBuffer(visual.indirectBuffer);
  assertBufferByteLength(
    prefix,
    "visual output",
    visualBufferRecord.buffer,
    expectedSlotCapacity * VISUAL_RECORD_STRIDE_BYTES,
  );
  assertBufferByteLength(
    prefix,
    "visual indirect draw args",
    indirectBufferRecord.buffer,
    DRAW_INDIRECT_BYTE_LENGTH,
  );
  return {
    buffer: visualBufferRecord.buffer,
    indirectBuffer: indirectBufferRecord.buffer,
  };
}

/**
 * Resolve a Rust-returned border-trace output handle into website shape.
 *
 * 1. Reads only host resource identity and buffer metadata; it never maps or
 *    copies border-trace data.
 * 2. Checks the allocated byte length against the dispatch
 *    expectation so stale artifacts cannot masquerade as valid trace output.
 * 3. Keeps the 2D border tracer as a separate product lane from the existing
 *    rectangle visual overlay.
 *
 * @param prefix - Log/error prefix identifying the component backend.
 * @param expectedSlotCapacity - Number of trace record slots expected for the entry.
 * @param borderTrace - Rust-returned upstream border-trace output resource.
 * @returns Website executor view over the GPU-resident border-trace buffer.
 */
export function resolveAnalysisBorderTraceOutput(
  prefix: string,
  expectedSlotCapacity: number,
  borderTrace: GeneratedHostGpu.AnalysisBorderTraceOutput,
): ComponentGpuAnalysisBorderTraceOutput {
  const borderTraceBufferRecord = requireRegisteredBuffer(borderTrace.buffer);
  const indirectBufferRecord = requireRegisteredBuffer(borderTrace.indirectBuffer);
  assertBufferByteLength(
    prefix,
    "border-trace output",
    borderTraceBufferRecord.buffer,
    expectedBorderTraceByteLength(expectedSlotCapacity),
  );
  assertBufferByteLength(
    prefix,
    "border-trace indirect draw args",
    indirectBufferRecord.buffer,
    DRAW_INDIRECT_BYTE_LENGTH,
  );
  return {
    buffer: borderTraceBufferRecord.buffer,
    indirectBuffer: indirectBufferRecord.buffer,
  };
}

/**
 * Resolve a Rust-returned edge-discovery output handle into website shape.
 *
 * 1. Reads only host resource identity and buffer metadata; it never maps or
 *    copies edge-discovery data.
 * 2. Validates the tile-grid capacity against the Rust plan so
 *    stale output cannot be drawn against the wrong texture size.
 * 3. Keeps the pixel-derived edge discovery lane separate from reference-guided border tracing.
 *
 * @param prefix - Log/error prefix identifying the component backend.
 * @param expectedSlotCapacity - Number of edge record slots expected for the entry.
 * @param edgeDiscovery - Rust-returned upstream edge-discovery output resource.
 * @returns Website executor view over the GPU-resident edge-discovery buffer.
 */
export function resolveAnalysisEdgeDiscoveryOutput(
  prefix: string,
  expectedSlotCapacity: number,
  edgeDiscovery: GeneratedHostGpu.AnalysisEdgeDiscoveryOutput,
): ComponentGpuAnalysisEdgeDiscoveryOutput {
  const edgeBufferRecord = requireRegisteredBuffer(edgeDiscovery.buffer);
  const indirectBufferRecord = requireRegisteredBuffer(edgeDiscovery.indirectBuffer);
  assertBufferByteLength(
    prefix,
    "edge-discovery output",
    edgeBufferRecord.buffer,
    expectedEdgeDiscoveryByteLength(expectedSlotCapacity),
  );
  assertBufferByteLength(
    prefix,
    "edge-discovery indirect draw args",
    indirectBufferRecord.buffer,
    DRAW_INDIRECT_BYTE_LENGTH,
  );
  return {
    buffer: edgeBufferRecord.buffer,
    indirectBuffer: indirectBufferRecord.buffer,
  };
}

/**
 * Create the one-shot summary resolver for commands appended to a shared
 * browser frame encoder.
 *
 * Ownership is intentionally explicit:
 *
 * 1. Before `resolveAfterSubmit`, this object owns the Rust-created summary
 *    output and staging buffers and can destroy them on a frame abort.
 * 2. `resolveAfterSubmit` may run only after the scheduler has submitted the
 *    native encoder. It transfers both buffers to the website summary decoder.
 * 3. Renderer-facing GPU output buffers are not owned here; the frame
 *    contributor stages and rolls those back separately because the render
 *    pass can consume them in the same command buffer.
 *
 * @param prefix - Log/error prefix identifying the shared-frame backend.
 * @param input - Browser resources supplied to the component call.
 * @param summary - Rust-returned encoded summary descriptor.
 * @param encoding - Metadata recovered from the borrowed encoder projection.
 * @param resolver - Device-local summary decoder owned by the website backend.
 * @returns One-shot pending summary lifecycle.
 */
export function createComponentGpuFramePendingSummary(
  prefix: string,
  input: ComponentGpuAnalysisInput,
  summary: GeneratedGpuAnalysisFrame.AnalysisFrameSummary,
  encoding: ExternalGpuCommandEncoding,
  resolver: ComponentGpuSummaryResolver,
): ComponentGpuFramePendingSummary {
  const stagingRecord = requireRegisteredBuffer(summary.stagingBuffer);
  const { plan } = summary;
  const { resources } = encoding;

  if (
    encoding.device !== input.device ||
    stagingRecord.device !== input.device ||
    resources.texture !== input.texture ||
    resources.truthBuffer !== input.truthBuffer
  ) {
    throw new Error(
      `${prefix} borrowed encoder resources do not match the analysis input`,
    );
  }
  if (
    plan.request.entryId !== input.entryId ||
    plan.request.displayName !== input.displayName ||
    plan.request.nodeCount !== input.nodeCount
  ) {
    throw new Error(`${prefix} encoded plan does not match the analysis input`);
  }
  assertSupportedAnalysisPlan(prefix, input.texture, plan);

  const byteLength = Number(summary.byteLength);
  if (!Number.isSafeInteger(byteLength)) {
    throw new Error(
      `${prefix} summary byte length ${summary.byteLength.toString()} cannot be represented safely`,
    );
  }
  if (byteLength !== expectedSummaryByteLength(plan)) {
    throw new Error(`${prefix} encoded summary byte length does not match plan`);
  }
  assertBufferByteLength(
    prefix,
    "summary output",
    resources.summaryBuffer,
    byteLength,
  );
  assertBufferByteLength(
    prefix,
    "summary staging",
    stagingRecord.buffer,
    byteLength,
  );

  const summaryBuffers = createSummaryBuffersView(
    plan,
    resources.summaryBuffer,
    stagingRecord.buffer,
    byteLength,
  );
  let state: "pending" | "transferred" | "disposed" = "pending";

  return {
    async resolveAfterSubmit(submission) {
      if (state !== "pending") {
        throw new Error(
          `${prefix} pending summary was already ${state}`,
        );
      }
      state = "transferred";

      // Pipeline creation has its own nested validation scopes inside the host
      // projection. The scheduler-provided promise covers encoding, rendering,
      // finish, and queue submission for the combined frame.
      const commandValidation =
        encoding.setupValidation ?? Promise.resolve(null);
      return await resolver({
        ...input,
        plan,
        summaryBuffers,
        submission: {
          plan,
          commandValidation,
          commandValidationPhase: encoding.validationPhase,
          validation: submission.validation,
          validationPhase: submission.validationPhase,
        },
      });
    },

    dispose() {
      if (state !== "pending") return;
      state = "disposed";
      destroyUnclaimedSummaryReadbackBuffers(
        resources.summaryBuffer,
        stagingRecord.buffer,
      );
    },
  };
}

/**
 * Resolve a stable-path diagnostic summary readback descriptor.
 *
 * 1. Uses only handles returned by Rust: the submitted command buffer plus the
 *    CPU-readable staging buffer. There is no project-owned analysis-job
 *    resource in the stable WIT contract anymore.
 * 2. Reuses command-buffer metadata recorded by the upstream WebGPU host shim
 *    to recover the summary-output buffer, captured-pixel texture, component-reference buffer,
 *    and validation promises.
 * 3. Starts the configured website resolver outside the component boundary so
 *    stable P1 remains JSPI-free while still reading only the compact
 *    diagnostic summary bytes.
 *
 * @param prefix - Log/error prefix identifying the component backend.
 * @param deviceHandle - Opaque handle for the inspector's shared device.
 * @param readback - Rust-returned diagnostic readback descriptor.
 * @returns Decoded compact diagnostic summary.
 */
export async function resolveAnalysisSummaryReadback(
  prefix: string,
  deviceHandle: GpuDevice,
  readback: GeneratedHostGpu.AnalysisSummaryReadback,
): Promise<AnalysisSummaryResult> {
  if (!analysisSummaryResolver) {
    throw new Error(
      "[analysis][component-gpu] no GPU analysis summary resolver configured",
    );
  }

  let unclaimedSummaryBuffer: GPUBuffer | null = null;
  let unclaimedSummaryStagingBuffer: GPUBuffer | null = null;
  let summaryBuffersTransferredToResolver = false;

  try {
    const summaryStagingBufferRecord = requireRegisteredBuffer(readback.stagingBuffer);
    const commandBufferRecord = requireSubmittedCommandBuffer(readback.commands);
    const { plan } = readback;

    unclaimedSummaryBuffer = commandBufferRecord.resources.summaryBuffer;
    unclaimedSummaryStagingBuffer = summaryStagingBufferRecord.buffer;

    const deviceRecord = requireRegisteredDevice(deviceHandle);
    if (
      summaryStagingBufferRecord.device !== deviceRecord.device ||
      commandBufferRecord.device !== deviceRecord.device
    ) {
      throw new Error(`${prefix} different device resource passed to summary readback`);
    }
    assertSupportedAnalysisPlan(
      prefix,
      commandBufferRecord.resources.texture,
      plan,
    );
    const summaryByteLengthNumber = Number(readback.byteLength);
    if (!Number.isSafeInteger(summaryByteLengthNumber)) {
      throw new Error(
        `${prefix} summary byte length ${readback.byteLength.toString()} cannot be represented safely`,
      );
    }
    assertBufferByteLength(
      prefix,
      "summary output",
      commandBufferRecord.resources.summaryBuffer,
      summaryByteLengthNumber,
    );
    assertBufferByteLength(
      prefix,
      "summary staging",
      summaryStagingBufferRecord.buffer,
      summaryByteLengthNumber,
    );
    if (summaryByteLengthNumber !== expectedSummaryByteLength(plan)) {
      throw new Error(
        `${prefix} summary byte length ${summaryByteLengthNumber} does not match plan`,
      );
    }

    const { request } = plan;
    const analysisInput: ComponentGpuAnalysisInput = {
      entryId: request.entryId,
      displayName: request.displayName,
      device: deviceRecord.device,
      texture: commandBufferRecord.resources.texture,
      truthBuffer: commandBufferRecord.resources.truthBuffer,
      nodeCount: request.nodeCount,
    };
    const submission: ComponentGpuAnalysisSubmission = {
      plan,
      ...commandBufferRecord.submission,
    };
    const summaryBuffers = createSummaryBuffersView(
      plan,
      commandBufferRecord.resources.summaryBuffer,
      summaryStagingBufferRecord.buffer,
      summaryByteLengthNumber,
    );

    // Ownership transfer boundary:
    //
    // 1. Before this line, the loader owns early-failure cleanup for the
    //    Rust-created summary buffers.
    // 2. After this line, the website resolver owns readback cleanup, including
    //    failures while awaiting validation or browser `mapAsync`.
    // 3. The visual buffer is tracked separately by `withComponentGpuAnalysisScope`.
    summaryBuffersTransferredToResolver = true;
    return await analysisSummaryResolver({
      ...analysisInput,
      plan,
      summaryBuffers,
      submission,
    });
  } finally {
    if (!summaryBuffersTransferredToResolver) {
      destroyUnclaimedSummaryReadbackBuffers(
        unclaimedSummaryBuffer,
        unclaimedSummaryStagingBuffer,
      );
    }
  }
}
