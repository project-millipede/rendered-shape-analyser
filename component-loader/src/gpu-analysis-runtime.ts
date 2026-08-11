import {
  destroyUntransferredSummaryBuffers,
  expectedEdgeDiscoverySlotCapacity,
  type ComponentGpuOutputHandles,
  resolveAnalysisBorderTraceOutput,
  resolveAnalysisEdgeDiscoveryOutput,
  resolveAnalysisVisualOutput,
} from "./host/gpu-output";
import {
  forEachComponentGpuOutputValue,
  type ComponentGpuOutputSet,
} from "./host/gpu-output-set";
import {
  registerGpuBuffer,
  registerGpuDevice,
  registerGpuTexture,
  releaseWebGpuHandle,
  requireRegisteredBuffer,
  requireRegisteredCommandBuffer,
  type GpuBuffer,
  type GpuCommandBuffer,
  type GpuDevice,
  type GpuTexture,
  type RegisteredGpuBufferHandle,
} from "./host/webgpu";
import type { ComponentGpuAnalysisInput } from "./host/gpu-types";

/** Opaque WIT handles registered for one component GPU analysis call. */
export interface RegisteredComponentGpuInputHandles {
  /** Temporary WIT projection of the caller-owned browser device. */
  readonly device: GpuDevice;
  /** Temporary WIT projection of the captured texture owned by that device. */
  readonly texture: GpuTexture;
  /** Temporary WIT projection of the reference buffer owned by that device. */
  readonly truthBuffer: GpuBuffer;
}

/** Browser-facing output buffers resolved during one component call. */
export type ResolvedComponentGpuOutputs = ComponentGpuOutputSet<GPUBuffer>;

/** Cleanup scope exposed to one stable or async component call. */
export interface ComponentGpuAnalysisScope {
  /** Caller-owned inputs projected into the temporary WIT registry. */
  readonly inputs: RegisteredComponentGpuInputHandles;
  /** Claim both stable-summary WIT handles before validating either one. */
  trackSummaryReadback(
    stagingBuffer: RegisteredGpuBufferHandle,
    commands: GpuCommandBuffer,
  ): void;
  /**
   * Stand down native summary cleanup after both identities were inspected.
   * The outer scope still releases their temporary WIT handles.
   */
  transferSummaryReadbackCleanup(): void;
  /** Atomically claim every renderer handle before resolving any one lane. */
  trackOutputHandles(outputs: ComponentGpuOutputHandles): void;
}

/** Component-created resources tracked during one analysis call. */
interface TrackedComponentGpuOutputs {
  /** Stable staging-buffer WIT handle claimed from the guest result. */
  summaryStagingHandle: RegisteredGpuBufferHandle | null;
  /** Stable command-buffer WIT handle carrying submitted summary metadata. */
  commandBufferHandle: GpuCommandBuffer | null;
  /** Whether the summary-readback adapter now owns native summary cleanup. */
  summaryReadbackCleanupTransferred: boolean;
  /** Complete renderer-handle set claimed before lane validation. */
  outputHandles: ComponentGpuOutputHandles | null;
}

/**
 * Release caller-owned resources from the temporary WIT registry.
 *
 * Handles are released in reverse dependency order: truth buffer, texture,
 * then device. Registry release removes only WIT identities; it never destroys
 * the caller's native browser objects.
 */
const releaseComponentGpuInputHandles = (
  handles: RegisteredComponentGpuInputHandles,
): void => {
  releaseWebGpuHandle(handles.truthBuffer);
  releaseWebGpuHandle(handles.texture);
  releaseWebGpuHandle(handles.device);
};

/** Destroy one component-created output before releasing its WIT handle. */
const destroyTrackedOutputHandle = (
  handle: RegisteredGpuBufferHandle | null,
): void => {
  if (!handle) return;
  try {
    requireRegisteredBuffer(handle).buffer.destroy();
  } catch {
    // Preserve the original validation failure for invalid or stale handles.
  }
};

/** Destroy stable summaries before the readback adapter assumes cleanup. */
const destroyTrackedSummaryReadback = (
  outputs: TrackedComponentGpuOutputs,
): void => {
  if (outputs.summaryReadbackCleanupTransferred) return;

  let stagingBuffer: GPUBuffer | null = null;
  if (outputs.summaryStagingHandle) {
    try {
      stagingBuffer = requireRegisteredBuffer(
        outputs.summaryStagingHandle,
      ).buffer;
    } catch {
      // Preserve the analysis failure that initiated scope cleanup.
    }
  }

  let summaryBuffer: GPUBuffer | null = null;
  if (outputs.commandBufferHandle) {
    try {
      summaryBuffer = requireRegisteredCommandBuffer(
        outputs.commandBufferHandle,
      ).resources.summaryBuffer;
    } catch {
      // Preserve the analysis failure that initiated scope cleanup.
    }
  }

  destroyUntransferredSummaryBuffers(summaryBuffer, stagingBuffer);
};

/**
 * Release component-created WIT handles and destroy untransferred resources.
 *
 * Summary buffers remain owned here until cleanup transfers to the stable
 * summary-readback adapter, which later hands them to the invocation-local
 * resolver after host-side identity and metadata validation. Renderer buffers
 * are destroyed only when the callback fails before returning them; a
 * successful callback transfers those native buffers to the result owner.
 * Every tracked temporary WIT handle is released in either outcome, and
 * releasing its identity does not destroy a transferred native buffer.
 */
const releaseTrackedComponentGpuOutputs = (
  outputs: TrackedComponentGpuOutputs,
  outputsReturnedToCaller: boolean,
): void => {
  destroyTrackedSummaryReadback(outputs);
  const outputHandles = outputs.outputHandles;
  if (outputHandles && !outputsReturnedToCaller) {
    forEachComponentGpuOutputValue(outputHandles, destroyTrackedOutputHandle);
  }

  releaseWebGpuHandle(outputs.commandBufferHandle);
  releaseWebGpuHandle(outputs.summaryStagingHandle);
  if (outputHandles) {
    forEachComponentGpuOutputValue(outputHandles, releaseWebGpuHandle);
  }
};

/**
 * Run one stable or async component call inside a transient WIT-handle scope.
 *
 * The scope projects the caller's device, texture, and truth buffer into WIT,
 * records every returned component handle before downstream host validation
 * can fail, and releases every registered input and tracked returned handle
 * exactly once. Failed calls destroy native outputs that never transferred;
 * successful calls leave transferred output buffers alive for the browser
 * result owner.
 *
 * Stable and JSPI use this asynchronous scope for different reasons:
 *
 * 1. Stable generated `analyze` returns synchronously; only its host-side
 *    summary readback and call-local resolver cross an asynchronous boundary.
 * 2. JSPI awaits generated component execution itself inside this scope.
 * 3. Shared-frame encoding cannot use this scope because it must return
 *    synchronously with a pending summary before the scheduler submits the
 *    borrowed encoder.
 */
export async function withComponentGpuAnalysisScope<Result>(
  input: ComponentGpuAnalysisInput,
  callback: (scope: ComponentGpuAnalysisScope) => Promise<Result>,
): Promise<Result> {
  const handles: RegisteredComponentGpuInputHandles = {
    device: registerGpuDevice(input.device),
    texture: registerGpuTexture(input.texture, input.device),
    truthBuffer: registerGpuBuffer(input.truthBuffer, input.device),
  };
  const outputs: TrackedComponentGpuOutputs = {
    summaryStagingHandle: null,
    commandBufferHandle: null,
    summaryReadbackCleanupTransferred: false,
    outputHandles: null,
  };
  let outputsReturnedToCaller = false;

  try {
    const result = await callback({
      inputs: handles,
      trackSummaryReadback(stagingBuffer, commands) {
        outputs.summaryStagingHandle = stagingBuffer;
        outputs.commandBufferHandle = commands;
      },
      transferSummaryReadbackCleanup() {
        if (!outputs.summaryStagingHandle || !outputs.commandBufferHandle) {
          throw new Error(
            "component GPU summary readback was not tracked before transfer",
          );
        }
        outputs.summaryReadbackCleanupTransferred = true;
      },
      trackOutputHandles(outputHandles) {
        outputs.outputHandles = outputHandles;
      },
    });
    outputsReturnedToCaller = true;
    return result;
  } finally {
    releaseTrackedComponentGpuOutputs(outputs, outputsReturnedToCaller);
    releaseComponentGpuInputHandles(handles);
  }
}

/** Resolve generated buffer handles into the three browser-facing outputs. */
export function resolveComponentGpuOutputs(
  prefix: string,
  input: ComponentGpuAnalysisInput,
  scope: ComponentGpuAnalysisScope,
  outputs: ComponentGpuOutputHandles,
): ResolvedComponentGpuOutputs {
  // Claim every returned handle before the first resolver can throw. The
  // surrounding scope can then destroy the complete raw result atomically.
  scope.trackOutputHandles(outputs);

  const visual = resolveAnalysisVisualOutput(
    prefix,
    input.nodeCount,
    outputs.visual,
  );
  const borderTrace = resolveAnalysisBorderTraceOutput(
    prefix,
    input.nodeCount,
    outputs.borderTrace,
  );
  const edgeSlotCapacity = expectedEdgeDiscoverySlotCapacity(
    input.texture.width,
    input.texture.height,
  );
  const edgeDiscovery = resolveAnalysisEdgeDiscoveryOutput(
    prefix,
    edgeSlotCapacity,
    outputs.edgeDiscovery,
  );
  return { visual, borderTrace, edgeDiscovery };
}
