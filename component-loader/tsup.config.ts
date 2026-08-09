import { defineConfig, type Options } from "tsup";

const generatedRuntimeModules = new Map([
  [
    "../../pkg/generated/analysis/inspector-component",
    "../../pkg/generated/analysis/inspector-component.js",
  ],
  [
    "../../pkg/generated/gpu-analysis/inspector-component",
    "../../pkg/generated/gpu-analysis/inspector-component.js",
  ],
  [
    "../../pkg/generated/gpu-analysis-async/inspector-component",
    "../../pkg/generated/gpu-analysis-async/inspector-component.js",
  ],
  [
    "../../pkg/generated/gpu-analysis-frame/inspector-component",
    "../../pkg/generated/gpu-analysis-frame/inspector-component.js",
  ],
  [
    "../../pkg/generated/wasi-0.3/inspector-component",
    "../../pkg/generated/wasi-0.3/inspector-component.js",
  ],
]);

/**
 * Create the build-time bridge from authored extensionless generated imports
 * to runtime-valid ESM files.
 *
 * 1. Keeps TypeScript source pointed at extensionless generated module paths.
 * 2. Marks those generated modules external so they are not bundled into the
 *    loader.
 * 3. Rewrites only emitted JavaScript specifiers to the `.js` files that Node,
 *    browsers, and Next can load.
 *
 * @returns The `tsup` option fragment that installs the esbuild plugin.
 */
function createGeneratedRuntimeModulePluginOptions(): Pick<
  Options,
  "esbuildPlugins"
> {
  return {
    esbuildPlugins: [
      {
        name: "generated-component-runtime-paths",
        /**
         * Register the path rewrite for jco-generated runtime modules.
         *
         * @param build - Esbuild plugin build handle provided by `tsup`.
         * @returns Nothing.
         */
        setup(build) {
          build.onResolve(
            {
              filter:
                /^\.\.\/\.\.\/pkg\/generated\/(?:analysis|gpu-analysis|gpu-analysis-async|gpu-analysis-frame|wasi-0\.3)\/inspector-component$/,
            },
            (args) => {
              const runtimePath = generatedRuntimeModules.get(args.path);
              if (!runtimePath) return;
              return {
                external: true,
                path: runtimePath,
              };
            },
          );
        },
      },
    ],
  };
}

// Authored TypeScript stays extensionless; tsup owns emitted ESM specifiers.
export default defineConfig({
  ...createGeneratedRuntimeModulePluginOptions(),
  clean: true,
  dts: true,
  entry: {
    index: "component-loader/src/index.ts",
    frame: "component-loader/src/frame.ts",
    "host/events": "component-loader/src/host/events.ts",
    generated: "component-loader/src/generated.ts",
    "host/gpu": "component-loader/src/host/gpu.ts",
    "host/gpu-types": "component-loader/src/host/gpu-types.ts",
    "host/log": "component-loader/src/host/log.ts",
    "host/webgpu": "component-loader/src/host/webgpu/index.ts",
  },
  format: ["esm"],
  outDir: "component-loader/dist",
  platform: "browser",
  splitting: true,
  target: "es2022",
  treeshake: false,
});
