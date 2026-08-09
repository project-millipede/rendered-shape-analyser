/**
 * Focused lifecycle proof for the typed fake WebGPU command host.
 *
 * These unit cases establish the pass-state accounting used by generated
 * component integration tests: only one pass may be open, copy and finish need
 * a closed pass, a pass ends exactly once, and explicit finish/submission calls
 * publish their corresponding observation records.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  capturedGpuCommandEncodes,
  capturedGpuCommandSubmits,
} from "../../../target/component-tests/host/gpu.js";
import { requireTestGpuCommandEncoder } from "../../../target/component-tests/host/webgpu/index.js";
import {
  createPreparedMockCommandContext,
  type PreparedMockCommandContext,
} from "../support/mock-command-context.js";

/** Minimal typed view of the compute-pass handle emitted by the compiled host. */
interface FakeComputePassHandle {
  dispatchWorkgroups(
    workgroupCountX: number,
    workgroupCountY?: number,
    workgroupCountZ?: number,
  ): void;
  end(): void;
}

/** Minimal typed view of encoder methods exercised by these lifecycle cases. */
interface LifecycleCommandEncoder {
  beginComputePass(descriptor?: { label?: string }): FakeComputePassHandle;
  copyBufferToBuffer(
    source: object,
    sourceOffset: bigint | undefined,
    destination: object,
    destinationOffset: bigint | undefined,
    size: bigint | undefined,
  ): void;
  finish(descriptor?: { label?: string }): object;
}

describe("fake WebGPU command lifecycle accounting", () => {
  let context: PreparedMockCommandContext;

  beforeEach(() => {
    context = createPreparedMockCommandContext();
  });

  it("[P10] rejects encoder operations that require a closed compute pass", () => {
    const encoder = context.encoder as LifecycleCommandEncoder;
    const pass = encoder.beginComputePass({
      label: "open lifecycle pass",
    });
    const encoderRecord = requireTestGpuCommandEncoder(context.encoder);

    expect(encoderRecord).toMatchObject({
      computePassBegins: 1,
      computePassEnds: 0,
      computePassOpen: true,
    });
    expect(() => encoder.beginComputePass()).toThrow(/second compute pass/);
    expect(() =>
      encoder.copyBufferToBuffer(
        context.stagingBuffer,
        0n,
        context.stagingBuffer,
        0n,
        1n,
      ),
    ).toThrow(/copy buffers while a compute pass is open/);
    expect(() => encoder.finish()).toThrow(
      /finish while a compute pass is open/,
    );

    pass.end();
    expect(encoderRecord).toMatchObject({
      computePassBegins: 1,
      computePassEnds: 1,
      computePassOpen: false,
    });
  });

  it("[P10] ends each compute pass exactly once", () => {
    const encoder = context.encoder as LifecycleCommandEncoder;
    const pass = encoder.beginComputePass({
      label: "single-end lifecycle pass",
    });
    const encoderRecord = requireTestGpuCommandEncoder(context.encoder);

    pass.end();

    expect(() => pass.dispatchWorkgroups(1)).toThrow(/record after end/);
    expect(() => pass.end()).toThrow(/cannot end more than once/);
    expect(encoderRecord).toMatchObject({
      computePassBegins: 1,
      computePassEnds: 1,
      computePassOpen: false,
    });
  });

  it("[P10] captures explicit finish operations", () => {
    context.encoder.finish({
      label: "mock-host lifecycle commands",
    });

    // Priority 10: fake finish observation accounting.
    expect(capturedGpuCommandEncodes).toHaveLength(1);
  });

  it("[P9] captures explicit submit operations", () => {
    const commands = context.encoder.finish({
      label: "mock-host lifecycle commands",
    });
    context.deviceHandle.queue().submit([commands]);

    // Priority 9: fake submit observation accounting.
    expect(capturedGpuCommandSubmits).toHaveLength(1);
  });
});
