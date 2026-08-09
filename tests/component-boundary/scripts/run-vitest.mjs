/**
 * Prepare and run exactly one documented Vitest category, or both categories.
 *
 * Unit runs compile only the typed host. Integration and combined runs also
 * transpile the real components before starting the JSPI-enabled worker.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const harnessRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [category = "all", ...vitestArguments] = process.argv.slice(2);
const categories = new Set(["unit", "integration", "all"]);

if (!categories.has(category)) {
  throw new Error(
    `unknown test category ${JSON.stringify(category)}; expected unit, integration, or all`,
  );
}

async function run(command, arguments_) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd: harnessRoot,
      stdio: "inherit",
    });

    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `${command} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
        ),
      );
    });
  });
}

const prepareArguments = [join(harnessRoot, "scripts", "prepare.ts")];
if (category === "unit") {
  prepareArguments.push("--host-only");
}
await run(process.execPath, prepareArguments);

const require = createRequire(import.meta.url);
const vitestPackage = require.resolve("vitest/package.json");
const vitestCli = join(dirname(vitestPackage), "vitest.mjs");
const categoryArguments = category === "all" ? [] : [category];

// JCO's current JSPI output calls `WebAssembly.Suspending` and
// `WebAssembly.promising`; Node 24 exposes them behind this V8 flag.
await run(process.execPath, [
  "--experimental-wasm-jspi",
  vitestCli,
  "run",
  "--config",
  join(harnessRoot, "vitest.config.ts"),
  ...categoryArguments,
  ...vitestArguments,
]);
