/**
 * Typed loaders for the real JCO-transpiled component worlds.
 *
 * Preparation writes each world below `target/component-tests/generated` with
 * static imports of the compiled Node host. Loading through these URLs keeps
 * component code, host resources, and test observations inside Vitest's single
 * inlined module graph.
 */
import type { LayoutNodeFixture } from "../fixtures/analysis-tree.js";
import type {
  AnalysisPlan,
  AnalysisRequest,
} from "../fixtures/gpu-workload.js";
import type { SummaryReadbackDescriptor } from "../../../target/component-tests/host/gpu.js";

interface TreeAggregates {
  nodeCount: number;
  maxDepth: number;
  ghostCount: number;
  totalArea: number;
  coverage: number;
}

interface GpuLaneOutput {
  buffer: object;
  indirectBuffer: object;
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

export interface AnalysisModuleExports {
  ping(message: string): string;
  setParams(paramsJson: string): void;
  analyzeTree(
    nodes: LayoutNodeFixture[],
    textureWidth: number,
    textureHeight: number,
  ): TreeAggregates;
}

interface AnalysisModule {
  analysis: AnalysisModuleExports;
}

export interface StableGpuModuleExports {
  analyze(
    device: unknown,
    texture: unknown,
    truthBuffer: unknown,
    request: AnalysisRequest,
  ): StableGpuDispatch;
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
  ): Promise<AsyncGpuDispatch>;
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
  ): FrameGpuDispatch;
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
  | "analysis"
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

export const loadAnalysisModule = (): Promise<AnalysisModule> =>
  importGeneratedWorld<AnalysisModule>("analysis");

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
