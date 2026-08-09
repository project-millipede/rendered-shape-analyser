import { requireTestGpuBuffer } from "./registry.js";
import type { GpuMapMode } from "./records.js";
import {
  capturedTestGpuBufferMaps,
  capturedTestGpuBufferUnmaps,
  capturedTestGpuMappedRangeCopies,
} from "./state.js";

/**
 * Map a registered fake buffer for asynchronous readback.
 *
 * 1. Enforce read-only mapping. The async analyzer component calls this helper
 *    only for its diagnostic summary staging buffer, never for visual outputs
 *    or uploads.
 * 2. Capture the request so the integration test can prove the async world used
 *    upstream buffer readback instead of a project-specific resolver.
 * 3. Create a zero-filled synthetic mapped range with the requested byte extent.
 * 4. Resolve on the next microtask to retain the asynchronous boundary.
 *
 * @param handle - Opaque upstream buffer handle.
 * @param mode - Upstream map flags; only `read` is supported.
 * @param offset - Optional byte offset, defaulting to zero.
 * @param size - Optional byte length, defaulting to the remaining buffer size.
 */
export async function mapTestGpuBuffer(
  handle: object,
  mode: GpuMapMode,
  offset: bigint | undefined,
  size: bigint | undefined,
): Promise<void> {
  const record = requireTestGpuBuffer(handle);
  if (!mode?.read || mode.write) {
    throw new Error("test analyzer supports only read buffer maps");
  }

  const byteOffset = Number(offset ?? 0n);
  const byteLength = Number(size ?? BigInt(record.buffer.size - byteOffset));
  record.mapped = {
    offset: byteOffset,
    size: byteLength,
    bytes: new Uint8Array(byteLength),
  };
  capturedTestGpuBufferMaps.push({
    device: record.device,
    buffer: record.buffer,
    offset: byteOffset,
    size: byteLength,
  });
  await Promise.resolve();
}

/**
 * Copy bytes from an active synthetic buffer mapping.
 *
 * The async analyzer component uses this for summary staging readback. The
 * request is captured, and `Uint8Array.slice` returns a copy rather than an
 * alias of the synthetic mapped range.
 *
 * @param handle - Opaque upstream buffer handle.
 * @param offset - Optional absolute buffer byte offset.
 * @param size - Optional byte length.
 * @returns A new byte array containing the requested mapped range.
 */
export function copyTestGpuMappedRange(
  handle: object,
  offset: bigint | undefined,
  size: bigint | undefined,
): Uint8Array {
  const record = requireTestGpuBuffer(handle);
  if (!record.mapped) {
    throw new Error("test mapped range requested before mapAsync");
  }

  const byteOffset = Number(offset ?? 0n);
  const byteLength = Number(size ?? BigInt(record.mapped.size));
  capturedTestGpuMappedRangeCopies.push({
    device: record.device,
    buffer: record.buffer,
    offset: byteOffset,
    size: byteLength,
  });
  return record.mapped.bytes.slice(
    byteOffset - record.mapped.offset,
    byteOffset - record.mapped.offset + byteLength,
  );
}

/**
 * End an active synthetic buffer mapping.
 *
 * The async analyzer component uses this for summary staging readback. The
 * unmap is captured before the synthetic mapped range is discarded.
 *
 * @param handle - Opaque upstream buffer handle.
 */
export function unmapTestGpuBuffer(handle: object): void {
  const record = requireTestGpuBuffer(handle);
  capturedTestGpuBufferUnmaps.push({
    device: record.device,
    buffer: record.buffer,
  });
  record.mapped = null;
}
