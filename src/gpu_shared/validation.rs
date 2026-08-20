//! Workload-specific metadata validation and compatibility composition.

use crate::wit::generated::millipede::inspector::host_gpu::{
    AnalysisDispatch, AnalysisValidationError, AnalysisValidationErrorKind,
};
use crate::wit::generated::wasi::webgpu::webgpu::{GpuBuffer, GpuTexture};

use crate::reference_diagnostics::{GROUND_TRUTH_HEADER_BYTES, GROUND_TRUTH_NODE_BYTES};

/// Validate non-zero captured-texture dimensions shared by both workloads.
///
/// Keeping this helper neutral prevents either workload validator from
/// depending on the other merely to enforce their shared dimension rules.
fn validate_nonzero_texture_dimensions(
    texture_width: u32,
    texture_height: u32,
) -> Result<(), &'static str> {
    if texture_width == 0 || texture_height == 0 {
        return Err("texture dimensions must be non-zero");
    }
    Ok(())
}

/// Validate the diagnostic-specific reference-count rule.
///
/// A caller may treat zero references as no diagnostic request. Once
/// reference-guided diagnostics are requested, at least one valid component
/// reference must be available.
///
/// # Arguments
///
/// * `node_count` - Number of valid records in the component-reference buffer.
///
/// # Returns
///
/// `Ok(())` for a non-zero reference count, otherwise the stable reason
/// composed into the public typed preflight error.
fn validate_diagnostic_reference_count(node_count: u32) -> Result<(), &'static str> {
    if node_count == 0 {
        return Err("ground-truth node count must be non-zero");
    }
    Ok(())
}

/// Validate all metadata required by pixel-derived discovery.
///
/// Reference count and truth-buffer facts are intentionally absent from this
/// signature. A discovery-only caller therefore cannot reject an otherwise
/// valid captured texture because it has no reference nodes.
/// Compatibility entry identity is absent as well: it labels logs and public
/// workflow results, but it is not a discovery-workload validity input.
///
/// # Arguments
///
/// * `texture_width` - Captured-texture width in texels.
/// * `texture_height` - Captured-texture height in texels.
///
/// # Returns
///
/// `Ok(())` when the discovery metadata is meaningful, otherwise the stable
/// validation reason composed into the public typed preflight error.
fn validate_discovery_metadata(
    texture_width: u32,
    texture_height: u32,
) -> Result<(), &'static str> {
    validate_nonzero_texture_dimensions(texture_width, texture_height)
}

/// Validate the unchanged mixed public request through the independent rules.
///
/// This temporary compatibility adapter preserves the former validation order
/// and error strings:
///
/// 1. Reject an empty compatibility entry identity.
/// 2. Pass only captured-texture dimensions into discovery validation.
/// 3. Pass only `node_count` into diagnostic reference-count validation.
///
/// Entry identity remains here solely because the unchanged public workflow
/// uses it to correlate and label results. This compatibility composition does
/// not define the input contract of an independent discovery or diagnostic
/// adapter.
///
/// # Arguments
///
/// * `request` - Dispatch metadata supplied by the browser analysis backend.
///
/// # Returns
///
/// `Ok(())` when both currently requested workloads are meaningful, otherwise
/// the stable reason composed into the public typed preflight error.
fn validate_compatibility_request(request: &AnalysisDispatch) -> Result<(), &'static str> {
    if request.entry_id.is_empty() {
        return Err("entry id is empty");
    }

    validate_discovery_metadata(request.texture_width, request.texture_height)?;
    validate_diagnostic_reference_count(request.node_count)
}

/// Validate captured-texture dimensions against the upstream browser resource.
///
/// # Arguments
///
/// * `texture` - Captured-pixel texture supplied as an upstream `wasi:webgpu`
///   resource handle.
/// * `texture_width` - Declared captured-texture width to compare with the
///   upstream resource.
/// * `texture_height` - Declared captured-texture height to compare with the
///   upstream resource.
///
/// # Returns
///
/// `Ok(())` when declared dimensions match the registered texture, otherwise
/// the stable reason composed into the public typed preflight error.
fn validate_texture(
    texture: &GpuTexture,
    texture_width: u32,
    texture_height: u32,
) -> Result<(), &'static str> {
    if texture.width() != texture_width || texture.height() != texture_height {
        return Err("texture dimensions do not match upstream gpu-texture");
    }
    Ok(())
}

/// Validate diagnostic reference count against the upstream truth buffer.
///
/// # Arguments
///
/// * `truth_buffer` - Component-reference buffer supplied as an upstream
///   `wasi:webgpu` resource handle.
/// * `node_count` - Number of valid reference records declared by diagnostics.
///
/// # Returns
///
/// `Ok(())` when the registered buffer can contain the declared node count,
/// otherwise the stable reason composed into the public typed preflight error.
fn validate_truth_buffer(truth_buffer: &GpuBuffer, node_count: u32) -> Result<(), &'static str> {
    let required_bytes =
        GROUND_TRUTH_HEADER_BYTES + u64::from(node_count) * GROUND_TRUTH_NODE_BYTES;

    if truth_buffer.size() < required_bytes {
        return Err("ground-truth buffer is smaller than declared node count");
    }
    Ok(())
}

/// Validate every recoverable preflight layer in its public precedence order.
///
/// The returned error is part of the generated component contract, so callers
/// can reject malformed input without trapping their component instance. This
/// function must remain free of GPU planning, allocation, command encoding,
/// submission, and logging side effects.
///
/// # Validation order
///
/// 1. Request metadata.
/// 2. Declared dimensions against the upstream texture.
/// 3. Declared node count against the upstream truth-buffer capacity.
///
/// # Arguments
///
/// * `texture` - Captured-pixel texture supplied by the host.
/// * `truth_buffer` - Component-reference buffer supplied by the host.
/// * `request` - Dispatch metadata supplied by the browser backend.
///
/// # Returns
///
/// `Ok(())` when all preflight layers pass, otherwise the first typed
/// validation error according to the order above.
pub(crate) fn validate_analysis_preflight(
    texture: &GpuTexture,
    truth_buffer: &GpuBuffer,
    request: &AnalysisDispatch,
) -> Result<(), AnalysisValidationError> {
    if let Err(message) = validate_compatibility_request(request) {
        return Err(analysis_validation_error(
            AnalysisValidationErrorKind::InvalidRequest,
            message,
        ));
    }

    if let Err(message) = validate_texture(texture, request.texture_width, request.texture_height) {
        return Err(analysis_validation_error(
            AnalysisValidationErrorKind::TextureMismatch,
            message,
        ));
    }

    if let Err(message) = validate_truth_buffer(truth_buffer, request.node_count) {
        return Err(analysis_validation_error(
            AnalysisValidationErrorKind::TruthBufferTooSmall,
            message,
        ));
    }

    Ok(())
}

/// Compose one generated validation record without adding logging side effects.
fn analysis_validation_error(
    kind: AnalysisValidationErrorKind,
    message: &str,
) -> AnalysisValidationError {
    AnalysisValidationError {
        kind,
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compatibility_request(
        entry_id: &str,
        texture_width: u32,
        texture_height: u32,
        node_count: u32,
    ) -> AnalysisDispatch {
        AnalysisDispatch {
            entry_id: entry_id.to_string(),
            display_name: "Validation fixture".to_string(),
            texture_width,
            texture_height,
            node_count,
        }
    }

    #[test]
    fn discovery_metadata_requires_nonzero_texture_dimensions() {
        // Discovery accepts the smallest meaningful texture and has no
        // diagnostic reference-count input.
        assert_eq!(validate_discovery_metadata(1, 1), Ok(()));
        assert_eq!(
            validate_discovery_metadata(0, 1),
            Err("texture dimensions must be non-zero")
        );
        assert_eq!(
            validate_discovery_metadata(1, 0),
            Err("texture dimensions must be non-zero")
        );
    }

    #[test]
    fn diagnostic_reference_count_requires_one_reference() {
        assert_eq!(validate_diagnostic_reference_count(1), Ok(()));
        assert_eq!(
            validate_diagnostic_reference_count(0),
            Err("ground-truth node count must be non-zero")
        );
    }

    #[test]
    fn compatibility_validation_preserves_entry_dimension_reference_order() {
        // The mixed public request keeps its established error precedence:
        // compatibility identity first, shared texture dimensions second, and
        // the diagnostic-only reference count last.
        assert_eq!(
            validate_compatibility_request(&compatibility_request("entry", 1, 1, 1)),
            Ok(())
        );
        assert_eq!(
            validate_compatibility_request(&compatibility_request("", 0, 0, 0)),
            Err("entry id is empty")
        );
        assert_eq!(
            validate_compatibility_request(&compatibility_request("entry", 0, 1, 0)),
            Err("texture dimensions must be non-zero")
        );
        assert_eq!(
            validate_compatibility_request(&compatibility_request("entry", 1, 1, 0)),
            Err("ground-truth node count must be non-zero")
        );
    }
}
