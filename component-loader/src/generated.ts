import type * as AnalysisModule from "../../pkg/generated/analysis/inspector-component";
import type * as GpuAnalysisInterfaceModule from "../../pkg/generated/gpu-analysis/interfaces/millipede-inspector-gpu-analysis";
import type * as GpuAnalysisAsyncInterfaceModule from "../../pkg/generated/gpu-analysis-async/interfaces/millipede-inspector-gpu-analysis-async";
import type * as GpuAnalysisFrameInterfaceModule from "../../pkg/generated/gpu-analysis-frame/interfaces/millipede-inspector-gpu-analysis-frame";
import type * as WasiAsyncProofsModule from "../../pkg/generated/wasi-0.3/inspector-component";
import type { PrivatePreparedComponent } from "./capability";

export type AnalysisInterface = typeof AnalysisModule.analysis;

export type GpuAnalysisInterface = typeof GpuAnalysisInterfaceModule;

export type GpuAnalysisAsyncInterface = typeof GpuAnalysisAsyncInterfaceModule;

export type GpuAnalysisFrameInterface = typeof GpuAnalysisFrameInterfaceModule;
export type GpuAnalysisFrameEncodedResult =
  GpuAnalysisFrameInterfaceModule.EncodedAnalysisFrame;

type RawWasiAsyncProofsInterface = typeof WasiAsyncProofsModule.wasiAsyncProofs;
export type WasiAsyncProofsInterface = Omit<
  RawWasiAsyncProofsInterface,
  "proveStream"
> & {
  proveStream(label: string): Promise<AsyncIterable<number>>;
};

export type NodeRecord = AnalysisModule.analysis.NodeRecord;
export type TreeStats = AnalysisModule.analysis.TreeStats;

/** Normalize the current generated JSPI stream shape for authored callers. */
const adaptWasiAsyncProofs = (
  proofs: RawWasiAsyncProofsInterface | undefined,
): WasiAsyncProofsInterface | undefined => {
  if (!proofs) return undefined;
  if (typeof proofs.proveAsyncFunc !== "function") return undefined;
  if (typeof proofs.proveFuture !== "function") return undefined;
  if (typeof proofs.proveStream !== "function") return undefined;

  return {
    proveAsyncFunc: proofs.proveAsyncFunc,
    proveFuture: proofs.proveFuture,
    // The generated declaration presents an AsyncIterable directly, while
    // this JSPI export resolves it through an outer Promise.
    proveStream: async (label: string) => proofs.proveStream(label),
  };
};

/** Provider cleanup used by the current generated ESM compatibility path. */
const disposeGeneratedComponent = (): Promise<void> => Promise.resolve();

/**
 * Normalize one required generated export behind the private provider shape.
 *
 * @param capability - Required callable export from one selected world.
 * @param exportName - Stable diagnostic name for a missing export.
 * @param isCallable - World-specific callable-interface validation.
 * @returns Provider-owned prepared component for the authored loader.
 */
const requireGeneratedCapability = <Capability>(
  capability: Capability | undefined,
  exportName: string,
  isCallable: (candidate: Capability) => boolean,
): PrivatePreparedComponent<Capability> => {
  if (!capability || !isCallable(capability)) {
    throw new Error(
      `generated component is missing or has an invalid ${exportName} export`,
    );
  }
  return {
    capability,
    dispose: disposeGeneratedComponent,
  };
};

/**
 * Prepare the browser-safe analysis capability through the current provider.
 *
 * 1. Keeps `index.ts` independent from generated file layout details.
 * 2. Uses an extensionless authored TypeScript specifier.
 * 3. Lets the loader build rewrite the emitted runtime specifier to `.js`.
 *
 * @returns A normalized callable capability and private provider cleanup.
 */
export function instantiateAnalysisComponent(): Promise<
  PrivatePreparedComponent<AnalysisInterface>
> {
  return import("../../pkg/generated/analysis/inspector-component").then(
    (module) =>
      requireGeneratedCapability(
        module.analysis,
        "analysis",
        (capability) =>
          typeof capability.ping === "function" &&
          typeof capability.setParams === "function" &&
          typeof capability.analyzeTree === "function",
      ),
  );
}

/**
 * Prepare the stable GPU-analysis capability through the current provider.
 *
 * 1. Keeps the stable GPU-analysis world behind the local generated adapter.
 * 2. Uses an extensionless authored TypeScript specifier.
 * 3. Lets the loader build rewrite the emitted runtime specifier to `.js`.
 *
 * @returns A normalized callable capability and private provider cleanup.
 */
export function instantiateGpuAnalysisComponent(): Promise<
  PrivatePreparedComponent<GpuAnalysisInterface>
> {
  return import("../../pkg/generated/gpu-analysis/inspector-component").then(
    (module) =>
      requireGeneratedCapability(
        module.gpuAnalysis,
        "gpuAnalysis",
        (capability) => typeof capability.analyze === "function",
      ),
  );
}

/**
 * Prepare the Chrome/JSPI-only capability through the current provider.
 *
 * 1. Keeps the async GPU-analysis world behind the local generated adapter.
 * 2. Uses an extensionless authored TypeScript specifier.
 * 3. Lets the loader build rewrite the emitted runtime specifier to `.js`.
 *
 * @returns A normalized callable capability and private provider cleanup.
 */
export function instantiateGpuAnalysisAsyncComponent(): Promise<
  PrivatePreparedComponent<GpuAnalysisAsyncInterface>
> {
  return import("../../pkg/generated/gpu-analysis-async/inspector-component").then(
    (module) =>
      requireGeneratedCapability(
        module.gpuAnalysisAsync,
        "gpuAnalysisAsync",
        (capability) => typeof capability.analyze === "function",
      ),
  );
}

/**
 * Prepare the scheduler-owned shared-frame capability.
 *
 * The current compiled artifact has a distinct WIT world whose required import
 * surface omits encoder `finish` and `gpu-queue`. Borrowing alone does not
 * guarantee that restriction: the Rust ownership contract, host guard, and
 * component-boundary integration proof keep those imports absent. Keeping
 * this generated path separate lets the loader instantiate the frame world
 * lazily without coupling it to stable or JSPI module loading.
 *
 * @returns A normalized callable capability and private provider cleanup.
 */
export function instantiateGpuAnalysisFrameComponent(): Promise<
  PrivatePreparedComponent<GpuAnalysisFrameInterface>
> {
  return import("../../pkg/generated/gpu-analysis-frame/inspector-component").then(
    (module) =>
      requireGeneratedCapability(
        module.gpuAnalysisFrame,
        "gpuAnalysisFrame",
        (capability) => typeof capability.encode === "function",
      ),
  );
}

/**
 * Prepare the WASI 0.3 async-proof capability through the current provider.
 *
 * 1. Keeps proof-only generated module layout out of the public loader.
 * 2. Uses an extensionless authored TypeScript specifier.
 * 3. Lets the loader build rewrite the emitted runtime specifier to `.js`.
 *
 * @returns A normalized callable capability and private provider cleanup.
 */
export function instantiateWasiAsyncProofsComponent(): Promise<
  PrivatePreparedComponent<WasiAsyncProofsInterface>
> {
  return import("../../pkg/generated/wasi-0.3/inspector-component").then(
    (module) => {
      const capability = adaptWasiAsyncProofs(module.wasiAsyncProofs);
      return requireGeneratedCapability(
        capability,
        "wasiAsyncProofs",
        (capability) =>
          typeof capability.proveAsyncFunc === "function" &&
          typeof capability.proveFuture === "function" &&
          typeof capability.proveStream === "function",
      );
    },
  );
}
