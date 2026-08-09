import {
  copyTestGpuMappedRange,
  mapTestGpuBuffer,
  unmapTestGpuBuffer,
} from "./mapping.js";
import { requireTestGpuBuffer, requireTestGpuTexture } from "./registry.js";
import type { GpuMapMode } from "./records.js";

/** Opaque upstream resource for a fake GPU error. */
export class GpuError {
  readonly #message: string;

  /**
   * Create an error resource exposing the supplied message through the
   * upstream `gpu-error.message` method.
   *
   * @param message - Fake WebGPU error message to expose to Rust.
   */
  public constructor(message: string) {
    this.#message = message;
  }

  /** @returns The fake WebGPU error message. */
  public message(): string {
    return this.#message;
  }
}

/**
 * Opaque upstream resource for a fake GPU texture.
 *
 * Only dimension metadata is modeled; the test host has no texel contents.
 * `width` and `height` mirror the browser-host methods Rust validation reads.
 */
export class GpuTexture {
  /** @returns The registered foreign texture width, in texels. */
  public width(): number {
    return requireTestGpuTexture(this).texture.width;
  }

  /** @returns The registered foreign texture height, in texels. */
  public height(): number {
    return requireTestGpuTexture(this).texture.height;
  }
}

/**
 * Opaque upstream resource for a fake GPU buffer.
 *
 * The host models byte-size metadata and synthetic summary-staging mappings,
 * not GPU-backed buffer contents. `size` mirrors the browser-host metadata
 * method Rust validation reads.
 */
export class GpuBuffer {
  /** @returns The registered foreign buffer size, in bytes. */
  public size(): bigint {
    return BigInt(requireTestGpuBuffer(this).buffer.size);
  }

  /**
   * Map this buffer through upstream `gpu-buffer.map-async`.
   *
   * The async analyzer component uses this surface for summary staging
   * readback.
   *
   * @param mode - Upstream mapping flags.
   * @param offset - Optional byte offset.
   * @param size - Optional byte length.
   */
  public async mapAsync(
    mode: GpuMapMode,
    offset: bigint | undefined,
    size: bigint | undefined,
  ): Promise<void> {
    await mapTestGpuBuffer(this, mode, offset, size);
  }

  /**
   * Return a copy of bytes from this buffer's active mapped range.
   *
   * @param offset - Optional absolute buffer byte offset.
   * @param size - Optional byte length.
   * @returns A new byte array containing the requested mapped bytes.
   */
  public getMappedRangeGetWithCopy(
    offset: bigint | undefined,
    size: bigint | undefined,
  ): Uint8Array {
    return copyTestGpuMappedRange(this, offset, size);
  }

  /** End this buffer's active upstream mapping. */
  public unmap(): void {
    unmapTestGpuBuffer(this);
  }
}

/** Opaque upstream resource for a fake GPU compute pipeline. */
export class GpuComputePipeline {}

/** Opaque upstream resource for a fake GPU shader module. */
export class GpuShaderModule {}

/** Opaque upstream resource for a fake GPU bind-group layout. */
export class GpuBindGroupLayout {}

/** Opaque upstream resource for a fake GPU pipeline layout. */
export class GpuPipelineLayout {}

/** Opaque upstream resource for unused fake pipeline constants. */
export class RecordGpuPipelineConstantValue {}

/** Opaque upstream resource for a fake GPU bind group. */
export class GpuBindGroup {}

/** Opaque upstream resource for an unused fake GPU sampler. */
export class GpuSampler {}

/** Opaque upstream resource for an unused fake GPU texture view. */
export class GpuTextureView {}

/** Opaque upstream resource for an unused fake GPU query set. */
export class GpuQuerySet {}
