import type { ComponentCapabilitySupport } from "./capability";

/**
 * Classify JSPI support before importing a JSPI-generated provider.
 *
 * Generated async modules may reference `WebAssembly.Suspending` and
 * `WebAssembly.promising` during evaluation. The selected loader must run this
 * synchronous probe before it starts the dynamic provider import.
 */
export function probeJspiSupport(): ComponentCapabilitySupport {
  const wasm = globalThis.WebAssembly;
  if (typeof wasm !== "object" || wasm === null) {
    return {
      status: "unsupported",
      reason: {
        code: "jspi-unavailable",
        message:
          "WebAssembly.Suspending and WebAssembly.promising are unavailable",
      },
    };
  }
  const jspi = wasm as typeof wasm & {
    readonly Suspending?: never;
    readonly promising?: never;
  };
  if (typeof jspi.Suspending !== "function") {
    return {
      status: "unsupported",
      reason: {
        code: "jspi-unavailable",
        message:
          "WebAssembly.Suspending and WebAssembly.promising are unavailable",
      },
    };
  }
  if (typeof jspi.promising !== "function") {
    return {
      status: "unsupported",
      reason: {
        code: "jspi-unavailable",
        message:
          "WebAssembly.Suspending and WebAssembly.promising are unavailable",
      },
    };
  }
  return { status: "supported" };
}
