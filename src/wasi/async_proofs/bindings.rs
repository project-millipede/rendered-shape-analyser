//! WASI async-proof-owned view over the generated WIT bindings.

pub(crate) use crate::wit::generated::exports::millipede::inspector::wasi_async_proofs::Guest as WasiAsyncProofsGuest;
pub(crate) use crate::wit::generated::millipede::inspector::host_log::{Level, log};
pub(crate) use crate::wit::generated::{wit_future, wit_stream};
pub(crate) use wit_bindgen::rt::async_support::{FutureReader, StreamReader, start_task};
