//! Runtime helpers shared by component interface implementations.

use std::sync::Once;

use crate::wit::generated::millipede::inspector::host_log::{Level, log};

/// Route Rust panics to the host console — exactly once.
///
/// On `wasm32-unknown-unknown` there is no WASI stderr: without this hook
/// a panic message vanishes and the host only sees an opaque trap.
pub(crate) fn install_panic_hook() {
    static HOOK: Once = Once::new();
    HOOK.call_once(|| {
        std::panic::set_hook(Box::new(|panic_info| {
            log(
                Level::Error,
                &format!("[runtime] guest panic: {panic_info}"),
            );
        }));
    });
}
