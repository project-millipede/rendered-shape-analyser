import { describe, expect, it } from "vitest";

import {
  transitionComponentCapabilityState,
  type ComponentCapabilityState,
  type ComponentCapabilityTransitionEffect,
  type ComponentCapabilityTransitionTrigger,
} from "../../../component-loader/src/capability-state.js";

/** One explicit pure transition expectation. */
interface TransitionCase {
  state: ComponentCapabilityState;
  trigger: ComponentCapabilityTransitionTrigger;
  expectedState: ComponentCapabilityState;
  effect: ComponentCapabilityTransitionEffect;
}

/** Preparation settlements that only an active attempt may publish. */
const PREPARATION_SETTLEMENTS: ReadonlyArray<ComponentCapabilityTransitionTrigger> =
  ["preparation-succeeded", "support-unavailable", "preparation-failed"];

/** Classify terminal requests separately from late preparation settlements. */
const expectedDisposedEffect = (
  trigger: ComponentCapabilityTransitionTrigger,
): ComponentCapabilityTransitionEffect => {
  if (PREPARATION_SETTLEMENTS.includes(trigger)) return "late-preparation";
  return "state-unchanged";
};

/** Assert the full transition so repeated states cannot look newly entered. */
const expectTransition = ({
  state,
  trigger,
  expectedState,
  effect,
}: TransitionCase): void => {
  expect(transitionComponentCapabilityState(state, trigger)).toEqual({
    previousState: state,
    nextState: expectedState,
    trigger,
    effect,
  });
};

describe("component capability state machine", () => {
  it("[P10] follows the preparation and retirement lifecycle", () => {
    let state: ComponentCapabilityState = "idle";

    state = transitionComponentCapabilityState(
      state,
      "prepare-requested",
    ).nextState;
    expect(state).toBe("preparing");

    const ready = transitionComponentCapabilityState(
      state,
      "preparation-succeeded",
    );
    expect(ready.effect).toBe("state-changed");
    state = ready.nextState;
    expect(state).toBe("ready");

    state = transitionComponentCapabilityState(
      state,
      "dispose-requested",
    ).nextState;
    expect(state).toBe("disposed");
  });

  it("[P10] keeps repeated requests on their current settled state", () => {
    const cases: ReadonlyArray<TransitionCase> = [
      {
        state: "preparing",
        trigger: "prepare-requested",
        expectedState: "preparing",
        effect: "state-unchanged",
      },
      {
        state: "preparing",
        trigger: "retry-requested",
        expectedState: "preparing",
        effect: "state-unchanged",
      },
      {
        state: "ready",
        trigger: "prepare-requested",
        expectedState: "ready",
        effect: "state-unchanged",
      },
      {
        state: "ready",
        trigger: "retry-requested",
        expectedState: "ready",
        effect: "state-unchanged",
      },
      {
        state: "unsupported",
        trigger: "prepare-requested",
        expectedState: "unsupported",
        effect: "state-unchanged",
      },
      {
        state: "failed",
        trigger: "prepare-requested",
        expectedState: "failed",
        effect: "state-unchanged",
      },
    ];

    for (const transition of cases) expectTransition(transition);
  });

  it("[P10] starts an attempt only from idle or retryable outcomes", () => {
    const cases: ReadonlyArray<TransitionCase> = [
      {
        state: "idle",
        trigger: "prepare-requested",
        expectedState: "preparing",
        effect: "state-changed",
      },
      {
        state: "idle",
        trigger: "retry-requested",
        expectedState: "preparing",
        effect: "state-changed",
      },
      {
        state: "unsupported",
        trigger: "retry-requested",
        expectedState: "preparing",
        effect: "state-changed",
      },
      {
        state: "failed",
        trigger: "retry-requested",
        expectedState: "preparing",
        effect: "state-changed",
      },
    ];

    for (const transition of cases) expectTransition(transition);
  });

  it("[P10] accepts preparation settlements only while preparing", () => {
    const cases: ReadonlyArray<TransitionCase> = [
      {
        state: "preparing",
        trigger: "preparation-succeeded",
        expectedState: "ready",
        effect: "state-changed",
      },
      {
        state: "preparing",
        trigger: "support-unavailable",
        expectedState: "unsupported",
        effect: "state-changed",
      },
      {
        state: "preparing",
        trigger: "preparation-failed",
        expectedState: "failed",
        effect: "state-changed",
      },
    ];
    for (const transition of cases) expectTransition(transition);

    const inactiveStates: ReadonlyArray<ComponentCapabilityState> = [
      "idle",
      "ready",
      "unsupported",
      "failed",
    ];
    for (const state of inactiveStates) {
      for (const trigger of PREPARATION_SETTLEMENTS) {
        expect(() =>
          transitionComponentCapabilityState(state, trigger),
        ).toThrow(
          `invalid component capability transition: ${state} + ${trigger}`,
        );
      }
    }
  });

  it("[P10] makes disposed absorb requests and late settlements", () => {
    const triggers: ReadonlyArray<ComponentCapabilityTransitionTrigger> = [
      "prepare-requested",
      "retry-requested",
      "preparation-succeeded",
      "support-unavailable",
      "preparation-failed",
      "dispose-requested",
    ];

    for (const trigger of triggers) {
      expect(transitionComponentCapabilityState("disposed", trigger)).toEqual({
        previousState: "disposed",
        nextState: "disposed",
        trigger,
        effect: expectedDisposedEffect(trigger),
      });
    }
  });

  it("[P9] permits disposal from every live state", () => {
    const liveStates: ReadonlyArray<ComponentCapabilityState> = [
      "idle",
      "preparing",
      "ready",
      "unsupported",
      "failed",
    ];

    for (const state of liveStates) {
      expect(
        transitionComponentCapabilityState(state, "dispose-requested"),
      ).toEqual({
        previousState: state,
        nextState: "disposed",
        trigger: "dispose-requested",
        effect: "state-changed",
      });
    }
  });
});
