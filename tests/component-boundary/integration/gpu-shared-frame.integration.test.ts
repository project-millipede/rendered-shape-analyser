/**
 * Scheduler-owned encoder boundary proof.
 *
 * The component receives a borrowed encoder, appends the same ten analyzer
 * dispatches plus the compact-summary copy, and returns without finishing or
 * submitting. The test then finishes and submits that exact encoder through its
 * scheduler owner, mirroring the browser scheduler.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  capturedGpuBorderTraceCreates,
  capturedGpuCommandEncodes,
  capturedGpuCommandSubmits,
  capturedGpuEdgeDiscoveryCreates,
  capturedGpuPipelineCreates,
  capturedGpuResultCreates,
  capturedGpuVisualCreates,
  requireTestGpuBuffer,
} from "../../../target/component-tests/host/gpu.js";
import { requireTestGpuCommandEncoder } from "../../../target/component-tests/host/webgpu/index.js";
import {
  EXPECTED_FRAME_GPU_PLAN,
  FRAME_ANALYSIS_REQUEST,
  SUMMARY_BYTE_LENGTH,
} from "../fixtures/gpu-workload.js";
import {
  loadFrameGpuModule,
  type FrameGpuDispatch,
  type FrameGpuModuleExports,
} from "../support/generated-components.js";
import {
  createGpuTestContext,
  type FakeCommandEncoderHandle,
  type GpuTestContext,
} from "../support/gpu-test-context.js";

describe("generated shared-frame GPU component", () => {
  let gpuAnalysisFrame: FrameGpuModuleExports;
  let context: GpuTestContext;
  let frameEncoder: FakeCommandEncoderHandle;
  let dispatch: FrameGpuDispatch;

  beforeAll(async () => {
    ({ gpuAnalysisFrame } = await loadFrameGpuModule());
  });

  beforeEach(() => {
    context = createGpuTestContext();
    frameEncoder = context.deviceHandle.createCommandEncoder({
      label: "scheduler-owned test frame encoder",
    });
    dispatch = gpuAnalysisFrame.encode(
      frameEncoder,
      context.deviceHandle,
      context.textureHandle,
      context.bufferHandle,
      FRAME_ANALYSIS_REQUEST,
    );
  });

  it("[P10] neither finishes nor submits the borrowed encoder", () => {
    // Priority 10: scheduler retains lifecycle ownership.
    // R2-B additionally proves that the compatibility orchestrator opens and
    // closes exactly one compute pass.
    const encoderRecord = requireTestGpuCommandEncoder(frameEncoder);

    expect(encoderRecord.computePassBegins).toBe(1);
    expect(encoderRecord.computePassEnds).toBe(1);
    expect(encoderRecord.computePassOpen).toBe(false);
    expect(
      capturedGpuCommandEncodes,
      "borrowed component must not finish the scheduler encoder",
    ).toHaveLength(0);
    expect(
      capturedGpuCommandSubmits,
      "borrowed component must not submit the scheduler encoder",
    ).toHaveLength(0);
  });

  it("[P9] preserves the exact frame summary descriptor", () => {
    // Priority 9: exact public frame plan and byte boundary.
    expect(dispatch.summary.plan).toEqual(EXPECTED_FRAME_GPU_PLAN);
    expect(Number(dispatch.summary.byteLength)).toBe(SUMMARY_BYTE_LENGTH);
  });

  it("[P9] returns all six renderer-facing opaque handles", () => {
    // Priority 9: the generated frame result preserves every prepared output
    // and indirect-argument handle, not just one handle per workload.
    expect(requireTestGpuBuffer(dispatch.visual.buffer).buffer).toBe(
      capturedGpuVisualCreates[0]?.buffer,
    );
    expect(requireTestGpuBuffer(dispatch.visual.indirectBuffer).buffer).toBe(
      capturedGpuVisualCreates[0]?.indirectBuffer,
    );
    expect(requireTestGpuBuffer(dispatch.borderTrace.buffer).buffer).toBe(
      capturedGpuBorderTraceCreates[0]?.buffer,
    );
    expect(
      requireTestGpuBuffer(dispatch.borderTrace.indirectBuffer).buffer,
    ).toBe(capturedGpuBorderTraceCreates[0]?.indirectBuffer);
    expect(requireTestGpuBuffer(dispatch.edgeDiscovery.buffer).buffer).toBe(
      capturedGpuEdgeDiscoveryCreates[0]?.buffer,
    );
    expect(
      requireTestGpuBuffer(dispatch.edgeDiscovery.indirectBuffer).buffer,
    ).toBe(capturedGpuEdgeDiscoveryCreates[0]?.indirectBuffer);
  });

  it("[P7] prepares every existing R2-A workload lane", () => {
    // Priority 7: complete workload preparation counts.
    expect(capturedGpuPipelineCreates).toHaveLength(10);
    expect(capturedGpuResultCreates).toHaveLength(1);
    expect(capturedGpuVisualCreates).toHaveLength(1);
    expect(capturedGpuBorderTraceCreates).toHaveLength(1);
    expect(capturedGpuEdgeDiscoveryCreates).toHaveLength(1);
  });

  it("[P6] leaves the encoder usable by its scheduler owner", () => {
    // Priority 6: foreign owner can finish and submit afterward.
    expect(() => {
      const schedulerCommands = frameEncoder.finish({
        label: "scheduler-owned test frame commands",
      });
      context.deviceHandle.queue().submit([schedulerCommands]);
    }).not.toThrow();
    expect(capturedGpuCommandEncodes).toHaveLength(1);
    expect(capturedGpuCommandSubmits).toHaveLength(1);
  });
});
