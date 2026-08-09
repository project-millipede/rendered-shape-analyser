/**
 * Local sentinel for the async WebGPU error-scope boundary.
 *
 * This file is intentionally async-path-only. Delete it once the clean
 * `pop-error-scope` result can be represented without a sentinel.
 */

/**
 * Empty WebGPU error message used as the clean `pop-error-scope` sentinel.
 *
 * Returning a `gpu-error` resource with this message keeps the clean-scope
 * sentinel local and lets Rust treat the scope as successful.
 */
export const CLEAN_ERROR_SCOPE_MESSAGE = "";
