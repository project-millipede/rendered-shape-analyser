import {
  notifyComponentGpuAnalysisReturned,
  notifyComponentGpuAnalysisStarted,
  notifyComponentGpuAnalysisThrew,
  type ComponentGpuAnalysisObserver,
} from "./gpu-analysis-observer";
import { normalizeCaughtError } from "./errors";
import type {
  ComponentGpuAnalysisInput,
  ComponentGpuFrameEncodedOutput,
  ComponentGpuSummaryResolver,
} from "./host/gpu-types";

/** Dependencies required for one scheduler-owned frame invocation. */
export interface ComponentGpuAnalysisFrameOptions {
  /** Device-local compact-summary decoder for this exact invocation. */
  readonly summaryResolver: ComponentGpuSummaryResolver;
  /** Optional post-readiness invocation-boundary observer. */
  readonly observer?: ComponentGpuAnalysisObserver;
}

/** Ready frame capability whose execution contains no loading or awaiting. */
export interface ComponentGpuAnalysisFrameCapability {
  /**
   * Append commands to the caller's still-open frame encoder.
   *
   * Any throw means the scheduler must abandon the whole encoder/frame. It
   * must not append more work, finish, or submit that encoder because WebGPU
   * command recording cannot be rolled back.
   */
  readonly encode: (
    input: ComponentGpuAnalysisInput,
    encoder: GPUCommandEncoder,
    options: ComponentGpuAnalysisFrameOptions,
  ) => ComponentGpuFrameEncodedOutput;
}

/** Already-prepared synchronous frame operation captured by a capability. */
export type ExecutePreparedComponentGpuFrameAnalysis = (
  input: ComponentGpuAnalysisInput,
  encoder: GPUCommandEncoder,
  summaryResolver: ComponentGpuSummaryResolver,
) => ComponentGpuFrameEncodedOutput;

/** Execute one observed frame call while preserving its synchronous result. */
const encodeObservedWithPreparedComponent = (
  execute: ExecutePreparedComponentGpuFrameAnalysis,
  observer: ComponentGpuAnalysisObserver,
  input: ComponentGpuAnalysisInput,
  encoder: GPUCommandEncoder,
  summaryResolver: ComponentGpuSummaryResolver,
): ComponentGpuFrameEncodedOutput => {
  notifyComponentGpuAnalysisStarted(observer, "frame", input.entryId);
  try {
    const output = execute(input, encoder, summaryResolver);
    notifyComponentGpuAnalysisReturned(observer, "frame", input.entryId);
    return output;
  } catch (caught) {
    const error = normalizeCaughtError(
      caught,
      "frame component invocation threw an unreadable value",
    );
    notifyComponentGpuAnalysisThrew(observer, "frame", input.entryId, error);
    throw caught;
  }
};

/**
 * Bind one prepared synchronous operation to the public frame contract.
 *
 * This function performs no provider work and never re-enters preparation.
 */
export function createComponentGpuAnalysisFrameCapability(
  execute: ExecutePreparedComponentGpuFrameAnalysis,
): ComponentGpuAnalysisFrameCapability {
  return {
    encode(
      input: ComponentGpuAnalysisInput,
      encoder: GPUCommandEncoder,
      options: ComponentGpuAnalysisFrameOptions,
    ) {
      const observer = options.observer;
      if (!observer) {
        return execute(input, encoder, options.summaryResolver);
      }
      return encodeObservedWithPreparedComponent(
        execute,
        observer,
        input,
        encoder,
        options.summaryResolver,
      );
    },
  };
}
