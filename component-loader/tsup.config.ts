import { defineConfig, type Options } from "tsup";

const generatedRuntimePathMappings = [
  {
    sourcePrefix: "../../../pkg/generated/",
    outputPrefix: "../../pkg/generated/",
  },
  {
    sourcePrefix: "../../../../pkg/generated/",
    outputPrefix: "../../../pkg/generated/",
  },
] as const;
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
              filter: /pkg\/generated\/.+\/inspector-component$/,
            },
            (args) => {
              const mapping = generatedRuntimePathMappings.find(
                ({ sourcePrefix }) => args.path.startsWith(sourcePrefix),
              );
              if (!mapping) return;
              const worldPath = args.path.slice(
                mapping.sourcePrefix.length,
                -generatedRuntimeSuffix.length,
              );
              if (!worldPath) return;
              return {
                external: true,
                path: `${mapping.outputPrefix}${worldPath}${generatedRuntimeSuffix}.js`,
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
    "gpu-analysis": "component-loader/src/gpu-analysis.ts",
    "gpu-analysis-async": "component-loader/src/gpu-analysis-async.ts",
    "gpu-analysis-frame": "component-loader/src/gpu-analysis-frame.ts",
    "boundary-proofs/wasi-async":
      "component-loader/src/boundary-proofs/wasi-async/entry.ts",
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
