import { classifyTestBindGroupLayout } from "./bindings.js";
import {
  requireTestGpuBindGroupLayout,
  requireTestGpuPipelineLayout,
  requireTestGpuShaderModule,
  storeTestGpuBindGroupLayout,
  storeTestGpuComputePipeline,
  storeTestGpuPipelineLayout,
  storeTestGpuShaderModule,
} from "./registry.js";
import type {
  AnalyzerPipelineRole,
  ForeignGpuDevice,
  GpuBindGroupLayoutDescriptor,
  GpuComputePipelineDescriptor,
  GpuLayoutMode,
  GpuPipelineLayoutDescriptor,
  GpuShaderModuleDescriptor,
} from "./records.js";
import {
  GpuBindGroupLayout,
  GpuComputePipeline,
  GpuPipelineLayout,
  GpuShaderModule,
} from "./resources.js";
import { capturedTestGpuPipelineCreates } from "./state.js";

/** Discovery stages sharing one role while retaining distinct entry points. */
const EDGE_DISCOVERY_ENTRY_POINTS = new Set([
  "edge_feature",
  "edge_convolution",
  "edge_thin",
  "edge_tile_stats",
  "haar_low_high_frequency_level1",
  "haar_low_high_frequency_level2",
  "edge_project_frequency_support",
]);

/**
 * Resolve the concrete pipeline-layout handle from the upstream layout mode.
 *
 * @param layout - Layout union supplied through WIT; the analyzer compatibility
 *   path requires `specific`.
 * @returns The opaque handle carried by the `specific` variant.
 */
function readTestSpecificPipelineLayout(layout: GpuLayoutMode): object {
  if (
    layout.tag !== "specific" ||
    !("val" in layout) ||
    typeof layout.val !== "object" ||
    layout.val === null
  ) {
    throw new Error("test analyzer compute pipelines require explicit layouts");
  }
  return layout.val;
}

/** Classify an analyzer entry point into its bind-group and pipeline role. */
function classifyTestPipelineEntryPoint(
  entryPoint: string | undefined,
): AnalyzerPipelineRole {
  if (entryPoint === "init_visuals") {
    return "visual";
  }
  if (entryPoint === "trace_borders") {
    return "border-trace";
  }
  if (entryPoint !== undefined && EDGE_DISCOVERY_ENTRY_POINTS.has(entryPoint)) {
    return "edge-discovery";
  }
  return "stats";
}

/**
 * Reject entry points outside the analyzer shader contract established by
 * R2-A and preserved by R2-B.
 */
function requireSupportedEntryPoint(
  entryPoint: string | undefined,
): asserts entryPoint is string {
  if (
    entryPoint !== "init_visuals" &&
    entryPoint !== "main" &&
    entryPoint !== "trace_borders" &&
    !(entryPoint !== undefined && EDGE_DISCOVERY_ENTRY_POINTS.has(entryPoint))
  ) {
    throw new Error(`test unsupported compute entry point: ${entryPoint}`);
  }
}

/**
 * Register a fake upstream shader module on its creating device.
 *
 * @param device - Foreign device creating the module.
 * @param descriptor - Shader source and metadata supplied through WIT.
 * @returns The registered opaque shader-module handle.
 */
export function createTestGpuShaderModule(
  device: ForeignGpuDevice,
  descriptor: GpuShaderModuleDescriptor,
): GpuShaderModule {
  const handle = new GpuShaderModule();
  storeTestGpuShaderModule(handle, { device, descriptor });
  return handle;
}

/**
 * Register and classify an analyzer bind-group layout.
 *
 * @param device - Foreign device creating the layout.
 * @param descriptor - Exact sparse analyzer layout entries.
 * @returns The registered opaque bind-group-layout handle.
 */
export function createTestGpuBindGroupLayout(
  device: ForeignGpuDevice,
  descriptor: GpuBindGroupLayoutDescriptor,
): GpuBindGroupLayout {
  const handle = new GpuBindGroupLayout();
  storeTestGpuBindGroupLayout(handle, {
    device,
    role: classifyTestBindGroupLayout(descriptor),
    descriptor,
  });
  return handle;
}

/**
 * Register an analyzer pipeline layout from its first bind-group layout.
 *
 * The bind-group layout must belong to the creating device. Its classified
 * lane role is propagated to the pipeline-layout record.
 *
 * @param device - Foreign device creating the pipeline layout.
 * @param descriptor - Ordered bind-group layouts supplied through WIT.
 * @returns The registered opaque pipeline-layout handle.
 */
export function createTestGpuPipelineLayout(
  device: ForeignGpuDevice,
  descriptor: GpuPipelineLayoutDescriptor,
): GpuPipelineLayout {
  const bindGroupLayout = descriptor.bindGroupLayouts[0];
  if (!bindGroupLayout) {
    throw new Error(
      "test analyzer pipeline layout requires a bind-group layout",
    );
  }
  const layoutRecord = requireTestGpuBindGroupLayout(bindGroupLayout);
  if (layoutRecord.device !== device) {
    throw new Error(
      "test pipeline layout received a layout from a different device",
    );
  }

  const handle = new GpuPipelineLayout();
  storeTestGpuPipelineLayout(handle, {
    device,
    role: layoutRecord.role,
    descriptor,
  });
  return handle;
}

/**
 * Create and record one analyzer compute pipeline for the compatibility path.
 *
 * 1. Resolve the shader module and explicit pipeline layout.
 * 2. Require both resources to belong to the creating device.
 * 3. Classify and validate the shader entry point against the layout role.
 * 4. Capture pipeline creation for boundary assertions.
 * 5. Retain both role and entry point on the returned handle: pipeline creation
 *    order and the pipeline selected for an actual dispatch are independent.
 *
 * @param device - Foreign device creating the pipeline.
 * @param descriptor - Explicit layout, shader module, entry point, and label.
 * @returns The registered opaque compute-pipeline handle.
 */
export function createTestGpuComputePipeline(
  device: ForeignGpuDevice,
  descriptor: GpuComputePipelineDescriptor,
): GpuComputePipeline {
  const shaderRecord = requireTestGpuShaderModule(descriptor.compute.module);
  const layout = readTestSpecificPipelineLayout(descriptor.layout);
  const layoutRecord = requireTestGpuPipelineLayout(layout);
  if (shaderRecord.device !== device || layoutRecord.device !== device) {
    throw new Error(
      "test compute pipeline received resources from different devices",
    );
  }

  const { entryPoint } = descriptor.compute;
  const role = classifyTestPipelineEntryPoint(entryPoint);
  requireSupportedEntryPoint(entryPoint);
  if (layoutRecord.role !== role) {
    throw new Error("test compute pipeline received mismatched layout role");
  }
  capturedTestGpuPipelineCreates.push({
    device,
    role,
    entryPoint,
    label: descriptor.label,
  });

  const handle = new GpuComputePipeline();
  storeTestGpuComputePipeline(handle, { role, entryPoint, device });
  return handle;
}
