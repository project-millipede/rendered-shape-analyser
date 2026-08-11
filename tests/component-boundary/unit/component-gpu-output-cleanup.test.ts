import { describe, expect, it, vi } from "vitest";

import {
  resolveComponentGpuOutputs,
  withComponentGpuAnalysisScope,
} from "../../../component-loader/src/gpu-analysis-runtime.js";
import {
  destroyUntransferredSummaryBuffers,
  type ComponentGpuOutputHandles,
} from "../../../component-loader/src/host/gpu-output.js";
import {
  createComponentGpuOutputSet,
  forEachComponentGpuOutputValue,
  mapComponentGpuOutputValues,
  type ComponentGpuOutputSet,
} from "../../../component-loader/src/host/gpu-output-set.js";
import type { ComponentGpuAnalysisInput } from "../../../component-loader/src/host/gpu-types.js";
import {
  GpuBuffer,
  GpuCommandBuffer,
  GpuDevice,
  discardExternalGpuCommandEncodingProjection,
  registerExternalGpuCommandEncoder,
  registerGpuBuffer,
  registerGpuCommandBuffer,
  requireRegisteredCommandEncoder,
  takeExternalGpuCommandEncoding,
} from "../../../component-loader/src/host/webgpu/index.js";
import { resolveAnalysisSummaryReadback } from "../../../component-loader/src/host/gpu-summary-stable.js";
import { EXPECTED_STABLE_GPU_PLAN } from "../fixtures/gpu-workload.js";

/** Minimal observable GPU buffer used by host-only ownership tests. */
interface TestGpuBuffer {
  readonly value: GPUBuffer;
  readonly destroy: ReturnType<typeof vi.fn>;
  readonly unmap: ReturnType<typeof vi.fn>;
}

/** Create a structural GPU buffer without executing a browser workload. */
const createTestGpuBuffer = (
  size: number,
  mapState: GPUBufferMapState = "unmapped",
): TestGpuBuffer => {
  const destroy = vi.fn();
  const unmap = vi.fn();
  const value = {
    size,
    mapState,
    destroy,
    unmap,
  } as unknown as GPUBuffer;
  return { value, destroy, unmap };
};

/** Register one component-created output buffer on a fake device. */
const registerOutputBuffer = (size: number, device: GPUDevice) => {
  const buffer = createTestGpuBuffer(size);
  return {
    buffer,
    handle: registerGpuBuffer(buffer.value, device),
  };
};

type RegisteredTestOutputBuffer = ReturnType<typeof registerOutputBuffer>;

/** Register one complete renderer-output set for a host-only ownership test. */
const registerTestOutputSet = (
  device: GPUDevice,
  visualBufferSize: number = 32,
): ComponentGpuOutputSet<RegisteredTestOutputBuffer> => ({
  visual: {
    buffer: registerOutputBuffer(visualBufferSize, device),
    indirectBuffer: registerOutputBuffer(16, device),
  },
  borderTrace: {
    buffer: registerOutputBuffer(32, device),
    indirectBuffer: registerOutputBuffer(16, device),
  },
  edgeDiscovery: {
    buffer: registerOutputBuffer(32, device),
    indirectBuffer: registerOutputBuffer(16, device),
  },
});

/** Assert that every native buffer in one renderer-output set was destroyed. */
const expectOutputSetDestroyed = (
  outputs: ComponentGpuOutputSet<RegisteredTestOutputBuffer>,
): void => {
  forEachComponentGpuOutputValue(outputs, (output) => {
    expect(output.buffer.destroy).toHaveBeenCalledTimes(1);
  });
};

describe("component GPU output cleanup", () => {
  it("[P10] attempts every summary cleanup action independently", () => {
    const summary = createTestGpuBuffer(12);
    const staging = createTestGpuBuffer(12, "mapped");
    staging.unmap.mockImplementationOnce(() => {
      throw new Error("unmap failed");
    });
    staging.destroy.mockImplementationOnce(() => {
      throw new Error("staging destruction failed");
    });

    expect(() =>
      destroyUntransferredSummaryBuffers(summary.value, staging.value),
    ).not.toThrow();

    expect(staging.unmap).toHaveBeenCalledTimes(1);
    expect(staging.destroy).toHaveBeenCalledTimes(1);
    expect(summary.destroy).toHaveBeenCalledTimes(1);
  });

  it("[P10] destroys every returned output when the first validation fails", async () => {
    const device = {} as GPUDevice;
    const callerTruthBuffer = createTestGpuBuffer(4);
    const input: ComponentGpuAnalysisInput = {
      entryId: "validation-failure",
      displayName: "validation failure",
      device,
      texture: { width: 8, height: 8 } as GPUTexture,
      truthBuffer: callerTruthBuffer.value,
      nodeCount: 1,
    };
    const outputBuffers = registerTestOutputSet(device, 0);
    const summary = createTestGpuBuffer(12);
    const staging = registerOutputBuffer(12, device);
    const nativeOutputs = mapComponentGpuOutputValues(
      outputBuffers,
      (output) => output.buffer.value,
    );
    const commandHandle = registerGpuCommandBuffer({
      device,
      resources: {
        texture: input.texture,
        truthBuffer: input.truthBuffer,
        summaryBuffer: summary.value,
        outputs: nativeOutputs,
      },
      commandBuffer: {
        commandBuffer: {} as GPUCommandBuffer,
        validation: Promise.resolve(null),
        validationPhase: "test command validation",
      },
    });
    const rawOutputs: ComponentGpuOutputHandles = mapComponentGpuOutputValues(
      outputBuffers,
      (output) => output.handle,
    );

    await expect(
      withComponentGpuAnalysisScope(input, async (scope) => {
        scope.trackSummaryReadback(staging.handle, commandHandle);
        return resolveComponentGpuOutputs(
          "[test][component-gpu]",
          input,
          scope,
          rawOutputs,
        );
      }),
    ).rejects.toThrow("visual output buffer has size 0, expected 32");

    expectOutputSetDestroyed(outputBuffers);
    expect(summary.destroy).toHaveBeenCalledTimes(1);
    expect(staging.buffer.destroy).toHaveBeenCalledTimes(1);
    expect(callerTruthBuffer.destroy).not.toHaveBeenCalled();
  });

  it("[P10] destroys resolved staging when stable command lookup fails", async () => {
    const device = {} as GPUDevice;
    const staging = registerOutputBuffer(12, device);
    const transferScopeCleanup = vi.fn();
    const plan = {
      ...EXPECTED_STABLE_GPU_PLAN,
      kernel: "per-component-stats-v1" as const,
    };

    await expect(
      resolveAnalysisSummaryReadback(
        "[test][component-gpu]",
        new GpuDevice(),
        {
          plan,
          stagingBuffer: staging.handle,
          byteLength: 12n,
          commands: new GpuCommandBuffer(),
        },
        transferScopeCleanup,
        async () => {
          throw new Error("summary resolver must not run");
        },
      ),
    ).rejects.toThrow("unregistered GPU command-buffer handle");

    expect(staging.buffer.destroy).toHaveBeenCalledTimes(1);
    expect(transferScopeCleanup).toHaveBeenCalledTimes(1);
  });

  it("[P10] destroys resolved summary when stable staging lookup fails", async () => {
    const device = {} as GPUDevice;
    const summary = createTestGpuBuffer(12);
    const rendererOutput = createTestGpuBuffer(32);
    const transferScopeCleanup = vi.fn();
    const plan = {
      ...EXPECTED_STABLE_GPU_PLAN,
      kernel: "per-component-stats-v1" as const,
    };
    const commandHandle = registerGpuCommandBuffer({
      device,
      resources: {
        texture: { width: 8, height: 8 } as GPUTexture,
        truthBuffer: createTestGpuBuffer(4).value,
        summaryBuffer: summary.value,
        outputs: createComponentGpuOutputSet(rendererOutput.value),
      },
      commandBuffer: {
        commandBuffer: {} as GPUCommandBuffer,
        validation: Promise.resolve(null),
        validationPhase: "test command validation",
      },
    });

    await expect(
      resolveAnalysisSummaryReadback(
        "[test][component-gpu]",
        new GpuDevice(),
        {
          plan,
          stagingBuffer: new GpuBuffer(),
          byteLength: 12n,
          commands: commandHandle,
        },
        transferScopeCleanup,
        async () => {
          throw new Error("summary resolver must not run");
        },
      ),
    ).rejects.toThrow("unregistered GPU buffer handle");

    expect(summary.destroy).toHaveBeenCalledTimes(1);
    expect(transferScopeCleanup).toHaveBeenCalledTimes(1);
  });

  it("[P10] discards failed frame extraction without finishing the caller encoder", () => {
    const summaryBuffer = createTestGpuBuffer(12);
    const callerTruthBuffer = createTestGpuBuffer(4);
    const finish = vi.fn();
    const encoder = { finish } as unknown as GPUCommandEncoder;
    const device = {} as GPUDevice;
    const outputBuffers = registerTestOutputSet(device);
    const handle = registerExternalGpuCommandEncoder(encoder, device);
    const record = requireRegisteredCommandEncoder(handle);
    record.resources.truthBuffer = callerTruthBuffer.value;
    record.resources.summaryBuffer = summaryBuffer.value;
    record.resources.outputs = mapComponentGpuOutputValues(
      outputBuffers,
      (output) => output.buffer.value,
    );

    expect(() => takeExternalGpuCommandEncoding(handle)).toThrow(
      "Rust returned before binding the complete analyzer resource set",
    );

    const destroyed = discardExternalGpuCommandEncodingProjection(handle);

    expect(summaryBuffer.destroy).toHaveBeenCalledTimes(1);
    expectOutputSetDestroyed(outputBuffers);
    expect(callerTruthBuffer.destroy).not.toHaveBeenCalled();
    const expectedDestroyed = new Set<GPUBuffer>([summaryBuffer.value]);
    forEachComponentGpuOutputValue(outputBuffers, (output) => {
      expectedDestroyed.add(output.buffer.value);
    });
    expect(destroyed).toEqual(expectedDestroyed);
    expect(finish).not.toHaveBeenCalled();
    expect(() => requireRegisteredCommandEncoder(handle)).toThrow(
      "unregistered GPU command-encoder handle",
    );
    expect(() =>
      discardExternalGpuCommandEncodingProjection(handle),
    ).not.toThrow();
    expect(summaryBuffer.destroy).toHaveBeenCalledTimes(1);
    expectOutputSetDestroyed(outputBuffers);
  });

  it("[P9] reports only frame buffers whose native destruction succeeded", () => {
    const summaryBuffer = createTestGpuBuffer(12);
    summaryBuffer.destroy.mockImplementationOnce(() => {
      throw new Error("native destruction failed");
    });
    const encoder = {} as GPUCommandEncoder;
    const device = {} as GPUDevice;
    const handle = registerExternalGpuCommandEncoder(encoder, device);
    const record = requireRegisteredCommandEncoder(handle);
    record.resources.summaryBuffer = summaryBuffer.value;

    const destroyed = discardExternalGpuCommandEncodingProjection(handle);

    expect(summaryBuffer.destroy).toHaveBeenCalledTimes(1);
    expect(destroyed.has(summaryBuffer.value)).toBe(false);
  });
});
