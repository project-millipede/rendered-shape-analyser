import {
  registerTestGpuBuffer,
  registerTestGpuDevice,
  registerTestGpuTexture,
} from "../../../target/component-tests/host/gpu.js";
import {
  ANALYSIS_TEXTURE_HEIGHT,
  ANALYSIS_TEXTURE_WIDTH,
} from "../fixtures/analysis-tree.js";
import { COMPONENT_REFERENCE_BUFFER_SIZE } from "../fixtures/gpu-workload.js";

export interface FakeDevice {
  label: string;
}

export interface FakeTexture {
  label: string;
  width: number;
  height: number;
}

export interface FakeBuffer {
  label: string;
  size: number;
}

export interface FakeCommandEncoderHandle {
  finish(descriptor?: { label?: string }): object;
}

export interface FakeDeviceHandle {
  createCommandEncoder(descriptor?: {
    label?: string;
  }): FakeCommandEncoderHandle;
  queue(): { submit(commandBuffers: unknown[]): void };
}

export interface GpuTestContext {
  fakeDevice: FakeDevice;
  fakeTexture: FakeTexture;
  fakeBuffer: FakeBuffer;
  deviceHandle: FakeDeviceHandle;
  textureHandle: object;
  bufferHandle: object;
}

/** Optional overrides for one isolated GPU component-boundary fixture. */
export interface GpuTestContextOptions {
  /**
   * Registered component-reference buffer size in bytes.
   *
   * Omit this value for the valid six-reference fixture. A focused validation
   * case may set it to zero to reach the final truth-buffer size check without
   * changing the shared request or texture facts.
   */
  referenceBufferSize?: number;
}

/**
 * Create one isolated set of browser-side objects and opaque WIT handles.
 *
 * The plain objects model caller-owned WebGPU resources. Their registered
 * handles cross the Component Model boundary and must resolve in host captures
 * to those exact objects; this context carries no texels or GPU execution.
 *
 * @param options - Optional fake-resource overrides for a focused test case.
 * @returns Caller objects together with their registered WIT resource handles.
 */
export function createGpuTestContext(
  options: GpuTestContextOptions = {},
): GpuTestContext {
  const fakeDevice: FakeDevice = { label: "shared test device" };
  const fakeTexture: FakeTexture = {
    label: "captured-pixel texture",
    width: ANALYSIS_TEXTURE_WIDTH,
    height: ANALYSIS_TEXTURE_HEIGHT,
  };
  const fakeBuffer: FakeBuffer = {
    label: "component-reference buffer",
    size: options.referenceBufferSize ?? COMPONENT_REFERENCE_BUFFER_SIZE,
  };
  const deviceHandle = registerTestGpuDevice(fakeDevice) as FakeDeviceHandle;

  return {
    fakeDevice,
    fakeTexture,
    fakeBuffer,
    deviceHandle,
    textureHandle: registerTestGpuTexture(fakeTexture, fakeDevice),
    bufferHandle: registerTestGpuBuffer(fakeBuffer, fakeDevice),
  };
}
