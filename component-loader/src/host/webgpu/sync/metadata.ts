/**
 * Synchronous upstream `wasi:webgpu` metadata operations used by both GPU paths.
 *
 * These helpers intentionally contain only browser WebGPU properties that are
 * synchronous in the real API and synchronous in upstream `webgpu.wit`.
 */

/**
 * Read the width of a browser texture for upstream `gpu-texture.width`.
 *
 * 1. Reads only metadata from the already registered browser `GPUTexture`.
 * 2. Does not map, copy, or inspect texel contents.
 * 3. Is shared by stable `component-gpu` and Chrome/JSPI `component-gpu-async`.
 *
 * @param texture - Browser texture represented by an upstream WIT resource.
 * @returns Texture width in texels.
 */
export function readBrowserTextureWidth(texture: GPUTexture): number {
  return texture.width;
}

/**
 * Read the height of a browser texture for upstream `gpu-texture.height`.
 *
 * 1. Reads only metadata from the already registered browser `GPUTexture`.
 * 2. Does not map, copy, or inspect texel contents.
 * 3. Is shared by stable `component-gpu` and Chrome/JSPI `component-gpu-async`.
 *
 * @param texture - Browser texture represented by an upstream WIT resource.
 * @returns Texture height in texels.
 */
export function readBrowserTextureHeight(texture: GPUTexture): number {
  return texture.height;
}

/**
 * Read the byte length of a browser buffer for upstream `gpu-buffer.size`.
 *
 * 1. Reads only metadata from the already registered browser `GPUBuffer`.
 * 2. Does not map the buffer or copy buffer contents.
 * 3. Lets Rust validate component-reference buffer capacity without inventing a
 *    project-specific buffer-size bridge.
 *
 * @param buffer - Browser buffer represented by an upstream WIT resource.
 * @returns Buffer size in bytes.
 */
export function readBrowserBufferSize(buffer: GPUBuffer): bigint {
  return BigInt(buffer.size);
}
