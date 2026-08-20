import { describe, expect, it } from "vitest";

import {
  invokeAsyncComponentOperation,
  invokeComponentOperation,
} from "../../../component-loader/src/component-invocation.js";
import {
  ComponentGpuAnalysisValidationError,
  type ComponentGpuAnalysisValidationErrorKind,
  normalizeComponentGpuAnalysisValidationError,
} from "../../../component-loader/src/gpu-analysis-validation-error.js";

interface ValidationRecord {
  readonly kind: ComponentGpuAnalysisValidationErrorKind;
  readonly message: string;
}

const VALIDATION_RECORDS = [
  { kind: "invalid-request", message: "entry id is empty" },
  {
    kind: "texture-mismatch",
    message: "texture dimensions do not match upstream gpu-texture",
  },
  {
    kind: "truth-buffer-too-small",
    message: "ground-truth buffer is smaller than declared node count",
  },
] as const satisfies readonly ValidationRecord[];
const VALIDATION_RECORD = VALIDATION_RECORDS[2];

function expectAuthoredValidationError(
  value: unknown,
  expected: ValidationRecord = VALIDATION_RECORD,
): void {
  expect(value).toBeInstanceOf(ComponentGpuAnalysisValidationError);
  expect(value).toMatchObject({
    name: "ComponentGpuAnalysisValidationError",
    ...expected,
  });
}

describe("component GPU analysis validation-error normalization", () => {
  it("[P10] composes normalization with sync and async operations", async () => {
    expect(() =>
      invokeComponentOperation(() => {
        throw VALIDATION_RECORD;
      }, normalizeComponentGpuAnalysisValidationError),
    ).toThrow(ComponentGpuAnalysisValidationError);

    await expect(
      invokeAsyncComponentOperation(async () => {
        throw VALIDATION_RECORD;
      }, normalizeComponentGpuAnalysisValidationError),
    ).rejects.toBeInstanceOf(ComponentGpuAnalysisValidationError);
  });

  it("[P10] preserves inferred sync and async success values", async () => {
    const value = { result: "success" } as const;

    expect(
      invokeComponentOperation(
        () => value,
        normalizeComponentGpuAnalysisValidationError,
      ),
    ).toBe(value);

    await expect(
      invokeAsyncComponentOperation(
        async () => value,
        normalizeComponentGpuAnalysisValidationError,
      ),
    ).resolves.toBe(value);
  });

  it("[P10] normalizes directly lifted validation-error records", () => {
    for (const record of VALIDATION_RECORDS) {
      expectAuthoredValidationError(
        normalizeComponentGpuAnalysisValidationError(record),
        record,
      );
    }
  });

  it("[P9] preserves inherited and malformed raw records", () => {
    const inheritedRecord = Object.create(VALIDATION_RECORD) as object;
    const unknownKind = {
      kind: "unknown-validation-kind",
      message: VALIDATION_RECORD.message,
    };
    const nonStringMessage = {
      kind: VALIDATION_RECORD.kind,
      message: 42,
    };

    expect(normalizeComponentGpuAnalysisValidationError(inheritedRecord)).toBe(
      inheritedRecord,
    );
    expect(normalizeComponentGpuAnalysisValidationError(unknownKind)).toBe(
      unknownKind,
    );
    expect(normalizeComponentGpuAnalysisValidationError(nonStringMessage)).toBe(
      nonStringMessage,
    );
  });

  it("[P10] preserves a WebAssembly.RuntimeError by identity", () => {
    const trap = new WebAssembly.RuntimeError("unreachable");

    expect(normalizeComponentGpuAnalysisValidationError(trap)).toBe(trap);
  });
});
