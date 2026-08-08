#[test]
fn fetched_wasi_webgpu_wit_uses_the_async_surface() {
    let wit = include_str!("../wit/deps/wasi-webgpu-0.0.1/package.wit");
    for pattern in REQUIRED_WASI_WEBGPU_ASYNC_SIGNATURES {
        assert!(
            wit.contains(pattern),
            "fetched wasi:webgpu WIT is missing async signature: {pattern}"
        );
    }
}

const REQUIRED_WASI_WEBGPU_ASYNC_SIGNATURES: &[&str] = &[
    "request-adapter: async func",
    "request-device: async func",
    "map-async: async func",
    "create-compute-pipeline-async: async func",
    "pop-error-scope: async func",
    "on-submitted-work-done: async func",
    "lost: func() -> future<gpu-device-lost-info>",
    "on-uncaptured-error: func() -> stream<gpu-error>",
];
