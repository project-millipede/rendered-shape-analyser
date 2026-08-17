/**
 * JSPI product-async boundary proof.
 *
 * The async world uses the shared Rust recording and submission path, awaits
 * upstream `gpu-buffer.map-async`, copies the mapped summary range, decodes the
 * compact summary in Rust, and returns it directly instead of returning the
 * stable world's JavaScript readback descriptor.
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
  capturedTestGpuBufferMaps,
  capturedTestGpuBufferUnmaps,
  capturedTestGpuMappedRangeCopies,
  requireTestGpuBuffer,
} from "../../../target/component-tests/host/gpu.js";
import {
  expectIndirectDrawBuffer,
  type FakeGpuBuffer,
} from "../assertions/indirect-draw-buffer.js";
import {
  ASYNC_ANALYSIS_REQUEST,
  EXPECTED_ASYNC_SUMMARY,
  SUMMARY_BYTE_LENGTH,
} from "../fixtures/gpu-workload.js";
import {
  loadAsyncGpuModule,
  type AsyncGpuDispatch,
  type AsyncGpuModuleExports,
  unwrapGpuAnalysisSuccess,
} from "../support/generated-components.js";
import {
  createGpuTestContext,
  type GpuTestContext,
} from "../support/gpu-test-context.js";

describe("generated async GPU component", () => {
  let gpuAnalysisAsync: AsyncGpuModuleExports;
  let context: GpuTestContext;
  let dispatch: AsyncGpuDispatch;

  beforeAll(async () => {
    ({ gpuAnalysisAsync } = await loadAsyncGpuModule());
  });

  beforeEach(async () => {
    context = createGpuTestContext();
    const outcome = await gpuAnalysisAsync.analyze(
      context.deviceHandle,
      context.textureHandle,
      context.bufferHandle,
      ASYNC_ANALYSIS_REQUEST,
    );
    dispatch = unwrapGpuAnalysisSuccess(outcome);
  });

  it("[P10] returns the exact Rust-decoded public summary", () => {
    // Priority 10: async public summary projection.
    expect(dispatch.summary).toEqual(EXPECTED_ASYNC_SUMMARY);
  });

  it("[P9] maps, copies, and unmaps exactly 72 summary bytes", () => {
    // Priority 9: Rust-owned async readback lifecycle.
    expect(capturedTestGpuBufferMaps).toHaveLength(1);
    expect(capturedTestGpuBufferMaps[0]?.device).toBe(context.fakeDevice);
    expect(capturedTestGpuBufferMaps[0]?.size).toBe(SUMMARY_BYTE_LENGTH);
    expect(capturedTestGpuMappedRangeCopies).toHaveLength(1);
    expect(capturedTestGpuMappedRangeCopies[0]?.device).toBe(
      context.fakeDevice,
    );
    expect(capturedTestGpuMappedRangeCopies[0]?.size).toBe(SUMMARY_BYTE_LENGTH);
    expect(capturedTestGpuBufferUnmaps).toHaveLength(1);
    expect(capturedTestGpuBufferUnmaps[0]?.device).toBe(context.fakeDevice);
  });

  it("[P8] owns one complete encoding and submission", () => {
    // Priority 8: async command ownership.
    const commandEncode = capturedGpuCommandEncodes[0];
    const commandSubmit = capturedGpuCommandSubmits[0];
    const discoveryCreate = capturedGpuEdgeDiscoveryCreates[0];

    expect(capturedGpuCommandEncodes).toHaveLength(1);
    expect(commandEncode?.device).toBe(context.fakeDevice);
    expect(commandEncode?.texture).toBe(context.fakeTexture);
    expect(commandEncode?.buffer).toBe(context.fakeBuffer);
    expect(capturedGpuCommandSubmits).toHaveLength(1);
    expect(commandSubmit?.device).toBe(context.fakeDevice);
    expect(commandSubmit?.texture).toBe(context.fakeTexture);
    expect(commandSubmit?.buffer).toBe(context.fakeBuffer);
    expect(commandSubmit?.edgeDiscoveryBuffer).toBe(discoveryCreate?.buffer);
    expect(commandSubmit?.edgeDiscoveryIndirectBuffer).toBe(
      discoveryCreate?.indirectBuffer,
    );
  });

  it("[P7] returns all six renderer-facing opaque handles", () => {
    // Priority 7: complete async returned-handle identity.
    const visualCreate = capturedGpuVisualCreates[0];
    const borderCreate = capturedGpuBorderTraceCreates[0];
    const discoveryCreate = capturedGpuEdgeDiscoveryCreates[0];

    expect(requireTestGpuBuffer(dispatch.visual.buffer).buffer).toBe(
      visualCreate?.buffer,
    );
    expect(requireTestGpuBuffer(dispatch.visual.indirectBuffer).buffer).toBe(
      visualCreate?.indirectBuffer,
    );
    expect(requireTestGpuBuffer(dispatch.borderTrace.buffer).buffer).toBe(
      borderCreate?.buffer,
    );
    expect(
      requireTestGpuBuffer(dispatch.borderTrace.indirectBuffer).buffer,
    ).toBe(borderCreate?.indirectBuffer);
    expect(requireTestGpuBuffer(dispatch.edgeDiscovery.buffer).buffer).toBe(
      discoveryCreate?.buffer,
    );
    expect(
      requireTestGpuBuffer(dispatch.edgeDiscovery.indirectBuffer).buffer,
    ).toBe(discoveryCreate?.indirectBuffer);
  });

  it("[P6] creates every async pipeline and lane on one device", () => {
    // Priority 6: pipeline and workload preparation stay on the caller's device.
    expect(capturedGpuPipelineCreates).toHaveLength(10);
    for (const pipelineCreate of capturedGpuPipelineCreates) {
      expect(pipelineCreate.device).toBe(context.fakeDevice);
    }
    expect(capturedGpuResultCreates).toHaveLength(1);
    expect(capturedGpuResultCreates[0]?.device).toBe(context.fakeDevice);
    expect(capturedGpuVisualCreates).toHaveLength(1);
    expect(capturedGpuVisualCreates[0]?.device).toBe(context.fakeDevice);
    expect(capturedGpuBorderTraceCreates).toHaveLength(1);
    expect(capturedGpuBorderTraceCreates[0]?.device).toBe(context.fakeDevice);
    expect(capturedGpuEdgeDiscoveryCreates).toHaveLength(1);
    expect(capturedGpuEdgeDiscoveryCreates[0]?.device).toBe(context.fakeDevice);
  });

  it("[P5] keeps indirect arguments as GPU-only draw records", () => {
    // Priority 5: indirect buffers stay GPU-owned.
    const visualCreate = capturedGpuVisualCreates[0];
    const borderCreate = capturedGpuBorderTraceCreates[0];
    const discoveryCreate = capturedGpuEdgeDiscoveryCreates[0];

    expectIndirectDrawBuffer(
      "async visual",
      visualCreate?.buffer as object,
      visualCreate?.indirectBuffer as FakeGpuBuffer,
    );
    expectIndirectDrawBuffer(
      "async border trace",
      borderCreate?.buffer as object,
      borderCreate?.indirectBuffer as FakeGpuBuffer,
    );
    expectIndirectDrawBuffer(
      "async edge discovery",
      discoveryCreate?.buffer as object,
      discoveryCreate?.indirectBuffer as FakeGpuBuffer,
    );
  });
});
