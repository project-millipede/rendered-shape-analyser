import type { ComponentCapabilitySupport } from "./capability";

/** Classify baseline WebAssembly support without starting provider work. */
export function probeWebAssemblySupport(): ComponentCapabilitySupport {
  const wasm = globalThis.WebAssembly;
  if (typeof wasm === "object" && wasm !== null) {
    return { status: "supported" };
  }
  return {
    status: "unsupported",
    reason: {
      code: "webassembly-unavailable",
      message: "WebAssembly is unavailable in this runtime",
    },
  };
}
