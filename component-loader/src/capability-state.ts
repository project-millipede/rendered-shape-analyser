/** Current lifecycle state stored by one component capability loader. */
export type ComponentCapabilityState =
  | "idle"
  | "preparing"
  | "ready"
  | "unsupported"
  | "failed"
  | "disposed";

/** Input that asks the pure state machine to evaluate one transition. */
export type ComponentCapabilityTransitionTrigger =
  | "prepare-requested"
  | "retry-requested"
  | "preparation-succeeded"
  | "support-unavailable"
  | "preparation-failed"
  | "dispose-requested";

/** Classification of how one transition trigger affects stored state. */
export type ComponentCapabilityTransitionEffect =
  | "state-changed"
  | "state-unchanged"
  | "late-preparation";

/** Complete pure result of applying one transition trigger. */
export interface ComponentCapabilityStateTransition {
  readonly previousState: ComponentCapabilityState;
  readonly nextState: ComponentCapabilityState;
  readonly trigger: ComponentCapabilityTransitionTrigger;
  readonly effect: ComponentCapabilityTransitionEffect;
}

/*
 * Data flow:
 *
 * current state + transition trigger -> state transition -> next state
 *
 * A trigger is only a pure-function input. Nothing in this module emits an
 * event, calls a listener, or stores state.
 */

/** Create one immutable transition result. */
const createTransition = (
  previousState: ComponentCapabilityState,
  nextState: ComponentCapabilityState,
  trigger: ComponentCapabilityTransitionTrigger,
  effect: ComponentCapabilityTransitionEffect,
): ComponentCapabilityStateTransition =>
  Object.freeze({ previousState, nextState, trigger, effect });

/**
 * Apply one pure lifecycle transition.
 *
 * This function owns no promises, provider calls, capabilities, or cleanup.
 * Normal capability operations such as `analyze()` and `encode()` are
 * deliberately absent: once ready, ordinary execution does not change loader
 * state.
 *
 * A trigger is an input to this function. It is not an emitted notification.
 * The returned transition states whether the input changed stored state.
 *
 * @param state - Current authoritative loader state.
 * @param trigger - Transition input to evaluate.
 * @returns The complete transition, including whether state changed.
 */
export function transitionComponentCapabilityState(
  state: ComponentCapabilityState,
  trigger: ComponentCapabilityTransitionTrigger,
): ComponentCapabilityStateTransition {
  if (state === "disposed") {
    if (
      trigger === "preparation-succeeded" ||
      trigger === "support-unavailable" ||
      trigger === "preparation-failed"
    ) {
      return createTransition(state, state, trigger, "late-preparation");
    }
    return createTransition(state, state, trigger, "state-unchanged");
  }
  if (trigger === "dispose-requested") {
    return createTransition(state, "disposed", trigger, "state-changed");
  }

  if (trigger === "prepare-requested") {
    if (state === "idle") {
      return createTransition(state, "preparing", trigger, "state-changed");
    }
    return createTransition(state, state, trigger, "state-unchanged");
  }

  if (trigger === "retry-requested") {
    if (state === "idle" || state === "unsupported" || state === "failed") {
      return createTransition(state, "preparing", trigger, "state-changed");
    }
    return createTransition(state, state, trigger, "state-unchanged");
  }

  if (state !== "preparing") {
    throw new Error(
      `invalid component capability transition: ${state} + ${trigger}`,
    );
  }

  switch (trigger) {
    case "preparation-succeeded":
      return createTransition(state, "ready", trigger, "state-changed");
    case "support-unavailable":
      return createTransition(state, "unsupported", trigger, "state-changed");
    case "preparation-failed":
      return createTransition(state, "failed", trigger, "state-changed");
  }
}
