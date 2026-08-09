/**
 * Typed records shared by the generated-component WebGPU host.
 *
 * These types describe only the upstream surface exercised by the component
 * integration tests. They intentionally do not model browser WebGPU
 * execution.
 */

export type ForeignGpuDevice = object;

export interface ForeignGpuTexture {
  label?: string;
  width: number;
  height: number;
}

export interface GpuBufferUsage {
  mapRead?: boolean;
  mapWrite?: boolean;
  copySrc?: boolean;
  copyDst?: boolean;
  index?: boolean;
  vertex?: boolean;
  uniform?: boolean;
  storage?: boolean;
  indirect?: boolean;
  queryResolve?: boolean;
}

export interface ForeignGpuBuffer {
  label?: string;
  mappedAtCreation?: boolean;
  size: number;
  usage?: GpuBufferUsage;
}

export interface GpuBufferDescriptor {
  label?: string;
  mappedAtCreation?: boolean;
  size: bigint;
  usage: GpuBufferUsage;
}

export interface GpuShaderModuleDescriptor {
  label?: string;
  code: string;
  compilationHints?: readonly unknown[];
}

export interface GpuBindGroupLayoutEntry {
  binding: number;
  visibility?: unknown;
  buffer?: unknown;
  sampler?: unknown;
  texture?: unknown;
  storageTexture?: unknown;
}

export interface GpuBindGroupLayoutDescriptor {
  label?: string;
  entries: GpuBindGroupLayoutEntry[];
}

export interface GpuBufferBindingResource {
  tag: "gpu-buffer";
  val: object;
}

export interface GpuTextureBindingResource {
  tag: "gpu-texture";
  val: object;
}

export interface UnsupportedGpuBindingResource {
  tag: string;
  val?: unknown;
}

export type GpuBindingResource =
  | GpuBufferBindingResource
  | GpuTextureBindingResource
  | UnsupportedGpuBindingResource;

export interface GpuBindGroupEntry {
  binding: number;
  resource: GpuBindingResource;
}

export interface GpuBindGroupDescriptor {
  label?: string;
  layout: object;
  entries: GpuBindGroupEntry[];
}

export interface SpecificGpuLayoutMode {
  tag: "specific";
  val: object;
}

export interface OtherGpuLayoutMode {
  tag: string;
  val?: unknown;
}

export type GpuLayoutMode = SpecificGpuLayoutMode | OtherGpuLayoutMode;

export interface GpuPipelineLayoutDescriptor {
  label?: string;
  bindGroupLayouts: Array<object | undefined>;
  immediateSize?: number;
}

export interface GpuComputePipelineDescriptor {
  label?: string;
  layout: GpuLayoutMode;
  compute: {
    module: object;
    entryPoint?: string;
    constants?: unknown;
  };
}

export interface GpuCommandEncoderDescriptor {
  label?: string;
}

export interface GpuComputePassDescriptor {
  label?: string;
  timestampWrites?: unknown;
}

export interface GpuCommandBufferDescriptor {
  label?: string;
}

export interface GpuMapMode {
  read?: boolean;
  write?: boolean;
}

export type AnalyzerPipelineRole =
  | "visual"
  | "stats"
  | "border-trace"
  | "edge-discovery";

export type AnalyzerBindGroupKind = AnalyzerPipelineRole;

export interface DeviceRecord {
  device: ForeignGpuDevice;
  errorScopes: string[];
}

export interface TextureRecord {
  texture: ForeignGpuTexture;
  device: ForeignGpuDevice;
}

export interface MappedRangeRecord {
  offset: number;
  size: number;
  bytes: Uint8Array;
}

export interface BufferRecord {
  buffer: ForeignGpuBuffer;
  device: ForeignGpuDevice;
  mapped: MappedRangeRecord | null;
}

export interface QueueRecord {
  queue: object;
  device: ForeignGpuDevice;
}

export interface DispatchRecord {
  pipelineRole: AnalyzerPipelineRole;
  pipelineEntryPoint: string | null;
  workgroupCountX: number;
  workgroupCountY: number | undefined;
  workgroupCountZ: number | undefined;
}

export interface SummaryCopyRecord {
  source: ForeignGpuBuffer;
  sourceOffset: bigint | undefined;
  destination: ForeignGpuBuffer;
  destinationOffset: bigint | undefined;
  size: bigint | undefined;
}

export interface AnalyzerResourceRecord {
  device: ForeignGpuDevice;
  texture: ForeignGpuTexture;
  buffer: ForeignGpuBuffer;
  summaryBuffer: ForeignGpuBuffer;
  visualBuffer: ForeignGpuBuffer;
  visualIndirectBuffer: ForeignGpuBuffer;
  borderTraceBuffer: ForeignGpuBuffer;
  borderTraceIndirectBuffer: ForeignGpuBuffer;
  edgeDiscoveryBuffer: ForeignGpuBuffer;
  edgeDiscoveryIndirectBuffer: ForeignGpuBuffer;
}

export interface CommandRecord extends AnalyzerResourceRecord {
  dispatches: DispatchRecord[];
  copiedSummary: SummaryCopyRecord;
  label: string;
}

export interface CommandBufferRecord extends CommandRecord {
  submission: CommandRecord | null;
}

export interface CommandEncoderRecord {
  device: ForeignGpuDevice;
  label: string;
  /** Number of compute passes successfully opened on this encoder. */
  computePassBegins: number;
  /** Number of compute passes successfully ended on this encoder. */
  computePassEnds: number;
  /** Whether one compute pass currently owns command recording. */
  computePassOpen: boolean;
  texture: ForeignGpuTexture | null;
  buffer: ForeignGpuBuffer | null;
  summaryBuffer: ForeignGpuBuffer | null;
  visualBuffer: ForeignGpuBuffer | null;
  visualIndirectBuffer: ForeignGpuBuffer | null;
  borderTraceBuffer: ForeignGpuBuffer | null;
  borderTraceIndirectBuffer: ForeignGpuBuffer | null;
  edgeDiscoveryBuffer: ForeignGpuBuffer | null;
  edgeDiscoveryIndirectBuffer: ForeignGpuBuffer | null;
  dispatches: DispatchRecord[];
  copiedSummary: SummaryCopyRecord | false;
  activePipelineRole?: AnalyzerPipelineRole;
}

export interface ComputePassRecord {
  device: ForeignGpuDevice;
  encoder: object;
  label: string;
  /** Prevent one pass handle from ending more than once. */
  ended: boolean;
  activePipelineRole: AnalyzerPipelineRole | null;
  activePipelineEntryPoint: string | null;
}

export interface ShaderModuleRecord {
  device: ForeignGpuDevice;
  descriptor: GpuShaderModuleDescriptor;
}

export interface BindGroupLayoutRecord {
  device: ForeignGpuDevice;
  role: AnalyzerPipelineRole;
  descriptor: GpuBindGroupLayoutDescriptor;
}

export interface PipelineLayoutRecord {
  device: ForeignGpuDevice;
  role: AnalyzerPipelineRole;
  descriptor: GpuPipelineLayoutDescriptor;
}

export interface ComputePipelineRecord {
  device: ForeignGpuDevice;
  role: AnalyzerPipelineRole;
  entryPoint: string;
}

export interface BindGroupRecord {
  kind: AnalyzerBindGroupKind;
  device: ForeignGpuDevice;
  texture: ForeignGpuTexture | null;
  buffer: ForeignGpuBuffer | null;
  summaryBuffer: ForeignGpuBuffer | null;
  visualBuffer: ForeignGpuBuffer | null;
  visualIndirectBuffer: ForeignGpuBuffer | null;
  borderTraceBuffer: ForeignGpuBuffer | null;
  borderTraceIndirectBuffer: ForeignGpuBuffer | null;
  edgeDiscoveryBuffer: ForeignGpuBuffer | null;
  edgeDiscoveryIndirectBuffer: ForeignGpuBuffer | null;
}

export interface PipelineCreateObservation {
  device: ForeignGpuDevice;
  role: AnalyzerPipelineRole;
  entryPoint: string;
  label: string | undefined;
}

export interface OutputCreateObservation {
  device: ForeignGpuDevice;
  buffer: ForeignGpuBuffer;
  label: string | undefined;
}

export interface IndirectOutputCreateObservation extends OutputCreateObservation {
  indirectBuffer: ForeignGpuBuffer;
}

export interface BufferMapObservation {
  device: ForeignGpuDevice;
  buffer: ForeignGpuBuffer;
  offset: number;
  size: number;
}

export interface BufferUnmapObservation {
  device: ForeignGpuDevice;
  buffer: ForeignGpuBuffer;
}

export interface QueueSubmitObservation extends AnalyzerResourceRecord {}
