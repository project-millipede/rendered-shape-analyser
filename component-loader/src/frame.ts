/**
 * Isolated loader for the scheduler-owned `gpu-analysis-frame` world.
 *
 * Nothing in this module is used by the stable or JSPI runners. Its public
 * operation is synchronous because Rust must append commands while the
 * browser's frame encoder is still open; component loading and summary
 * readback remain asynchronous at the edges of that operation.
 */

import {
  instantiateGpuAnalysisFrameComponent,
  type GpuAnalysisFrameEncodedResult,
  type GpuAnalysisFrameInterface,
} from "./generated";
import {
  createComponentCapabilityController,
  createComponentCapabilityLoaderView,
  type ComponentCapabilityLoader,
} from "./legacy-capability";
import {
  createComponentGpuFramePendingSummary,
  expectedEdgeDiscoverySlotCapacity,
  registerExternalGpuCommandEncoder,
  registerGpuBuffer,
  registerGpuDevice,
  registerGpuTexture,
  releaseGpuHandle,
  resolveAnalysisBorderTraceOutput,
  resolveAnalysisEdgeDiscoveryOutput,
  resolveAnalysisVisualOutput,
  takeExternalGpuCommandEncoding,
  type ComponentGpuAnalysisInput,
  type ComponentGpuAnalysisBorderTraceOutput,
  type ComponentGpuAnalysisEdgeDiscoveryOutput,
  type ComponentGpuAnalysisVisualOutput,
  type ComponentGpuFrameEncodedOutput,
  type ComponentGpuFramePendingSummary,
  type ComponentGpuSummaryResolver,
  type GpuBuffer,
  type GpuCommandEncoder as WitGpuCommandEncoder,
  type GpuDevice,
  type GpuTexture,
} from "./host/gpu";
import {
  requireRegisteredBuffer,
  type ExternalGpuCommandEncoding,
} from "./host/webgpu";

/** Shared-frame component lifecycle used by preload and synchronous encoding. */
const componentGpuFrameAnalyzerController = createComponentCapabilityController(
  {
    instantiate: instantiateGpuAnalysisFrameComponent,
    probeSupport() {
      const wasm = globalThis.WebAssembly;
      if (typeof wasm === "object" && wasm !== null) {
        return { status: "supported" };
      }
      return {
        status: "unsupported",
        reason: {
          code: "webassembly-unavailable",
          message: "WebAssembly is unavailable in this runtime",
        },
      };
    },
    reportFailure(error) {
      console.warn(
        "[analysis][component-gpu-frame] component failed to load",
        error,
      );
    },
  },
);

/** Explicit lifecycle for the scheduler-owned shared-frame capability. */
export const componentGpuFrameAnalyzerLoader: ComponentCapabilityLoader<GpuAnalysisFrameInterface> =
  createComponentCapabilityLoaderView(componentGpuFrameAnalyzerController);

/**
 * Load the shared-frame component before the scheduler needs to encode.
 *
 * The frame callback cannot await module instantiation without closing over a
 * stale browser encoder. Consumers therefore preload this promise when the
 * engine/device backend is created and call the synchronous encoder only
 * after it resolves.
 *
 * @returns The callable shared-frame interface, or `null` when the
 *   compatibility view does not reach the loader's ready state.
 */
export function loadComponentGpuFrameAnalyzer(): Promise<GpuAnalysisFrameInterface | null> {
  return componentGpuFrameAnalyzerController.prepareNullable();
}

/**
 * Append one component analysis run to the scheduler's native frame encoder.
 *
 * This function never calls `finish()` or `queue.submit()`. The native
 * `GPUCommandEncoder` remains browser-owned; only a temporary WIT projection
 * crosses the Component Model boundary. Returned GPU output buffers are usable
 * by a render pass encoded later into this same frame, while the pending
 * summary must wait for the scheduler's submission notification.
 *
 * @param input - Shared device, captured texture, ground truth, and metadata.
 * @param encoder - Still-open native encoder owned by the frame scheduler.
 * @param summaryResolver - Device-local compact-summary decoder.
 * @returns Synchronously encoded GPU outputs and pending summary lifecycle.
 */
export function encodeComponentGpuFrameAnalysis(
  input: ComponentGpuAnalysisInput,
  encoder: GPUCommandEncoder,
  summaryResolver: ComponentGpuSummaryResolver,
): ComponentGpuFrameEncodedOutput {
  const frameInterface =
    componentGpuFrameAnalyzerController.getReadyCapability();
  const state = componentGpuFrameAnalyzerController.state;
  if (state === "idle" || state === "preparing") {
    throw new Error(
      "[analysis][component-gpu-frame] component was not preloaded",
    );
  }
  if (state === "disposed") {
    throw new Error("[analysis][component-gpu-frame] component is disposed");
  }
  if (!frameInterface) {
    throw new Error("[analysis][component-gpu-frame] component is unavailable");
  }

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
  let result: GpuAnalysisFrameEncodedResult | undefined;
  let pendingSummary: ComponentGpuFramePendingSummary | null = null;
  let outputTransferred = false;
  let visual: ComponentGpuAnalysisVisualOutput | null = null;
  let borderTrace: ComponentGpuAnalysisBorderTraceOutput | null = null;
  let edgeDiscovery: ComponentGpuAnalysisEdgeDiscoveryOutput | null = null;

  try {
    result = frameInterface.encode(
      encoderHandle,
      deviceHandle,
      textureHandle,
      truthHandle,
      {
        entryId: input.entryId,
        displayName: input.displayName,
        textureWidth: input.texture.width,
        textureHeight: input.texture.height,
        nodeCount: input.nodeCount,
      },
    );

    // Taking the projection proves that Rust reached all expected bind groups
    // and prevents later loader cleanup from accidentally deleting metadata
    // needed by the pending summary.
    externalEncoding = takeExternalGpuCommandEncoding(encoderHandle);
    encoderProjectionConsumed = true;
    pendingSummary = createComponentGpuFramePendingSummary(
      "[analysis][component-gpu-frame]",
      input,
      result.summary,
      externalEncoding,
      summaryResolver,
    );
    visual = resolveAnalysisVisualOutput(
      "[analysis][component-gpu-frame]",
      input.nodeCount,
      result.visual,
    );
    borderTrace = resolveAnalysisBorderTraceOutput(
      "[analysis][component-gpu-frame]",
      input.nodeCount,
      result.borderTrace,
    );
    edgeDiscovery = resolveAnalysisEdgeDiscoveryOutput(
      "[analysis][component-gpu-frame]",
      expectedEdgeDiscoverySlotCapacity(
        input.texture.width,
        input.texture.height,
      ),
      result.edgeDiscovery,
    );

    outputTransferred = true;
    return {
      summary: pendingSummary,
      visual,
      borderTrace,
      edgeDiscovery,
    };
  } finally {
    if (!outputTransferred) {
      if (pendingSummary) {
        pendingSummary.dispose();
      }
      if (!pendingSummary && externalEncoding) {
        // `createComponentGpuFramePendingSummary` validates before it can
        // return its lifecycle object. Cover that narrow failure window here,
        // while the staging WIT handle is still registered.
        externalEncoding.resources.summaryBuffer.destroy();
        if (result) {
          const staging = requireRegisteredBuffer(
            result.summary.stagingBuffer,
          ).buffer;
          if (staging.mapState === "mapped") staging.unmap();
          staging.destroy();
        }
      }
      visual?.buffer.destroy();
      visual?.indirectBuffer.destroy();
      borderTrace?.buffer.destroy();
      borderTrace?.indirectBuffer.destroy();
      edgeDiscovery?.buffer.destroy();
      edgeDiscovery?.indirectBuffer.destroy();
    }

    // These are WIT registry identities, not native object destruction. The
    // browser backend owns successful GPU output buffers and the pending-summary
    // object owns successful diagnostic buffers from this point onward.
    if (!encoderProjectionConsumed) {
      releaseGpuHandle(encoderHandle);
    }
    releaseGpuHandle(result?.summary.stagingBuffer);
    releaseGpuHandle(result?.visual.buffer);
    releaseGpuHandle(result?.visual.indirectBuffer);
    releaseGpuHandle(result?.borderTrace.buffer);
    releaseGpuHandle(result?.borderTrace.indirectBuffer);
    releaseGpuHandle(result?.edgeDiscovery.buffer);
    releaseGpuHandle(result?.edgeDiscovery.indirectBuffer);
    releaseGpuHandle(truthHandle);
    releaseGpuHandle(textureHandle);
    releaseGpuHandle(deviceHandle);
  }
}
