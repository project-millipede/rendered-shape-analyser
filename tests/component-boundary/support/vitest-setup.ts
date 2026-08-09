/**
 * Shared lifecycle setup for the compiled, stateful component test host.
 *
 * 1. JCO-generated components statically import the emitted host modules under
 *    `target/component-tests/host`.
 * 2. This setup imports the same emitted `reset.js` URL so components and tests
 *    share one ESM instance, including capture arrays and WeakMap registries.
 * 3. Importing `host/reset.ts` directly would create a second source-module
 *    instance and reset state the generated components never use.
 * 4. Each test starts with fresh observations and resource handles, suppresses
 *    expected guest-log noise, and restores Vitest mocks afterward.
 */
import { afterEach, beforeEach, vi } from "vitest";

import { resetTestHostState } from "../../../target/component-tests/host/reset.js";

beforeEach(() => {
  resetTestHostState();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});
