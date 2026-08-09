import {
  requireTestGpuBindGroup,
  requireTestGpuBuffer,
  requireTestGpuCommandBuffer,
  requireTestGpuCommandEncoder,
  requireTestGpuComputePass,
  requireTestGpuComputePipeline,
  requireTestGpuQueue,
  storeTestGpuCommandBuffer,
  storeTestGpuComputePass,
} from "./registry.js";
import type {
  CommandEncoderRecord,
  CommandRecord,
  ComputePassRecord,
  GpuCommandBufferDescriptor,
  GpuComputePassDescriptor,
} from "./records.js";
import { GpuBindGroup, GpuBuffer, GpuComputePipeline } from "./resources.js";
import {
  capturedTestGpuCommandEncodes,
  capturedTestGpuQueueSubmits,
} from "./state.js";

/**
 * Resolve an open fake compute pass and its parent command encoder.
 *
 * Both the pass-local `ended` flag and the encoder-wide open-pass flag must
 * agree that recording is still legal. This rejects stale pass handles after
 * `end()` and keeps every pass command subject to the same lifecycle check.
 *
 * @param pass - Opaque compute-pass handle supplied by the generated component.
 * @returns The registered pass record and its parent command-encoder record.
 */
function requireOpenComputePass(pass: object): {
  passRecord: ComputePassRecord;
  encoderRecord: CommandEncoderRecord;
} {
  const passRecord = requireTestGpuComputePass(pass);
  const encoderRecord = requireTestGpuCommandEncoder(passRecord.encoder);
  if (passRecord.ended || !encoderRecord.computePassOpen) {
    throw new Error("test compute pass cannot record after end");
  }
  return { passRecord, encoderRecord };
}

/** Opaque upstream resource for a fake GPU command buffer. */
export class GpuCommandBuffer {}

/** Opaque upstream resource for a fake GPU queue. */
export class GpuQueue {
  /**
   * Submit analyzer command buffers through the upstream `gpu-queue` API.
   *
   * 1. Resolve this queue and every opaque command-buffer handle.
   * 2. Reject buffers owned by another device or already submitted once.
   * 3. Store a submission snapshot on each command buffer and capture its
   *    resource identities, allowing stable result resolution to prove Rust
   *    called `gpu-queue.submit`.
   *
   * @param commandBuffers - Opaque handles in submission order.
   */
  public submit(commandBuffers: GpuCommandBuffer[]): void {
    const queueRecord = requireTestGpuQueue(this);

    for (const commandBuffer of commandBuffers) {
      const commandRecord = requireTestGpuCommandBuffer(commandBuffer);
      if (commandRecord.device !== queueRecord.device) {
        throw new Error(
          "test wasi:webgpu received command buffer from different device",
        );
      }
      if (commandRecord.submission) {
        throw new Error(
          "test wasi:webgpu received an already-submitted command buffer",
        );
      }

      const submission: CommandRecord = { ...commandRecord };
      commandRecord.submission = submission;
      capturedTestGpuQueueSubmits.push({
        device: commandRecord.device,
        texture: commandRecord.texture,
        buffer: commandRecord.buffer,
        summaryBuffer: commandRecord.summaryBuffer,
        visualBuffer: commandRecord.visualBuffer,
        visualIndirectBuffer: commandRecord.visualIndirectBuffer,
        borderTraceBuffer: commandRecord.borderTraceBuffer,
        borderTraceIndirectBuffer: commandRecord.borderTraceIndirectBuffer,
        edgeDiscoveryBuffer: commandRecord.edgeDiscoveryBuffer,
        edgeDiscoveryIndirectBuffer: commandRecord.edgeDiscoveryIndirectBuffer,
      });
    }
  }

  /**
   * Await fake submitted work through the upstream queue API.
   *
   * The promise resolves on the next microtask after validating the queue
   * handle, preserving the asynchronous boundary Rust awaits.
   */
  public async onSubmittedWorkDone(): Promise<void> {
    requireTestGpuQueue(this);
    await Promise.resolve();
  }
}

/** Opaque upstream resource for a fake GPU command encoder. */
export class GpuCommandEncoder {
  /**
   * Begin a registered fake compute pass owned by this encoder.
   *
   * The encoder may own only one live compute pass. Beginning a second pass
   * before ending the first is rejected; a successful begin marks the encoder
   * open and increments the observable begin count.
   *
   * @param descriptor - Optional upstream pass label.
   * @returns The opaque compute-pass handle.
   */
  public beginComputePass(
    descriptor: GpuComputePassDescriptor | undefined,
  ): GpuComputePassEncoder {
    const encoderRecord = requireTestGpuCommandEncoder(this);
    if (encoderRecord.computePassOpen) {
      throw new Error(
        "test command encoder cannot begin a second compute pass while one is open",
      );
    }

    encoderRecord.computePassOpen = true;
    encoderRecord.computePassBegins += 1;
    const handle = new GpuComputePassEncoder();
    storeTestGpuComputePass(handle, {
      device: encoderRecord.device,
      encoder: this,
      label: descriptor?.label ?? "test compute pass",
      ended: false,
      activePipelineRole: null,
      activePipelineEntryPoint: null,
    });
    return handle;
  }

  /**
   * Record the analyzer's summary-output-to-staging-buffer copy.
   *
   * The analyzer must first end its compute pass because WebGPU does not allow
   * encoder-level copies while a pass is open. Both buffers must belong to the
   * encoder's device. The offsets and byte length are retained for lifecycle
   * and readback assertions.
   *
   * @param source - Registered summary-output buffer handle.
   * @param sourceOffset - Optional source byte offset.
   * @param destination - Registered staging-buffer handle.
   * @param destinationOffset - Optional destination byte offset.
   * @param size - Optional number of bytes copied.
   */
  public copyBufferToBuffer(
    source: GpuBuffer,
    sourceOffset: bigint | undefined,
    destination: GpuBuffer,
    destinationOffset: bigint | undefined,
    size: bigint | undefined,
  ): void {
    const encoderRecord = requireTestGpuCommandEncoder(this);
    if (encoderRecord.computePassOpen) {
      throw new Error(
        "test command encoder cannot copy buffers while a compute pass is open",
      );
    }
    const sourceRecord = requireTestGpuBuffer(source);
    const destinationRecord = requireTestGpuBuffer(destination);
    if (
      sourceRecord.device !== encoderRecord.device ||
      destinationRecord.device !== encoderRecord.device
    ) {
      throw new Error(
        "test wasi:webgpu copy received buffers from different devices",
      );
    }
    encoderRecord.copiedSummary = {
      source: sourceRecord.buffer,
      sourceOffset,
      destination: destinationRecord.buffer,
      destinationOffset,
      size,
    };
  }

  /**
   * Finish a complete analyzer encoding and register its command buffer.
   *
   * 1. Require the analyzer's compute pass to have ended.
   * 2. Require every diagnostic and discovery lane to have projected its
   *    resources onto the encoder record.
   * 3. Require the compact-summary staging copy to have been recorded.
   * 4. Capture the completed encode and return an opaque, not-yet-submitted
   *    command-buffer handle.
   *
   * Stable and async components call this themselves; the shared-frame test
   * calls it later through the scheduler-owned encoder.
   *
   * @param descriptor - Optional command-buffer label.
   * @returns The registered opaque command-buffer handle.
   */
  public finish(
    descriptor: GpuCommandBufferDescriptor | undefined,
  ): GpuCommandBuffer {
    const encoderRecord = requireTestGpuCommandEncoder(this);
    if (encoderRecord.computePassOpen) {
      throw new Error(
        "test command encoder cannot finish while a compute pass is open",
      );
    }
    if (
      !encoderRecord.texture ||
      !encoderRecord.buffer ||
      !encoderRecord.summaryBuffer ||
      !encoderRecord.visualBuffer ||
      !encoderRecord.visualIndirectBuffer ||
      !encoderRecord.borderTraceBuffer ||
      !encoderRecord.borderTraceIndirectBuffer ||
      !encoderRecord.edgeDiscoveryBuffer ||
      !encoderRecord.edgeDiscoveryIndirectBuffer
    ) {
      throw new Error(
        "test command encoder finished before analyzer bind groups",
      );
    }
    if (!encoderRecord.copiedSummary) {
      throw new Error("test command encoder finished before summary copy");
    }

    const record: CommandRecord = {
      device: encoderRecord.device,
      texture: encoderRecord.texture,
      buffer: encoderRecord.buffer,
      summaryBuffer: encoderRecord.summaryBuffer,
      visualBuffer: encoderRecord.visualBuffer,
      visualIndirectBuffer: encoderRecord.visualIndirectBuffer,
      borderTraceBuffer: encoderRecord.borderTraceBuffer,
      borderTraceIndirectBuffer: encoderRecord.borderTraceIndirectBuffer,
      edgeDiscoveryBuffer: encoderRecord.edgeDiscoveryBuffer,
      edgeDiscoveryIndirectBuffer: encoderRecord.edgeDiscoveryIndirectBuffer,
      dispatches: encoderRecord.dispatches,
      copiedSummary: encoderRecord.copiedSummary,
      label: descriptor?.label ?? encoderRecord.label,
    };
    capturedTestGpuCommandEncodes.push(record);

    const handle = new GpuCommandBuffer();
    storeTestGpuCommandBuffer(handle, { ...record, submission: null });
    return handle;
  }
}

/** Opaque upstream resource for a fake GPU compute pass encoder. */
export class GpuComputePassEncoder {
  /**
   * Select the compute pipeline used by subsequent binding and dispatch calls.
   *
   * The pipeline must belong to the pass device. Both its lane role and exact
   * entry point are retained: the role validates bind groups, while the entry
   * point distinguishes ordered stages sharing the edge-discovery role. The
   * pass must still be open; a handle cannot select another pipeline after
   * `end()`.
   *
   * @param pipeline - Registered upstream compute-pipeline handle.
   */
  public setPipeline(pipeline: GpuComputePipeline): void {
    const { passRecord, encoderRecord } = requireOpenComputePass(this);
    const pipelineRecord = requireTestGpuComputePipeline(pipeline);
    if (pipelineRecord.device !== passRecord.device) {
      throw new Error(
        "test compute pass received pipeline from different device",
      );
    }
    passRecord.activePipelineRole = pipelineRecord.role;
    passRecord.activePipelineEntryPoint = pipelineRecord.entryPoint;
    encoderRecord.activePipelineRole = pipelineRecord.role;
  }

  /**
   * Project one lane's bind-group resources onto the parent command encoder.
   *
   * 1. Reject dynamic offsets, which the analyzer compatibility path never
   *    uses.
   * 2. Require the compute pass to remain open, including for an undefined
   *    bind group.
   * 3. Require the bind group to belong to the pass device.
   * 4. Require its lane kind to match the active pipeline role.
   * 5. Retain the lane's foreign resources for finish/submission assertions.
   *
   * @param _index - Upstream bind-group slot; the analyzer supplies group zero.
   * @param bindGroup - Opaque bind-group handle; `undefined` is accepted as an
   *   upstream no-op and does not clear previously projected resources.
   * @param dynamicOffsetsData - Unsupported dynamic-offset data.
   * @param dynamicOffsetsDataStart - Unsupported dynamic-offset start.
   * @param dynamicOffsetsDataLength - Unsupported dynamic-offset length.
   */
  public setBindGroup(
    _index: number,
    bindGroup: GpuBindGroup | undefined,
    dynamicOffsetsData: Uint32Array | undefined,
    dynamicOffsetsDataStart: bigint | undefined,
    dynamicOffsetsDataLength: number | undefined,
  ): void {
    if (
      dynamicOffsetsData ||
      dynamicOffsetsDataStart !== undefined ||
      dynamicOffsetsDataLength !== undefined
    ) {
      throw new Error("test analyzer does not use dynamic bind-group offsets");
    }

    const { passRecord, encoderRecord } = requireOpenComputePass(this);
    if (!bindGroup) {
      return;
    }
    const bindGroupRecord = requireTestGpuBindGroup(bindGroup);
    if (bindGroupRecord.device !== passRecord.device) {
      throw new Error(
        "test compute pass received bind group from different device",
      );
    }

    if (bindGroupRecord.kind === "visual") {
      if (passRecord.activePipelineRole !== "visual") {
        throw new Error(
          "test visual bind group received a non-visual pipeline",
        );
      }
      encoderRecord.buffer = bindGroupRecord.buffer;
      encoderRecord.visualBuffer = bindGroupRecord.visualBuffer;
      encoderRecord.visualIndirectBuffer = bindGroupRecord.visualIndirectBuffer;
    }
    if (bindGroupRecord.kind === "border-trace") {
      if (passRecord.activePipelineRole !== "border-trace") {
        throw new Error(
          "test border-trace bind group received a non-border pipeline",
        );
      }
      encoderRecord.texture = bindGroupRecord.texture;
      encoderRecord.buffer = bindGroupRecord.buffer;
      encoderRecord.borderTraceBuffer = bindGroupRecord.borderTraceBuffer;
      encoderRecord.borderTraceIndirectBuffer =
        bindGroupRecord.borderTraceIndirectBuffer;
    }
    if (bindGroupRecord.kind === "edge-discovery") {
      if (passRecord.activePipelineRole !== "edge-discovery") {
        throw new Error(
          "test edge-discovery bind group received a non-edge pipeline",
        );
      }
      encoderRecord.texture = bindGroupRecord.texture;
      encoderRecord.edgeDiscoveryBuffer = bindGroupRecord.edgeDiscoveryBuffer;
      encoderRecord.edgeDiscoveryIndirectBuffer =
        bindGroupRecord.edgeDiscoveryIndirectBuffer;
    }
    if (bindGroupRecord.kind === "stats") {
      if (passRecord.activePipelineRole !== "stats") {
        throw new Error("test stats bind group received a non-stats pipeline");
      }
      encoderRecord.texture = bindGroupRecord.texture;
      encoderRecord.buffer = bindGroupRecord.buffer;
      encoderRecord.summaryBuffer = bindGroupRecord.summaryBuffer;
    }
  }

  /**
   * Record one fake analyzer dispatch under the active pipeline.
   *
   * The pass must remain open and have an active analyzer pipeline. Successful
   * calls retain the exact entry point and workgroup dimensions in order.
   *
   * @param workgroupCountX - Workgroup count on the x axis.
   * @param workgroupCountY - Optional workgroup count on the y axis.
   * @param workgroupCountZ - Optional workgroup count on the z axis.
   */
  public dispatchWorkgroups(
    workgroupCountX: number,
    workgroupCountY: number | undefined,
    workgroupCountZ: number | undefined,
  ): void {
    const { passRecord, encoderRecord } = requireOpenComputePass(this);
    if (!passRecord.activePipelineRole) {
      throw new Error(
        "test dispatch happened before analyzer resources were bound",
      );
    }
    encoderRecord.dispatches.push({
      pipelineRole: passRecord.activePipelineRole,
      pipelineEntryPoint: passRecord.activePipelineEntryPoint,
      workgroupCountX,
      workgroupCountY,
      workgroupCountZ,
    });
  }

  /**
   * End the fake compute pass and close its parent encoder's active pass.
   *
   * A pass may end exactly once. Success updates both lifecycle records and
   * increments the observable end count used by shared-frame ownership tests.
   */
  public end(): void {
    const passRecord = requireTestGpuComputePass(this);
    if (passRecord.ended) {
      throw new Error("test compute pass cannot end more than once");
    }

    const { encoderRecord } = requireOpenComputePass(this);

    passRecord.ended = true;
    encoderRecord.computePassOpen = false;
    encoderRecord.computePassEnds += 1;
  }
}
