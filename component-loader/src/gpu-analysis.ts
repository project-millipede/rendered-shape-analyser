import {
  createComponentCapabilityLoader,
  type ComponentCapabilityLoader,
} from "./capability";
import { invokeComponentOperation } from "./component-invocation";
import {
  createComponentGpuAnalysisCapability,
  type ComponentGpuAnalysisCapability,
} from "./gpu-analysis-capability";
import {
  resolveComponentGpuOutputs,
  withComponentGpuAnalysisScope,
} from "./gpu-analysis-runtime";
import { createComponentGpuAnalysisDispatch } from "./gpu-analysis-dispatch";
import { normalizeComponentGpuAnalysisValidationError } from "./gpu-analysis-validation-error";
import { resolveAnalysisSummaryReadback } from "./host/gpu-summary-stable";
import type {
  ComponentGpuAnalysisInput,
  ComponentGpuAnalysisOutput,
  ComponentGpuSummaryResolver,
} from "./host/gpu-types";
import {
  instantiateGpuAnalysisComponent,
  type GpuAnalysisInterface,
} from "./providers/gpu-analysis";
import { probeWebAssemblySupport } from "./support-webassembly";

/**
 * Execute one stable call against an already prepared component.
 *
 * No loading or preparation occurs here. The call projects caller-owned GPU
 * inputs into WIT, lets Rust validate and submit its planned analyzer work,
 * validates the returned renderer-buffer identities, and transfers those
 * buffers to the result owner. Compact-summary buffers transfer separately to
 * the invocation-local resolver after their submitted command metadata has
 * been validated.
 */
const analyzeWithPreparedComponent = async (
  component: GpuAnalysisInterface,
  input: ComponentGpuAnalysisInput,
  summaryResolver: ComponentGpuSummaryResolver,
): Promise<ComponentGpuAnalysisOutput> =>
  withComponentGpuAnalysisScope(input, async (scope) => {
    const { device, texture, truthBuffer } = scope.inputs;
    const dispatch = createComponentGpuAnalysisDispatch(input);
    const result = invokeComponentOperation(
      () => component.analyze(device, texture, truthBuffer, dispatch),
      normalizeComponentGpuAnalysisValidationError,
    );
    const { summary: summaryReadback, ...outputHandles } = result;
    scope.trackSummaryReadback(
      summaryReadback.stagingBuffer,
      summaryReadback.commands,
    );
    const outputs = resolveComponentGpuOutputs(
      "[analysis][component-gpu]",
      input,
      scope,
      outputHandles,
    );
    const summary = await resolveAnalysisSummaryReadback(
      "[analysis][component-gpu]",
      device,
      summaryReadback,
      scope.transferSummaryReadbackCleanup,
      summaryResolver,
    );
    return { summary, ...outputs };
  });

/** Normalize one generated stable interface into the authored ready API. */
const instantiateComponentGpuAnalysisCapability =
  async (): Promise<ComponentGpuAnalysisCapability> => {
    const component = await instantiateGpuAnalysisComponent();
    const capability = createComponentGpuAnalysisCapability(
      (input, summaryResolver) =>
        analyzeWithPreparedComponent(component, input, summaryResolver),
    );
    return capability;
  };

/** Explicit lifecycle for the stable authored GPU-analysis capability. */
export const componentGpuAnalyzerLoader: ComponentCapabilityLoader<ComponentGpuAnalysisCapability> =
  createComponentCapabilityLoader({
    instantiate: instantiateComponentGpuAnalysisCapability,
    probeSupport: probeWebAssemblySupport,
    reportFailure(error) {
      console.info(
        "[analysis][component-gpu] component failed to instantiate",
        error,
      );
    },
  });

export type {
  AnalysisSummaryResult,
  ComponentGpuAnalysisBorderTraceOutput,
  ComponentGpuAnalysisEdgeDiscoveryOutput,
  ComponentGpuAnalysisInput,
  ComponentGpuAnalysisOutput,
  ComponentGpuAnalysisVisualOutput,
  ComponentGpuSummaryResolveInput,
  ComponentGpuSummaryResolver,
} from "./host/gpu-types";
export type {
  ComponentGpuAnalysisInvocationEvent,
  ComponentGpuAnalysisObserver,
  ComponentGpuAnalysisVariant,
} from "./gpu-analysis-observer";
export type {
  ComponentGpuAnalysisCapability,
  ComponentGpuAnalysisOptions,
} from "./gpu-analysis-capability";
export {
  ComponentGpuAnalysisValidationError,
  type ComponentGpuAnalysisValidationErrorKind,
} from "./gpu-analysis-validation-error";
export type {
  ComponentCapabilityLoader,
  ComponentCapabilityPrepareResult,
  ComponentCapabilityState,
  ComponentUnsupportedReason,
} from "./capability";
