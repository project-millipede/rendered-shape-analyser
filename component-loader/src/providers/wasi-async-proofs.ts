import type * as WasiAsyncProofsModule from "../../../pkg/generated/wasi-0.3/inspector-component";
import { requireGeneratedCapability } from "./shared";

type RawWasiAsyncProofsInterface = typeof WasiAsyncProofsModule.wasiAsyncProofs;

export type WasiAsyncProofsInterface = Omit<
  RawWasiAsyncProofsInterface,
  "proveStream"
> & {
  proveStream(label: string): Promise<AsyncIterable<number>>;
};

/** Normalize the current generated JSPI stream shape for authored callers. */
const adaptWasiAsyncProofs = (
  proofs: RawWasiAsyncProofsInterface | undefined,
): WasiAsyncProofsInterface | undefined => {
  if (!proofs) return undefined;
  if (typeof proofs.proveAsyncFunc !== "function") return undefined;
  if (typeof proofs.proveFuture !== "function") return undefined;
  if (typeof proofs.proveStream !== "function") return undefined;

  return {
    proveAsyncFunc: proofs.proveAsyncFunc,
    proveFuture: proofs.proveFuture,
    // The generated declaration presents an AsyncIterable directly, while
    // this JSPI export resolves it through an outer Promise.
    proveStream: async (label: string) => proofs.proveStream(label),
  };
};

/**
 * Prepare the WASI 0.3 async-proof capability through its generated provider.
 *
 * @returns A Promise resolving to the validated callable generated capability.
 */
export async function instantiateWasiAsyncProofsComponent(): Promise<WasiAsyncProofsInterface> {
  const module =
    await import("../../../pkg/generated/wasi-0.3/inspector-component");
  const capability = adaptWasiAsyncProofs(module.wasiAsyncProofs);
  return requireGeneratedCapability(
    capability,
    "wasiAsyncProofs",
    (candidate) =>
      typeof candidate.proveAsyncFunc === "function" &&
      typeof candidate.proveFuture === "function" &&
      typeof candidate.proveStream === "function",
  );
}
