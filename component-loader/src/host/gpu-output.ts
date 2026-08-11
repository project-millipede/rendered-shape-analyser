/**
 * Variant-neutral analysis-plan and output-buffer translation.
 *
 * Stable, JSPI, and shared-frame entrypoints all use these invariants. The
 * module deliberately contains no variant-specific summary lifecycle.
 * Renderer resolution recovers existing native identities and metadata only;
 * it never maps or copies renderer data. Exact direct and indirect buffer
 * sizes prevent stale or cross-plan outputs from being accepted.
 */

import {
  type RegisteredGpuBufferHandle,
  requireRegisteredBuffer,
} from "./webgpu";
import type * as GeneratedHostGpu from "../../../pkg/generated/gpu-analysis/interfaces/millipede-inspector-host-gpu";
import type * as GeneratedGpuAnalysisAsync from "../../../pkg/generated/gpu-analysis-async/interfaces/millipede-inspector-gpu-analysis-async";
import type * as GeneratedGpuAnalysisFrame from "../../../pkg/generated/gpu-analysis-frame/interfaces/millipede-inspector-gpu-analysis-frame";
import type {
  ComponentGpuOutputPair,
  ComponentGpuOutputSet,
} from "./gpu-output-set";
import type {
  AnalysisPlan,
  ComponentGpuAnalysisBorderTraceOutput,
  ComponentGpuAnalysisEdgeDiscoveryOutput,
  ComponentGpuAnalysisSummaryBuffers,
  ComponentGpuAnalysisVisualBuffers,
  ComponentGpuAnalysisVisualOutput,
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
/** Byte length of one WebGPU non-indexed indirect-draw argument record. */
const DRAW_INDIRECT_BYTE_LENGTH = 16;

/** Generated renderer-output handles shared by all three GPU analysis worlds. */
export type ComponentGpuOutputHandles =
  ComponentGpuOutputSet<RegisteredGpuBufferHandle>;

type AssertAssignable<Actual extends Expected, Expected> = true;

type OutputFieldShape<Outputs> = {
  [OutputName in keyof Outputs]: {
    [FieldName in keyof Outputs[OutputName]]: true;
  };
};

// These bidirectional checks make either a new lane or a new field inside an
// existing generated output pair a compile-time change to the canonical set.
type StableOutputFieldsMatch = AssertAssignable<
  OutputFieldShape<ComponentGpuOutputHandles>,
  OutputFieldShape<Omit<GeneratedHostGpu.AnalysisDispatchResult, "summary">>
> &
  AssertAssignable<
    OutputFieldShape<Omit<GeneratedHostGpu.AnalysisDispatchResult, "summary">>,
    OutputFieldShape<ComponentGpuOutputHandles>
  >;

type AsyncOutputFieldsMatch = AssertAssignable<
  OutputFieldShape<ComponentGpuOutputHandles>,
  OutputFieldShape<Omit<GeneratedGpuAnalysisAsync.AnalysisResult, "summary">>
> &
  AssertAssignable<
    OutputFieldShape<Omit<GeneratedGpuAnalysisAsync.AnalysisResult, "summary">>,
    OutputFieldShape<ComponentGpuOutputHandles>
  >;

type FrameOutputFieldsMatch = AssertAssignable<
  OutputFieldShape<ComponentGpuOutputHandles>,
  OutputFieldShape<
    Omit<GeneratedGpuAnalysisFrame.EncodedAnalysisFrame, "summary">
  >
> &
  AssertAssignable<
    OutputFieldShape<
      Omit<GeneratedGpuAnalysisFrame.EncodedAnalysisFrame, "summary">
    >,
    OutputFieldShape<ComponentGpuOutputHandles>
  >;

/** Integer ceil division for Rust-planned dispatch dimensions. */
const ceilDiv = (value: number, divisor: number): number =>
  Math.ceil(value / divisor);

/**
 * Assert that a Rust-selected plan matches the host-supported GPU contract.
 *
 * The check correlates Rust-forwarded dimensions with the host texture and
 * validates the kernel, workgroup, dispatch grid, summary layout, and edge
 * layout. Rejecting unsupported or stale metadata before summary buffers
 * transfer to the call-local decoder prevents a plausible result from being
 * associated with the wrong texture or plan. Stable and frame summary paths
 * share this invariant.
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

/** Assert two Rust-selected plans describe the same executable workflow. */
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
    ensured.edgeDiscoverySlotCapacity !== requested.edgeDiscoverySlotCapacity ||
    ensured.request.entryId !== requested.request.entryId ||
    ensured.request.displayName !== requested.request.displayName ||
    ensured.request.textureWidth !== requested.request.textureWidth ||
    ensured.request.textureHeight !== requested.request.textureHeight ||
    ensured.request.nodeCount !== requested.request.nodeCount;

  if (mismatch) {
    throw new Error(`${prefix} dispatch plan does not match resource plan`);
  }
}

/** Compute the expected diagnostic summary byte length for a Rust plan. */
export const expectedSummaryByteLength = (plan: AnalysisPlan): number =>
  plan.request.nodeCount * plan.summaryNodeStrideBytes;

/** Compute the expected GPU-resident visual byte length for a Rust plan. */
const expectedVisualByteLength = (plan: AnalysisPlan): number =>
  plan.request.nodeCount * VISUAL_RECORD_STRIDE_BYTES;

/** Compute the expected border-trace byte length for a slot capacity. */
const expectedBorderTraceByteLength = (capacity: number): number =>
  capacity * BORDER_TRACE_RECORD_STRIDE_BYTES;

/** Compute the renderer-facing edge-discovery slot capacity for a texture. */
export const expectedEdgeDiscoverySlotCapacity = (
  textureWidth: number,
  textureHeight: number,
): number =>
  ceilDiv(textureWidth, EDGE_DISCOVERY_TILE_SIZE) *
  ceilDiv(textureHeight, EDGE_DISCOVERY_TILE_SIZE);

/** Compute the edge-discovery byte length for a slot capacity. */
const expectedEdgeDiscoveryByteLength = (capacity: number): number =>
  capacity * EDGE_DISCOVERY_RECORD_STRIDE_BYTES;

/**
 * Assert that a Rust-created buffer has the exact plan-derived byte length.
 *
 * Exact validation prevents stale or incorrectly correlated component output
 * from being accepted only because its WIT handle remains valid.
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

/** Build the resolver-facing summary shape from Rust-created buffers. */
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
 * Destroy summary buffers before ownership reaches a caller resolver.
 *
 * Stable and frame failure paths share this cleanup. A mapped staging buffer
 * is unmapped first, then both native buffers are destroyed independently and
 * best-effort so cleanup cannot replace the failure being handled.
 */
export const destroyUntransferredSummaryBuffers = (
  summaryBuffer: GPUBuffer | null,
  summaryStagingBuffer: GPUBuffer | null,
): void => {
  if (summaryStagingBuffer) {
    try {
      if (summaryStagingBuffer.mapState === "mapped") {
        summaryStagingBuffer.unmap();
      }
    } catch {
      // Continue with both native destruction attempts.
    }
    try {
      summaryStagingBuffer.destroy();
    } catch {
      // Cleanup is best-effort and must not replace the owning failure.
    }
  }
  if (summaryBuffer) {
    try {
      summaryBuffer.destroy();
    } catch {
      // Cleanup is best-effort and must not replace the owning failure.
    }
  }
};

/** Build the overlay-facing visual shape from a Rust-created buffer. */
export const createVisualBuffersView = (
  plan: AnalysisPlan,
  visualBuffer: GPUBuffer,
): ComponentGpuAnalysisVisualBuffers => ({
  plan,
  visualBuffer,
  visualByteLength: expectedVisualByteLength(plan),
  visualSlotCapacity: plan.request.nodeCount,
});

/** Resolve existing visual buffers for direct rectangle-overlay consumption. */
export function resolveAnalysisVisualOutput(
  prefix: string,
  expectedSlotCapacity: number,
  visual: ComponentGpuOutputPair<RegisteredGpuBufferHandle>,
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

/** Resolve the reference-guided border-trace lane independently of visuals. */
export function resolveAnalysisBorderTraceOutput(
  prefix: string,
  expectedSlotCapacity: number,
  borderTrace: ComponentGpuOutputPair<RegisteredGpuBufferHandle>,
): ComponentGpuAnalysisBorderTraceOutput {
  const borderTraceBufferRecord = requireRegisteredBuffer(borderTrace.buffer);
  const indirectBufferRecord = requireRegisteredBuffer(
    borderTrace.indirectBuffer,
  );
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
 * Resolve the pixel-derived edge lane and validate its texture-derived
 * capacity independently of reference-guided border tracing.
 */
export function resolveAnalysisEdgeDiscoveryOutput(
  prefix: string,
  expectedSlotCapacity: number,
  edgeDiscovery: ComponentGpuOutputPair<RegisteredGpuBufferHandle>,
): ComponentGpuAnalysisEdgeDiscoveryOutput {
  const edgeBufferRecord = requireRegisteredBuffer(edgeDiscovery.buffer);
  const indirectBufferRecord = requireRegisteredBuffer(
    edgeDiscovery.indirectBuffer,
  );
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
