/**
 * Generated GPU adapter validation and lifecycle proof.
 *
 * One undersized component-reference buffer reaches the final resource check
 * through each retained public GPU world. The stable case also covers the two
 * earlier preflight categories once, avoiding per-world duplication while
 * proving the shared classifier's complete public mapping. Every world then
 * invokes the same generated instance with a valid fixture successfully. The
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
  type AnalysisValidationErrorKind,
  type FrameGpuModuleExports,
  type GpuAnalysisOutcome,
  type StableGpuModuleExports,
  unwrapGpuAnalysisSuccess,
} from "../support/generated-components.js";
import {
  createGpuTestContext,
  type FakeCommandEncoderHandle,
} from "../support/gpu-test-context.js";

function expectedValidationOutcome(
  kind: AnalysisValidationErrorKind,
  message: string,
): GpuAnalysisOutcome<never> {
  return {
    tag: "validation-error",
    val: { kind, message },
  };
}

const EXPECTED_TRUTH_BUFFER_VALIDATION_OUTCOME = expectedValidationOutcome(
  "truth-buffer-too-small",
  "ground-truth buffer is smaller than declared node count",
);

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
 * Snapshot every modeled field of the scheduler-owned encoder.
 *
 * The dispatch array is cloned because the registered encoder record remains
 * mutable while a component call runs. Comparing snapshots therefore proves
 * that a shared-frame validation error did not append commands or change any
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

  it("[P10] recovers frame validation with an untouched encoder and reusable instance", () => {
    // The zero-byte truth buffer passes request and texture validation, then
    // reaches the final truth-buffer branch. The assertions below cover the
    // host-observed workload effects and the borrowed encoder itself.
    const invalidContext = createGpuTestContext({ referenceBufferSize: 0 });
    const invalidEncoder = invalidContext.deviceHandle.createCommandEncoder({
      label: "invalid shared-frame test encoder",
    });
    const encoderBefore = snapshotEncoder(invalidEncoder);

    const invalidOutcome = gpuAnalysisFrame.encode(
      invalidEncoder,
      invalidContext.deviceHandle,
      invalidContext.textureHandle,
      invalidContext.bufferHandle,
      FRAME_ANALYSIS_REQUEST,
    );

    expect(invalidOutcome).toEqual(EXPECTED_TRUTH_BUFFER_VALIDATION_OUTCOME);

    const encoderAfter = snapshotEncoder(invalidEncoder);
    expect(encoderAfter.computePassBegins).toBe(0);
    expect(encoderAfter.computePassEnds).toBe(0);
    expect(encoderAfter.computePassOpen).toBe(false);
    expect(encoderAfter).toEqual(encoderBefore);
    expectNoObservedAnalyzerWorkStarted();

    const validContext = createGpuTestContext();
    const validEncoder = validContext.deviceHandle.createCommandEncoder({
      label: "valid shared-frame recovery encoder",
    });
    const validOutcome = gpuAnalysisFrame.encode(
      validEncoder,
      validContext.deviceHandle,
      validContext.textureHandle,
      validContext.bufferHandle,
      FRAME_ANALYSIS_REQUEST,
    );
    unwrapGpuAnalysisSuccess(validOutcome);

    expect(snapshotEncoder(validEncoder).computePassBegins).toBe(1);
  });

  it("[P8] classifies stable preflight errors and reuses the same instance", () => {
    // 1. `invalid-request` wins when request, texture, and truth buffer are
    // all invalid.
    const invalidRequestContext = createGpuTestContext({
      referenceBufferSize: 0,
    });
    const invalidRequestOutcome = gpuAnalysis.analyze(
      invalidRequestContext.deviceHandle,
      invalidRequestContext.textureHandle,
      invalidRequestContext.bufferHandle,
      {
        ...STABLE_ANALYSIS_REQUEST,
        entryId: "",
        textureWidth: STABLE_ANALYSIS_REQUEST.textureWidth + 1,
      },
    );

    expect(invalidRequestOutcome).toEqual(
      expectedValidationOutcome("invalid-request", "entry id is empty"),
    );
    expectNoObservedAnalyzerWorkStarted();

    // 2. `texture-mismatch` wins when request metadata is valid but the
    // texture and truth buffer are both invalid.
    const textureMismatchContext = createGpuTestContext({
      referenceBufferSize: 0,
    });
    const textureMismatchOutcome = gpuAnalysis.analyze(
      textureMismatchContext.deviceHandle,
      textureMismatchContext.textureHandle,
      textureMismatchContext.bufferHandle,
      {
        ...STABLE_ANALYSIS_REQUEST,
        textureWidth: STABLE_ANALYSIS_REQUEST.textureWidth + 1,
      },
    );

    expect(textureMismatchOutcome).toEqual(
      expectedValidationOutcome(
        "texture-mismatch",
        "texture dimensions do not match upstream gpu-texture",
      ),
    );
    expectNoObservedAnalyzerWorkStarted();

    // 3. `truth-buffer-too-small` is selected when request metadata and the
    // borrowed texture are valid.
    const invalidContext = createGpuTestContext({ referenceBufferSize: 0 });

    const invalidOutcome = gpuAnalysis.analyze(
      invalidContext.deviceHandle,
      invalidContext.textureHandle,
      invalidContext.bufferHandle,
      STABLE_ANALYSIS_REQUEST,
    );

    expect(invalidOutcome).toEqual(EXPECTED_TRUTH_BUFFER_VALIDATION_OUTCOME);
    expectNoObservedAnalyzerWorkStarted();

    const validContext = createGpuTestContext();
    const validOutcome = gpuAnalysis.analyze(
      validContext.deviceHandle,
      validContext.textureHandle,
      validContext.bufferHandle,
      STABLE_ANALYSIS_REQUEST,
    );
    unwrapGpuAnalysisSuccess(validOutcome);

    expect(capturedGpuCommandSubmits).toHaveLength(1);
  });

  it("[P8] recovers async validation and accepts a valid call on the same instance", async () => {
    const invalidContext = createGpuTestContext({ referenceBufferSize: 0 });

    const invalidOutcome = await gpuAnalysisAsync.analyze(
      invalidContext.deviceHandle,
      invalidContext.textureHandle,
      invalidContext.bufferHandle,
      ASYNC_ANALYSIS_REQUEST,
    );

    expect(invalidOutcome).toEqual(EXPECTED_TRUTH_BUFFER_VALIDATION_OUTCOME);
    expectNoObservedAnalyzerWorkStarted();

    const validContext = createGpuTestContext();
    const validOutcome = await gpuAnalysisAsync.analyze(
      validContext.deviceHandle,
      validContext.textureHandle,
      validContext.bufferHandle,
      ASYNC_ANALYSIS_REQUEST,
    );
    unwrapGpuAnalysisSuccess(validOutcome);

    expect(capturedGpuCommandSubmits).toHaveLength(1);
  });
});
