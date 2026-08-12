/**
 * Non-product WIT/JCO async-projection proof.
 *
 * - WIT `async func` projects to `Promise<number>`.
 * - WIT `future<u32>` projects to `PromiseLike<number>`.
 * - WIT `stream<u8>` projects through the current JSPI wrapper to an async
 *   iterable which yields the expected byte sequence.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  loadWasiAsyncBoundaryProofModule,
  type WasiAsyncBoundaryProofExports,
} from "../support/generated-components.js";
import { readUtf8Stream } from "../support/read-utf8-stream.js";

describe("generated WASI async boundary-proof component", () => {
  let wasiAsyncProofs: WasiAsyncBoundaryProofExports;

  beforeAll(async () => {
    ({ wasiAsyncProofs } = await loadWasiAsyncBoundaryProofModule());
  });

  it("[P10] projects WIT async functions to Promise results", () => {
    // Priority 10: direct WIT async projection.
    return expect(wasiAsyncProofs.proveAsyncFunc(41)).resolves.toBe(42);
  });

  it("[P9] projects WIT futures to Promise-like results", () => {
    // Priority 9: WIT future thenable projection.
    return expect(wasiAsyncProofs.proveFuture(40)).resolves.toBe(42);
  });

  it("[P8] projects WIT streams to their semantic bytes", async () => {
    const streamResult = await readUtf8Stream(
      await wasiAsyncProofs.proveStream("test"),
      11,
    );

    // Priority 8: WIT stream projection and byte sequence.
    expect(streamResult).toBe("stream:test");
  });
});
