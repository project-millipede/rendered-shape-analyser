# WIT Package Dependencies

This folder isolates `wkg` state for the inspector component.

`wasi:webgpu@0.0.1` is not currently reachable through the public default
`wkg` registry from this machine, so `wkg.toml` temporarily overrides it to the
local `vendor/wasi-webgpu/wit` checkout. The public project WIT still imports
`wasi:webgpu/webgpu@0.0.1`; the override only controls how `wkg` resolves that
package while the registry package is unavailable.

When `wkg get wasi:webgpu@0.0.1 --format wit` succeeds without the override:

1. Remove the `wasi:webgpu` entry from `wkg.toml`.
2. Remove `vendor/wasi-webgpu`.
3. Run `npm run wit:fetch`.
4. Commit the refreshed `wit/deps` and `wkg/wkg.lock`.

`wkg` is currently used as a CLI because the published `wkg` crate is
binary-only. The Rust `xtask` crate owns orchestration and policy checks; it
calls `wkg wit fetch` from this folder so the local override is resolved
correctly.
