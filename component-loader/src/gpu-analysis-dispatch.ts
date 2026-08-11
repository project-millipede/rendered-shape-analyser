import type {
  AnalysisDispatch,
  ComponentGpuAnalysisInput,
} from "./host/gpu-types";

/**
 * Build the request metadata forwarded into one selected Rust GPU export.
 *
 * Stable, async, and shared-frame execution deliberately use this one record
 * shape. The browser adapter reads only synchronous texture metadata here;
 * Rust validates that metadata again against the supplied WIT resource
 * handles before it plans or dispatches analyzer work.
 *
 * @param input - Caller-owned WebGPU resources and analysis metadata.
 * @returns Component GPU-analysis dispatch record.
 */
export const createComponentGpuAnalysisDispatch = (
  input: ComponentGpuAnalysisInput,
): AnalysisDispatch => ({
  entryId: input.entryId,
  displayName: input.displayName,
  textureWidth: input.texture.width,
  textureHeight: input.texture.height,
  nodeCount: input.nodeCount,
});
