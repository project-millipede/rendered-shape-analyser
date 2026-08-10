import {
  transitionComponentCapabilityState,
  type ComponentCapabilityState,
  type ComponentCapabilityStateTransition,
  type ComponentCapabilityTransitionTrigger,
} from "./capability-state";

export type { ComponentCapabilityState } from "./capability-state";

/** Stable explanation for a platform capability that is not available. */
export interface ComponentUnsupportedReason {
  /** Machine-readable reason code suitable for fallback selection. */
  readonly code: string;
  /** Human-readable diagnostic message. */
  readonly message: string;
}

/** Result of explicitly preparing one selected component capability. */
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
    }
  | {
      readonly status: "disposed";
    };

/** Public provider-neutral lifecycle for one selected component capability. */
export interface ComponentCapabilityLoader<Capability> {
  /** Current mutable lifecycle state. */
  readonly state: ComponentCapabilityState;
  /** Prepare the selected component, sharing an active or settled attempt. */
  prepare(): Promise<ComponentCapabilityPrepareResult<Capability>>;
  /** Prepare from idle or start again after an unsupported or failed result. */
  retry(): Promise<ComponentCapabilityPrepareResult<Capability>>;
  /** Retire this loader and its privately owned prepared component once. */
  dispose(): Promise<void>;
}

/** Provider-owned prepared component retained behind the authored loader. */
export interface PrivatePreparedComponent<Capability> {
  /** Callable interface normalized for authored loader code. */
  capability: Capability;
  /** Provider-specific retirement operation; may intentionally be a no-op. */
  dispose(): Promise<void>;
}

/** Private operation that prepares one selected component implementation. */
export type InstantiateSelectedComponent<Capability> = () => Promise<
  PrivatePreparedComponent<Capability>
>;

/** Result of a synchronous platform-support probe. */
export type ComponentCapabilitySupport =
  | {
      status: "supported";
    }
  | {
      status: "unsupported";
      reason: ComponentUnsupportedReason;
    };

/** Internal construction policy for one capability loader. */
export interface ComponentCapabilityDefinition<Capability> {
  /** Prepare the selected private component implementation. */
  instantiate: InstantiateSelectedComponent<Capability>;
  /** Optionally reject unsupported environments before invoking the provider. */
  probeSupport?: () => ComponentCapabilitySupport;
  /** Report an unexpected attempt failure once without changing its result. */
  reportFailure?: (error: Error) => void;
}

/** Internal controller used by compatibility wrappers and synchronous callers. */
export interface ComponentCapabilityController<
  Capability,
> extends ComponentCapabilityLoader<Capability> {
  /** Return the prepared capability only while this loader remains ready. */
  getReadyCapability(): Capability | null;
  /** Preserve the existing nullable loader view over the current attempt. */
  prepareNullable(): Promise<Capability | null>;
}

/**
 * Expose only the provider-neutral public lifecycle of an internal controller.
 *
 * @param controller - Internal controller used by authored compatibility code.
 * @returns Frozen public view without synchronous or nullable helper methods.
 */
export function createComponentCapabilityLoaderView<Capability>(
  controller: ComponentCapabilityController<Capability>,
): ComponentCapabilityLoader<Capability> {
  return Object.freeze({
    get state() {
      return controller.state;
    },
    prepare() {
      return controller.prepare();
    },
    retry() {
      return controller.retry();
    },
    dispose() {
      return controller.dispose();
    },
  });
}

/** Stable result returned after a loader has been retired. */
const DISPOSED_RESULT = Object.freeze({ status: "disposed" } as const);

/**
 * Create one transport-neutral selected-component lifecycle.
 *
 * The controller deliberately knows nothing about generated bindings,
 * WebAssembly transport, WebGPU, scheduling, or measurement. Its only job is
 * to make preparation, retry, readiness, and retirement explicit.
 *
 * @param definition - Private provider and optional support/failure policy.
 * @returns A lifecycle controller for one selected component capability.
 */
export function createComponentCapabilityController<Capability>(
  definition: ComponentCapabilityDefinition<Capability>,
): ComponentCapabilityController<Capability> {
  let state: ComponentCapabilityState = "idle";
  let activePreparation: Promise<
    ComponentCapabilityPrepareResult<Capability>
  > | null = null;
  let nullablePreparation: Promise<Capability | null> | null = null;
  let preparedComponent: PrivatePreparedComponent<Capability> | null = null;
  let disposalPromise: Promise<void> | null = null;
  let lateDisposalError: Error | null = null;

  const isDisposed = (): boolean => state === "disposed";

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

  const retireLateCandidate = async (
    candidate: PrivatePreparedComponent<Capability>,
  ): Promise<ComponentCapabilityPrepareResult<Capability>> => {
    try {
      await candidate.dispose();
    } catch (error) {
      if (error instanceof Error) {
        lateDisposalError = error;
        return DISPOSED_RESULT;
      }
      lateDisposalError = new Error(String(error));
    }
    return DISPOSED_RESULT;
  };

  const createFailureResult = (
    error: Error,
  ): ComponentCapabilityPrepareResult<Capability> => {
    const outcome = applyTransition("preparation-failed");
    if (outcome.effect === "late-preparation") return DISPOSED_RESULT;
    reportFailure(error);
    if (isDisposed()) return DISPOSED_RESULT;
    return Object.freeze({ status: "failed" as const, error });
  };

  const performPreparation = async (): Promise<
    ComponentCapabilityPrepareResult<Capability>
  > => {
    if (isDisposed()) return DISPOSED_RESULT;

    const support = definition.probeSupport?.();
    if (support?.status === "unsupported") {
      const reason = Object.freeze({ ...support.reason });
      const outcome = applyTransition("support-unavailable");
      if (outcome.effect === "late-preparation") return DISPOSED_RESULT;
      return Object.freeze({
        status: "unsupported" as const,
        reason,
      });
    }

    if (isDisposed()) return DISPOSED_RESULT;
    const candidate = await definition.instantiate();
    if (isDisposed()) {
      applyTransition("preparation-succeeded");
      return retireLateCandidate(candidate);
    }

    const capability = candidate.capability;
    const outcome = applyTransition("preparation-succeeded");
    if (outcome.effect === "late-preparation") {
      return retireLateCandidate(candidate);
    }

    preparedComponent = candidate;
    return Object.freeze({
      status: "ready",
      capability,
    } as const);
  };

  const startPreparation = (): Promise<
    ComponentCapabilityPrepareResult<Capability>
  > => {
    nullablePreparation = null;
    lateDisposalError = null;

    const preparation = Promise.resolve()
      .then(performPreparation)
      .catch((error): ComponentCapabilityPrepareResult<Capability> => {
        if (error instanceof Error) {
          return createFailureResult(error);
        }
        return createFailureResult(new Error(String(error)));
      });

    activePreparation = preparation;
    return preparation;
  };

  const prepare = (): Promise<ComponentCapabilityPrepareResult<Capability>> => {
    const request = applyTransition("prepare-requested");
    if (isDisposed()) return Promise.resolve(DISPOSED_RESULT);
    if (request.effect === "state-changed") return startPreparation();
    if (activePreparation) return activePreparation;
    throw new Error(`component capability ${state} state has no preparation`);
  };

  const retry = (): Promise<ComponentCapabilityPrepareResult<Capability>> => {
    const request = applyTransition("retry-requested");
    if (isDisposed()) return Promise.resolve(DISPOSED_RESULT);
    if (request.effect === "state-changed") {
      activePreparation = null;
      return startPreparation();
    }
    if (activePreparation) return activePreparation;
    throw new Error(`component capability ${state} state has no preparation`);
  };

  const dispose = (): Promise<void> => {
    const previousState = state;
    applyTransition("dispose-requested");
    if (disposalPromise) return disposalPromise;

    const pendingPreparation = activePreparation;
    const component = preparedComponent;
    activePreparation = null;
    preparedComponent = null;
    nullablePreparation = Promise.resolve(null);

    if (previousState === "preparing" && pendingPreparation) {
      disposalPromise = pendingPreparation.then(() => {
        const cleanupError = lateDisposalError;
        lateDisposalError = null;
        if (cleanupError) throw cleanupError;
      });
      return disposalPromise;
    }

    if (!component) {
      disposalPromise = Promise.resolve();
      return disposalPromise;
    }

    disposalPromise = Promise.resolve().then(() => component.dispose());
    return disposalPromise;
  };

  return {
    get state() {
      return state;
    },
    prepare,
    retry,
    dispose,
    getReadyCapability() {
      if (state !== "ready") return null;
      if (!preparedComponent) return null;
      return preparedComponent.capability;
    },
    prepareNullable() {
      if (nullablePreparation) return nullablePreparation;
      nullablePreparation = prepare().then((result) => {
        if (result.status !== "ready") return null;
        return result.capability;
      });
      return nullablePreparation;
    },
  };
}
