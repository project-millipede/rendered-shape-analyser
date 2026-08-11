import {
  notifyComponentGpuAnalysisReturned,
  notifyComponentGpuAnalysisStarted,
  notifyComponentGpuAnalysisThrew,
  type ComponentGpuAnalysisObserver,
} from "./gpu-analysis-observer";
import { normalizeCaughtError } from "./errors";
import type {
  ComponentGpuAnalysisInput,
  ComponentGpuAnalysisOutput,
} from "./host/gpu-types";

/** Optional post-readiness instrumentation for one JSPI invocation. */
export interface ComponentGpuAnalysisAsyncOptions {
  /** Optional observer around normal execution after readiness. */
  readonly observer?: ComponentGpuAnalysisObserver;
}

/** Ready JSPI GPU-analysis capability exposed to browser integrations. */
export interface ComponentGpuAnalysisAsyncCapability {
  /** Execute one complete async component analysis on caller-owned inputs. */
  readonly analyze: (
    input: ComponentGpuAnalysisInput,
    options?: ComponentGpuAnalysisAsyncOptions,
  ) => Promise<ComponentGpuAnalysisOutput>;
}

/** Already-prepared JSPI operation captured behind an authored capability. */
export type ExecutePreparedComponentGpuAnalysisAsync = (
  input: ComponentGpuAnalysisInput,
) => Promise<ComponentGpuAnalysisOutput>;

/** Execute one async call while reporting its post-readiness boundary. */
const analyzeObservedWithPreparedComponent = async (
  execute: ExecutePreparedComponentGpuAnalysisAsync,
  observer: ComponentGpuAnalysisObserver,
  input: ComponentGpuAnalysisInput,
): Promise<ComponentGpuAnalysisOutput> => {
  notifyComponentGpuAnalysisStarted(observer, "async", input.entryId);
  try {
    const output = await execute(input);
    notifyComponentGpuAnalysisReturned(observer, "async", input.entryId);
    return output;
  } catch (caught) {
    const error = normalizeCaughtError(
      caught,
      "async component invocation threw an unreadable value",
    );
    notifyComponentGpuAnalysisThrew(observer, "async", input.entryId, error);
    throw caught;
  }
};

/**
 * Bind one prepared JSPI operation to the public invocation contract.
 *
 * This function performs no provider work and never re-enters preparation.
 */
export function createComponentGpuAnalysisAsyncCapability(
  execute: ExecutePreparedComponentGpuAnalysisAsync,
): ComponentGpuAnalysisAsyncCapability {
  return {
    analyze(
      input: ComponentGpuAnalysisInput,
      options?: ComponentGpuAnalysisAsyncOptions,
    ) {
      const observer = options?.observer;
      if (!observer) {
        return execute(input);
      }
      return analyzeObservedWithPreparedComponent(execute, observer, input);
    },
  };
}
