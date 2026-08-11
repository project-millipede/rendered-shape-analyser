import type * as GpuAnalysisInterfaceModule from "../../../pkg/generated/gpu-analysis/interfaces/millipede-inspector-gpu-analysis";
import { requireGeneratedCapability } from "./shared";

export type GpuAnalysisInterface = typeof GpuAnalysisInterfaceModule;

/**
 * Prepare the stable GPU-analysis capability through its generated provider.
 *
 * @returns A Promise resolving to the validated callable generated capability.
 */
export async function instantiateGpuAnalysisComponent(): Promise<GpuAnalysisInterface> {
  const module =
    await import("../../../pkg/generated/gpu-analysis/inspector-component");
  return requireGeneratedCapability(
    module.gpuAnalysis,
    "gpuAnalysis",
    (capability) => typeof capability.analyze === "function",
  );
}
