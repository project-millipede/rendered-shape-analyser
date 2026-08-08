//! GPU-analysis-owned view over the generated WIT bindings.

pub(crate) use crate::wit::generated::exports::millipede::inspector::gpu_analysis::Guest as GpuAnalysisGuest;
pub(crate) use crate::wit::generated::millipede::inspector::host_gpu::{
    AnalysisDispatch, AnalysisDispatchResult,
};
pub(crate) use crate::wit::generated::millipede::inspector::host_log::{Level, log};
pub(crate) use crate::wit::generated::wasi::webgpu::webgpu::{GpuBuffer, GpuDevice, GpuTexture};
