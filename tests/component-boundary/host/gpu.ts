/**
 * Node test-host implementation of `millipede:inspector/host-gpu`.
 *
 * The component-boundary suite has no browser WebGPU. Together with the typed
 * `host/webgpu` implementation, this module preserves the GPU boundary
 * established by R2-A and retained by R2-B:
 *
 * 1. Rust creates upstream `wasi:webgpu` pipeline and buffer resources.
 * 2. Rust creates upstream bind groups through the fake GPU device.
 * 3. Rust records commands; stable and async own submission, while
 *    shared-frame leaves finishing and submission to the borrowed encoder's
 *    owner.
 * 4. Stable analysis returns an explicit compact-summary readback descriptor
 *    for host-side JavaScript resolution.
 */

import type {
  ForeignGpuBuffer,
  ForeignGpuDevice,
  ForeignGpuTexture,
} from "./webgpu/records.js";
import {
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
  registerTestGpuBuffer,
  registerTestGpuDevice,
  registerTestGpuTexture,
  requireTestGpuBuffer,
  requireTestGpuDevice,
  requireTestSubmittedGpuCommandBuffer,
} from "./webgpu/index.js";

export {
  capturedTestGpuBufferMaps,
  capturedTestGpuBufferUnmaps,
  capturedTestGpuMappedRangeCopies,
  registerTestGpuBuffer,
  registerTestGpuDevice,
  registerTestGpuTexture,
  requireTestGpuBuffer,
};
export {
  capturedTestGpuCommandEncodes as capturedGpuCommandEncodes,
  capturedTestGpuPipelineCreates as capturedGpuPipelineCreates,
  capturedTestGpuQueueSubmits as capturedGpuCommandSubmits,
  capturedTestGpuResultCreates as capturedGpuResultCreates,
  capturedTestGpuVisualCreates as capturedGpuVisualCreates,
  capturedTestGpuBorderTraceCreates as capturedGpuBorderTraceCreates,
  capturedTestGpuEdgeDiscoveryCreates as capturedGpuEdgeDiscoveryCreates,
};

export interface AnalysisRequest {
  entryId: string;
  displayName: string;
  textureWidth: number;
  textureHeight: number;
  nodeCount: number;
}

export interface AnalysisPlan {
  request: AnalysisRequest;
  kernel: string;
  workgroupSizeX: number;
  workgroupSizeY: number;
  dispatchWorkgroupsX: number;
  dispatchWorkgroupsY: number;
  summaryWordsPerNode: number;
  summaryNodeStrideBytes: number;
  edgeDiscoveryTileSize: number;
  edgeDiscoveryThresholdMilli: number;
  edgeDiscoverySlotCapacity: number;
}

export interface SummaryReadbackDescriptor {
  plan: AnalysisPlan;
  stagingBuffer: object;
  byteLength: bigint;
  commands: object;
}

export interface GpuResultResolveObservation {
  plan: AnalysisPlan;
  device: ForeignGpuDevice;
  texture: ForeignGpuTexture;
  buffer: ForeignGpuBuffer;
  summaryBuffer: ForeignGpuBuffer;
  summaryStagingBuffer: ForeignGpuBuffer;
  summaryByteLength: bigint;
  request: AnalysisRequest;
}

export interface TestAnalysisSummary {
  entryId: string;
  textureWidth: number;
  textureHeight: number;
  nodeCount: number;
  nodes: never[];
}

/** Captured stable-path result-resolution requests, in call order. */
export const capturedGpuResultResolves: GpuResultResolveObservation[] = [];

/**
 * Compute the expected compact-summary byte length for an execution plan.
 *
 * @param plan - Rust-owned plan whose request count and summary stride define
 *   the buffer extent.
 * @returns Exact expected summary byte length.
 */
function expectedSummaryByteLength(plan: AnalysisPlan): number {
  return plan.request.nodeCount * plan.summaryNodeStrideBytes;
}

/**
 * Resolve a fake stable-path compact-summary readback descriptor.
 *
 * 1. Resolve the opaque device, staging-buffer, and submitted command-buffer
 *    handles to their registered records and underlying foreign objects.
 * 2. Prove that all three resources belong to the same device and that the
 *    descriptor exposes the exact byte length derived from its Rust plan.
 * 3. Capture the resolution boundary and synthesize the established public
 *    analysis result; this Node host does not decode real mapped GPU bytes.
 *
 * @param deviceHandle - Opaque fake GPU-device resource.
 * @param readback - Rust-returned summary readback descriptor.
 * @returns Public analysis result synthesized by the Node test host.
 */
export async function resolveTestAnalysisSummaryReadback(
  deviceHandle: object,
  readback: SummaryReadbackDescriptor,
): Promise<TestAnalysisSummary> {
  const { plan } = readback;
  const deviceRecord = requireTestGpuDevice(deviceHandle);
  const stagingRecord = requireTestGpuBuffer(readback.stagingBuffer);
  const submissionRecord = requireTestSubmittedGpuCommandBuffer(
    readback.commands,
  );

  if (
    stagingRecord.device !== deviceRecord.device ||
    submissionRecord.device !== deviceRecord.device
  ) {
    throw new Error(
      "test host-gpu received resolve resources from different devices",
    );
  }
  if (Number(readback.byteLength) !== expectedSummaryByteLength(plan)) {
    throw new Error("test host-gpu received wrong summary byte length");
  }

  const { request } = plan;
  capturedGpuResultResolves.push({
    plan,
    device: deviceRecord.device,
    texture: submissionRecord.texture,
    buffer: submissionRecord.buffer,
    summaryBuffer: submissionRecord.summaryBuffer,
    summaryStagingBuffer: stagingRecord.buffer,
    summaryByteLength: readback.byteLength,
    request,
  });

  return {
    entryId: request.entryId,
    textureWidth: request.textureWidth,
    textureHeight: request.textureHeight,
    nodeCount: request.nodeCount,
    nodes: [],
  };
}

/** Clear resolver observations without replacing the exported array. */
export function resetTestGpuResolverState(): void {
  capturedGpuResultResolves.length = 0;
}
