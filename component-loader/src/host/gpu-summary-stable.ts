/** Stable-world compact-summary resolution after component submission. */

import type * as GeneratedHostGpu from "../../../pkg/generated/gpu-analysis/interfaces/millipede-inspector-host-gpu";
import {
  type GpuDevice,
  requireRegisteredBuffer,
  requireRegisteredCommandBuffer,
  requireRegisteredDevice,
  requireSubmittedCommandBuffer,
} from "./webgpu";
import {
  assertBufferByteLength,
  assertSupportedAnalysisPlan,
  createSummaryBuffersView,
  destroyUntransferredSummaryBuffers,
  expectedSummaryByteLength,
} from "./gpu-output";
import type {
  AnalysisSummaryResult,
  ComponentGpuAnalysisInput,
  ComponentGpuAnalysisSubmission,
  ComponentGpuSummaryResolver,
} from "./gpu-types";

/**
 * Resolve a stable-path diagnostic summary readback descriptor.
 *
 * The stable summary descriptor contains only a submitted-command handle and a
 * staging handle; there is no project-owned analysis-job resource. Recorded
 * command metadata recovers the summary output, texture, truth buffer, and
 * validation promises. After validating their common device and plan, this
 * function starts the call-local resolver outside the component boundary so
 * the stable capability remains JSPI-free.
 */
export async function resolveAnalysisSummaryReadback(
  prefix: string,
  deviceHandle: GpuDevice,
  readback: GeneratedHostGpu.AnalysisSummaryReadback,
  transferScopeCleanup: () => void,
  summaryResolver: ComponentGpuSummaryResolver,
): Promise<AnalysisSummaryResult> {
  let unclaimedSummaryBuffer: GPUBuffer | null = null;
  let unclaimedSummaryStagingBuffer: GPUBuffer | null = null;
  let cleanupOwnedByResolver = false;
  let summaryBuffersTransferredToResolver = false;

  try {
    let summaryStagingBufferRecord: ReturnType<
      typeof requireRegisteredBuffer
    > | null = null;
    let registeredCommandBuffer: ReturnType<
      typeof requireRegisteredCommandBuffer
    > | null = null;
    let lookupFailure: Error | null = null;

    try {
      summaryStagingBufferRecord = requireRegisteredBuffer(
        readback.stagingBuffer,
      );
      unclaimedSummaryStagingBuffer = summaryStagingBufferRecord.buffer;
    } catch (caught) {
      if (caught instanceof Error) {
        lookupFailure = caught;
      } else {
        lookupFailure = new Error(String(caught));
      }
    }

    try {
      registeredCommandBuffer = requireRegisteredCommandBuffer(
        readback.commands,
      );
      unclaimedSummaryBuffer = registeredCommandBuffer.resources.summaryBuffer;
    } catch (caught) {
      if (!lookupFailure) {
        if (caught instanceof Error) {
          lookupFailure = caught;
        } else {
          lookupFailure = new Error(String(caught));
        }
      }
    }

    transferScopeCleanup();
    cleanupOwnedByResolver = true;
    // Both handles were inspected independently and the outer transfer
    // succeeded. This readback function now owns every valid native cleanup
    // identity, including partial lookup failures.
    if (lookupFailure) throw lookupFailure;
    if (!summaryStagingBufferRecord || !registeredCommandBuffer) {
      throw new Error(`${prefix} summary readback lookup was incomplete`);
    }

    const commandBufferRecord = requireSubmittedCommandBuffer(
      readback.commands,
    );
    const { plan } = readback;

    const deviceRecord = requireRegisteredDevice(deviceHandle);
    if (
      summaryStagingBufferRecord.device !== deviceRecord.device ||
      commandBufferRecord.device !== deviceRecord.device
    ) {
      throw new Error(
        `${prefix} different device resource passed to summary readback`,
      );
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

    // Until this call begins, this function owns early-failure cleanup. The
    // call-local resolver takes both native summary buffers from this point,
    // including cleanup after mapping or validation failures. Renderer buffers
    // remain independently owned by the surrounding analysis result path.
    summaryBuffersTransferredToResolver = true;
    return await summaryResolver({
      ...analysisInput,
      plan,
      summaryBuffers,
      submission,
    });
  } finally {
    if (cleanupOwnedByResolver && !summaryBuffersTransferredToResolver) {
      destroyUntransferredSummaryBuffers(
        unclaimedSummaryBuffer,
        unclaimedSummaryStagingBuffer,
      );
    }
  }
}
