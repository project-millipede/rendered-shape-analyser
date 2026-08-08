//! Async-only upstream WebGPU calls for the Chrome/JSPI analysis world.
//!
//! Keep this module out of the stable `gpu-analysis` path. Every function here
//! corresponds to an upstream `wasi:webgpu` operation that is async or exists
//! only to support the async diagnostic sequence.

use super::bindings::{GpuDevice, GpuErrorFilter};

/// Start a browser WebGPU validation scope through upstream `wasi:webgpu`.
///
/// # Arguments
///
/// * `device` - Shared inspector `gpu-device` resource handle.
///
/// # Returns
///
/// Nothing. The matching async pop happens immediately after Rust submits the
/// analyzer command buffer. The inspector uses one shared browser `GPUDevice`,
/// so this scope must not remain open across `await` points where the panel's
/// normal render pass can also create or bind WebGPU resources.
pub(super) fn push_validation_scope(device: &GpuDevice) {
    device.push_error_scope(GpuErrorFilter::Validation);
}

/// Await queue completion through upstream `wasi:webgpu`.
///
/// # Arguments
///
/// * `device` - Shared inspector `gpu-device` resource handle.
///
/// # Returns
///
/// Nothing. The future resolves when the browser queue reports submitted work
/// has completed.
pub(super) async fn await_submitted_work(device: &GpuDevice) {
    let queue = device.queue();
    queue.on_submitted_work_done().await;
}

/// Finish the browser WebGPU validation scope through upstream `wasi:webgpu`.
///
/// # Arguments
///
/// * `device` - Shared inspector `gpu-device` resource handle.
///
/// # Returns
///
/// `Ok(())` when the scope reports no validation error, or an error string
/// suitable for logging before trapping.
pub(super) async fn pop_validation_scope(device: &GpuDevice) -> Result<(), String> {
    match device.pop_error_scope().await {
        Ok(None) => Ok(()),
        Ok(Some(error)) => {
            let message = error.message();
            if message.is_empty() {
                Ok(())
            } else {
                Err(message)
            }
        }
        Err(_) => Err("failed to pop WebGPU validation error scope".to_string()),
    }
}
