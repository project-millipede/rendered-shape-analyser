import {
  createComponentCapabilityLoader,
  type ComponentCapabilityLoader,
} from "./capability";
import {
  resolveComponentGpuOutputs,
  withComponentGpuAnalysisScope,
} from "./gpu-analysis-runtime";
import { createComponentGpuAnalysisDispatch } from "./gpu-analysis-dispatch";
import {
  createComponentGpuAnalysisAsyncCapability,
  type ComponentGpuAnalysisAsyncCapability,
} from "./gpu-analysis-async-capability";
import type {
  ComponentGpuAnalysisInput,
  ComponentGpuAnalysisOutput,
} from "./host/gpu-types";
import {
  instantiateGpuAnalysisAsyncComponent,
  type GpuAnalysisAsyncInterface,
} from "./providers/gpu-analysis-async";
import { probeJspiSupport } from "./support-jspi";

/**
 * Execute one JSPI call against an already prepared component.
 *
 * No loading or support probing occurs here. The call projects caller-owned
 * GPU inputs into WIT, awaits Rust's asynchronous analyzer and compact-summary
 * readback, validates the returned renderer-buffer identities, and transfers
 * those native buffers to the result owner.
 */
const analyzeWithPreparedComponent = async (
  component: GpuAnalysisAsyncInterface,
  input: ComponentGpuAnalysisInput,
): Promise<ComponentGpuAnalysisOutput> =>
  withComponentGpuAnalysisScope(input, async (scope) => {
    const { device, texture, truthBuffer } = scope.inputs;
    const result = await component.analyze(
      device,
      texture,
      truthBuffer,
      createComponentGpuAnalysisDispatch(input),
    );
    const { summary, ...outputHandles } = result;
    const outputs = resolveComponentGpuOutputs(
      "[analysis][component-gpu-async]",
      input,
      scope,
      outputHandles,
    );
    return {
      summary: {
        entryId: input.entryId,
        ...summary,
      },
      ...outputs,
    };
  });

/** Normalize one generated JSPI interface into the authored ready API. */
const instantiateComponentGpuAnalysisAsyncCapability =
  async (): Promise<ComponentGpuAnalysisAsyncCapability> => {
    const component = await instantiateGpuAnalysisAsyncComponent();
    return createComponentGpuAnalysisAsyncCapability((input) =>
      analyzeWithPreparedComponent(component, input),
    );
  };

/** Explicit lifecycle for the JSPI authored GPU-analysis capability. */
export const componentGpuAnalyzerAsyncLoader: ComponentCapabilityLoader<ComponentGpuAnalysisAsyncCapability> =
  createComponentCapabilityLoader({
    instantiate: instantiateComponentGpuAnalysisAsyncCapability,
    probeSupport: probeJspiSupport,
    reportFailure(error) {
      console.info(
        "[analysis][component-gpu-async] component failed to instantiate",
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
} from "./host/gpu-types";
export type {
  ComponentGpuAnalysisInvocationEvent,
  ComponentGpuAnalysisObserver,
  ComponentGpuAnalysisVariant,
} from "./gpu-analysis-observer";
export type {
  ComponentGpuAnalysisAsyncCapability,
  ComponentGpuAnalysisAsyncOptions,
} from "./gpu-analysis-async-capability";
export type {
  ComponentCapabilityLoader,
  ComponentCapabilityPrepareResult,
  ComponentCapabilityState,
  ComponentUnsupportedReason,
} from "./capability";
