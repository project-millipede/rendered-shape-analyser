//! Analysis-owned view over the generated WIT bindings.

pub(crate) use crate::wit::generated::exports::millipede::inspector::analysis::{
    Guest as AnalysisGuest, NodeRecord, TreeStats,
};
pub(crate) use crate::wit::generated::millipede::inspector::host_events::emit;
pub(crate) use crate::wit::generated::millipede::inspector::host_log::{Level, log};
