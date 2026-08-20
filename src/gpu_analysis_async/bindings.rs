//! Async GPU-analysis-owned view over the generated WIT bindings.

pub(crate) use crate::wit::generated::exports::millipede::inspector::gpu_analysis_async::{
    AnalysisResult, AnalysisSummaryNodeStats, AnalysisSummaryResult, Guest as GpuAnalysisAsyncGuest,
};
pub(crate) use crate::wit::generated::millipede::inspector::host_gpu::{
    AnalysisDispatch, AnalysisValidationError,
};
pub(crate) use crate::wit::generated::millipede::inspector::host_log::{Level, log};
pub(crate) use crate::wit::generated::wasi::webgpu::webgpu::{
    GpuBuffer, GpuDevice, GpuErrorFilter, GpuMapMode, GpuTexture,
};
