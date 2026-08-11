import type * as GpuAnalysisFrameInterfaceModule from "../../../pkg/generated/gpu-analysis-frame/interfaces/millipede-inspector-gpu-analysis-frame";
import { requireGeneratedCapability } from "./shared";

export type GpuAnalysisFrameInterface = typeof GpuAnalysisFrameInterfaceModule;
export type GpuAnalysisFrameEncodedResult =
  GpuAnalysisFrameInterfaceModule.EncodedAnalysisFrame;

/**
 * Prepare the scheduler-owned shared-frame capability.
 *
 * The frame world deliberately remains isolated from the stable and JSPI
 * providers. Its required import surface omits encoder `finish` and
 * `gpu-queue`. Borrowing alone does not enforce that restriction: Rust
 * ownership, the host guard, and component-boundary integration tests preserve
 * it together. Keeping this generated path separate also prevents frame
 * preparation from loading either sibling world, while its authored operation
 * stays synchronous after explicit preparation.
 *
 * @returns A Promise resolving to the validated callable generated capability.
 */
export async function instantiateGpuAnalysisFrameComponent(): Promise<GpuAnalysisFrameInterface> {
  const module =
    await import("../../../pkg/generated/gpu-analysis-frame/inspector-component");
  return requireGeneratedCapability(
    module.gpuAnalysisFrame,
    "gpuAnalysisFrame",
    (capability) => typeof capability.encode === "function",
  );
}
