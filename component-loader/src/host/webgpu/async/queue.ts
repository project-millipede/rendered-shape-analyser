/**
 * Chrome/JSPI-only upstream WebGPU queue helpers.
 *
 * Queue completion is promise-shaped in browser WebGPU and async-shaped in
 * upstream `webgpu.wit`, so this helper stays out of the stable path.
 */

/**
 * Await browser queue completion for upstream `gpu-queue.on-submitted-work-done`.
 *
 * 1. Uses the queue from the already registered browser `GPUDevice`.
 * 2. Awaits `GPUQueue.onSubmittedWorkDone()` without mapping summary buffers.
 * 3. Proves one real upstream async WebGPU operation through the JSPI path.
 *
 * @param queue - Browser queue represented by an upstream WIT resource.
 * @returns Promise that resolves after submitted queue work completes.
 */
export async function awaitBrowserQueueSubmittedWork(
  queue: GPUQueue,
): Promise<void> {
  await queue.onSubmittedWorkDone();
}
