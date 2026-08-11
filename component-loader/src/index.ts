/**
 * Common authored contracts for `@millipede/inspector-component`.
 *
 * Runtime capability loaders live at explicit package subpaths. Keeping this
 * root entry value-free prevents it from making unselected generated worlds
 * reachable through a shared runtime barrel.
 */

export type {
  ComponentCapabilityLoader,
  ComponentCapabilityPrepareResult,
  ComponentCapabilityState,
  ComponentUnsupportedReason,
} from "./capability";
export type {
  AnalysisDispatch,
  AnalysisKernel,
  AnalysisPlan,
  AnalysisSummaryNodeStats,
  AnalysisSummaryResult,
  ComponentGpuAnalysisBorderTraceOutput,
  ComponentGpuAnalysisCommandBuffer,
  ComponentGpuAnalysisEdgeDiscoveryOutput,
  ComponentGpuAnalysisInput,
  ComponentGpuAnalysisOutput,
  ComponentGpuAnalysisSubmission,
  ComponentGpuAnalysisSummaryBuffers,
  ComponentGpuAnalysisVisualBuffers,
  ComponentGpuAnalysisVisualOutput,
  ComponentGpuFrameEncodedOutput,
  ComponentGpuFramePendingSummary,
  ComponentGpuFrameSubmission,
  ComponentGpuSummaryResolveInput,
  ComponentGpuSummaryResolver,
} from "./host/gpu-types";
export type {
  ComponentGpuAnalysisInvocationEvent,
  ComponentGpuAnalysisObserver,
  ComponentGpuAnalysisVariant,
} from "./gpu-analysis-observer";

/** Guest log level accepted by the generated host-log import. */
export type GuestLogLevel = "debug" | "info" | "warn" | "error";
