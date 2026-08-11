import { describe, expect, it, vi } from "vitest";

import { createComponentCapabilityLoader } from "../../../component-loader/src/capability.js";
import { createComponentGpuAnalysisAsyncCapability } from "../../../component-loader/src/gpu-analysis-async-capability.js";
import { createComponentGpuAnalysisCapability } from "../../../component-loader/src/gpu-analysis-capability.js";
import { createComponentGpuAnalysisFrameCapability } from "../../../component-loader/src/gpu-analysis-frame-capability.js";
import type {
  ComponentGpuAnalysisInvocationEvent,
  ComponentGpuAnalysisObserver,
} from "../../../component-loader/src/gpu-analysis-observer.js";
import type {
  AnalysisSummaryResult,
  ComponentGpuAnalysisInput,
  ComponentGpuAnalysisOutput,
  ComponentGpuFrameEncodedOutput,
  ComponentGpuSummaryResolver,
} from "../../../component-loader/src/host/gpu-types.js";

/** Create one minimal caller-owned input for wrapper-only tests. */
const createInput = (entryId: string): ComponentGpuAnalysisInput => ({
  entryId,
  displayName: entryId,
  device: {} as GPUDevice,
  texture: { width: 1, height: 1 } as GPUTexture,
  truthBuffer: {} as GPUBuffer,
  nodeCount: 1,
});

/** Create a compact summary whose entry id identifies its resolver. */
const createSummary = (entryId: string): AnalysisSummaryResult => ({
  entryId,
  textureWidth: 1,
  textureHeight: 1,
  nodeCount: 1,
  nodes: [],
});

/** Create one structurally complete GPU output without invoking WebGPU. */
const createOutput = (
  summary: AnalysisSummaryResult,
): ComponentGpuAnalysisOutput => {
  const buffer = {} as GPUBuffer;
  return {
    summary,
    visual: { buffer, indirectBuffer: buffer },
    borderTrace: { buffer, indirectBuffer: buffer },
    edgeDiscovery: { buffer, indirectBuffer: buffer },
  };
};

describe("authored stable GPU capability", () => {
  it("[P10] performs provider work once and routes each call-local resolver", async () => {
    const firstSummary = createSummary("first-resolver");
    const secondSummary = createSummary("second-resolver");
    const firstResolver: ComponentGpuSummaryResolver = async () => firstSummary;
    const secondResolver: ComponentGpuSummaryResolver = async () =>
      secondSummary;
    const execute = vi.fn(
      async (
        _input: ComponentGpuAnalysisInput,
        resolver: ComponentGpuSummaryResolver,
      ): Promise<ComponentGpuAnalysisOutput> => {
        if (resolver === firstResolver) return createOutput(firstSummary);
        if (resolver === secondResolver) return createOutput(secondSummary);
        throw new Error("unexpected resolver");
      },
    );
    const capability = createComponentGpuAnalysisCapability(execute);
    const instantiate = vi.fn(() => Promise.resolve(capability));
    const loader = createComponentCapabilityLoader({ instantiate });

    const prepared = await loader.prepare();
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") return;

    const input = createInput("entry");
    const first = prepared.capability.analyze(input, {
      summaryResolver: firstResolver,
    });
    const second = prepared.capability.analyze(input, {
      summaryResolver: secondResolver,
    });
    await expect(first).resolves.toEqual(createOutput(firstSummary));
    await expect(second).resolves.toEqual(createOutput(secondSummary));

    expect(instantiate).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenNthCalledWith(1, input, firstResolver);
    expect(execute).toHaveBeenNthCalledWith(2, input, secondResolver);
    expect(loader.state).toBe("ready");
  });

  it("[P9] reports primitive invocation boundaries without changing outcomes", async () => {
    const summary = createSummary("observed");
    const output = createOutput(summary);
    const execute = vi.fn(() => Promise.resolve(output));
    const capability = createComponentGpuAnalysisCapability(execute);
    const events: Array<ComponentGpuAnalysisInvocationEvent> = [];
    const observer: ComponentGpuAnalysisObserver = {
      observe(event) {
        events.push(event);
      },
    };

    await expect(
      capability.analyze(createInput("observed"), {
        summaryResolver: async () => summary,
        observer,
      }),
    ).resolves.toBe(output);
    expect(events).toEqual([
      { phase: "started", variant: "stable", entryId: "observed" },
      { phase: "returned", variant: "stable", entryId: "observed" },
    ]);

    const failure = new TypeError("fixture failure");
    const failingCapability = createComponentGpuAnalysisCapability(() =>
      Promise.reject(failure),
    );
    await expect(
      failingCapability.analyze(createInput("failed"), {
        summaryResolver: async () => summary,
        observer,
      }),
    ).rejects.toBe(failure);
    expect(events.at(-2)).toEqual({
      phase: "started",
      variant: "stable",
      entryId: "failed",
    });
    expect(events.at(-1)).toEqual({
      phase: "threw",
      variant: "stable",
      entryId: "failed",
      errorName: "TypeError",
      errorMessage: "fixture failure",
    });

    const throwingObserver: ComponentGpuAnalysisObserver = {
      observe() {
        throw new Error("observer failure");
      },
    };
    await expect(
      capability.analyze(createInput("best-effort"), {
        summaryResolver: async () => summary,
        observer: throwingObserver,
      }),
    ).resolves.toBe(output);
  });

  it("[P9] bypasses observation machinery when no observer is supplied", async () => {
    const rejection = { code: "non-error-rejection" } as const;
    const rejected = Promise.reject(rejection);
    const execute = vi.fn(() => rejected);
    const capability = createComponentGpuAnalysisCapability(execute);
    const result = capability.analyze(createInput("unobserved"), {
      summaryResolver: async () => createSummary("unused"),
    });

    expect(result).toBe(rejected);
    await expect(result).rejects.toBe(rejection);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("[P9] keeps observation best-effort for unreadable thrown values", async () => {
    const rejection = Object.create(null) as object;
    const events: Array<ComponentGpuAnalysisInvocationEvent> = [];
    const capability = createComponentGpuAnalysisCapability(() =>
      Promise.reject(rejection),
    );

    const result = capability.analyze(createInput("unreadable"), {
      summaryResolver: async () => createSummary("unused"),
      observer: {
        observe(event) {
          events.push(event);
        },
      },
    });

    await expect(result).rejects.toBe(rejection);
    expect(events.at(-1)).toEqual({
      phase: "threw",
      variant: "stable",
      entryId: "unreadable",
      errorName: "Error",
      errorMessage: "stable component invocation threw an unreadable value",
    });
  });
});

describe("authored async GPU capability", () => {
  it("[P9] preserves Promise and rejection identity without an observer", async () => {
    const rejection = { code: "async-rejection" } as const;
    const rejected = Promise.reject(rejection);
    const execute = vi.fn(() => rejected);
    const capability = createComponentGpuAnalysisAsyncCapability(execute);
    const result = capability.analyze(createInput("async-unobserved"));

    expect(result).toBe(rejected);
    await expect(result).rejects.toBe(rejection);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("authored shared-frame GPU capability", () => {
  const createFrameOutput = (): ComponentGpuFrameEncodedOutput => {
    const buffer = {} as GPUBuffer;
    return {
      summary: {
        resolveAfterSubmit: async () => createSummary("frame"),
        dispose() {},
      },
      visual: { buffer, indirectBuffer: buffer },
      borderTrace: { buffer, indirectBuffer: buffer },
      edgeDiscovery: { buffer, indirectBuffer: buffer },
    };
  };

  it("[P10] stays synchronous and preserves output identity", () => {
    const output = createFrameOutput();
    const execute = vi.fn(() => output);
    const capability = createComponentGpuAnalysisFrameCapability(execute);
    const input = createInput("frame");
    const encoder = {} as GPUCommandEncoder;
    const summaryResolver: ComponentGpuSummaryResolver = async () =>
      createSummary("frame");
    const appendRender = vi.fn();
    const finish = vi.fn();
    const submit = vi.fn();

    const result = capability.encode(input, encoder, {
      summaryResolver,
    });
    appendRender();
    finish();
    submit();

    expect(result).toBe(output);
    expect(result).not.toBeInstanceOf(Promise);
    expect(execute).toHaveBeenCalledWith(input, encoder, summaryResolver);
    expect(appendRender).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("[P10] requires the scheduler to abandon after every throw", () => {
    const failure = { code: "frame-encode-failure" } as const;
    const capability = createComponentGpuAnalysisFrameCapability(() => {
      throw failure;
    });
    const appendRender = vi.fn();
    const finish = vi.fn();
    const submit = vi.fn();
    const abandon = vi.fn();

    try {
      capability.encode(createInput("frame-failure"), {} as GPUCommandEncoder, {
        summaryResolver: async () => createSummary("unused"),
      });
      appendRender();
      finish();
      submit();
    } catch (caught) {
      expect(caught).toBe(failure);
      abandon();
    }

    expect(abandon).toHaveBeenCalledTimes(1);
    expect(appendRender).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});
