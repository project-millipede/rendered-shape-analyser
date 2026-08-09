/**
 * Chrome/JSPI-only upstream WebGPU buffer readback helpers.
 *
 * Browser buffer mapping is promise-shaped, and upstream `webgpu.wit` models
 * `gpu-buffer.map-async` as an async function. These helpers therefore stay
 * out of the browser-safe stable component path.
 */

/** Minimal upstream `gpu-map-mode` shape used by the analyzer. */
export interface UpstreamGpuMapMode {
  /** Whether Rust requested a read mapping. */
  read?: boolean;
  /** Whether Rust requested a write mapping. Unsupported by this analyzer. */
  write?: boolean;
}

/** Browser map failure kind from upstream `map-async-error-kind`. */
type UpstreamMapAsyncErrorKind =
  | "operation-error"
  | "range-error"
  | "abort-error";

/** Browser mapped-range failure kind from upstream `get-mapped-range-error-kind`. */
type UpstreamMappedRangeErrorKind =
  | "operation-error"
  | "range-error"
  | "type-error";

/** Browser unmap failure kind from upstream `unmap-error-kind`. */
type UpstreamUnmapErrorKind = "abort-error";

/** WIT-lowered error payload consumed by jco's generated result handler. */
interface UpstreamErrorPayload<Kind extends string> {
  /** Variant discriminant expected by generated jco lowering code. */
  kind: { tag: Kind };
  /** Human-readable browser error message. */
  message: string;
}

/** Thrown wrapper that tells jco to lower the value as a WIT result error. */
interface UpstreamThrownError<Kind extends string> {
  /** WIT error record payload; plain `Error` would be rethrown by jco. */
  payload: UpstreamErrorPayload<Kind>;
}

/**
 * Convert a caught browser failure into a jco-lowerable WIT result error.
 *
 * 1. jco's generated host import wrapper catches thrown values with a
 *    `payload` property and lowers that payload as the WIT `err` variant.
 * 2. Plain JavaScript `Error` objects are intentionally rethrown by jco, which
 *    would surface teardown races as browser page errors.
 * 3. This helper keeps browser WebGPU failures in the upstream `result`
 *    channel so Rust can return a normal async analysis error.
 *
 * @param kind - Upstream WIT error-kind tag.
 * @param message - Browser exception message or host validation failure text.
 * @returns Throw-only wrapper for the generated jco trampoline.
 */
const upstreamError = <Kind extends string>(
  kind: Kind,
  message: string,
): UpstreamThrownError<Kind> => ({
  payload: {
    kind: { tag: kind },
    message,
  },
});

/**
 * Convert an optional upstream `gpu-size64` value into a browser byte count.
 *
 * 1. Accepts `undefined` because upstream map/range offsets are optional.
 * 2. Rejects values that cannot be represented safely by browser WebGPU's
 *    JavaScript-number APIs.
 * 3. Keeps the conversion local to async buffer readback so sync metadata
 *    helpers remain free of mapping concerns.
 *
 * @param value - Optional upstream byte size or offset.
 * @param label - Human-readable field name for errors.
 * @returns JavaScript number byte count, or `undefined` when omitted.
 */
const optionalSize64ToNumber = (
  value: bigint | undefined,
  label: string,
): number | undefined => {
  if (value === undefined) return undefined;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `[analysis][component-gpu-async] ${label} exceeds JavaScript safe integer range`,
    );
  }
  return Number(value);
};

/**
 * Await browser `GPUBuffer.mapAsync(...)` for upstream `gpu-buffer.map-async`.
 *
 * 1. Supports only read mappings because the analyzer maps a diagnostic
 *    staging buffer after the GPU copy has completed.
 * 2. Rejects write mappings so this helper cannot become a hidden upload path.
 * 3. Awaits the real browser promise through the JSPI-only component world.
 *
 * @param buffer - Browser buffer represented by an upstream `gpu-buffer`.
 * @param mode - Upstream map-mode flags selected by Rust.
 * @param offset - Optional byte offset to map.
 * @param size - Optional byte length to map.
 * @returns Promise that resolves when the browser buffer is mapped.
 */
export async function mapBrowserBufferForRead(
  buffer: GPUBuffer,
  mode: UpstreamGpuMapMode,
  offset: bigint | undefined,
  size: bigint | undefined,
): Promise<void> {
  if (!mode.read || mode.write) {
    throw upstreamError<UpstreamMapAsyncErrorKind>(
      "operation-error",
      "[analysis][component-gpu-async] analyzer supports only MAP_READ buffer mappings",
    );
  }

  try {
    await buffer.mapAsync(
      GPUMapMode.READ,
      optionalSize64ToNumber(offset, "map offset") ?? 0,
      optionalSize64ToNumber(size, "map size"),
    );
  } catch (error) {
    throw upstreamError<UpstreamMapAsyncErrorKind>(
      error instanceof RangeError ? "range-error" : "abort-error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Copy a mapped browser buffer range for upstream `get-mapped-range...with-copy`.
 *
 * 1. Reads only from an already mapped staging buffer.
 * 2. Copies the mapped range into a fresh `Uint8Array` so Rust receives owned
 *    bytes and the host can safely unmap afterward.
 * 3. Does not expose a live `ArrayBuffer` view across the component boundary.
 *
 * @param buffer - Browser buffer represented by an upstream `gpu-buffer`.
 * @param offset - Optional mapped-range byte offset.
 * @param size - Optional mapped-range byte length.
 * @returns Copied bytes from the mapped staging range.
 */
export function copyMappedBrowserBufferRange(
  buffer: GPUBuffer,
  offset: bigint | undefined,
  size: bigint | undefined,
): Uint8Array {
  try {
    const range = buffer.getMappedRange(
      optionalSize64ToNumber(offset, "mapped range offset") ?? 0,
      optionalSize64ToNumber(size, "mapped range size"),
    );
    return new Uint8Array(range).slice();
  } catch (error) {
    throw upstreamError<UpstreamMappedRangeErrorKind>(
      error instanceof RangeError ? "range-error" : "operation-error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Unmap a browser buffer for upstream `gpu-buffer.unmap`.
 *
 * @param buffer - Browser buffer represented by an upstream `gpu-buffer`.
 * @returns Nothing.
 */
export function unmapBrowserBuffer(buffer: GPUBuffer): void {
  try {
    buffer.unmap();
  } catch (error) {
    throw upstreamError<UpstreamUnmapErrorKind>(
      "abort-error",
      error instanceof Error ? error.message : String(error),
    );
  }
}
