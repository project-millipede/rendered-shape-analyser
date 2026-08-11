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

/** Assert the complete transition record. */
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
  it("[P10] enters ready exactly once", () => {
    const preparing = transitionComponentCapabilityState(
      "idle",
      "prepare-requested",
    );
    expect(preparing).toEqual({
      previousState: "idle",
      nextState: "preparing",
      trigger: "prepare-requested",
      effect: "state-changed",
    });

    const ready = transitionComponentCapabilityState(
      preparing.nextState,
      "preparation-succeeded",
    );
    expect(ready).toEqual({
      previousState: "preparing",
      nextState: "ready",
      trigger: "preparation-succeeded",
      effect: "state-changed",
    });

    expectTransition({
      state: ready.nextState,
      trigger: "prepare-requested",
      expectedState: "ready",
      effect: "state-unchanged",
    });
  });

  it("[P10] keeps every active or settled prepare request unchanged", () => {
    const states: ReadonlyArray<ComponentCapabilityState> = [
      "preparing",
      "ready",
      "unsupported",
      "failed",
    ];

    for (const state of states) {
      expectTransition({
        state,
        trigger: "prepare-requested",
        expectedState: state,
        effect: "state-unchanged",
      });
    }
  });

  it("[P10] maps the three legal settlements from preparing", () => {
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
  });

  it("[P10] rejects settlements without an active preparation", () => {
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
});
