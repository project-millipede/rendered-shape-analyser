import { describe, expect, it, vi } from "vitest";

import {
  createComponentCapabilityLoader,
  type ComponentCapabilityLoader,
} from "../../../component-loader/src/capability.js";

/** Small callable value used to prove exact capability identity. */
interface TestCapability {
  run(): string;
}

/** Controllable promise used to hold a preparation attempt in flight. */
interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(error: Error): void;
}

/** Create one locally controlled promise without shared test machinery. */
const createDeferred = <Value>(): Deferred<Value> => {
  let resolvePromise: ((value: Value) => void) | undefined;
  let rejectPromise: ((error: Error) => void) | undefined;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
    reject(error) {
      rejectPromise?.(error);
    },
  };
};

/** Create one callable fixture whose identity is stable across assertions. */
const createCapability = (label: string): TestCapability => ({
  run: () => label,
});

describe("component capability loader", () => {
  it("[P10] shares one preparation Promise and enters ready once", async () => {
    const deferred = createDeferred<TestCapability>();
    const capability = createCapability("ready");
    const instantiate = vi.fn(() => deferred.promise);
    const loader = createComponentCapabilityLoader({ instantiate });

    expect(loader.state).toBe("idle");

    const first = loader.prepare();
    const second = loader.prepare();
    expect(first).toBe(second);
    expect(loader.state).toBe("preparing");

    await Promise.resolve();
    expect(instantiate).toHaveBeenCalledTimes(1);
    deferred.resolve(capability);

    const result = await first;
    expect(result).toEqual({ status: "ready", capability });
    expect(loader.state).toBe("ready");
    expect(loader.prepare()).toBe(first);
    expect(await loader.prepare()).toBe(result);
    expect(instantiate).toHaveBeenCalledTimes(1);
  });

  it("[P10] settles unsupported without invoking or retrying the provider", async () => {
    let supported = false;
    const instantiate = vi.fn(() =>
      Promise.resolve(createCapability("must-not-load")),
    );
    const loader = createComponentCapabilityLoader({
      instantiate,
      probeSupport: () => {
        if (supported) return { status: "supported" };
        return {
          status: "unsupported",
          reason: {
            code: "fixture-unavailable",
            message: "fixture support is unavailable",
          },
        };
      },
    });

    const preparation = loader.prepare();
    const result = await preparation;
    expect(result).toEqual({
      status: "unsupported",
      reason: {
        code: "fixture-unavailable",
        message: "fixture support is unavailable",
      },
    });
    expect(loader.state).toBe("unsupported");
    expect(instantiate).not.toHaveBeenCalled();

    supported = true;
    expect(loader.prepare()).toBe(preparation);
    expect(await loader.prepare()).toBe(result);
    expect(instantiate).not.toHaveBeenCalled();
  });

  it("[P10] settles provider failure and reports it exactly once", async () => {
    const reportFailure = vi.fn();
    const instantiate = vi.fn(() => Promise.reject("provider rejected"));
    const loader = createComponentCapabilityLoader({
      instantiate,
      reportFailure,
    });

    const preparation = loader.prepare();
    const result = await preparation;
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("provider rejected");
    }
    expect(loader.state).toBe("failed");
    expect(loader.prepare()).toBe(preparation);
    expect(await loader.prepare()).toBe(result);
    expect(instantiate).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledTimes(1);
  });

  it("[P10] settles an unreadable rejection instead of remaining preparing", async () => {
    const rejection = Object.create(null) as object;
    const instantiate = vi.fn(() => Promise.reject(rejection));
    const loader = createComponentCapabilityLoader({ instantiate });

    const preparation = loader.prepare();
    const result = await preparation;

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error.message).toBe(
        "component capability preparation rejected with an unreadable value",
      );
    }
    expect(loader.state).toBe("failed");
    expect(loader.prepare()).toBe(preparation);
    expect(instantiate).toHaveBeenCalledTimes(1);
  });

  it("[P9] keeps failure reporting non-authoritative and reentrant-safe", async () => {
    let loader: ComponentCapabilityLoader<TestCapability>;
    let reentrantPreparation: Promise<unknown> | null = null;
    loader = createComponentCapabilityLoader({
      instantiate: () => Promise.reject(new Error("fixture failure")),
      reportFailure() {
        reentrantPreparation = loader.prepare();
        throw new Error("reporter failure");
      },
    });

    const preparation = loader.prepare();
    const result = await preparation;
    expect(result.status).toBe("failed");
    expect(reentrantPreparation).toBe(preparation);
    expect(loader.state).toBe("failed");
  });

  it("[P9] exposes only state and one-shot prepare", async () => {
    const capability = createCapability("opaque");
    const loader = createComponentCapabilityLoader({
      instantiate: () => Promise.resolve(capability),
    });

    const result = await loader.prepare();
    expect(result).toEqual({ status: "ready", capability });
    expect(Object.keys(loader).sort()).toEqual(["prepare", "state"]);
    expect("retry" in loader).toBe(false);
    expect("dispose" in loader).toBe(false);
  });
});
