//! Repository-local task runner.
//!
//! Keep generated-file orchestration and policy checks here instead of shell
//! scripts so the rules are typed, testable, and visible to Rust tooling.

use anyhow::{Context, Result, bail};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

fn main() -> Result<()> {
    let mut args = std::env::args().skip(1);
    match (args.next().as_deref(), args.next().as_deref()) {
        (Some("wit"), Some("fetch")) => wit_fetch(),
        (Some("wit"), Some("check")) => wit_check(),
        _ => bail!("usage: cargo run -p inspector-component-xtask -- wit <fetch|check>"),
    }
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("xtask lives directly under the repository root")
        .to_path_buf()
}

fn wit_fetch() -> Result<()> {
    let root = repo_root();
    let wkg_dir = root.join("wkg");
    let status = Command::new("wkg")
        .args(["wit", "fetch", "--wit-dir", "../wit", "--type", "wit"])
        .current_dir(&wkg_dir)
        .status()
        .with_context(|| {
            format!(
                "failed to run wkg from {}; install with: cargo install wkg --locked",
                wkg_dir.display()
            )
        })?;

    if !status.success() {
        bail!("wkg wit fetch failed with status {status}");
    }

    verify_wasi_webgpu_async_wit(&root)?;
    Ok(())
}

fn wit_check() -> Result<()> {
    let root = repo_root();
    let before = snapshot_wit_state(&root).context("failed to snapshot current WIT state")?;

    wit_fetch()?;

    let after = snapshot_wit_state(&root).context("failed to snapshot fetched WIT state")?;
    if before != after {
        bail!(
            "WIT dependencies changed; run `npm run wit:fetch` and commit `wit/deps` plus `wkg/wkg.lock`"
        );
    }

    println!("--- WIT dependencies are current ---");
    Ok(())
}

fn snapshot_wit_state(root: &Path) -> Result<BTreeMap<String, Vec<u8>>> {
    let mut files = BTreeMap::new();
    collect_files(root, &root.join("wit/deps"), &mut files)?;

    let lock = root.join("wkg/wkg.lock");
    if lock.exists() {
        files.insert("wkg/wkg.lock".to_owned(), fs::read(&lock)?);
    }

    Ok(files)
}

fn collect_files(root: &Path, dir: &Path, files: &mut BTreeMap<String, Vec<u8>>) -> Result<()> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).with_context(|| format!("failed to read {}", dir.display()))? {
        let path = entry?.path();
        if path.is_dir() {
            collect_files(root, &path, files)?;
        } else {
            let key = path
                .strip_prefix(root)?
                .to_string_lossy()
                .replace(std::path::MAIN_SEPARATOR, "/");
            files.insert(key, fs::read(&path)?);
        }
    }

    Ok(())
}

fn verify_wasi_webgpu_async_wit(root: &Path) -> Result<()> {
    let wit = root.join("wit/deps/wasi-webgpu-0.0.1/package.wit");
    let content = fs::read_to_string(&wit)
        .with_context(|| format!("fetched wasi:webgpu WIT not found at {}", wit.display()))?;

    for pattern in REQUIRED_WASI_WEBGPU_ASYNC_SIGNATURES {
        if !content.contains(pattern) {
            bail!("fetched wasi:webgpu WIT is missing async signature: {pattern}");
        }
    }

    println!("--- wasi:webgpu async WIT verified ---");
    Ok(())
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
