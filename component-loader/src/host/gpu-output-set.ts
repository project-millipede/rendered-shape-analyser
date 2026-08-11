/**
 * Renderer-record and indirect-draw GPU buffers produced by one analyzer lane.
 */
export interface ComponentGpuOutputPair<Value> {
  /** GPU-resident renderer records written by the analyzer lane. */
  buffer: Value;
  /** GPU-written non-indexed indirect-draw arguments for those records. */
  indirectBuffer: Value;
}

/** Complete renderer-output set shared by stable, async, and frame variants. */
export interface ComponentGpuOutputSet<Value> {
  /** Rectangle-overlay records and their indirect draw arguments. */
  visual: ComponentGpuOutputPair<Value>;
  /** Reference-guided border-trace records and indirect draw arguments. */
  borderTrace: ComponentGpuOutputPair<Value>;
  /** Pixel-derived edge-discovery records and indirect draw arguments. */
  edgeDiscovery: ComponentGpuOutputPair<Value>;
}

/** Renderer-output lane name derived directly from the shared set shape. */
export type ComponentGpuOutputName = keyof ComponentGpuOutputSet<never>;

/** Create one output set whose fields all start with the supplied value. */
export function createComponentGpuOutputSet<Value>(
  initialValue: Value,
): ComponentGpuOutputSet<Value> {
  return {
    visual: {
      buffer: initialValue,
      indirectBuffer: initialValue,
    },
    borderTrace: {
      buffer: initialValue,
      indirectBuffer: initialValue,
    },
    edgeDiscovery: {
      buffer: initialValue,
      indirectBuffer: initialValue,
    },
  };
}

/** Map every direct and indirect value while preserving the output-set shape. */
export function mapComponentGpuOutputValues<Input, Output>(
  outputs: ComponentGpuOutputSet<Input>,
  map: (value: Input) => Output,
): ComponentGpuOutputSet<Output> {
  return {
    visual: {
      buffer: map(outputs.visual.buffer),
      indirectBuffer: map(outputs.visual.indirectBuffer),
    },
    borderTrace: {
      buffer: map(outputs.borderTrace.buffer),
      indirectBuffer: map(outputs.borderTrace.indirectBuffer),
    },
    edgeDiscovery: {
      buffer: map(outputs.edgeDiscovery.buffer),
      indirectBuffer: map(outputs.edgeDiscovery.indirectBuffer),
    },
  };
}

/** Visit every direct and indirect value in one complete output set. */
export function forEachComponentGpuOutputValue<Value>(
  outputs: ComponentGpuOutputSet<Value>,
  visit: (value: Value) => void,
): void {
  forEachComponentGpuOutput(outputs, (output) => {
    visit(output.buffer);
    visit(output.indirectBuffer);
  });
}

/** Visit every named output pair without maintaining a parallel lane list. */
export function forEachComponentGpuOutput<Value>(
  outputs: ComponentGpuOutputSet<Value>,
  visit: (
    output: ComponentGpuOutputPair<Value>,
    outputName: ComponentGpuOutputName,
  ) => void,
): void {
  const outputNames = Object.keys(outputs) as ComponentGpuOutputName[];
  for (const outputName of outputNames) {
    visit(outputs[outputName], outputName);
  }
}

/** Check that every renderer-output slot contains a concrete value. */
export function isCompleteComponentGpuOutputSet<Value>(
  outputs: ComponentGpuOutputSet<Value | null>,
): outputs is ComponentGpuOutputSet<Value> {
  let complete = true;
  forEachComponentGpuOutputValue(outputs, (value) => {
    if (value === null) complete = false;
  });
  return complete;
}
