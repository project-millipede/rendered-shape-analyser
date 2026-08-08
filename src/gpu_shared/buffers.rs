//! Generated output-record adapters for the mixed GPU-analysis worlds.

use crate::wit::generated::millipede::inspector::host_gpu::{
    AnalysisBorderTraceOutput, AnalysisEdgeDiscoveryOutput, AnalysisVisualOutput,
};
#[cfg(feature = "gpu-analysis")]
use crate::wit::generated::millipede::inspector::host_gpu::{
    AnalysisPlan, AnalysisSummaryReadback,
};
use crate::wit::generated::wasi::webgpu::webgpu::GpuBuffer;
#[cfg(feature = "gpu-analysis")]
use crate::wit::generated::wasi::webgpu::webgpu::GpuCommandBuffer;

/// Build the component-visible reference-guided rectangle output handle.
///
/// # Arguments
///
/// * `buffer` - Rust-created upstream visual-output buffer.
/// * `indirect_buffer` - GPU-written indirect draw arguments for `buffer`.
///
/// # Returns
///
/// GPU-resident diagnostic rectangle resource plus renderer-facing metadata.
pub(crate) fn create_analysis_visual_output(
    buffer: GpuBuffer,
    indirect_buffer: GpuBuffer,
) -> AnalysisVisualOutput {
    AnalysisVisualOutput {
        buffer,
        indirect_buffer,
    }
}

/// Build the component-visible reference-guided border-trace output handle.
///
/// # Arguments
///
/// * `buffer` - Rust-created upstream border-trace output buffer.
/// * `indirect_buffer` - GPU-written indirect draw arguments for `buffer`.
///
/// # Returns
///
/// GPU-resident diagnostic border-trace resource plus renderer-facing metadata.
pub(crate) fn create_analysis_border_trace_output(
    buffer: GpuBuffer,
    indirect_buffer: GpuBuffer,
) -> AnalysisBorderTraceOutput {
    AnalysisBorderTraceOutput {
        buffer,
        indirect_buffer,
    }
}

/// Build the component-visible pixel-derived discovery output handle.
///
/// This adapter belongs to the mixed WIT boundary rather than the discovery
/// implementation, whose plans and resource groups remain generated-type-free.
///
/// # Arguments
///
/// * `buffer` - Renderer-facing pixel-derived edge-record buffer.
/// * `indirect_buffer` - GPU-written indirect draw arguments for `buffer`.
///
/// # Returns
///
/// The unchanged mixed-world output record containing both GPU handles.
pub(crate) fn create_edge_discovery_output(
    buffer: GpuBuffer,
    indirect_buffer: GpuBuffer,
) -> AnalysisEdgeDiscoveryOutput {
    AnalysisEdgeDiscoveryOutput {
        buffer,
        indirect_buffer,
    }
}

/// Build the component-visible diagnostic summary readback descriptor.
///
/// # Arguments
///
/// * `staging_buffer` - Rust-created upstream staging buffer that receives the
///   compact diagnostic summary copy.
/// * `summary_byte_length` - Exact byte length copied into `staging_buffer`.
/// * `submitted_commands` - Submitted upstream command buffer used for host
///   validation metadata and lifetime correlation.
/// * `compatibility_plan` - Component-visible compatibility metadata projected
///   from the diagnostic and discovery plans that sized the workload resources.
///
/// # Returns
///
/// Stable-export readback descriptor. JavaScript maps this tiny staging buffer
/// outside the component boundary; diagnostic visual outputs remain GPU-resident.
#[cfg(feature = "gpu-analysis")]
pub(crate) fn create_analysis_summary_readback(
    staging_buffer: GpuBuffer,
    summary_byte_length: u64,
    submitted_commands: GpuCommandBuffer,
    compatibility_plan: AnalysisPlan,
) -> AnalysisSummaryReadback {
    AnalysisSummaryReadback {
        plan: compatibility_plan,
        staging_buffer,
        byte_length: summary_byte_length,
        commands: submitted_commands,
    }
}
