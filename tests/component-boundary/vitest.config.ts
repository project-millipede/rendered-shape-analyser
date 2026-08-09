import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const harnessRoot = fileURLToPath(new URL(".", import.meta.url));
const cacheDirectory = fileURLToPath(
  new URL("../../target/component-tests/vite-cache", import.meta.url),
);

export default defineConfig({
  cacheDir: cacheDirectory,
  root: harnessRoot,
  test: {
    environment: "node",
    // Vitest forks the test worker, so it needs the same JSPI opt-in as the
    // outer runner that starts the CLI.
    execArgv: ["--experimental-wasm-jspi"],
    fileParallelism: false,
    include: [
      "unit/**/*.test.ts",
      "integration/**/*.test.ts",
    ],
    isolate: false,
    maxWorkers: 1,
    pool: "forks",
    // Keep generated components and compiled host modules in the same Vitest
    // module graph. Splitting either tree into a second native/external graph
    // would give tests different host arrays and registries than the component.
    server: {
      deps: {
        inline: [
          /[\\/]target[\\/]component-tests[\\/]host[\\/]/,
          /[\\/]target[\\/]component-tests[\\/]generated[\\/]/,
        ],
      },
    },
    sequence: {
      concurrent: false,
    },
    setupFiles: ["./support/vitest-setup.ts"],
    testTimeout: 30_000,
  },
});
