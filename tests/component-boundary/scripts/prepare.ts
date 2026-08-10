/**
 * Prepare the compiled Node host and real JCO component modules for Vitest.
 *
 * 1. Compile the authored TypeScript host to ordinary JavaScript under
 *    `target/component-tests/host`.
 * 2. Transpile every selected component world into a sibling generated tree.
 * 3. Map each generated module's static WIT imports to that compiled host.
 * 4. Reject missing inputs and outputs without a shell or network fallback.
 *
 * The emitted host is the integration runtime, not merely disposable compiler
 * output: generated components and test assertions must import those same ESM
 * URLs to share resource classes, registries, and capture arrays.
 */
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface ComponentTranspile {
  readonly artifact: string;
  readonly directory: string;
  readonly mappings: readonly (readonly [string, string])[];
  /** Exports JCO must explicitly wrap for JSPI; presence enables JSPI mode. */
  readonly asyncExports?: readonly string[];
}

const harnessRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(harnessRoot, "../..");
const testOutputRoot = join(repositoryRoot, "target", "component-tests");
const hostOutputRoot = join(testOutputRoot, "host");
const generatedRoot = join(testOutputRoot, "generated");
const hostOnly = process.argv.slice(2).includes("--host-only");
const unexpectedArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--host-only");

if (unexpectedArguments.length > 0) {
  throw new Error(
    `unknown preparation argument(s): ${unexpectedArguments.join(", ")}`,
  );
}

/**
 * JCO writes static host imports into each generated module. Test transpilation
 * maps them to the compiled Node host; `scripts/sync.sh` maps the same WIT
 * imports to browser host modules for website artifacts.
 */
const commonMappings = [
  ["millipede:inspector/host-log@0.1.0", "../../host/log.js"],
  ["millipede:inspector/host-events@0.1.0", "../../host/events.js"],
] as const;

const gpuMappings = [
  ...commonMappings,
  ["wasi:webgpu/webgpu@0.0.1", "../../host/webgpu/index.js"],
  ["millipede:inspector/host-gpu@0.1.0", "../../host/gpu.js"],
] as const;

const componentTranspiles: readonly ComponentTranspile[] = [
  {
    artifact: "inspector-component.analysis.wasm",
    directory: "analysis",
    mappings: commonMappings,
  },
  {
    artifact: "inspector-component.gpu-analysis.wasm",
    directory: "gpu-analysis",
    mappings: gpuMappings,
  },
  {
    artifact: "inspector-component.gpu-analysis-async.wasm",
    directory: "gpu-analysis-async",
    mappings: gpuMappings,
    asyncExports: ["millipede:inspector/gpu-analysis-async@0.1.0#analyze"],
  },
  {
    artifact: "inspector-component.gpu-analysis-frame.wasm",
    directory: "gpu-analysis-frame",
    mappings: gpuMappings,
  },
  // JCO detects `prove-async-func` from its WIT `async func` declaration. The
  // synchronous exports returning `future<T>` or `stream<T>` must be named
  // explicitly so generated Wasm calls use `WebAssembly.promising` instead of
  // the synchronous path.
  {
    artifact: "inspector-component.wasi-0.3.wasm",
    directory: "wasi-0.3",
    mappings: commonMappings,
    asyncExports: [
      "millipede:inspector/wasi-async-proofs@0.1.0#prove-future",
      "millipede:inspector/wasi-async-proofs@0.1.0#prove-stream",
    ],
  },
];

/** Run one checked Node-based tool without a shell or network fallback. */
async function runNodeTool(tool: string, arguments_: readonly string[]) {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [tool, ...arguments_], {
      cwd: repositoryRoot,
      stdio: "inherit",
    });

    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      let failureDetail = ` with exit code ${code}`;
      if (signal) failureDetail = ` with signal ${signal}`;
      rejectPromise(new Error(`${tool} failed${failureDetail}`));
    });
  });
}

/** Require a regular file before passing it to another tool. */
async function requireFile(path: string, description: string) {
  try {
    await access(path, fsConstants.R_OK);
    const metadata = await stat(path);
    if (!metadata.isFile()) {
      throw new Error(`${description} is not a regular file: ${path}`);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("not a regular file")
    ) {
      throw error;
    }
    throw new Error(`${description} is missing or unreadable: ${path}`, {
      cause: error,
    });
  }
}

/** Resolve the installed TypeScript entrypoint without an `npx` fallback. */
function resolveTypescriptEntrypoint() {
  const require = createRequire(import.meta.url);
  return require.resolve("typescript/bin/tsc");
}

/** Resolve jco's CLI beside its public API entrypoint. */
function resolveJcoEntrypoint() {
  const require = createRequire(import.meta.url);
  const jcoApi = require.resolve("@bytecodealliance/jco");
  return join(dirname(jcoApi), "jco.js");
}

/**
 * Compile the typed test host and require its public runtime entry points.
 *
 * @param typescript - Resolved path to the locally installed TypeScript CLI.
 */
async function compileHost(typescript: string) {
  await runNodeTool(typescript, [
    "-p",
    join(harnessRoot, "tsconfig.host.json"),
  ]);

  for (const relativeOutput of [
    "events.js",
    "gpu.js",
    "log.js",
    "reset.js",
    "webgpu/index.js",
  ]) {
    await requireFile(
      join(hostOutputRoot, relativeOutput),
      `compiled host module ${relativeOutput}`,
    );
  }
}

/**
 * Transpile every real component world against the compiled Node host.
 *
 * All source artifacts are validated before any generated world is created, so
 * a partial component build cannot leave a misleading integration-test tree.
 *
 * @param jco - Resolved path to the locally installed JCO CLI.
 * @param componentRoot - Directory containing the five source components.
 */
async function transpileComponents(jco: string, componentRoot: string) {
  // Reject an incomplete source build before creating any generated world.
  for (const component of componentTranspiles) {
    await requireFile(
      join(componentRoot, component.artifact),
      `component artifact ${component.artifact}`,
    );
  }

  for (const component of componentTranspiles) {
    const artifact = join(componentRoot, component.artifact);
    const outputDirectory = join(generatedRoot, component.directory);

    const arguments_ = [
      "transpile",
      artifact,
      "-o",
      outputDirectory,
      "--name",
      "inspector-component",
    ];

    for (const [specifier, target] of component.mappings) {
      arguments_.push("--map", `${specifier}=${target}`);
    }

    if (component.asyncExports) {
      arguments_.push("--async-mode", "jspi", "--async-exports");
      arguments_.push(...component.asyncExports);
    }

    arguments_.push("--base64-cutoff", "0", "--no-namespaced-exports");
    await runNodeTool(jco, arguments_);
    await requireFile(
      join(outputDirectory, "inspector-component.js"),
      `generated ${component.directory} module`,
    );
  }
}

async function main() {
  // This directory contains only disposable test output. Clearing it keeps
  // unit runs from accidentally observing components generated by an earlier
  // integration run.
  await rm(testOutputRoot, { force: true, recursive: true });

  const typescript = resolveTypescriptEntrypoint();
  await requireFile(typescript, "TypeScript compiler");
  await compileHost(typescript);

  if (hostOnly) {
    return;
  }

  const componentRoot = resolve(
    process.env.INSPECTOR_COMPONENT_BUILD_DIR ??
      join(repositoryRoot, "target", "component"),
  );
  const jco = resolveJcoEntrypoint();
  await requireFile(jco, "jco CLI");
  await transpileComponents(jco, componentRoot);
}

await main();
