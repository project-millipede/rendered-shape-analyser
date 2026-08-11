/** Shared-frame compact-summary lifecycle after synchronous command encoding. */

import type * as GeneratedGpuAnalysisFrame from "../../../pkg/generated/gpu-analysis-frame/interfaces/millipede-inspector-gpu-analysis-frame";
import {
  type ExternalGpuCommandEncoding,
  requireRegisteredBuffer,
} from "./webgpu";
import {
  assertBufferByteLength,
  assertSupportedAnalysisPlan,
  createSummaryBuffersView,
  destroyUntransferredSummaryBuffers,
  expectedSummaryByteLength,
} from "./gpu-output";
import type {
  ComponentGpuAnalysisInput,
  ComponentGpuFramePendingSummary,
  ComponentGpuSummaryResolver,
} from "./gpu-types";

/**
 * Create the one-shot summary resolver for commands appended to a shared
 * browser frame encoder.
 *
 * Before submission the returned object owns both summary buffers and can
 * destroy them on abort. Calling `resolveAfterSubmit()` transfers ownership to
 * the call-local summary resolver. Renderer-facing outputs are not owned here;
 * the frame adapter transfers or rolls them back separately because render
 * work may consume them in the same command buffer.
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
    throw new Error(
      `${prefix} encoded summary byte length does not match plan`,
    );
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
        throw new Error(`${prefix} pending summary was already ${state}`);
      }
      state = "transferred";

      // Pipeline creation has its own nested setup-validation scopes. The
      // scheduler promise covers later encoding, rendering, finish, and the
      // shared queue submission for the complete frame.
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
      destroyUntransferredSummaryBuffers(
        resources.summaryBuffer,
        stagingRecord.buffer,
      );
    },
  };
}
