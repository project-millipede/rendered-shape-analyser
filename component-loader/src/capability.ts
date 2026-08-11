import {
  transitionComponentCapabilityState,
  type ComponentCapabilityState,
  type ComponentCapabilityStateTransition,
  type ComponentCapabilityTransitionTrigger,
} from "./capability-state";
import { normalizeCaughtError } from "./errors";

export type { ComponentCapabilityState } from "./capability-state";

/** Stable explanation for a platform capability that is not available. */
export interface ComponentUnsupportedReason {
  /** Machine-readable reason code suitable for fallback selection. */
  readonly code: string;
  /** Human-readable diagnostic message. */
  readonly message: string;
}

/** Settled result of explicitly preparing one selected component capability. */
export type ComponentCapabilityPrepareResult<Capability> =
  | {
      readonly status: "ready";
      readonly capability: Capability;
    }
  | {
      readonly status: "unsupported";
      readonly reason: ComponentUnsupportedReason;
    }
  | {
      readonly status: "failed";
      readonly error: Error;
    };

/** Public one-shot readiness boundary for one selected component capability. */
export interface ComponentCapabilityLoader<Capability> {
  /** Current mutable preparation state. */
  readonly state: ComponentCapabilityState;
  /** Prepare once, sharing the same active or settled Promise forever. */
  readonly prepare: () => Promise<ComponentCapabilityPrepareResult<Capability>>;
}

/** Private operation that prepares one selected component implementation. */
export type InstantiateSelectedComponent<Capability> =
  () => Promise<Capability>;

/** Result of a synchronous platform-support probe. */
export type ComponentCapabilitySupport =
  | {
      readonly status: "supported";
    }
  | {
      readonly status: "unsupported";
      readonly reason: ComponentUnsupportedReason;
    };

/** Internal construction policy for one capability loader. */
export interface ComponentCapabilityDefinition<Capability> {
  /** Prepare the selected private component implementation. */
  readonly instantiate: InstantiateSelectedComponent<Capability>;
  /** Optionally reject unsupported environments before invoking the provider. */
  readonly probeSupport?: () => ComponentCapabilitySupport;
  /** Report an unexpected attempt failure once without changing its result. */
  readonly reportFailure?: (error: Error) => void;
}

/**
 * Create one transport-neutral, one-shot selected-component loader.
 *
 * The loader deliberately knows nothing about generated bindings,
 * WebAssembly transport, WebGPU, scheduling, or measurement. Page-wide
 * variant entries do not expose retry or disposal: browser ESM failures can
 * be cached for the same URL, while current generated providers have no real
 * component-unload operation. Device-local resources are retired separately
 * by their actual browser owners.
 *
 * This loader does not own application variant selection. After preparation
 * starts, it does not cancel the provider attempt or suppress its settlement
 * when a consumer selects another variant. It always settles and caches that
 * attempt. The consumer's session or selection controller must decide whether
 * the completed capability is still current before publishing or invoking it.
 *
 * Removing loader-level disposal does not remove provider-specific resource
 * cleanup. This state machine owns readiness only. Invocation adapters remain
 * responsible for temporary WIT projections, while result and session owners
 * remain responsible for transferred GPU buffers, pending frame summaries,
 * and device-generation resources through their dedicated lifecycles.
 *
 * @param definition - Selected provider and optional support/failure policies.
 * @returns A one-shot loader sharing one active or settled preparation.
 */
export function createComponentCapabilityLoader<Capability>(
  definition: ComponentCapabilityDefinition<Capability>,
): ComponentCapabilityLoader<Capability> {
  let state: ComponentCapabilityState = "idle";
  let preparation: Promise<
    ComponentCapabilityPrepareResult<Capability>
  > | null = null;

  const applyTransition = (
    trigger: ComponentCapabilityTransitionTrigger,
  ): ComponentCapabilityStateTransition => {
    const result = transitionComponentCapabilityState(state, trigger);
    state = result.nextState;
    return result;
  };

  const reportFailure = (error: Error): void => {
    try {
      definition.reportFailure?.(error);
    } catch {
      // Diagnostics must not alter the authoritative preparation result.
    }
  };

  const createFailureResult = (
    caught: unknown,
  ): ComponentCapabilityPrepareResult<Capability> => {
    const error = normalizeCaughtError(
      caught,
      "component capability preparation rejected with an unreadable value",
    );
    applyTransition("preparation-failed");
    reportFailure(error);
    return { status: "failed", error };
  };

  const performPreparation = async (): Promise<
    ComponentCapabilityPrepareResult<Capability>
  > => {
    const support = definition.probeSupport?.();
    if (support?.status === "unsupported") {
      const reason: ComponentUnsupportedReason = { ...support.reason };
      applyTransition("support-unavailable");
      return {
        status: "unsupported",
        reason,
      };
    }

    const capability = await definition.instantiate();
    applyTransition("preparation-succeeded");
    return { status: "ready", capability };
  };

  const startPreparation = (): Promise<
    ComponentCapabilityPrepareResult<Capability>
  > => {
    const started = Promise.resolve()
      .then(performPreparation)
      .catch(createFailureResult);
    preparation = started;
    return started;
  };

  const prepare = (): Promise<ComponentCapabilityPrepareResult<Capability>> => {
    const transition = applyTransition("prepare-requested");
    if (transition.effect === "state-changed") return startPreparation();
    if (preparation) return preparation;
    throw new Error(`component capability ${state} state has no preparation`);
  };

  return {
    get state() {
      return state;
    },
    prepare,
  };
}
