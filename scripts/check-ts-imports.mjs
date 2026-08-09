#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const LOADER_SOURCE_ROOT = fileURLToPath(
  new URL("../component-loader/src/", import.meta.url),
);
const EXTRA_SOURCE_FILES = [
  fileURLToPath(new URL("../component-loader/tsup.config.ts", import.meta.url)),
];
const IMPORT_SPECIFIER_PATTERN =
  /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
const FORBIDDEN_TYPE_PATTERN =
  /\bas\s+(unknown|any)\b|:\s*(unknown|any)\b|=\s*(unknown|any)\b|<\s*(unknown|any)\s*>/g;
const FORBIDDEN_JSDOC_TYPE_PATTERN = /@\w+\s+\{[^}\n]*\b(unknown|any)\b[^}\n]*\}/g;
const FORBIDDEN_INDEXED_ACCESS_TYPE_PATTERN =
  /\b[A-Z][A-Za-z0-9_$]*(?:<[^>\n]+>)?\s*\[\s*["'][^"']+["']\s*\]/g;

/**
 * Collect authored source files checked by loader policy.
 *
 * 1. Walks one source tree recursively.
 * 2. Includes `.ts` and `.mjs` files because those are the relevant authored
 *    loader source formats.
 * 3. Excludes generated and built output by construction because callers pass
 *    only authored source roots.
 *
 * @param {string} directory - Absolute authored source directory path to scan.
 * @returns {Promise<string[]>} Absolute source file paths to inspect.
 */
async function collectAuthoredSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectAuthoredSourceFiles(path);
      if (entry.isFile() && (path.endsWith(".ts") || path.endsWith(".mjs"))) {
        return [path];
      }
      return [];
    }),
  );
  return files.flat();
}

/**
 * Find forbidden generated or relative `.js` import specifiers in one file.
 *
 * 1. Reads the file as source text.
 * 2. Checks static imports, re-exports, and literal dynamic imports.
 * 3. Reports generated aliases because the loader uses a local generated
 *    adapter instead of package-private import maps.
 *
 * @param {string} filePath - Absolute TypeScript file path to inspect.
 * @returns {Promise<string[]>} Forbidden import specifiers found in `filePath`.
 */
async function findForbiddenImports(filePath) {
  const source = await readFile(filePath, "utf8");
  const forbidden = [];

  for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
    const specifier = match[1] ?? match[2];
    const isRelativeJavaScriptImport =
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      specifier.endsWith(".js");
    const isGeneratedPackageAlias = specifier.startsWith("#generated/");

    if (isRelativeJavaScriptImport || isGeneratedPackageAlias) {
      forbidden.push(specifier);
    }
  }

  return forbidden;
}

/**
 * Find broad top-type usage in authored TypeScript source.
 *
 * 1. Looks for `unknown` and `any` in common type positions.
 * 2. Also checks JSDoc type braces such as `@param {unknown}`.
 * 3. Ignores ordinary prose such as log messages and comments.
 * 4. Keeps generated files out of scope because this policy is for code we
 *    author and maintain.
 *
 * @param {string} filePath - Absolute TypeScript file path to inspect.
 * @returns {Promise<string[]>} Forbidden type names found in `filePath`.
 */
async function findForbiddenBroadTypes(filePath) {
  const source = await readFile(filePath, "utf8");
  const forbidden = [];

  for (const match of source.matchAll(FORBIDDEN_TYPE_PATTERN)) {
    const typeName = match.slice(1).find(Boolean);
    if (typeName) forbidden.push(typeName);
  }

  for (const match of source.matchAll(FORBIDDEN_JSDOC_TYPE_PATTERN)) {
    const typeName = match[1];
    if (typeName) forbidden.push(typeName);
  }

  return forbidden;
}

/**
 * Find indexed-access type syntax in authored TypeScript source.
 *
 * 1. Detects patterns such as `SomeType["property"]`.
 * 2. Leaves ordinary runtime array/object indexing alone by requiring a
 *    type-like identifier before the bracket.
 * 3. Keeps generated files out of scope because this policy is for code we
 *    author and maintain.
 *
 * @param {string} filePath - Absolute TypeScript file path to inspect.
 * @returns {Promise<string[]>} Forbidden indexed-access snippets found in `filePath`.
 */
async function findForbiddenIndexedAccessTypes(filePath) {
  const source = await readFile(filePath, "utf8");
  return Array.from(source.matchAll(FORBIDDEN_INDEXED_ACCESS_TYPE_PATTERN), (match) => match[0]);
}

/**
 * Enforce explicit type and import policy in authored loader source.
 *
 * 1. Scans `component-loader/src` and the loader config.
 * 2. Fails when a human-authored TypeScript file imports another local module
 *    with a `.js` suffix or uses the old `#generated/*` aliases.
 * 3. Fails when authored source uses broad `unknown` or `any` types.
 * 4. Fails when authored TypeScript uses indexed-access type syntax.
 * 5. Leaves emitted JavaScript under `component-loader/dist` to the build
 *    tool, which is the right layer to choose runtime module specifiers.
 *
 * @returns {Promise<void>} Resolves after reporting policy violations.
 */
async function main() {
  const files = [
    ...(await collectAuthoredSourceFiles(LOADER_SOURCE_ROOT)),
    ...EXTRA_SOURCE_FILES,
  ];
  const failures = [];

  for (const filePath of files) {
    const forbidden = await findForbiddenImports(filePath);
    for (const specifier of forbidden) {
      failures.push({
        filePath,
        specifier,
      });
    }

    const broadTypes = await findForbiddenBroadTypes(filePath);
    for (const typeName of broadTypes) {
      failures.push({
        filePath,
        specifier: typeName,
      });
    }

    const indexedAccessTypes = await findForbiddenIndexedAccessTypes(filePath);
    for (const indexedAccessType of indexedAccessTypes) {
      failures.push({
        filePath,
        specifier: indexedAccessType,
      });
    }
  }

  if (failures.length === 0) return;

  console.error(
    "error: authored TypeScript must use extensionless relative imports, the local generated adapter, explicit types, and no indexed-access types",
  );
  for (const failure of failures) {
    console.error(
      `${relative(process.cwd(), failure.filePath)}: ${failure.specifier}`,
    );
  }
  process.exitCode = 1;
}

await main();
