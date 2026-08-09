/**
 * Stable GPU resource-boundary proof.
 *
 * Fake device, texture, and buffer handles cross the Component Model boundary
 * and resolve in host imports to the exact registered JavaScript objects across
 * encoding, submission, and stable readback resolution. This proves boundary
 * identity and ownership; real WebGPU execution remains browser-tested.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  capturedGpuBorderTraceCreates,
  capturedGpuCommandEncodes,
  capturedGpuCommandSubmits,
  capturedGpuEdgeDiscoveryCreates,
  capturedGpuPipelineCreates,
  capturedGpuResultCreates,
  capturedGpuResultResolves,
  capturedGpuVisualCreates,
  requireTestGpuBuffer,
  resolveTestAnalysisSummaryReadback,
} from "../../../target/component-tests/host/gpu.js";
import {
  expectIndirectDrawBuffer,
  type FakeGpuBuffer,
} from "../assertions/indirect-draw-buffer.js";
import { CURRENT_ANALYZER_DISPATCH_ENTRY_POINTS } from "../fixtures/analyzer-dispatch-contract.js";
import {
  EXPECTED_STABLE_GPU_PLAN,
  STABLE_ANALYSIS_REQUEST,
  SUMMARY_BYTE_LENGTH,
} from "../fixtures/gpu-workload.js";
import {
  loadStableGpuModule,
  type StableGpuDispatch,
  type StableGpuModuleExports,
} from "../support/generated-components.js";
import {
  createGpuTestContext,
  type GpuTestContext,
} from "../support/gpu-test-context.js";

describe("generated stable GPU component", () => {
  let gpuAnalysis: StableGpuModuleExports;
  let context: GpuTestContext;
  let dispatch: StableGpuDispatch;

  beforeAll(async () => {
    ({ gpuAnalysis } = await loadStableGpuModule());
  });

  beforeEach(async () => {
    context = createGpuTestContext();
    dispatch = gpuAnalysis.analyze(
      context.deviceHandle,
      context.textureHandle,
      context.bufferHandle,
      STABLE_ANALYSIS_REQUEST,
    );
    await resolveTestAnalysisSummaryReadback(
      context.deviceHandle,
      dispatch.summary,
    );
  });

  it("[P10] preserves the exact public readback plan and byte boundary", () => {
    // Priority 10: stable public plan projection and summary-copy boundary.
    expect(capturedGpuResultResolves).toHaveLength(1);
    expect(capturedGpuResultResolves[0]?.plan).toEqual(
      EXPECTED_STABLE_GPU_PLAN,
    );
    expect(Number(capturedGpuResultResolves[0]?.summaryByteLength)).toBe(
      SUMMARY_BYTE_LENGTH,
    );
  });

  it("[P10] preserves recorder order and stable lifecycle ownership", () => {
    // Priority 10: recorder order and stable ownership.
    expect(capturedGpuCommandEncodes).toHaveLength(1);
    expect(
      capturedGpuCommandEncodes[0]?.dispatches.map(
        (record) => record.pipelineEntryPoint,
      ),
    ).toEqual(CURRENT_ANALYZER_DISPATCH_ENTRY_POINTS);
    expect(capturedGpuCommandSubmits).toHaveLength(1);
  });

  it("[P8] preserves caller resource identity through every phase", () => {
    // Priority 8: foreign resource identity across all phases.
    const commandEncode = capturedGpuCommandEncodes[0];
    const commandSubmit = capturedGpuCommandSubmits[0];
    const resultResolve = capturedGpuResultResolves[0];
    const discoveryCreate = capturedGpuEdgeDiscoveryCreates[0];

    expect(commandEncode?.device).toBe(context.fakeDevice);
    expect(commandEncode?.texture).toBe(context.fakeTexture);
    expect(commandEncode?.buffer).toBe(context.fakeBuffer);
    expect(commandSubmit?.device).toBe(context.fakeDevice);
    expect(commandSubmit?.texture).toBe(context.fakeTexture);
    expect(commandSubmit?.buffer).toBe(context.fakeBuffer);
    expect(resultResolve?.device).toBe(context.fakeDevice);
    expect(resultResolve?.texture).toBe(context.fakeTexture);
    expect(resultResolve?.buffer).toBe(context.fakeBuffer);
    expect(commandSubmit?.edgeDiscoveryBuffer).toBe(discoveryCreate?.buffer);
    expect(commandSubmit?.edgeDiscoveryIndirectBuffer).toBe(
      discoveryCreate?.indirectBuffer,
    );
  });

  it("[P7] returns all six renderer-facing opaque handles", () => {
    // Priority 7: complete stable returned-handle identity.
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

  it("[P6] creates every pipeline and workload lane on one device", () => {
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
      "visual",
      visualCreate?.buffer as object,
      visualCreate?.indirectBuffer as FakeGpuBuffer,
    );
    expectIndirectDrawBuffer(
      "border trace",
      borderCreate?.buffer as object,
      borderCreate?.indirectBuffer as FakeGpuBuffer,
    );
    expectIndirectDrawBuffer(
      "edge discovery",
      discoveryCreate?.buffer as object,
      discoveryCreate?.indirectBuffer as FakeGpuBuffer,
    );
  });
});
