import { registerTestGpuBuffer } from "../../../target/component-tests/host/gpu.js";
import { requireTestGpuCommandEncoder } from "../../../target/component-tests/host/webgpu/index.js";
import { SUMMARY_BYTE_LENGTH } from "../fixtures/gpu-workload.js";
import {
  createGpuTestContext,
  type FakeCommandEncoderHandle,
  type GpuTestContext,
} from "./gpu-test-context.js";

export interface PreparedMockCommandContext extends GpuTestContext {
  encoder: FakeCommandEncoderHandle;
  stagingBuffer: object;
}

/**
 * Prepare a complete fake encoder without involving a generated component.
 *
 * This exists only for unit tests of the fake host's own lifecycle accounting.
 */
export function createPreparedMockCommandContext(): PreparedMockCommandContext {
  const context = createGpuTestContext();
  const encoder = context.deviceHandle.createCommandEncoder({
    label: "mock-host unit encoder",
  });
  const encoderRecord = requireTestGpuCommandEncoder(encoder);
  const summaryBuffer = {
    label: "summary output",
    size: SUMMARY_BYTE_LENGTH,
  };
  const stagingBufferObject = {
    label: "summary staging",
    size: SUMMARY_BYTE_LENGTH,
  };

  Object.assign(encoderRecord, {
    texture: context.fakeTexture,
    buffer: context.fakeBuffer,
    summaryBuffer,
    visualBuffer: { label: "visual output", size: 1 },
    visualIndirectBuffer: { label: "visual indirect", size: 16 },
    borderTraceBuffer: { label: "border output", size: 1 },
    borderTraceIndirectBuffer: { label: "border indirect", size: 16 },
    edgeDiscoveryBuffer: { label: "discovery output", size: 1 },
    edgeDiscoveryIndirectBuffer: { label: "discovery indirect", size: 16 },
    copiedSummary: {
      source: summaryBuffer,
      sourceOffset: 0n,
      destination: stagingBufferObject,
      destinationOffset: 0n,
      size: BigInt(SUMMARY_BYTE_LENGTH),
    },
  });

  return {
    ...context,
    encoder,
    stagingBuffer: registerTestGpuBuffer(
      stagingBufferObject,
      context.fakeDevice,
    ),
  };
}
