//! Raw `wit-bindgen` output.
//!
//! Domain modules should prefer their local `bindings.rs` view modules over
//! importing these generated paths directly.

/// wit-bindgen output for the browser-safe analysis-only world.
///
/// Generated code is exempt from the documentation standard; the public
/// contract is documented in `wit/` and forwarded into these
/// bindings by wit-bindgen.
#[cfg(all(
    not(feature = "wasi-async-proofs"),
    not(feature = "gpu-analysis"),
    not(feature = "gpu-analysis-async"),
    not(feature = "gpu-analysis-frame")
))]
#[allow(missing_docs, clippy::all)]
mod raw {
    wit_bindgen::generate!({
        path: "wit",
        world: "inspector-analysis",
    });
}

/// wit-bindgen output for the browser-safe GPU analysis world.
///
/// This world imports upstream `wasi:webgpu` resource names and exports only
/// the P1 GPU analyzer orchestration surface.
#[cfg(feature = "gpu-analysis")]
#[allow(missing_docs, clippy::all)]
mod raw {
    wit_bindgen::generate!({
        path: "wit",
        world: "inspector-gpu-analysis",
        with: {
            "wasi:webgpu/webgpu@0.0.1": generate,
        },
    });
}

/// wit-bindgen output for the Chrome/JSPI-only async GPU analysis world.
///
/// This world imports upstream `wasi:webgpu` resource names, awaits the
/// project-owned host dispatcher through JSPI, and exports only the
/// experimental async GPU analyzer orchestration surface.
#[cfg(feature = "gpu-analysis-async")]
#[allow(missing_docs, clippy::all)]
mod raw {
    wit_bindgen::generate!({
        path: "wit",
        world: "inspector-gpu-analysis-async",
        with: {
            "wasi:webgpu/webgpu@0.0.1": generate,
        },
    });
}

/// wit-bindgen output for the scheduler-owned shared-frame GPU world.
///
/// This world exposes a borrowed upstream command encoder. The browser keeps
/// ownership of encoder finish and queue submission, while the component owns
/// only the analyzer commands appended before the render pass.
#[cfg(feature = "gpu-analysis-frame")]
#[allow(missing_docs, clippy::all)]
mod raw {
    wit_bindgen::generate!({
        path: "wit",
        world: "inspector-gpu-analysis-frame",
        with: {
            "wasi:webgpu/webgpu@0.0.1": generate,
        },
    });
}

/// wit-bindgen output for the full world, including WASI 0.3 async proofs.
///
/// Generated code is exempt from the documentation standard; the public
/// contract is documented in `wit/` and forwarded into these
/// bindings by wit-bindgen.
#[cfg(all(
    feature = "wasi-async-proofs",
    not(feature = "gpu-analysis"),
    not(feature = "gpu-analysis-async"),
    not(feature = "gpu-analysis-frame")
))]
#[allow(missing_docs, clippy::all)]
mod raw {
    wit_bindgen::generate!({
        path: "wit",
        world: "inspector-component",
    });
}

pub(crate) use raw::*;
