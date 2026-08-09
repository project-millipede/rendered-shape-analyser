/**
 * Chrome/JSPI-only upstream WebGPU error-scope helpers.
 *
 * Browser error scopes are naturally promise-shaped when popped, so these
 * helpers stay out of the stable `component-gpu` path.
 */

import type * as GeneratedAsyncWebGpu from "../../../../../pkg/generated/gpu-analysis-async/interfaces/wasi-webgpu-webgpu";
import { CLEAN_ERROR_SCOPE_MESSAGE } from "./clean-scope-sentinel";

/**
 * Push a browser WebGPU error scope for upstream `gpu-device.push-error-scope`.
 *
 * 1. Uses the already registered browser `GPUDevice`.
 * 2. Starts a validation/internal/out-of-memory scope selected by Rust.
 * 3. Leaves the promise-shaped pop operation to the async helper.
 *
 * @param device - Browser WebGPU device represented by the upstream handle.
 * @param filter - Upstream error filter selected by the Rust component.
 * @returns Nothing.
 */
export function pushBrowserErrorScope(
  device: GPUDevice,
  filter: GeneratedAsyncWebGpu.GpuErrorFilter,
): void {
  device.pushErrorScope(filter);
}

/**
 * Pop a browser WebGPU error scope for upstream `gpu-device.pop-error-scope`.
 *
 * 1. Awaits the real browser `GPUDevice.popErrorScope()` promise.
 * 2. Returns the browser error message when WebGPU reports a validation issue.
 * 3. Returns the local clean-scope sentinel while this async resource-result
 *    shape remains isolated behind the Chrome/JSPI backend.
 *
 * @param device - Browser WebGPU device represented by the upstream handle.
 * @returns Error message, or the clean-scope sentinel when no error occurred.
 */
export async function popBrowserErrorScopeMessage(
  device: GPUDevice,
): Promise<string> {
  const error = await device.popErrorScope();
  return error?.message ?? CLEAN_ERROR_SCOPE_MESSAGE;
}

/**
 * Create the generated WIT error record for a failed pop operation.
 *
 * 1. Keeps the object shape exactly aligned with jco-generated declarations.
 * 2. Avoids broad `any` or `unknown` types at the authored boundary.
 * 3. Lets callers narrow thrown JavaScript values before choosing the message.
 *
 * @param message - Human-readable failure reason.
 * @returns Generated `pop-error-scope-error` record.
 */
export function createPopErrorScopeError(
  message: string,
): GeneratedAsyncWebGpu.PopErrorScopeError {
  return {
    kind: { tag: "operation-error" },
    message,
  };
}
