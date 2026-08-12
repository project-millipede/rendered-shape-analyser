//! Implementation of the WIT `wasi-async-proofs` boundary-proof export.

use super::bindings::{
    FutureReader, Level, StreamReader, WasiAsyncProofsGuest, log, start_task, wit_future,
    wit_stream,
};
use crate::shared::Component;
use crate::shared::runtime::install_panic_hook;

/// Complete a Component Model `future<u32>` from a guest task.
///
/// `future<T>` is exposed by the Rust bindings as a reader/writer pair. The
/// reader crosses the component boundary back to the host; the writer stays in
/// the guest and eventually sends the value. Spawning a tiny task lets the
/// caller receive the future immediately while the guest resolves it through
/// the WASI 0.3 async machinery.
///
/// # Arguments
///
/// * `value` - The value to send into the returned future.
///
/// # Returns
///
/// The readable side of the component-model future.
fn future_u32(value: u32) -> FutureReader<u32> {
    let (writer, reader) = wit_future::new::<u32>(|| 0);
    start_task(async move {
        match writer.write(value).await {
            Ok(()) => log(
                Level::Info,
                &format!("[boundary-proofs/wasi-async] future proof completed {value}"),
            ),
            Err(_) => log(
                Level::Warn,
                &format!(
                    "[boundary-proofs/wasi-async] future proof dropped before host received {value}"
                ),
            ),
        }
    });
    reader
}

/// Complete a Component Model `stream<u8>` from a guest task.
///
/// Like `future<T>`, streams are represented as reader/writer pairs. The guest
/// returns the reader immediately, then writes the byte payload through the
/// writer from a task. jco should project the returned reader to JavaScript as
/// an `AsyncIterable<number>` after the JSPI export Promise resolves.
///
/// # Arguments
///
/// * `bytes` - The bytes to write into the stream.
///
/// # Returns
///
/// The readable side of the component-model stream.
fn stream_u8(bytes: Vec<u8>) -> StreamReader<u8> {
    let (mut writer, reader) = wit_stream::new::<u8>();
    let byte_len = bytes.len();
    start_task(async move {
        let remaining = writer.write_all(bytes).await;
        if remaining.is_empty() {
            log(
                Level::Info,
                &format!("[boundary-proofs/wasi-async] stream proof completed {byte_len} bytes"),
            );
        } else {
            log(
                Level::Warn,
                &format!(
                    "[boundary-proofs/wasi-async] stream proof dropped with {} of {byte_len} bytes unsent",
                    remaining.len()
                ),
            );
        }
    });
    reader
}

impl WasiAsyncProofsGuest for Component {
    /// Prove WIT `async func`; see `wit/boundary-proofs-wasi-async.wit`.
    async fn prove_async_func(value: u32) -> u32 {
        install_panic_hook();
        log(
            Level::Info,
            &format!("[boundary-proofs/wasi-async] async-func proof received {value}"),
        );
        let result = value + 1;
        log(
            Level::Info,
            &format!("[boundary-proofs/wasi-async] async-func proof returning {result}"),
        );
        result
    }

    /// Prove WIT `future<T>`; see `wit/boundary-proofs-wasi-async.wit`.
    fn prove_future(value: u32) -> FutureReader<u32> {
        install_panic_hook();
        log(
            Level::Info,
            &format!("[boundary-proofs/wasi-async] future proof received {value}"),
        );
        let result = value + 2;
        log(
            Level::Info,
            &format!("[boundary-proofs/wasi-async] future proof returning {result}"),
        );
        future_u32(result)
    }

    /// Prove WIT `stream<T>`; see `wit/boundary-proofs-wasi-async.wit`.
    fn prove_stream(label: String) -> StreamReader<u8> {
        install_panic_hook();
        log(
            Level::Info,
            &format!("[boundary-proofs/wasi-async] stream proof received {label}"),
        );
        let bytes = format!("stream:{label}").into_bytes();
        log(
            Level::Info,
            &format!(
                "[boundary-proofs/wasi-async] stream proof returning {} bytes",
                bytes.len()
            ),
        );
        stream_u8(bytes)
    }
}
