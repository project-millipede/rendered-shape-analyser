import {
  createComponentCapabilityLoader,
  type ComponentCapabilityLoader,
} from "./capability";
import {
  instantiateWasiAsyncProofsComponent,
  type WasiAsyncProofsInterface,
} from "./providers/wasi-async-proofs";
import { probeJspiSupport } from "./support-jspi";

/** Ready JSPI proof capability kept outside every production analyzer entry. */
export interface WasiAsyncProofsCapability {
  readonly proveAsyncFunc: (value: number) => Promise<number>;
  readonly proveFuture: (value: number) => PromiseLike<number>;
  readonly proveStream: (label: string) => Promise<AsyncIterable<number>>;
}

/** Normalize generated proof exports into the authored diagnostic surface. */
const instantiateWasiAsyncProofsCapability =
  async (): Promise<WasiAsyncProofsCapability> => {
    const proofs: WasiAsyncProofsInterface =
      await instantiateWasiAsyncProofsComponent();
    const capability: WasiAsyncProofsCapability = {
      proveAsyncFunc(value: number) {
        return proofs.proveAsyncFunc(value);
      },
      proveFuture(value: number) {
        return proofs.proveFuture(value);
      },
      proveStream(label: string) {
        return proofs.proveStream(label);
      },
    };
    return capability;
  };

/**
 * One-shot readiness boundary for the isolated WASI async-proof capability.
 *
 * This proof-only loader remains outside every production analyzer entry so
 * experimental async shapes cannot enlarge the production analysis API or
 * load during a normal analyzer selection.
 */
export const wasiAsyncProofsComponentLoader: ComponentCapabilityLoader<WasiAsyncProofsCapability> =
  createComponentCapabilityLoader({
    instantiate: instantiateWasiAsyncProofsCapability,
    probeSupport: probeJspiSupport,
    reportFailure(error) {
      console.info(
        "[wasi-0.3][inspector-component] component failed to instantiate",
        error,
      );
    },
  });

export type {
  ComponentCapabilityLoader,
  ComponentCapabilityPrepareResult,
  ComponentCapabilityState,
  ComponentUnsupportedReason,
} from "./capability";
