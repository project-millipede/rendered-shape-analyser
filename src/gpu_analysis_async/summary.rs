//! Chrome/JSPI summary readback and decoding for `gpu-analysis-async`.

use super::bindings::{
    AnalysisDispatch, AnalysisSummaryNodeStats, AnalysisSummaryResult, GpuBuffer, GpuMapMode,
};
use crate::reference_diagnostics::SUMMARY_NODE_STRIDE_BYTES;

const U32_BYTE_LENGTH: usize = 4;
const LUMINANCE_SCALE: f64 = 1000.0;

/// Decode the compact per-component summary bytes copied from a mapped buffer.
///
/// # Arguments
///
/// * `request` - Original analysis request metadata used to size the summary.
/// * `bytes` - Copied staging-buffer bytes returned by upstream WebGPU.
///
/// # Returns
///
/// Backend-neutral diagnostic summary records for the analyzed entry.
fn decode_summary_bytes(request: &AnalysisDispatch, bytes: &[u8]) -> AnalysisSummaryResult {
    let nodes = (0..request.node_count)
        .map(|node_index| {
            let byte_offset = (usize::try_from(node_index).expect("node index fits usize"))
                * usize::try_from(SUMMARY_NODE_STRIDE_BYTES).expect("summary stride fits usize");
            let texel_count = read_u32_le(bytes, byte_offset);
            let ink_count = read_u32_le(bytes, byte_offset + U32_BYTE_LENGTH);
            let luminance_sum =
                f64::from(read_u32_le(bytes, byte_offset + 2 * U32_BYTE_LENGTH)) / LUMINANCE_SCALE;
            AnalysisSummaryNodeStats {
                node_index,
                texel_count,
                ink_count,
                luminance_sum,
                mean_luminance: if texel_count > 0 {
                    luminance_sum / f64::from(texel_count)
                } else {
                    0.0
                },
            }
        })
        .collect();

    AnalysisSummaryResult {
        texture_width: request.texture_width,
        texture_height: request.texture_height,
        node_count: request.node_count,
        nodes,
    }
}

/// Read one little-endian u32 counter from the mapped summary byte slice.
///
/// # Arguments
///
/// * `bytes` - Copied mapped-range bytes from the staging buffer.
/// * `offset` - Byte offset of the u32 counter.
///
/// # Returns
///
/// Counter value, or zero when the host returned a shorter range than
/// expected. The caller already validates the requested byte length; the zero
/// fallback avoids panicking while formatting diagnostics in malformed tests.
fn read_u32_le(bytes: &[u8], offset: usize) -> u32 {
    let Some(chunk) = bytes.get(offset..offset + 4) else {
        return 0;
    };
    u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]])
}

/// Map, copy, decode, and unmap the compact diagnostic summary staging buffer.
///
/// # Arguments
///
/// * `staging_buffer` - Rust-created upstream buffer with `MAP_READ` usage.
/// * `summary_byte_length` - Exact byte length copied into `staging_buffer`.
/// * `request` - Original analysis request metadata used for result fields.
///
/// # Returns
///
/// Decoded compact diagnostic summary. Visual analyzer output remains
/// GPU-resident and is not copied through this function.
pub(super) async fn read_diagnostic_summary(
    staging_buffer: &GpuBuffer,
    summary_byte_length: u64,
    request: &AnalysisDispatch,
) -> Result<AnalysisSummaryResult, String> {
    // Chrome/JSPI readback ownership:
    //
    // 1. This function exists only in `gpu_analysis_async`; the stable
    //    `gpu_analysis` path still lets JavaScript await browser `mapAsync`.
    // 2. The mapped range is the tiny diagnostic summary staging buffer, never
    //    captured-pixel texture and never GPU-resident visual output.
    // 3. Rust calls upstream-shaped `gpu-buffer` methods so the async path no
    //    longer needs a project-owned summary-readback bridge.
    // 4. The copied bytes are decoded to one-way reporting values and must not
    //    feed later GPU work.
    if let Err(error) = staging_buffer
        .map_async(GpuMapMode::READ, Some(0), Some(summary_byte_length))
        .await
    {
        return Err(format!(
            "failed to map async GPU summary staging buffer: {}",
            error.message
        ));
    }

    let bytes =
        match staging_buffer.get_mapped_range_get_with_copy(Some(0), Some(summary_byte_length)) {
            Ok(bytes) => bytes,
            Err(error) => {
                let _ = staging_buffer.unmap();
                return Err(format!(
                    "failed to copy mapped GPU summary staging range: {}",
                    error.message
                ));
            }
        };

    if let Err(error) = staging_buffer.unmap() {
        return Err(format!(
            "failed to unmap GPU summary staging buffer: {}",
            error.message
        ));
    }

    Ok(decode_summary_bytes(request, &bytes))
}
