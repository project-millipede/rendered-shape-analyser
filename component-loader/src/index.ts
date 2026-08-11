import {
  instantiateAnalysisComponent,
  instantiateGpuAnalysisAsyncComponent,
  instantiateGpuAnalysisComponent,
  instantiateWasiAsyncProofsComponent,
  type AnalysisInterface,
  type GpuAnalysisAsyncInterface,
  type GpuAnalysisInterface,
  type NodeRecord,
  type TreeStats,
  type WasiAsyncProofsInterface,
} from "./generated";
import {
  createComponentCapabilityController,
  createComponentCapabilityLoaderView,
  type ComponentCapabilityLoader,
  type ComponentCapabilitySupport,
} from "./legacy-capability";
import {
  configureGpuAnalysisSummaryResolver,
  expectedEdgeDiscoverySlotCapacity,
  registerGpuBuffer,
  registerGpuDevice,
  registerGpuTexture,
  releaseGpuHandle,
  resolveAnalysisBorderTraceOutput,
  resolveAnalysisEdgeDiscoveryOutput,
  resolveAnalysisVisualOutput,
  resolveAnalysisSummaryReadback,
} from "./host/gpu";
import type {
  AnalysisDispatch,
  AnalysisSummaryResult,
  AnalysisPlan,
  ComponentGpuAnalysisCommandBuffer,
  ComponentGpuAnalysisSummaryBuffers,
  ComponentGpuAnalysisVisualBuffers,
  ComponentGpuAnalysisVisualOutput,
  ComponentGpuAnalysisBorderTraceOutput,
  ComponentGpuAnalysisEdgeDiscoveryOutput,
  ComponentGpuAnalysisOutput,
  ComponentGpuAnalysisSubmission,
  ComponentGpuAnalysisInput,
  ComponentGpuSummaryResolveInput,
  ComponentGpuSummaryResolver,
  GpuBuffer,
  GpuCommandBuffer,
  GpuDevice,
  GpuTexture,
  RegisteredGpuBufferHandle,
} from "./host/gpu";

/** Parent sentinel marking a root node. */
export const NO_PARENT = 0xffffffff;

/** Bit 0 of a node record's flags field: laid out but paints nothing. */
export const GHOST_FLAG = 0b1;

export type {
  AnalysisSummaryResult,
  AnalysisPlan,
  AnalysisInterface,
  ComponentGpuAnalysisCommandBuffer,
  ComponentGpuAnalysisSummaryBuffers,
  ComponentGpuAnalysisVisualBuffers,
  ComponentGpuAnalysisVisualOutput,
  ComponentGpuAnalysisBorderTraceOutput,
  ComponentGpuAnalysisEdgeDiscoveryOutput,
  ComponentGpuAnalysisOutput,
  ComponentGpuAnalysisSubmission,
  ComponentGpuAnalysisInput,
  ComponentGpuSummaryResolveInput,
  ComponentGpuSummaryResolver,
  GpuAnalysisAsyncInterface,
  GpuAnalysisInterface,
  WasiAsyncProofsInterface,
  NodeRecord,
  TreeStats,
};
export type {
  ComponentCapabilityLoader,
  ComponentCapabilityPrepareResult,
  ComponentCapabilityState,
  ComponentUnsupportedReason,
} from "./legacy-capability";
export type GuestLogLevel = "debug" | "info" | "warn" | "error";

export {
  configureGpuAnalysisSummaryResolver,
  registerGpuBuffer,
  registerGpuDevice,
  registerGpuTexture,
  releaseGpuHandle,
};

// The shared-frame backend lives in its own authored module because its
// synchronous borrowed-encoder lifecycle must not leak into stable/JSPI code.
export {
  encodeComponentGpuFrameAnalysis,
  componentGpuFrameAnalyzerLoader,
  loadComponentGpuFrameAnalyzer,
} from "./frame";
export type { GpuAnalysisFrameInterface } from "./generated";
export type {
  ComponentGpuFrameEncodedOutput,
  ComponentGpuFramePendingSummary,
  ComponentGpuFrameSubmission,
} from "./host/gpu-types";

/** Opaque WIT handles registered for one component GPU analysis call. */
interface RegisteredComponentGpuInputHandles {
  /** Opaque handle for the caller's existing browser `GPUDevice`. */
  device: GpuDevice;
  /** Opaque handle for captured-pixel texture, owned by `device`. */
  texture: GpuTexture;
  /** Opaque handle for component-reference buffer, owned by `device`. */
  truthBuffer: GpuBuffer;
}

/** Cleanup scope exposed to one component GPU-analysis call. */
interface ComponentGpuAnalysisScope {
  /** Opaque input resource handles registered for the current call. */
  inputs: RegisteredComponentGpuInputHandles;
  /** Track a stable-path diagnostic readback handle so the scope can release it. */
  trackSummaryReadback(
    stagingBuffer: RegisteredGpuBufferHandle,
    commands: GpuCommandBuffer,
  ): void;
  /** Track a component-produced visual buffer handle and its browser output view. */
  trackVisualOutput(
    handle: RegisteredGpuBufferHandle,
    indirectHandle: RegisteredGpuBufferHandle,
    visual: ComponentGpuAnalysisVisualOutput,
  ): ComponentGpuAnalysisVisualOutput;
  /** Track a component-produced border-trace buffer handle and its browser output view. */
  trackBorderTraceOutput(
    handle: RegisteredGpuBufferHandle,
    indirectHandle: RegisteredGpuBufferHandle,
    borderTrace: ComponentGpuAnalysisBorderTraceOutput,
  ): ComponentGpuAnalysisBorderTraceOutput;
  /** Track a component-produced edge-discovery buffer handle and its browser output view. */
  trackEdgeDiscoveryOutput(
    handle: RegisteredGpuBufferHandle,
    indirectHandle: RegisteredGpuBufferHandle,
    edgeDiscovery: ComponentGpuAnalysisEdgeDiscoveryOutput,
  ): ComponentGpuAnalysisEdgeDiscoveryOutput;
}

/** Component-created resources tracked during one analysis call. */
interface TrackedComponentGpuOutputs {
  /** Rust-created staging-buffer handle returned for stable diagnostic readback. */
  summaryStagingHandle: RegisteredGpuBufferHandle | null;
  /** Submitted command-buffer handle returned for stable diagnostic validation. */
  commandBufferHandle: GpuCommandBuffer | null;
  /** WIT resource handle for the component-created visual output buffer. */
  visualHandle: RegisteredGpuBufferHandle | null;
  /** WIT resource handle for the component-created visual indirect buffer. */
  visualIndirectHandle: RegisteredGpuBufferHandle | null;
  /** Browser-facing visual output view resolved from `visualHandle`. */
  visual: ComponentGpuAnalysisVisualOutput | null;
  /** WIT resource handle for the component-created border-trace output buffer. */
  borderTraceHandle: RegisteredGpuBufferHandle | null;
  /** WIT resource handle for the component-created border-trace indirect buffer. */
  borderTraceIndirectHandle: RegisteredGpuBufferHandle | null;
  /** Browser-facing border-trace output view resolved from `borderTraceHandle`. */
  borderTrace: ComponentGpuAnalysisBorderTraceOutput | null;
  /** WIT resource handle for the component-created edge-discovery output buffer. */
  edgeDiscoveryHandle: RegisteredGpuBufferHandle | null;
  /** WIT resource handle for the component-created edge-discovery indirect buffer. */
  edgeDiscoveryIndirectHandle: RegisteredGpuBufferHandle | null;
  /** Browser-facing edge-discovery output view resolved from `edgeDiscoveryHandle`. */
  edgeDiscovery: ComponentGpuAnalysisEdgeDiscoveryOutput | null;
}

/**
 * Build the request metadata passed into the Rust GPU-analysis export.
 *
 * 1. Keeps stable and async component runners on the same request shape.
 * 2. Reads only synchronous browser WebGPU metadata from the captured texture.
 * 3. Leaves Rust to validate the metadata again through upstream WIT handles.
 *
 * @param input - Shared-device WebGPU resources and entry metadata.
 * @returns Component GPU-analysis request record.
 */
const createComponentGpuAnalysisDispatch = (
  input: ComponentGpuAnalysisInput,
): AnalysisDispatch => ({
  entryId: input.entryId,
  displayName: input.displayName,
  textureWidth: input.texture.width,
  textureHeight: input.texture.height,
  nodeCount: input.nodeCount,
});

/**
 * Release input handles registered for one component GPU-analysis call.
 *
 * 1. Releases handles in reverse dependency order: buffer, texture, device.
 * 2. Does not destroy the caller's browser objects; these are registry handles
 *    around resources still owned by the inspector.
 * 3. Keeps stable and async runners on the same cleanup path.
 *
 * @param handles - Transient WIT handles for caller-owned browser resources.
 * @returns Nothing.
 */
const releaseComponentGpuInputHandles = (
  handles: RegisteredComponentGpuInputHandles,
): void => {
  releaseGpuHandle(handles.truthBuffer);
  releaseGpuHandle(handles.texture);
  releaseGpuHandle(handles.device);
};

/**
 * Release component-created handles tracked during one analysis call.
 *
 * 1. Releases the stable-path summary staging and command-buffer handles.
 * 2. Releases the WIT handles for component-created visual buffers.
 * 3. Destroys the real browser `GPUBuffer` only if the call failed before
 *    transferring those GPU outputs to the caller.
 *
 * @param outputs - Component-created handles tracked by the scope.
 * @param outputsReturnedToCaller - Whether analysis state now owns produced GPU outputs.
 * @returns Nothing.
 */
const releaseTrackedComponentGpuOutputs = (
  outputs: TrackedComponentGpuOutputs,
  outputsReturnedToCaller: boolean,
): void => {
  releaseGpuHandle(outputs.commandBufferHandle);
  releaseGpuHandle(outputs.summaryStagingHandle);
  releaseGpuHandle(outputs.visualHandle);
  releaseGpuHandle(outputs.visualIndirectHandle);
  releaseGpuHandle(outputs.borderTraceHandle);
  releaseGpuHandle(outputs.borderTraceIndirectHandle);
  releaseGpuHandle(outputs.edgeDiscoveryHandle);
  releaseGpuHandle(outputs.edgeDiscoveryIndirectHandle);
  if (!outputsReturnedToCaller) {
    outputs.visual?.buffer.destroy();
    outputs.visual?.indirectBuffer.destroy();
    outputs.borderTrace?.buffer.destroy();
    outputs.borderTrace?.indirectBuffer.destroy();
    outputs.edgeDiscovery?.buffer.destroy();
    outputs.edgeDiscovery?.indirectBuffer.destroy();
  }
};

/**
 * Run one component GPU-analysis call inside a scoped resource lifetime.
 *
 * 1. Wraps the caller's browser `GPUDevice`, captured `GPUTexture`, and
 *    ground-truth `GPUBuffer` as opaque upstream WIT resource handles.
 * 2. Lets the callback track component-produced handles as soon as Rust
 *    returns them, including stable-path readback descriptors and visual
 *    buffers.
 * 3. Releases every transient WIT handle exactly once after the callback.
 * 4. Destroys real output `GPUBuffer`s only when the callback fails before
 *    returning them to the caller; successful calls transfer those buffers to
 *    analysis state for overlay rendering.
 *
 * @param input - Shared-device WebGPU resources and entry metadata.
 * @param callback - Work to run while resources are registered and tracked.
 * @returns The callback result.
 */
const withComponentGpuAnalysisScope = async <Result>(
  input: ComponentGpuAnalysisInput,
  callback: (scope: ComponentGpuAnalysisScope) => Promise<Result>,
): Promise<Result> => {
  const handles: RegisteredComponentGpuInputHandles = {
    device: registerGpuDevice(input.device),
    texture: registerGpuTexture(input.texture, input.device),
    truthBuffer: registerGpuBuffer(input.truthBuffer, input.device),
  };
  const outputs: TrackedComponentGpuOutputs = {
    summaryStagingHandle: null,
    commandBufferHandle: null,
    visualHandle: null,
    visualIndirectHandle: null,
    visual: null,
    borderTraceHandle: null,
    borderTraceIndirectHandle: null,
    borderTrace: null,
    edgeDiscoveryHandle: null,
    edgeDiscoveryIndirectHandle: null,
    edgeDiscovery: null,
  };
  let outputsReturnedToCaller = false;

  try {
    const result = await callback({
      inputs: handles,
      trackSummaryReadback(stagingBuffer, commands) {
        outputs.summaryStagingHandle = stagingBuffer;
        outputs.commandBufferHandle = commands;
      },
      trackVisualOutput(handle, indirectHandle, visual) {
        outputs.visualHandle = handle;
        outputs.visualIndirectHandle = indirectHandle;
        outputs.visual = visual;
        return visual;
      },
      trackBorderTraceOutput(handle, indirectHandle, borderTrace) {
        outputs.borderTraceHandle = handle;
        outputs.borderTraceIndirectHandle = indirectHandle;
        outputs.borderTrace = borderTrace;
        return borderTrace;
      },
      trackEdgeDiscoveryOutput(handle, indirectHandle, edgeDiscovery) {
        outputs.edgeDiscoveryHandle = handle;
        outputs.edgeDiscoveryIndirectHandle = indirectHandle;
        outputs.edgeDiscovery = edgeDiscovery;
        return edgeDiscovery;
      },
    });
    outputsReturnedToCaller = true;
    return result;
  } finally {
    releaseTrackedComponentGpuOutputs(outputs, outputsReturnedToCaller);
    releaseComponentGpuInputHandles(handles);
  }
};

/** Classify baseline WebAssembly support without starting component work. */
const probeWebAssemblySupport = (): ComponentCapabilitySupport => {
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
};

/** Classify JSPI support for the two explicitly asynchronous worlds. */
const probeJspiSupport = (): ComponentCapabilitySupport => {
  if (supportsJspiComponents()) return { status: "supported" };
  return {
    status: "unsupported",
    reason: {
      code: "jspi-unavailable",
      message:
        "WebAssembly.Suspending and WebAssembly.promising are unavailable",
    },
  };
};

/** Browser-safe analysis lifecycle behind the nullable compatibility API. */
const analysisComponentController = createComponentCapabilityController({
  instantiate: instantiateAnalysisComponent,
  probeSupport: probeWebAssemblySupport,
  reportFailure(error) {
    console.info(
      "[analysis][inspector-component] component failed to instantiate; wasm APIs disabled",
      error,
    );
  },
});

/** Explicit lifecycle for the browser-safe analysis capability. */
export const analysisComponentLoader: ComponentCapabilityLoader<AnalysisInterface> =
  createComponentCapabilityLoaderView(analysisComponentController);

/** Stable GPU-analysis lifecycle behind the nullable compatibility API. */
const componentGpuAnalyzerController = createComponentCapabilityController({
  instantiate: instantiateGpuAnalysisComponent,
  probeSupport: probeWebAssemblySupport,
  reportFailure(error) {
    console.info(
      "[analysis][component-gpu] component failed to instantiate; wasm APIs disabled",
      error,
    );
  },
});

/** Explicit lifecycle for the stable GPU-analysis capability. */
export const componentGpuAnalyzerLoader: ComponentCapabilityLoader<GpuAnalysisInterface> =
  createComponentCapabilityLoaderView(componentGpuAnalyzerController);

/** JSPI GPU-analysis lifecycle behind the nullable compatibility API. */
const componentGpuAnalyzerAsyncController = createComponentCapabilityController(
  {
    instantiate: instantiateGpuAnalysisAsyncComponent,
    probeSupport: probeJspiSupport,
    reportFailure(error) {
      console.info(
        "[analysis][component-gpu-async] component failed to instantiate; wasm APIs disabled",
        error,
      );
    },
  },
);

/** Explicit lifecycle for the JSPI GPU-analysis capability. */
export const componentGpuAnalyzerAsyncLoader: ComponentCapabilityLoader<GpuAnalysisAsyncInterface> =
  createComponentCapabilityLoaderView(componentGpuAnalyzerAsyncController);

/** WASI async-proof lifecycle behind the nullable compatibility API. */
const wasiAsyncProofsComponentController = createComponentCapabilityController({
  instantiate: instantiateWasiAsyncProofsComponent,
  probeSupport: probeJspiSupport,
  reportFailure(error) {
    console.info(
      "[wasi-0.3][inspector-component] component failed to instantiate; wasm APIs disabled",
      error,
    );
  },
});

/** Explicit lifecycle for the isolated WASI async-proof capability. */
export const wasiAsyncProofsComponentLoader: ComponentCapabilityLoader<WasiAsyncProofsInterface> =
  createComponentCapabilityLoaderView(wasiAsyncProofsComponentController);

/**
 * Load and instantiate the browser-safe analysis component.
 *
 * @returns The callable analysis interface, or `null` when the compatibility
 *   view does not reach the loader's ready state.
 */
export function loadAnalysisComponent(): Promise<AnalysisInterface | null> {
  return analysisComponentController.prepareNullable();
}

/**
 * Load and instantiate the browser-safe GPU-analysis component.
 *
 * This entrypoint is separate from {@link loadAnalysisComponent}: it imports
 * the P1 host-gpu resource world and should only be used by the WebGPU
 * analyzer backend.
 *
 * @returns The guest's `gpu-analysis` interface, or `null` when the
 *   compatibility view does not reach the loader's ready state.
 */
export function loadComponentGpuAnalyzer(): Promise<GpuAnalysisInterface | null> {
  return componentGpuAnalyzerController.prepareNullable();
}

/**
 * Check whether this runtime can evaluate jco's JSPI async-export output.
 *
 * Safari and Firefox can run the analysis component today, but they currently
 * do not expose WebAssembly.Suspending/WebAssembly.promising.
 */
export function supportsJspiComponents(): boolean {
  const wasm = globalThis.WebAssembly;
  return (
    typeof wasm === "object" &&
    wasm !== null &&
    "Suspending" in wasm &&
    typeof wasm.Suspending === "function" &&
    "promising" in wasm &&
    typeof wasm.promising === "function"
  );
}

/**
 * Check whether this runtime can evaluate the async GPU-analysis component.
 *
 * @returns Whether jco's JSPI-generated async GPU path can be imported.
 */
export function supportsComponentGpuAnalyzerAsync(): boolean {
  return supportsJspiComponents();
}

/**
 * Load and instantiate the Chrome/JSPI-only async GPU-analysis component.
 *
 * This entrypoint is separate from {@link loadComponentGpuAnalyzer}: it imports
 * the experimental async host-gpu world and is unavailable in browsers without
 * JSPI support.
 *
 * @returns The guest's `gpu-analysis-async` interface, or `null` when the
 *   compatibility view does not reach the loader's ready state.
 */
export function loadComponentGpuAnalyzerAsync(): Promise<GpuAnalysisAsyncInterface | null> {
  return componentGpuAnalyzerAsyncController.prepareNullable();
}

/**
 * Run one component-backed GPU analysis dispatch.
 *
 * 1. Loads the GPU-analysis component.
 * 2. Registers the caller's browser WebGPU objects as opaque WIT resources.
 * 3. Calls the Rust export, which validates metadata, builds an analysis
 *    plan, creates upstream shader/layout/pipeline/summary/visual resources,
 *    creates bind groups, encodes commands through upstream WebGPU methods,
 *    submits through upstream `gpu-queue.submit`, and returns a stable-path
 *    diagnostic readback descriptor plus GPU-resident visual output handles.
 * 4. Resolves the visual and border-trace handles into executor-facing GPU
 *    buffer views.
 * 5. Resolves the compact diagnostic readback outside the component boundary
 *    and releases the transient handles.
 *
 * @param input - Shared-device WebGPU resources and entry metadata.
 * @returns Decoded aggregate summary plus GPU-resident output buffer views.
 */
export async function runComponentGpuAnalysis(
  input: ComponentGpuAnalysisInput,
): Promise<ComponentGpuAnalysisOutput> {
  let gpuAnalysis = componentGpuAnalyzerController.getReadyCapability();
  if (!gpuAnalysis) gpuAnalysis = await loadComponentGpuAnalyzer();
  if (!gpuAnalysis) {
    throw new Error("[analysis][component-gpu] component failed to load");
  }

  return await withComponentGpuAnalysisScope(input, async (scope) => {
    const { device, texture, truthBuffer } = scope.inputs;
    const result = gpuAnalysis.analyze(
      device,
      texture,
      truthBuffer,
      createComponentGpuAnalysisDispatch(input),
    );
    scope.trackSummaryReadback(
      result.summary.stagingBuffer,
      result.summary.commands,
    );
    const visual = scope.trackVisualOutput(
      result.visual.buffer,
      result.visual.indirectBuffer,
      resolveAnalysisVisualOutput(
        "[analysis][component-gpu]",
        input.nodeCount,
        result.visual,
      ),
    );
    const borderTrace = scope.trackBorderTraceOutput(
      result.borderTrace.buffer,
      result.borderTrace.indirectBuffer,
      resolveAnalysisBorderTraceOutput(
        "[analysis][component-gpu]",
        input.nodeCount,
        result.borderTrace,
      ),
    );
    const edgeDiscovery = scope.trackEdgeDiscoveryOutput(
      result.edgeDiscovery.buffer,
      result.edgeDiscovery.indirectBuffer,
      resolveAnalysisEdgeDiscoveryOutput(
        "[analysis][component-gpu]",
        expectedEdgeDiscoverySlotCapacity(
          input.texture.width,
          input.texture.height,
        ),
        result.edgeDiscovery,
      ),
    );
    const summary = await resolveAnalysisSummaryReadback(
      "[analysis][component-gpu]",
      device,
      result.summary,
    );
    return { summary, visual, borderTrace, edgeDiscovery };
  });
}

/**
 * Run one Chrome/JSPI-only async component-backed GPU analysis dispatch.
 *
 * 1. Requires `WebAssembly.Suspending` and `WebAssembly.promising`.
 * 2. Loads the async GPU-analysis component.
 * 3. Registers the caller's browser WebGPU objects as opaque WIT resources.
 * 4. Awaits the Rust async export, which validates metadata, builds an
 *    analysis plan, creates upstream shader/layout/pipeline/summary/visual
 *    resources, creates bind groups, encodes commands through upstream WebGPU
 *    methods, submits through upstream `gpu-queue.submit`, awaits async host
 *    summary resolution, and returns the compact summary plus the
 *    GPU-resident output buffer handles directly.
 * 5. Resolves the visual and border-trace handles into executor-facing GPU
 *    buffer views.
 * 6. Releases transient resource handles after the call completes.
 *
 * @param input - Shared-device WebGPU resources and entry metadata.
 * @returns Decoded aggregate summary plus GPU-resident output buffer views.
 */
export async function runComponentGpuAnalysisAsync(
  input: ComponentGpuAnalysisInput,
): Promise<ComponentGpuAnalysisOutput> {
  let gpuAnalysis = componentGpuAnalyzerAsyncController.getReadyCapability();
  if (!gpuAnalysis) gpuAnalysis = await loadComponentGpuAnalyzerAsync();
  if (!gpuAnalysis) {
    throw new Error(
      "[analysis][component-gpu-async] component failed to load or JSPI unavailable",
    );
  }

  return await withComponentGpuAnalysisScope(input, async (scope) => {
    const { device, texture, truthBuffer } = scope.inputs;
    const result = await gpuAnalysis.analyze(
      device,
      texture,
      truthBuffer,
      createComponentGpuAnalysisDispatch(input),
    );
    const visual = scope.trackVisualOutput(
      result.visual.buffer,
      result.visual.indirectBuffer,
      resolveAnalysisVisualOutput(
        "[analysis][component-gpu-async]",
        input.nodeCount,
        result.visual,
      ),
    );
    const borderTrace = scope.trackBorderTraceOutput(
      result.borderTrace.buffer,
      result.borderTrace.indirectBuffer,
      resolveAnalysisBorderTraceOutput(
        "[analysis][component-gpu-async]",
        input.nodeCount,
        result.borderTrace,
      ),
    );
    const edgeDiscovery = scope.trackEdgeDiscoveryOutput(
      result.edgeDiscovery.buffer,
      result.edgeDiscovery.indirectBuffer,
      resolveAnalysisEdgeDiscoveryOutput(
        "[analysis][component-gpu-async]",
        expectedEdgeDiscoverySlotCapacity(
          input.texture.width,
          input.texture.height,
        ),
        result.edgeDiscovery,
      ),
    );
    return {
      summary: {
        entryId: input.entryId,
        ...result.summary,
      },
      visual,
      borderTrace,
      edgeDiscovery,
    };
  });
}

/**
 * Check whether this runtime can evaluate the isolated WASI 0.3 proof surface.
 *
 * @returns Whether jco's JSPI-generated async proof component can be imported.
 */
export function supportsWasiAsyncProofs(): boolean {
  return supportsJspiComponents();
}

/**
 * Load and instantiate the isolated WASI 0.3 async proof surface.
 *
 * This is deliberately separate from {@link loadAnalysisComponent}: the real
 * inspector API should not grow proof-only methods while we learn the async
 * shapes.
 *
 * @returns The callable proof interface, or `null` when the compatibility
 *   view does not reach the loader's ready state.
 */
export function loadWasiAsyncProofsComponent(): Promise<WasiAsyncProofsInterface | null> {
  return wasiAsyncProofsComponentController.prepareNullable();
}
