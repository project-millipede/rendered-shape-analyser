/**
 * Generated GPU adapter validation and lifecycle proof.
 *
 * One undersized component-reference buffer reaches the final resource check
 * through each retained public GPU world. The cases prove that validation traps
 * before observable analyzer preparation or command ownership begins; the
 * shared-frame case additionally snapshots its borrowed scheduler encoder to
 * prove that no modeled field changed.
 *
 * Pure metadata rules, their precedence, and exact error strings remain Rust
 * unit-test responsibilities rather than being repeated for every adapter.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  capturedGpuBorderTraceCreates,
  capturedGpuCommandEncodes,
  capturedGpuCommandSubmits,
  capturedGpuEdgeDiscoveryCreates,
  capturedGpuPipelineCreates,
  capturedGpuResultCreates,
  capturedGpuResultResolves,
  capturedGpuVisualCreates,
  capturedTestGpuBufferMaps,
  capturedTestGpuBufferUnmaps,
  capturedTestGpuMappedRangeCopies,
} from "../../../target/component-tests/host/gpu.js";
import { capturedLogLines } from "../../../target/component-tests/host/log.js";
import {
  requireTestGpuCommandEncoder,
  type CommandEncoderRecord,
} from "../../../target/component-tests/host/webgpu/index.js";
import {
  ASYNC_ANALYSIS_REQUEST,
  FRAME_ANALYSIS_REQUEST,
  STABLE_ANALYSIS_REQUEST,
} from "../fixtures/gpu-workload.js";
import {
  loadAsyncGpuModule,
  loadFrameGpuModule,
  loadStableGpuModule,
  type AsyncGpuModuleExports,
  type FrameGpuModuleExports,
  type StableGpuModuleExports,
} from "../support/generated-components.js";
import {
  createGpuTestContext,
  type FakeCommandEncoderHandle,
} from "../support/gpu-test-context.js";

/**
 * Assert only the analyzer preparation and lifecycle observations captured by
 * this typed host. Resource-handle registration and validation property reads
 * are deliberately outside this assertion.
 */
function expectNoObservedAnalyzerWorkStarted(): void {
  expect(capturedGpuPipelineCreates).toHaveLength(0);
  expect(capturedGpuResultCreates).toHaveLength(0);
  expect(capturedGpuVisualCreates).toHaveLength(0);
  expect(capturedGpuBorderTraceCreates).toHaveLength(0);
  expect(capturedGpuEdgeDiscoveryCreates).toHaveLength(0);
  expect(capturedGpuCommandEncodes).toHaveLength(0);
  expect(capturedGpuCommandSubmits).toHaveLength(0);
  expect(capturedGpuResultResolves).toHaveLength(0);
  expect(capturedTestGpuBufferMaps).toHaveLength(0);
  expect(capturedTestGpuMappedRangeCopies).toHaveLength(0);
  expect(capturedTestGpuBufferUnmaps).toHaveLength(0);
}

/**
 * Confirm that the intended adapter-specific validation branch produced the
 * trap rather than an earlier metadata or texture failure.
 *
 * @param fragment - Distinguishing text expected in one captured error log.
 */
function expectGroundTruthValidationLog(fragment: string): void {
  expect(
    capturedLogLines.some(
      ({ lvl, msg }) => lvl === "error" && msg.includes(fragment),
    ),
  ).toBe(true);
}

/**
 * Snapshot every modeled field of the scheduler-owned encoder.
 *
 * The dispatch array is cloned because the registered encoder record remains
 * mutable while a component call runs. Comparing snapshots therefore proves
 * that a rejected shared-frame call did not append commands or change any
 * modeled lifecycle/resource field.
 *
 * @param encoder - Borrowed fake encoder whose state must remain unchanged.
 * @returns A detached snapshot suitable for before/after structural equality.
 */
function snapshotEncoder(
  encoder: FakeCommandEncoderHandle,
): CommandEncoderRecord {
  const record = requireTestGpuCommandEncoder(encoder);
  return {
    ...record,
    dispatches: [...record.dispatches],
  };
}

describe("generated GPU validation boundaries", () => {
  let gpuAnalysis: StableGpuModuleExports;
  let gpuAnalysisAsync: AsyncGpuModuleExports;
  let gpuAnalysisFrame: FrameGpuModuleExports;

  beforeAll(async () => {
    ({ gpuAnalysis } = await loadStableGpuModule());
    ({ gpuAnalysisAsync } = await loadAsyncGpuModule());
    ({ gpuAnalysisFrame } = await loadFrameGpuModule());
  });

  it("[P10] leaves a borrowed encoder untouched when final validation fails", () => {
    // The zero-byte truth buffer passes request and texture validation, then
    // reaches the final truth-buffer branch. The assertions below cover the
    // host-observed workload effects and the borrowed encoder itself.
    const context = createGpuTestContext({ referenceBufferSize: 0 });
    const encoder = context.deviceHandle.createCommandEncoder({
      label: "invalid shared-frame test encoder",
    });
    const encoderBefore = snapshotEncoder(encoder);

    expect(() =>
      gpuAnalysisFrame.encode(
        encoder,
        context.deviceHandle,
        context.textureHandle,
        context.bufferHandle,
        FRAME_ANALYSIS_REQUEST,
      ),
    ).toThrow(WebAssembly.RuntimeError);

    const encoderAfter = snapshotEncoder(encoder);
    expect(encoderAfter.computePassBegins).toBe(0);
    expect(encoderAfter.computePassEnds).toBe(0);
    expect(encoderAfter.computePassOpen).toBe(false);
    expect(encoderAfter).toEqual(encoderBefore);
    expectGroundTruthValidationLog("invalid shared-frame ground-truth buffer");
    expectNoObservedAnalyzerWorkStarted();
  });

  it("[P8] traps stable truth-buffer validation without observed lifecycle effects", () => {
    const context = createGpuTestContext({ referenceBufferSize: 0 });

    expect(() =>
      gpuAnalysis.analyze(
        context.deviceHandle,
        context.textureHandle,
        context.bufferHandle,
        STABLE_ANALYSIS_REQUEST,
      ),
    ).toThrow(WebAssembly.RuntimeError);

    expectGroundTruthValidationLog("invalid ground-truth buffer");
    expectNoObservedAnalyzerWorkStarted();
  });

  it("[P8] rejects async truth-buffer validation without observed lifecycle effects", async () => {
    const context = createGpuTestContext({ referenceBufferSize: 0 });

    await expect(
      gpuAnalysisAsync.analyze(
        context.deviceHandle,
        context.textureHandle,
        context.bufferHandle,
        ASYNC_ANALYSIS_REQUEST,
      ),
    ).rejects.toBeInstanceOf(WebAssembly.RuntimeError);

    expectGroundTruthValidationLog(
      "invalid async GPU analysis ground-truth buffer",
    );
    expectNoObservedAnalyzerWorkStarted();
  });
});
