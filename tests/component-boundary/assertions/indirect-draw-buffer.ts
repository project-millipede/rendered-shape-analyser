import { expect } from "vitest";

export interface FakeGpuBuffer {
  size: number;
  usage: {
    storage: boolean;
    indirect: boolean;
    mapRead: boolean;
    mapWrite: boolean;
    copySrc: boolean;
  };
}

/**
 * Assert that one analyzer lane uses a GPU-owned indirect-draw buffer.
 *
 * 1. Renderer records and indirect arguments use different buffers.
 * 2. The indirect buffer holds one WebGPU non-indexed draw record:
 *    `vertexCount`, `instanceCount`, `firstVertex`, and `firstInstance`.
 * 3. Compute can write the buffer and rendering can consume it with
 *    `drawIndirect`.
 * 4. The buffer is neither mappable nor a copy source because active draw
 *    counts are a GPU-owned rendering signal, not diagnostic readback data.
 *
 * @param label - Human-readable analyzer lane used in assertion messages.
 * @param outputBuffer - Fake browser buffer containing renderer-facing records.
 * @param indirectBuffer - Fake browser buffer containing indirect arguments.
 */
export function expectIndirectDrawBuffer(
  label: string,
  outputBuffer: object,
  indirectBuffer: FakeGpuBuffer,
): void {
  expect(
    indirectBuffer,
    `${label} indirect buffer must be separate from record storage`,
  ).not.toBe(outputBuffer);
  expect(
    indirectBuffer.size,
    `${label} indirect buffer must be one WebGPU drawIndirect record`,
  ).toBe(16);
  expect(
    indirectBuffer.usage.storage,
    `${label} indirect buffer must be GPU-writable from compute`,
  ).toBe(true);
  expect(
    indirectBuffer.usage.indirect,
    `${label} indirect buffer must be drawable via drawIndirect`,
  ).toBe(true);
  expect(
    indirectBuffer.usage.mapRead,
    `${label} indirect buffer must not be CPU-readable`,
  ).toBe(false);
  expect(
    indirectBuffer.usage.mapWrite,
    `${label} indirect buffer must not be CPU-writable`,
  ).toBe(false);
  expect(
    indirectBuffer.usage.copySrc,
    `${label} indirect buffer must not be copied to CPU staging`,
  ).toBe(false);
}
