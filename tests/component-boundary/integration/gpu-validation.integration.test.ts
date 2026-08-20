/**
 * Generated GPU validation-result and lifecycle proof.
 *
 * Recoverable preflight failures cross the generated boundary as top-level
 * WIT result errors. Transpilation selects direct error lifting, so both
 * synchronous exports and the JSPI export expose the raw WIT error record. The
 * cases below prove that shared representation, validation precedence, and
 * successful reuse of each loaded component instance.
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
  EXPECTED_ASYNC_SUMMARY,
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

interface AnalysisValidationErrorRecord {
  readonly kind:
    | "invalid-request"
    | "texture-mismatch"
    | "truth-buffer-too-small";
  readonly message: string;
}

const INVALID_REQUEST_ERROR: AnalysisValidationErrorRecord = {
  kind: "invalid-request",
  message: "entry id is empty",
};

const TEXTURE_MISMATCH_ERROR: AnalysisValidationErrorRecord = {
  kind: "texture-mismatch",
  message: "texture dimensions do not match upstream gpu-texture",
};

const TRUTH_BUFFER_ERROR: AnalysisValidationErrorRecord = {
  kind: "truth-buffer-too-small",
  message: "ground-truth buffer is smaller than declared node count",
};

/**
 * Assert that a caught value is neither `WebAssembly.RuntimeError` nor any
 * other `Error` instance, and is exactly the expected raw lifted WIT validation
 * record.
 *
 * This helper accepts only the plain `{ kind, message }` record selected by
 * `--no-component-error-wrapping`. A Wasm trap, JavaScript error, host error,
 * or generated-binding error must fail before structural comparison.
 *
 * The exported functions return this WIT error type:
 *
 *     enum analysis-validation-error-kind {
 *       invalid-request,
 *       texture-mismatch,
 *       truth-buffer-too-small,
 *     }
 *
 *     record analysis-validation-error {
 *       kind: analysis-validation-error-kind,
 *       message: string,
 *     }
 *
 * A Rust `Result::Err(error)` is a normal Component Model return. With the
 * configured transpilation flag, its WIT record is lifted directly into a
 * JavaScript value such as:
 *
 *     {
 *       kind: "truth-buffer-too-small",
 *       message: "ground-truth buffer is smaller than declared node count",
 *     }
 *
 * A synchronous export throws that record. An async export rejects its Promise
 * with the same record.
 *
 * The assertion order is intentional:
 *
 * 1. Reject `WebAssembly.RuntimeError` as a terminal Wasm trap.
 *
 *    `WebAssembly.RuntimeError` is an `Error` subclass, so this specific check
 *    must precede the broader `Error` check. Possible trap sources include:
 *
 *    a. an explicit Rust `panic!`;
 *    b. a failed Rust `.unwrap()` or `.expect()`;
 *    c. execution of a Wasm `unreachable` instruction;
 *    d. an out-of-bounds Wasm memory or table access;
 *    e. another trapping Wasm instruction, such as integer division by zero;
 *    f. an invalid component resource operation that reaches a trapping
 *       canonical-ABI path.
 *
 *    A trap is not silent:
 *
 *    a. the current call throws or rejects with `WebAssembly.RuntimeError`;
 *    b. the generated provider records the first trap and disables that
 *       component instance;
 *    c. later calls rethrow the same stored `WebAssembly.RuntimeError` before
 *       re-entering Wasm;
 *    d. the provider does not automatically destroy, reset, retry, or replace
 *       the trapped instance.
 *
 * 2. Reject every other `Error` as an unexpected JavaScript-side failure.
 *
 *    Possible sources include:
 *
 *    a. an authored host implementation throwing `Error` or `TypeError`;
 *    b. generated canonical-ABI validation rejecting an invalid JavaScript
 *       value before or after component execution;
 *    c. generated resource projection or lifting code rejecting inconsistent
 *       state;
 *    d. test or authored adapter code throwing independently of the WIT
 *       `result`.
 *
 *    These values are not the expected lifted `analysis-validation-error`.
 *    In particular, the Rust `Result::Err(error)` path above produces the raw
 *    record, not an `Error` instance.
 *
 * 3. Compare the remaining value with the exact lifted WIT record.
 *
 *    Structural equality proves both the selected discriminant and diagnostic
 *    message:
 *
 *     expected.kind === caught.kind
 *     expected.message === caught.message
 *
 * This helper proves the error representation only. Each integration case
 * separately performs a valid operation through the same loaded export to
 * prove that the preceding `result::err` left the instance callable.
 */
function expectRawValidationError(
  caught: unknown,
  expected: AnalysisValidationErrorRecord,
): void {
  expect(caught).not.toBeInstanceOf(WebAssembly.RuntimeError);
  expect(caught).not.toBeInstanceOf(Error);
  expect(caught).toEqual(expected);
}

/** Invoke a synchronous export and assert its raw WIT validation error. */
function expectSyncValidationError(
  operation: () => unknown,
  expected: AnalysisValidationErrorRecord,
): void {
  try {
    operation();
  } catch (caught: unknown) {
    expectRawValidationError(caught, expected);
    return;
  }

  throw new TypeError("expected synchronous component operation to throw");
}

/** Invoke an async export and assert its raw WIT validation rejection. */
async function expectAsyncValidationError(
  operation: () => Promise<unknown>,
  expected: AnalysisValidationErrorRecord,
): Promise<void> {
  try {
    await operation();
  } catch (caught: unknown) {
    expectRawValidationError(caught, expected);
    return;
  }

  throw new TypeError("expected asynchronous component operation to reject");
}

/**
 * Assert only the analyzer preparation and lifecycle observations captured by
 * this typed host. Resource-handle registration and validation property reads
 * are deliberately outside this assertion.
 */
function expectNoObservedAnalyzerWorkStarted(): void {
  expect(capturedLogLines).toHaveLength(0);
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
 * that a rejected shared-frame call did not append commands or change any
 * modeled lifecycle/resource field.
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

  it("[P10] returns ordered stable validation errors and remains callable", () => {
    const invalidContext = createGpuTestContext({ referenceBufferSize: 0 });

    // Request validation wins even when the texture declaration and truth
    // buffer are also invalid.
    expectSyncValidationError(
      () =>
        gpuAnalysis.analyze(
          invalidContext.deviceHandle,
          invalidContext.textureHandle,
          invalidContext.bufferHandle,
          {
            ...STABLE_ANALYSIS_REQUEST,
            entryId: "",
            textureWidth: STABLE_ANALYSIS_REQUEST.textureWidth + 1,
          },
        ),
      INVALID_REQUEST_ERROR,
    );
    expectNoObservedAnalyzerWorkStarted();

    // Texture/resource agreement wins over the final capacity check.
    expectSyncValidationError(
      () =>
        gpuAnalysis.analyze(
          invalidContext.deviceHandle,
          invalidContext.textureHandle,
          invalidContext.bufferHandle,
          {
            ...STABLE_ANALYSIS_REQUEST,
            textureWidth: STABLE_ANALYSIS_REQUEST.textureWidth + 1,
          },
        ),
      TEXTURE_MISMATCH_ERROR,
    );
    expectNoObservedAnalyzerWorkStarted();

    expectSyncValidationError(
      () =>
        gpuAnalysis.analyze(
          invalidContext.deviceHandle,
          invalidContext.textureHandle,
          invalidContext.bufferHandle,
          STABLE_ANALYSIS_REQUEST,
        ),
      TRUTH_BUFFER_ERROR,
    );
    expectNoObservedAnalyzerWorkStarted();

    // A valid call through the same loaded generated interface returns the
    // bare success value and owns its normal command submission.
    const validContext = createGpuTestContext();
    const dispatch = gpuAnalysis.analyze(
      validContext.deviceHandle,
      validContext.textureHandle,
      validContext.bufferHandle,
      STABLE_ANALYSIS_REQUEST,
    );
    expect(dispatch.summary.plan.request).toEqual(STABLE_ANALYSIS_REQUEST);
    expect(capturedGpuCommandSubmits).toHaveLength(1);
  });

  it("[P10] keeps a frame encoder untouched and remains callable", () => {
    const invalidContext = createGpuTestContext({ referenceBufferSize: 0 });
    const invalidEncoder = invalidContext.deviceHandle.createCommandEncoder({
      label: "invalid shared-frame test encoder",
    });
    const encoderBefore = snapshotEncoder(invalidEncoder);

    expectSyncValidationError(
      () =>
        gpuAnalysisFrame.encode(
          invalidEncoder,
          invalidContext.deviceHandle,
          invalidContext.textureHandle,
          invalidContext.bufferHandle,
          FRAME_ANALYSIS_REQUEST,
        ),
      TRUTH_BUFFER_ERROR,
    );

    const encoderAfter = snapshotEncoder(invalidEncoder);
    expect(encoderAfter.computePassBegins).toBe(0);
    expect(encoderAfter.computePassEnds).toBe(0);
    expect(encoderAfter.computePassOpen).toBe(false);
    expect(encoderAfter).toEqual(encoderBefore);
    expectNoObservedAnalyzerWorkStarted();

    const validContext = createGpuTestContext();
    const validEncoder = validContext.deviceHandle.createCommandEncoder({
      label: "recovered shared-frame test encoder",
    });
    const dispatch = gpuAnalysisFrame.encode(
      validEncoder,
      validContext.deviceHandle,
      validContext.textureHandle,
      validContext.bufferHandle,
      FRAME_ANALYSIS_REQUEST,
    );

    expect(dispatch.summary.plan.request).toEqual(FRAME_ANALYSIS_REQUEST);
    expect(requireTestGpuCommandEncoder(validEncoder).computePassBegins).toBe(
      1,
    );
  });

  it("[P10] rejects an async raw error record and remains callable", async () => {
    const invalidContext = createGpuTestContext({ referenceBufferSize: 0 });

    await expectAsyncValidationError(
      () =>
        gpuAnalysisAsync.analyze(
          invalidContext.deviceHandle,
          invalidContext.textureHandle,
          invalidContext.bufferHandle,
          ASYNC_ANALYSIS_REQUEST,
        ),
      TRUTH_BUFFER_ERROR,
    );
    expectNoObservedAnalyzerWorkStarted();

    const validContext = createGpuTestContext();
    const dispatch = await gpuAnalysisAsync.analyze(
      validContext.deviceHandle,
      validContext.textureHandle,
      validContext.bufferHandle,
      ASYNC_ANALYSIS_REQUEST,
    );

    expect(dispatch.summary).toEqual(EXPECTED_ASYNC_SUMMARY);
    expect(capturedGpuCommandSubmits).toHaveLength(1);
  });
});
