//! Shared-frame-owned view over generated WIT bindings.

pub(crate) use crate::wit::generated::exports::millipede::inspector::gpu_analysis_frame::Guest as GpuAnalysisFrameGuest;
pub(crate) use crate::wit::generated::exports::millipede::inspector::gpu_analysis_frame::{
    AnalysisFrameSummary, EncodedAnalysisFrame,
};
pub(crate) use crate::wit::generated::millipede::inspector::host_gpu::{
    AnalysisDispatch, AnalysisValidationError,
};
pub(crate) use crate::wit::generated::millipede::inspector::host_log::{Level, log};
pub(crate) use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBuffer, GpuCommandEncoder, GpuDevice, GpuTexture,
};
