//! Optional compact diagnostic-summary staging and copy recording.
//!
//! Statistics output remains owned by the statistics lane. This module owns
//! only explicitly selected CPU-readable staging and copy mechanics; async
//! mapping, decoding, awaiting, and publication remain variant responsibilities.

use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBuffer, GpuBufferDescriptor, GpuBufferUsage, GpuCommandEncoder, GpuDevice,
};

use super::buffers::StatisticsOutputResources;
use super::plan::DiagnosticPlan;

/// CPU-readable staging owned separately from GPU statistics output.
pub(crate) struct SummaryReadbackResources {
    /// Staging buffer targeted by the optional post-pass summary copy.
    ///
    /// This inner `Option` models one-time ownership transfer. The outer
    /// `Option<SummaryReadbackResources>` on dispatch resources models whether
    /// readback was selected at all.
    staging: Option<GpuBuffer>,
    /// Exact byte length copied from statistics output into `staging`.
    pub(crate) byte_length: u64,
}

impl SummaryReadbackResources {
    /// Borrow the staging buffer for variant-specific async mapping.
    ///
    /// # Panics
    ///
    /// Panics if the staging buffer was already transferred.
    pub(crate) fn staging_buffer(&self) -> &GpuBuffer {
        self.staging
            .as_ref()
            .expect("diagnostic summary staging buffer was already transferred")
    }

    /// Transfer the staging buffer while retaining surrounding command resources.
    ///
    /// # Panics
    ///
    /// Panics if the staging buffer was already transferred.
    #[cfg(any(feature = "gpu-analysis", feature = "gpu-analysis-frame"))]
    pub(crate) fn take_staging_buffer(&mut self) -> GpuBuffer {
        self.staging
            .take()
            .expect("diagnostic summary staging buffer was already transferred")
    }
}

/// Prepare optional CPU-readable staging for a compact diagnostic summary.
///
/// # Arguments
///
/// * `device` - Shared inspector WebGPU device used for the staging allocation.
/// * `plan` - Diagnostic plan providing the label and exact copy byte length.
///
/// # Returns
///
/// A `COPY_DST | MAP_READ` staging buffer and its exact byte length. This helper
/// creates no statistics output and performs no copy or mapping.
pub(super) fn prepare_summary_readback(
    device: &GpuDevice,
    plan: &DiagnosticPlan,
) -> SummaryReadbackResources {
    let staging = device.create_buffer(&GpuBufferDescriptor {
        label: Some(format!("component-gpu summary staging {}", plan.entry_id)),
        mapped_at_creation: None,
        size: plan.summary_byte_length,
        usage: GpuBufferUsage::COPY_DST | GpuBufferUsage::MAP_READ,
    });

    SummaryReadbackResources {
        staging: Some(staging),
        byte_length: plan.summary_byte_length,
    }
}

/// Encode the optional compact statistics-to-staging copy after pass end.
///
/// The copy always uses source offset `0`, destination offset `0`, and exactly
/// `readback.byte_length` bytes.
///
/// # Arguments
///
/// * `encoder` - Caller-owned command encoder whose compute pass has ended.
/// * `statistics` - GPU statistics output used as the copy source.
/// * `readback` - Explicitly selected staging buffer and exact copy length.
///
/// This helper records no dispatch, performs no mapping or decoding, and never
/// finishes or submits the encoder.
pub(crate) fn encode_summary_copy(
    encoder: &GpuCommandEncoder,
    statistics: &StatisticsOutputResources,
    readback: &SummaryReadbackResources,
) {
    encoder.copy_buffer_to_buffer(
        &statistics.output,
        Some(0),
        readback.staging_buffer(),
        Some(0),
        Some(readback.byte_length),
    );
}
