import { resetTestEvents } from "./events.js";
import { resetTestGpuResolverState } from "./gpu.js";
import { resetTestLog } from "./log.js";
import { resetTestWebGpuState } from "./webgpu/index.js";

/**
 * Reset every component-boundary test-host observation and resource registry.
 *
 * Capture arrays are cleared in place so imported references stay valid.
 * Weak registries are replaced, deliberately invalidating every old opaque
 * resource handle. Vitest files must therefore create all foreign resources
 * after calling this function and must not reset during an active JSPI call.
 */
export function resetTestHostState(): void {
  resetTestEvents();
  resetTestLog();
  resetTestGpuResolverState();
  resetTestWebGpuState();
}
