/**
 * Shared TypeScript shapes for component-backed GPU analyzer host workflows.
 *
 * These types are not a second WIT source of truth. Records that cross the
 * component boundary must stay assignable to the jco-generated declarations
 * from `wit/*.wit`; the type-level checks at the bottom of this file make
 * TypeScript fail if the documented public mirrors drift.
 */

import type * as GeneratedHostGpu from "../../../pkg/generated/gpu-analysis/interfaces/millipede-inspector-host-gpu";
import type * as GeneratedGpuAnalysisAsync from "../../../pkg/generated/gpu-analysis-async/interfaces/millipede-inspector-gpu-analysis-async";
import type * as GeneratedFrameHostGpu from "../../../pkg/generated/gpu-analysis-frame/interfaces/millipede-inspector-host-gpu";

/**
 * Backend-neutral aggregate statistics for one ground-truth node.
 */
export interface AnalysisSummaryNodeStats {
  /** Index of the node inside the ground-truth buffer's node array. */
  nodeIndex: number;
  /** Number of captured texels assigned to this node by the analyzer kernel. */
  texelCount: number;
  /** Number of assigned texels treated as visible ink by the analyzer kernel. */
  inkCount: number;
  /** Sum of per-texel luminance values after decoding the GPU summary buffer. */
  luminanceSum: number;
  /** Average luminance for this node, or zero when the node has no assigned texels. */
  meanLuminance: number;
}

/**
 * Complete analysis summary for one inspector entry.
 */
export interface AnalysisSummaryResult {
  /** Inspector entry id that produced this summary. */
  entryId: string;
  /** Width of the captured texture analyzed by the backend, in texels. */
  textureWidth: number;
  /** Height of the captured texture analyzed by the backend, in texels. */
  textureHeight: number;
  /** Number of ground-truth nodes available to the analysis run. */
  nodeCount: number;
  /** Per-node aggregate statistics, ordered by ground-truth node index. */
  nodes: AnalysisSummaryNodeStats[];
}

/**
 * Metadata supplied by the Rust component for one GPU dispatch.
 */
export interface AnalysisDispatch {
  /** Inspector entry id used for summary correlation. */
  entryId: string;
  /** Human-readable component name used only for labels/logging. */
  displayName: string;
  /** Captured texture width in texels. */
  textureWidth: number;
  /** Captured texture height in texels. */
  textureHeight: number;
  /** Number of valid component-reference nodes encoded in the reference buffer. */
  nodeCount: number;
}

/** Analyzer kernel selected by the Rust component. */
export type AnalysisKernel = "per-component-stats-v1";

/**
 * Rust-owned execution plan for one GPU analyzer dispatch.
 */
export interface AnalysisPlan {
  /** Original request metadata supplied by the website. */
  request: AnalysisDispatch;
  /** Analyzer kernel the host must run. */
  kernel: AnalysisKernel;
  /** X dimension of the WGSL workgroup selected by Rust. */
  workgroupSizeX: number;
  /** Y dimension of the WGSL workgroup selected by Rust. */
  workgroupSizeY: number;
  /** Number of workgroups Rust wants to dispatch in X. */
  dispatchWorkgroupsX: number;
  /** Number of workgroups Rust wants to dispatch in Y. */
  dispatchWorkgroupsY: number;
  /** Number of u32 summary words written per ground-truth node. */
  summaryWordsPerNode: number;
  /** Byte stride of one node's compact summary record. */
  summaryNodeStrideBytes: number;
  /** Texel width and height of one pixel-derived edge-discovery tile. */
  edgeDiscoveryTileSize: number;
  /** Fixed-point edge threshold used by the pixel-derived discovery lane. */
  edgeDiscoveryThresholdMilli: number;
  /** Number of renderer-facing pixel-derived edge-discovery output slots. */
  edgeDiscoverySlotCapacity: number;
}

/**
 * GPU resources and metadata needed to run one component-backed analysis.
 */
export interface ComponentGpuAnalysisInput {
  /** Inspector entry id used for labels and summary correlation. */
  entryId: string;
  /** Human-readable component name used only for GPU/debug labels. */
  displayName: string;
  /** Shared inspector device that owns `texture` and `truthBuffer`. */
  device: GPUDevice;
  /** Captured-pixel texture for the entry, owned by `device`. */
  texture: GPUTexture;
  /** Ground-truth storage component-reference buffer for training/evaluation mode. */
  truthBuffer: GPUBuffer;
  /** Number of valid nodes encoded in `truthBuffer`. */
  nodeCount: number;
}

/**
 * Resolver-facing view over Rust-created upstream summary buffers.
 */
export interface ComponentGpuAnalysisSummaryBuffers {
  /** Rust or local plan this summary view was validated against. */
  plan: AnalysisPlan;
  /** Rust-created upstream buffer bound as the kernel's compact summary output. */
  summaryBuffer: GPUBuffer;
  /** Rust-created upstream staging buffer used for compact summary readback. */
  summaryStagingBuffer: GPUBuffer;
  /** Byte length of both summary and staging buffers. */
  summaryByteLength: number;
}

/**
 * Renderer-facing view over Rust-created upstream visual output.
 */
export interface ComponentGpuAnalysisVisualBuffers {
  /** Rust or local plan this visual view was validated against. */
  plan: AnalysisPlan;
  /** Rust-created upstream GPU-only buffer bound as visual output. */
  visualBuffer: GPUBuffer;
  /** Byte length of the visual buffer. */
  visualByteLength: number;
  /** Maximum number of visual record slots allocated in `visualBuffer`. */
  visualSlotCapacity: number;
}

/**
 * GPU-resident visual output returned by the Rust component.
 */
export interface ComponentGpuAnalysisVisualOutput {
  /** Browser GPU buffer returned through an upstream `gpu-buffer` handle. */
  buffer: GPUBuffer;
  /** Browser GPU buffer containing non-indexed indirect draw arguments. */
  indirectBuffer: GPUBuffer;
}

/**
 * GPU-resident 2D border-trace output returned by the Rust component.
 */
export interface ComponentGpuAnalysisBorderTraceOutput {
  /** Browser GPU buffer returned through an upstream `gpu-buffer` handle. */
  buffer: GPUBuffer;
  /** Browser GPU buffer containing non-indexed indirect draw arguments. */
  indirectBuffer: GPUBuffer;
}

/**
 * GPU-resident pixel-derived edge-discovery output returned by the Rust component.
 */
export interface ComponentGpuAnalysisEdgeDiscoveryOutput {
  /** Browser GPU buffer returned through an upstream `gpu-buffer` handle. */
  buffer: GPUBuffer;
  /** Browser GPU buffer containing non-indexed indirect draw arguments. */
  indirectBuffer: GPUBuffer;
}

/**
 * Complete component-backed analyzer output returned to website code.
 */
export interface ComponentGpuAnalysisOutput {
  /** CPU-readable diagnostic summary resolved from the compact staging buffer. */
  summary: AnalysisSummaryResult;
  /** GPU-resident visual output returned as an upstream buffer handle. */
  visual: ComponentGpuAnalysisVisualOutput;
  /** Separate GPU-resident 2D border-trace output returned as an upstream buffer handle. */
  borderTrace: ComponentGpuAnalysisBorderTraceOutput;
  /** Separate GPU-resident pixel-derived edge-discovery output returned as an upstream buffer handle. */
  edgeDiscovery: ComponentGpuAnalysisEdgeDiscoveryOutput;
}

/**
 * Scheduler submission metadata supplied after a shared frame is queued.
 */
export interface ComponentGpuFrameSubmission {
  /**
   * Validation scope covering component encoding, browser rendering, finish,
   * and the shared queue submission.
   */
  validation: Promise<GPUError | null>;
  /** Human-readable validation phase used in summary errors. */
  validationPhase: string;
}

/**
 * Compact summary whose GPU copy was encoded but not submitted when returned.
 */
export interface ComponentGpuFramePendingSummary {
  /**
   * Transfer summary buffers to the call-local decoder after successful
   * scheduler submission.
   */
  resolveAfterSubmit(
    submission: ComponentGpuFrameSubmission,
  ): Promise<AnalysisSummaryResult>;
  /**
   * Destroy unsubmitted summary resources after a frame aborts.
   *
   * This method is idempotent. It must not be called after
   * `resolveAfterSubmit()` has transferred ownership to the decoder.
   */
  dispose(): void;
}

/**
 * Shared-frame output available synchronously after Rust appends commands.
 *
 * Buffer identities are immediately usable by the render-pass encoder, while
 * their contents become valid only after the scheduler submits the frame.
 */
export interface ComponentGpuFrameEncodedOutput {
  /** Pending compact summary readback. */
  summary: ComponentGpuFramePendingSummary;
  /** GPU-resident rectangle visual output. */
  visual: ComponentGpuAnalysisVisualOutput;
  /** GPU-resident reference-guided border trace. */
  borderTrace: ComponentGpuAnalysisBorderTraceOutput;
  /** GPU-resident pixel-derived edge discovery and wavelet output. */
  edgeDiscovery: ComponentGpuAnalysisEdgeDiscoveryOutput;
}

/**
 * Host-owned encoded command buffer for one analyzer plan.
 */
export interface ComponentGpuAnalysisCommandBuffer {
  /** Browser command buffer ready for queue submission. */
  commandBuffer: GPUCommandBuffer;
  /** Validation promise covering bind-group and command-encoding work. */
  validation: Promise<GPUError | null>;
  /** Human-readable validation phase label used in diagnostics. */
  validationPhase: string;
}

/**
 * Host-owned marker for one submitted analyzer workload.
 */
export interface ComponentGpuAnalysisSubmission {
  /** Rust or local plan this submission was created for. */
  plan: AnalysisPlan;
  /** Validation promise inherited from command encoding. */
  commandValidation: Promise<GPUError | null>;
  /** Human-readable command-validation phase label used in diagnostics. */
  commandValidationPhase: string;
  /** Validation promise covering queue submission work. */
  validation: Promise<GPUError | null>;
  /** Human-readable validation phase label used in diagnostics. */
  validationPhase: string;
}

/**
 * GPU resources, submitted workload, and Rust-selected plan for summary readback.
 */
export interface ComponentGpuSummaryResolveInput extends ComponentGpuAnalysisInput {
  /** Rust-owned execution plan validated by the component host shim. */
  plan: AnalysisPlan;
  /** View over Rust-created summary buffers copied before resolution. */
  summaryBuffers: ComponentGpuAnalysisSummaryBuffers;
  /** Host-owned submission marker created after queue submit. */
  submission: ComponentGpuAnalysisSubmission;
}

/**
 * Summary resolver supplied by one prepared website adapter call.
 *
 * The stable component path receives a Rust-created staging-buffer descriptor
 * synchronously and the loader resolves this promise outside the component
 * boundary. The async sibling no longer uses this resolver; it maps and
 * decodes the compact staging buffer through upstream `gpu-buffer` methods
 * inside Rust.
 */
export type ComponentGpuSummaryResolver = (
  input: ComponentGpuSummaryResolveInput,
) => Promise<AnalysisSummaryResult>;

type AssertAssignable<Actual extends Expected, Expected> = true;

type AnalysisDispatchMatchesGenerated = AssertAssignable<
  AnalysisDispatch,
  GeneratedHostGpu.AnalysisDispatch
> &
  AssertAssignable<GeneratedHostGpu.AnalysisDispatch, AnalysisDispatch>;

type AnalysisKernelMatchesGenerated = AssertAssignable<
  AnalysisKernel,
  GeneratedHostGpu.AnalysisKernel
> &
  AssertAssignable<GeneratedHostGpu.AnalysisKernel, AnalysisKernel>;

type AnalysisPlanMatchesGenerated = AssertAssignable<
  AnalysisPlan,
  GeneratedHostGpu.AnalysisPlan
> &
  AssertAssignable<GeneratedHostGpu.AnalysisPlan, AnalysisPlan>;

type AnalysisSummaryNodeStatsMatchesGenerated = AssertAssignable<
  AnalysisSummaryNodeStats,
  GeneratedGpuAnalysisAsync.AnalysisSummaryNodeStats
> &
  AssertAssignable<
    GeneratedGpuAnalysisAsync.AnalysisSummaryNodeStats,
    AnalysisSummaryNodeStats
  >;

// `gpu-analysis-async` omits `entry-id` from the raw JSPI return record so
// generated jco output does not need to lift a string from a large async
// return payload. The authored loader reattaches `entryId` from the original
// request before exposing `AnalysisSummaryResult` to package consumers.
type GeneratedAsyncSummaryPayload = Omit<AnalysisSummaryResult, "entryId">;

type AnalysisSummaryResultMatchesGenerated = AssertAssignable<
  GeneratedAsyncSummaryPayload,
  GeneratedGpuAnalysisAsync.AnalysisSummaryResult
> &
  AssertAssignable<
    GeneratedGpuAnalysisAsync.AnalysisSummaryResult,
    GeneratedAsyncSummaryPayload
  >;

type AnalysisFramePlanMatchesGenerated = AssertAssignable<
  AnalysisPlan,
  GeneratedFrameHostGpu.AnalysisPlan
> &
  AssertAssignable<GeneratedFrameHostGpu.AnalysisPlan, AnalysisPlan>;
