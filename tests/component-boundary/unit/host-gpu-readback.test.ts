import { describe, expect, it } from "vitest";

import { resolveTestAnalysisSummaryReadback } from "../../../target/component-tests/host/gpu.js";
import {
  EXPECTED_STABLE_GPU_PLAN,
  EXPECTED_STABLE_HOST_RESULT,
  SUMMARY_BYTE_LENGTH,
} from "../fixtures/gpu-workload.js";
import { createPreparedMockCommandContext } from "../support/mock-command-context.js";

describe("fake host stable readback", () => {
  it("[P10] synthesizes the established public baseline result", async () => {
    const context = createPreparedMockCommandContext();
    const commands = context.encoder.finish({
      label: "mock-host readback commands",
    });
    context.deviceHandle.queue().submit([commands]);

    const result = await resolveTestAnalysisSummaryReadback(
      context.deviceHandle,
      {
        plan: EXPECTED_STABLE_GPU_PLAN,
        stagingBuffer: context.stagingBuffer,
        byteLength: BigInt(SUMMARY_BYTE_LENGTH),
        commands,
      },
    );

    // Priority 10: exact result authored by the fake resolver.
    expect(result).toEqual(EXPECTED_STABLE_HOST_RESULT);
  });
});
