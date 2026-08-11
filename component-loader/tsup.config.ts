import { defineConfig, type Options } from "tsup";

const generatedRuntimePrefix = "../../../pkg/generated/";
const generatedRuntimeSuffix = "/inspector-component";

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
                /^\.\.\/\.\.\/\.\.\/pkg\/generated\/[^/]+\/inspector-component$/,
            },
            (args) => {
              const world = args.path.slice(
                generatedRuntimePrefix.length,
                -generatedRuntimeSuffix.length,
              );
              if (!world) return;
              return {
                external: true,
                path: `../../pkg/generated/${world}/inspector-component.js`,
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
    analysis: "component-loader/src/analysis.ts",
    "gpu-analysis": "component-loader/src/gpu-analysis.ts",
    "gpu-analysis-async": "component-loader/src/gpu-analysis-async.ts",
    "gpu-analysis-frame": "component-loader/src/gpu-analysis-frame.ts",
    diagnostics: "component-loader/src/diagnostics.ts",
    "host/events": "component-loader/src/host/events.ts",
    "host/log": "component-loader/src/host/log.ts",
    "host/webgpu": "component-loader/src/host/webgpu/index.ts",
  },
  format: ["esm"],
  outDir: "component-loader/dist",
  platform: "browser",
  splitting: true,
  target: "es2022",
  treeshake: true,
});
