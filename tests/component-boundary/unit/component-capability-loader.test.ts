import { describe, expect, it, vi } from "vitest";

import {
  createComponentCapabilityController,
  createComponentCapabilityLoaderView,
  type ComponentCapabilityController,
  type PrivatePreparedComponent,
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

/** Create one locally controlled promise without adding shared test machinery. */
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
  it("[P10] shares one preparation attempt and retains the ready capability", async () => {
    const deferred = createDeferred<PrivatePreparedComponent<TestCapability>>();
    const capability = createCapability("ready");
    const instantiate = vi.fn(() => deferred.promise);
    const controller = createComponentCapabilityController({ instantiate });

    expect(controller.state).toBe("idle");

    const first = controller.prepare();
    const second = controller.prepare();
    expect(controller.state).toBe("preparing");
    expect(first).toBe(second);

    await Promise.resolve();
    expect(instantiate).toHaveBeenCalledTimes(1);

    deferred.resolve({
      capability,
      dispose: () => Promise.resolve(),
    });

    await expect(first).resolves.toEqual({ status: "ready", capability });
    await expect(second).resolves.toEqual({ status: "ready", capability });
    expect(controller.state).toBe("ready");
    expect(controller.getReadyCapability()).toBe(capability);
    expect(controller.prepare()).toBe(first);
    expect(controller.prepareNullable()).toBe(controller.prepareNullable());
    await expect(controller.prepareNullable()).resolves.toBe(capability);
    expect(instantiate).toHaveBeenCalledTimes(1);
  });

  it("[P10] distinguishes unsupported environments and retries explicitly", async () => {
    let supported = false;
    const capability = createCapability("supported-after-retry");
    const instantiate = vi.fn(() =>
      Promise.resolve({
        capability,
        dispose: () => Promise.resolve(),
      }),
    );
    const controller = createComponentCapabilityController({
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

    const unsupported = controller.prepare();
    await expect(unsupported).resolves.toEqual({
      status: "unsupported",
      reason: {
        code: "fixture-unavailable",
        message: "fixture support is unavailable",
      },
    });
    expect(controller.state).toBe("unsupported");
    expect(instantiate).not.toHaveBeenCalled();
    expect(controller.prepare()).toBe(unsupported);

    supported = true;
    const retried = controller.retry();
    expect(retried).not.toBe(unsupported);
    await expect(retried).resolves.toEqual({ status: "ready", capability });
    expect(controller.state).toBe("ready");
    expect(instantiate).toHaveBeenCalledTimes(1);
  });

  it("[P10] retains typed failure until an explicit retry succeeds", async () => {
    const capability = createCapability("retry-ready");
    const reportFailure = vi.fn();
    let attempt = 0;
    const instantiate = vi.fn(() => {
      attempt += 1;
      if (attempt === 1) return Promise.reject("provider rejected");
      return Promise.resolve({
        capability,
        dispose: () => Promise.resolve(),
      });
    });
    const controller = createComponentCapabilityController({
      instantiate,
      reportFailure,
    });

    const failed = controller.prepare();
    const failure = await failed;
    expect(failure.status).toBe("failed");
    if (failure.status === "failed") {
      expect(failure.error).toBeInstanceOf(Error);
      expect(failure.error.message).toBe("provider rejected");
    }
    expect(controller.state).toBe("failed");
    expect(controller.prepare()).toBe(failed);
    expect(instantiate).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledTimes(1);

    await expect(controller.retry()).resolves.toEqual({
      status: "ready",
      capability,
    });
    expect(instantiate).toHaveBeenCalledTimes(2);
    expect(reportFailure).toHaveBeenCalledTimes(1);
  });

  it("[P10] resets the nullable compatibility view after explicit retry", async () => {
    const capability = createCapability("nullable-retry-ready");
    let attempt = 0;
    const controller = createComponentCapabilityController<TestCapability>({
      instantiate: () => {
        attempt += 1;
        if (attempt === 1) {
          return Promise.reject(new Error("first attempt failed"));
        }
        return Promise.resolve({
          capability,
          dispose: () => Promise.resolve(),
        });
      },
    });

    const failedCompatibilityView = controller.prepareNullable();
    expect(controller.prepareNullable()).toBe(failedCompatibilityView);
    await expect(failedCompatibilityView).resolves.toBeNull();

    await expect(controller.retry()).resolves.toEqual({
      status: "ready",
      capability,
    });
    const readyCompatibilityView = controller.prepareNullable();
    expect(readyCompatibilityView).not.toBe(failedCompatibilityView);
    await expect(readyCompatibilityView).resolves.toBe(capability);
  });

  it("[P10] keeps disposal authoritative when failure reporting reenters", async () => {
    let controller: ComponentCapabilityController<TestCapability>;
    controller = createComponentCapabilityController({
      instantiate: () => Promise.reject(new Error("reported failure")),
      reportFailure() {
        void controller.dispose();
      },
    });

    await expect(controller.prepare()).resolves.toEqual({
      status: "disposed",
    });
    expect(controller.state).toBe("disposed");
  });

  it("[P10] quarantines and cleans a capability completed after disposal", async () => {
    const deferred = createDeferred<PrivatePreparedComponent<TestCapability>>();
    const capability = createCapability("late");
    const privateDispose = vi.fn(() => Promise.resolve());
    const controller = createComponentCapabilityController({
      instantiate: () => deferred.promise,
    });

    const preparation = controller.prepare();
    await Promise.resolve();
    const disposal = controller.dispose();

    expect(controller.state).toBe("disposed");
    expect(controller.getReadyCapability()).toBeNull();

    deferred.resolve({ capability, dispose: privateDispose });
    await expect(preparation).resolves.toEqual({ status: "disposed" });
    await expect(disposal).resolves.toBeUndefined();
    expect(privateDispose).toHaveBeenCalledTimes(1);
    expect(controller.getReadyCapability()).toBeNull();
    await expect(controller.prepare()).resolves.toEqual({ status: "disposed" });
    await expect(controller.retry()).resolves.toEqual({ status: "disposed" });
  });

  it("[P10] prevents reentrant disposal from publishing a capability", async () => {
    const capability = createCapability("reentrant-disposal");
    const privateDispose = vi.fn(() => Promise.resolve());
    let controller: ComponentCapabilityController<TestCapability>;
    controller = createComponentCapabilityController({
      instantiate: () =>
        Promise.resolve({
          get capability() {
            void controller.dispose();
            return capability;
          },
          dispose: privateDispose,
        }),
    });

    await expect(controller.prepare()).resolves.toEqual({
      status: "disposed",
    });
    await expect(controller.dispose()).resolves.toBeUndefined();
    expect(controller.state).toBe("disposed");
    expect(controller.getReadyCapability()).toBeNull();
    expect(privateDispose).toHaveBeenCalledTimes(1);
  });

  it("[P10] retires a ready private provider exactly once", async () => {
    const capability = createCapability("retired");
    const privateDispose = vi.fn(() => Promise.resolve());
    const controller = createComponentCapabilityController({
      instantiate: () =>
        Promise.resolve({ capability, dispose: privateDispose }),
    });

    await expect(controller.prepare()).resolves.toEqual({
      status: "ready",
      capability,
    });

    const firstDisposal = controller.dispose();
    const secondDisposal = controller.dispose();
    expect(firstDisposal).toBe(secondDisposal);
    await expect(firstDisposal).resolves.toBeUndefined();
    expect(controller.state).toBe("disposed");
    expect(privateDispose).toHaveBeenCalledTimes(1);
    await expect(controller.prepareNullable()).resolves.toBeNull();
  });

  it("[P9] disposes idle, unsupported, and failed loaders idempotently", async () => {
    const idleInstantiate = vi.fn(() =>
      Promise.resolve({
        capability: createCapability("idle"),
        dispose: () => Promise.resolve(),
      }),
    );
    const idle = createComponentCapabilityController({
      instantiate: idleInstantiate,
    });
    await idle.dispose();
    await idle.dispose();
    expect(idle.state).toBe("disposed");
    expect(idleInstantiate).not.toHaveBeenCalled();

    const unsupportedInstantiate = vi.fn(() =>
      Promise.resolve({
        capability: createCapability("unsupported"),
        dispose: () => Promise.resolve(),
      }),
    );
    const unsupported = createComponentCapabilityController({
      instantiate: unsupportedInstantiate,
      probeSupport: () => ({
        status: "unsupported",
        reason: { code: "unsupported", message: "unsupported fixture" },
      }),
    });
    await unsupported.prepare();
    await unsupported.dispose();
    await unsupported.dispose();
    expect(unsupported.state).toBe("disposed");
    expect(unsupportedInstantiate).not.toHaveBeenCalled();

    const failed = createComponentCapabilityController<TestCapability>({
      instantiate: () => Promise.reject(new Error("fixture failure")),
    });
    await failed.prepare();
    await failed.dispose();
    await failed.dispose();
    expect(failed.state).toBe("disposed");
  });

  it("[P9] keeps provider ownership out of the public ready result", async () => {
    const capability = createCapability("opaque");
    const privateDispose = vi.fn(() => Promise.resolve());
    const controller = createComponentCapabilityController({
      instantiate: () =>
        Promise.resolve({ capability, dispose: privateDispose }),
    });
    const loader = createComponentCapabilityLoaderView(controller);

    const result = await loader.prepare();
    expect(result).toEqual({ status: "ready", capability });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(loader)).toBe(true);
    expect(Object.keys(result).sort()).toEqual(["capability", "status"]);
    expect(Object.keys(loader).sort()).toEqual([
      "dispose",
      "prepare",
      "retry",
      "state",
    ]);
    expect("getReadyCapability" in loader).toBe(false);
    expect("prepareNullable" in loader).toBe(false);

    await loader.dispose();
    expect(loader.state).toBe("disposed");
    expect(result.status).toBe("ready");
    expect(privateDispose).toHaveBeenCalledTimes(1);
  });
});
