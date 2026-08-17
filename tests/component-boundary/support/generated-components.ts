/**
 * Typed loaders for the real JCO-transpiled component worlds.
 *
 * Preparation writes each world below `target/component-tests/generated` with
 * static imports of the compiled Node host. Loading through these URLs keeps
 * component code, host resources, and test observations inside Vitest's single
 * inlined module graph.
 */
import type {
  AnalysisPlan,
  AnalysisRequest,
} from "../fixtures/gpu-workload.js";
import type { SummaryReadbackDescriptor } from "../../../target/component-tests/host/gpu.js";

interface GpuLaneOutput {
  buffer: object;
  indirectBuffer: object;
}

export type AnalysisValidationErrorKind =
  | "invalid-request"
  | "texture-mismatch"
  | "truth-buffer-too-small";

export interface AnalysisValidationError {
  kind: AnalysisValidationErrorKind;
  message: string;
}

/** Shared generated outcome shape used by every product GPU world. */
export type GpuAnalysisOutcome<Success> =
  | {
      tag: "success";
      val: Success;
    }
  | {
      tag: "validation-error";
      val: AnalysisValidationError;
    };

/** Require the successful value in generated-world happy-path tests. */
export function unwrapGpuAnalysisSuccess<Success>(
  outcome: GpuAnalysisOutcome<Success>,
): Success {
  if (outcome.tag === "success") return outcome.val;
  throw new Error(
    `expected GPU analysis success, received ${outcome.val.kind}: ${outcome.val.message}`,
  );
}

export interface StableGpuDispatch {
  summary: SummaryReadbackDescriptor;
  visual: GpuLaneOutput;
  borderTrace: GpuLaneOutput;
  edgeDiscovery: GpuLaneOutput;
}

export interface AsyncGpuDispatch {
  summary: {
    textureWidth: number;
    textureHeight: number;
    nodeCount: number;
    nodes: Array<{
      nodeIndex: number;
      texelCount: number;
      inkCount: number;
      luminanceSum: number;
      meanLuminance: number;
    }>;
  };
  visual: GpuLaneOutput;
  borderTrace: GpuLaneOutput;
  edgeDiscovery: GpuLaneOutput;
}

export interface FrameGpuDispatch {
  summary: {
    plan: AnalysisPlan;
    byteLength: bigint;
  };
  visual: GpuLaneOutput;
  borderTrace: GpuLaneOutput;
  edgeDiscovery: GpuLaneOutput;
}

export interface StableGpuModuleExports {
  analyze(
    device: unknown,
    texture: unknown,
    truthBuffer: unknown,
    request: AnalysisRequest,
  ): GpuAnalysisOutcome<StableGpuDispatch>;
}

interface StableGpuModule {
  gpuAnalysis: StableGpuModuleExports;
}

export interface AsyncGpuModuleExports {
  analyze(
    device: unknown,
    texture: unknown,
    truthBuffer: unknown,
    request: AnalysisRequest,
  ): Promise<GpuAnalysisOutcome<AsyncGpuDispatch>>;
}

interface AsyncGpuModule {
  gpuAnalysisAsync: AsyncGpuModuleExports;
}

export interface FrameGpuModuleExports {
  encode(
    encoder: unknown,
    device: unknown,
    texture: unknown,
    truthBuffer: unknown,
    request: AnalysisRequest,
  ): GpuAnalysisOutcome<FrameGpuDispatch>;
}

interface FrameGpuModule {
  gpuAnalysisFrame: FrameGpuModuleExports;
}

export interface WasiAsyncBoundaryProofExports {
  proveAsyncFunc(value: number): Promise<number>;
  proveFuture(value: number): PromiseLike<number>;
  proveStream(value: string): Promise<AsyncIterable<number>>;
}

interface WasiAsyncBoundaryProofModule {
  wasiAsyncProofs: WasiAsyncBoundaryProofExports;
}

type GeneratedWorld =
  | "gpu-analysis"
  | "gpu-analysis-async"
  | "gpu-analysis-frame"
  | "boundary-proofs/wasi-async";

const generatedModuleUrl = (world: GeneratedWorld): string =>
  new URL(
    `../../../target/component-tests/generated/${world}/inspector-component.js`,
    import.meta.url,
  ).href;

const importGeneratedWorld = async <T>(world: GeneratedWorld): Promise<T> =>
  (await import(/* @vite-ignore */ generatedModuleUrl(world))) as T;

export const loadStableGpuModule = (): Promise<StableGpuModule> =>
  importGeneratedWorld<StableGpuModule>("gpu-analysis");

export const loadAsyncGpuModule = (): Promise<AsyncGpuModule> =>
  importGeneratedWorld<AsyncGpuModule>("gpu-analysis-async");

export const loadFrameGpuModule = (): Promise<FrameGpuModule> =>
  importGeneratedWorld<FrameGpuModule>("gpu-analysis-frame");

export const loadWasiAsyncBoundaryProofModule =
  (): Promise<WasiAsyncBoundaryProofModule> =>
    importGeneratedWorld<WasiAsyncBoundaryProofModule>(
      "boundary-proofs/wasi-async",
    );
