import {
  createComponentCapabilityLoader,
  type ComponentCapabilityLoader,
} from "./capability";
import { invokeComponentOperation } from "./component-invocation";
import {
  createComponentGpuAnalysisFrameCapability,
  type ComponentGpuAnalysisFrameCapability,
} from "./gpu-analysis-frame-capability";
import { createComponentGpuAnalysisDispatch } from "./gpu-analysis-dispatch";
import { normalizeComponentGpuAnalysisValidationError } from "./gpu-analysis-validation-error";
import {
  type ComponentGpuOutputHandles,
  destroyUntransferredSummaryBuffers,
  expectedEdgeDiscoverySlotCapacity,
  resolveAnalysisBorderTraceOutput,
  resolveAnalysisEdgeDiscoveryOutput,
  resolveAnalysisVisualOutput,
} from "./host/gpu-output";
import { forEachComponentGpuOutputValue } from "./host/gpu-output-set";
import {
  discardExternalGpuCommandEncodingProjection,
  registerExternalGpuCommandEncoder,
  registerGpuBuffer,
  registerGpuDevice,
  registerGpuTexture,
  releaseWebGpuHandle,
  requireRegisteredBuffer,
  takeExternalGpuCommandEncoding,
  type ExternalGpuCommandEncoding,
  type GpuBuffer,
  type GpuCommandEncoder as WitGpuCommandEncoder,
  type GpuDevice,
  type GpuTexture,
  type RegisteredGpuBufferHandle,
} from "./host/webgpu";
import { createComponentGpuFramePendingSummary } from "./host/gpu-summary-frame";
import type {
  ComponentGpuAnalysisBorderTraceOutput,
  ComponentGpuAnalysisEdgeDiscoveryOutput,
  ComponentGpuAnalysisInput,
  ComponentGpuAnalysisVisualOutput,
  ComponentGpuFrameEncodedOutput,
  ComponentGpuFramePendingSummary,
  ComponentGpuSummaryResolver,
} from "./host/gpu-types";
import {
  instantiateGpuAnalysisFrameComponent,
  type GpuAnalysisFrameInterface,
} from "./providers/gpu-analysis-frame";
import { probeWebAssemblySupport } from "./support-webassembly";

/** Destroy one component-created frame output after encoding fails. */
const destroyRegisteredOutputHandle = (
  handle: RegisteredGpuBufferHandle,
  alreadyDestroyed?: ReadonlySet<GPUBuffer>,
): void => {
  try {
    const buffer = requireRegisteredBuffer(handle).buffer;
    if (alreadyDestroyed?.has(buffer)) return;
    buffer.destroy();
  } catch {
    // Preserve the original encoding or validation failure.
  }
};

/** Destroy one component-created summary staging buffer after frame failure. */
const destroyRegisteredSummaryStagingHandle = (
  handle: RegisteredGpuBufferHandle,
): void => {
  try {
    const staging = requireRegisteredBuffer(handle).buffer;
    destroyUntransferredSummaryBuffers(null, staging);
  } catch {
    // Preserve the original encoding, extraction, or validation failure.
  }
};

/**
 * Append one call through an already prepared generated frame interface.
 *
 * A temporary WIT projection wraps the caller's still-open native encoder.
 * This operation never finishes or submits it. Returned renderer buffers may
 * be consumed by later commands in the same frame, while compact-summary
 * resolution must wait for the scheduler's eventual submission.
 */
const encodeWithPreparedComponent = (
  frameInterface: GpuAnalysisFrameInterface,
  input: ComponentGpuAnalysisInput,
  encoder: GPUCommandEncoder,
  summaryResolver: ComponentGpuSummaryResolver,
): ComponentGpuFrameEncodedOutput => {
  const deviceHandle: GpuDevice = registerGpuDevice(input.device);
  const textureHandle: GpuTexture = registerGpuTexture(
    input.texture,
    input.device,
  );
  const truthHandle: GpuBuffer = registerGpuBuffer(
    input.truthBuffer,
    input.device,
  );
  const encoderHandle: WitGpuCommandEncoder = registerExternalGpuCommandEncoder(
    encoder,
    input.device,
  );
  let encoderProjectionConsumed = false;
  let externalEncoding: ExternalGpuCommandEncoding | null = null;
  let discardedEncodingBuffers: ReadonlySet<GPUBuffer> | undefined;
  let summaryStagingHandle: RegisteredGpuBufferHandle | null = null;
  let outputHandles: ComponentGpuOutputHandles | null = null;
  let pendingSummary: ComponentGpuFramePendingSummary | null = null;
  let outputTransferred = false;
  let visual: ComponentGpuAnalysisVisualOutput | null = null;
  let borderTrace: ComponentGpuAnalysisBorderTraceOutput | null = null;
  let edgeDiscovery: ComponentGpuAnalysisEdgeDiscoveryOutput | null = null;

  try {
    const dispatch = createComponentGpuAnalysisDispatch(input);
    const result = invokeComponentOperation(
      () =>
        frameInterface.encode(
          encoderHandle,
          deviceHandle,
          textureHandle,
          truthHandle,
          dispatch,
        ),
      normalizeComponentGpuAnalysisValidationError,
    );
    summaryStagingHandle = result.summary.stagingBuffer;
    const { summary: encodedSummary, ...encodedOutputHandles } = result;
    outputHandles = encodedOutputHandles;

    // Taking the projection consumes its registry identity, proves that Rust
    // bound the complete analyzer resource set, and preserves that metadata
    // for pending-summary validation after the temporary projection is gone.
    externalEncoding = takeExternalGpuCommandEncoding(encoderHandle);
    encoderProjectionConsumed = true;
    pendingSummary = createComponentGpuFramePendingSummary(
      "[analysis][component-gpu-frame]",
      input,
      encodedSummary,
      externalEncoding,
      summaryResolver,
    );
    visual = resolveAnalysisVisualOutput(
      "[analysis][component-gpu-frame]",
      input.nodeCount,
      outputHandles.visual,
    );
    borderTrace = resolveAnalysisBorderTraceOutput(
      "[analysis][component-gpu-frame]",
      input.nodeCount,
      outputHandles.borderTrace,
    );
    const edgeSlotCapacity = expectedEdgeDiscoverySlotCapacity(
      input.texture.width,
      input.texture.height,
    );
    edgeDiscovery = resolveAnalysisEdgeDiscoveryOutput(
      "[analysis][component-gpu-frame]",
      edgeSlotCapacity,
      outputHandles.edgeDiscovery,
    );

    outputTransferred = true;
    return {
      summary: pendingSummary,
      visual,
      borderTrace,
      edgeDiscovery,
    };
  } finally {
    /*
     * Failure cleanup follows the ownership stage reached by the call:
     *
     * - before extraction, the borrowed projection records component buffers;
     * - after extraction, this adapter owns the native summary-output buffer
     *   plus any returned staging/output WIT handles;
     * - after pending-summary creation, that one-shot object owns both summary
     *   buffers until resolution or disposal;
     * - renderer buffers transfer only after the complete result is returned.
     *
     * WIT identities are always released, but releasing them does not destroy
     * native resources. Native identities already destroyed while discarding
     * the projection are therefore excluded from the later fallback cleanup.
     */
    if (!outputTransferred && pendingSummary) {
      pendingSummary.dispose();
    }
    if (!outputTransferred && !pendingSummary && externalEncoding) {
      destroyUntransferredSummaryBuffers(
        externalEncoding.resources.summaryBuffer,
        null,
      );
    }
    if (!outputTransferred && !pendingSummary && !externalEncoding) {
      discardedEncodingBuffers =
        discardExternalGpuCommandEncodingProjection(encoderHandle);
    }
    if (!outputTransferred && !pendingSummary && summaryStagingHandle) {
      destroyRegisteredSummaryStagingHandle(summaryStagingHandle);
    }
    if (!outputTransferred && outputHandles) {
      forEachComponentGpuOutputValue(outputHandles, (handle) => {
        destroyRegisteredOutputHandle(handle, discardedEncodingBuffers);
      });
    }

    if (!encoderProjectionConsumed) {
      releaseWebGpuHandle(encoderHandle);
    }
    releaseWebGpuHandle(summaryStagingHandle);
    if (outputHandles) {
      forEachComponentGpuOutputValue(outputHandles, releaseWebGpuHandle);
    }
    releaseWebGpuHandle(truthHandle);
    releaseWebGpuHandle(textureHandle);
    releaseWebGpuHandle(deviceHandle);
  }
};

/**
 * Normalize the isolated generated frame interface into the authored ready API.
 *
 * Stable and JSPI entrypoints do not use this generated frame provider.
 * Provider preparation and post-submission summary readback are asynchronous
 * edges, while the capability's `encode()` method is strictly synchronous and
 * never finishes or submits the borrowed encoder.
 */
const instantiateComponentGpuAnalysisFrameCapability =
  async (): Promise<ComponentGpuAnalysisFrameCapability> => {
    const frameInterface = await instantiateGpuAnalysisFrameComponent();
    return createComponentGpuAnalysisFrameCapability(
      (input, encoder, summaryResolver) =>
        encodeWithPreparedComponent(
          frameInterface,
          input,
          encoder,
          summaryResolver,
        ),
    );
  };

/**
 * Single-attempt preparation boundary for the scheduler-owned frame capability.
 *
 * Preparation normally begins while the engine or device backend is being
 * established and must complete before a frame callback invokes `encode()`.
 * The callback cannot await provider work while retaining a usable still-open
 * encoder; it may invoke only the ready synchronous capability.
 */
export const componentGpuFrameAnalyzerLoader: ComponentCapabilityLoader<ComponentGpuAnalysisFrameCapability> =
  createComponentCapabilityLoader({
    instantiate: instantiateComponentGpuAnalysisFrameCapability,
    probeSupport: probeWebAssemblySupport,
    reportFailure(error) {
      console.warn(
        "[analysis][component-gpu-frame] component failed to instantiate",
        error,
      );
    },
  });

export type {
  AnalysisSummaryResult,
  ComponentGpuAnalysisBorderTraceOutput,
  ComponentGpuAnalysisEdgeDiscoveryOutput,
  ComponentGpuAnalysisInput,
  ComponentGpuAnalysisVisualOutput,
  ComponentGpuFrameEncodedOutput,
  ComponentGpuFramePendingSummary,
  ComponentGpuFrameSubmission,
  ComponentGpuSummaryResolver,
} from "./host/gpu-types";
export type {
  ComponentGpuAnalysisInvocationEvent,
  ComponentGpuAnalysisObserver,
  ComponentGpuAnalysisVariant,
} from "./gpu-analysis-observer";
export type {
  ComponentGpuAnalysisFrameCapability,
  ComponentGpuAnalysisFrameOptions,
} from "./gpu-analysis-frame-capability";
export {
  ComponentGpuAnalysisValidationError,
  type ComponentGpuAnalysisValidationErrorKind,
} from "./gpu-analysis-validation-error";
export type {
  ComponentCapabilityLoader,
  ComponentCapabilityPrepareResult,
  ComponentCapabilityState,
  ComponentUnsupportedReason,
} from "./capability";
