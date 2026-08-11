import type * as AnalysisModule from "../../../pkg/generated/analysis/inspector-component";
import { requireGeneratedCapability } from "./shared";

export type AnalysisInterface = typeof AnalysisModule.analysis;
export type NodeRecord = AnalysisModule.analysis.NodeRecord;
export type TreeStats = AnalysisModule.analysis.TreeStats;

/**
 * Prepare the browser-safe analysis capability through its generated provider.
 *
 * @returns A Promise resolving to the validated callable generated capability.
 */
export async function instantiateAnalysisComponent(): Promise<AnalysisInterface> {
  const module =
    await import("../../../pkg/generated/analysis/inspector-component");
  return requireGeneratedCapability(
    module.analysis,
    "analysis",
    (capability) =>
      typeof capability.ping === "function" &&
      typeof capability.setParams === "function" &&
      typeof capability.analyzeTree === "function",
  );
}
