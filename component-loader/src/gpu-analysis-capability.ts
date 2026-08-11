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
  ComponentGpuSummaryResolver,
} from "./host/gpu-types";

/** Per-call dependencies for one stable component GPU analysis. */
export interface ComponentGpuAnalysisOptions {
  /** Device-local compact-summary decoder for this exact invocation. */
  readonly summaryResolver: ComponentGpuSummaryResolver;
  /** Optional observer around normal execution after readiness. */
  readonly observer?: ComponentGpuAnalysisObserver;
}

/** Ready stable GPU-analysis capability exposed to browser integrations. */
export interface ComponentGpuAnalysisCapability {
  /** Execute one prepared stable analysis on caller-owned browser resources. */
  readonly analyze: (
    input: ComponentGpuAnalysisInput,
    options: ComponentGpuAnalysisOptions,
  ) => Promise<ComponentGpuAnalysisOutput>;
}

/** Already-prepared stable operation captured behind an authored capability. */
export type ExecutePreparedComponentGpuAnalysis = (
  input: ComponentGpuAnalysisInput,
  summaryResolver: ComponentGpuSummaryResolver,
) => Promise<ComponentGpuAnalysisOutput>;

/** Execute one stable call while reporting its post-readiness boundary. */
const executeObservedComponentGpuAnalysis = async (
  execute: ExecutePreparedComponentGpuAnalysis,
  observer: ComponentGpuAnalysisObserver,
  input: ComponentGpuAnalysisInput,
  summaryResolver: ComponentGpuSummaryResolver,
): Promise<ComponentGpuAnalysisOutput> => {
  notifyComponentGpuAnalysisStarted(observer, "stable", input.entryId);
  try {
    const output = await execute(input, summaryResolver);
    notifyComponentGpuAnalysisReturned(observer, "stable", input.entryId);
    return output;
  } catch (caught) {
    const error = normalizeCaughtError(
      caught,
      "stable component invocation threw an unreadable value",
    );
    notifyComponentGpuAnalysisThrew(observer, "stable", input.entryId, error);
    throw caught;
  }
};

/**
 * Bind one prepared stable operation to the public invocation contract.
 *
 * This function performs no provider work. It exists separately so tests can
 * prove that execution routes the call-local resolver and observer without
 * re-entering preparation.
 */
export function createComponentGpuAnalysisCapability(
  execute: ExecutePreparedComponentGpuAnalysis,
): ComponentGpuAnalysisCapability {
  return {
    analyze(
      input: ComponentGpuAnalysisInput,
      options: ComponentGpuAnalysisOptions,
    ) {
      const observer = options.observer;
      if (!observer) {
        return execute(input, options.summaryResolver);
      }
      return executeObservedComponentGpuAnalysis(
        execute,
        observer,
        input,
        options.summaryResolver,
      );
    },
  };
}
