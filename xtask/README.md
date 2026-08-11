# xtask

Rust task runner for repository-local maintenance commands.

This crate owns WIT dependency orchestration because the policy is part of the
Rust component contract:

- `wit fetch` runs `wkg fetch` from `../wkg`, where the temporary
  `wasi:webgpu` override lives.
- `wit fetch` verifies that the fetched `wasi:webgpu@0.0.1` package exposes the
  async browser-relevant surface we expect.
- `wit check` snapshots `wit/deps` plus `wkg/wkg.lock`, runs fetch, and fails if
  committed generated WIT state is stale.

`wkg` is still used directly as the package manager. The published `wkg` crate
is a binary crate, so this task runner invokes the CLI instead of importing a
`wkg` library. The policy guard is Rust code here and a normal Rust integration
test in `../tests/wasi_webgpu_wit.rs`.

Do not move dependency fetching into Cargo build scripts: fetching mutates
committed source files and may need network or registry state, while ordinary
Cargo builds should stay deterministic once `wit/deps` is present.
