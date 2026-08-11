import type * as GpuAnalysisAsyncInterfaceModule from "../../../pkg/generated/gpu-analysis-async/interfaces/millipede-inspector-gpu-analysis-async";
import { requireGeneratedCapability } from "./shared";

export type GpuAnalysisAsyncInterface = typeof GpuAnalysisAsyncInterfaceModule;

/**
 * Prepare the JSPI GPU-analysis capability through its generated provider.
 *
 * @returns A Promise resolving to the validated callable generated capability.
 */
export async function instantiateGpuAnalysisAsyncComponent(): Promise<GpuAnalysisAsyncInterface> {
  const module =
    await import("../../../pkg/generated/gpu-analysis-async/inspector-component");
  return requireGeneratedCapability(
    module.gpuAnalysisAsync,
    "gpuAnalysisAsync",
    (capability) => typeof capability.analyze === "function",
  );
}
