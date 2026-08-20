import type { AnalysisValidationErrorKind as GeneratedAnalysisValidationErrorKind } from "../../pkg/generated/gpu-analysis/interfaces/millipede-inspector-host-gpu";

/**
 * Runtime whitelist for directly lifted WIT validation-error records.
 *
 * The generated-key `Record` keeps this structural decoder exhaustive when
 * WIT adds or removes an `analysis-validation-error-kind`.
 */
const validationErrorKinds: Readonly<
  Record<GeneratedAnalysisValidationErrorKind, true>
> = {
  "invalid-request": true,
  "texture-mismatch": true,
  "truth-buffer-too-small": true,
};

/** Runtime names derived from the exhaustive generated-kind record. */
const validationErrorKindNames: readonly string[] =
  Object.keys(validationErrorKinds);

/** Recoverable preflight failures returned by the GPU-analysis components. */
export type ComponentGpuAnalysisValidationErrorKind =
  keyof typeof validationErrorKinds;

/** Authored error exposed by every exact GPU-analysis package subpath. */
export class ComponentGpuAnalysisValidationError extends Error {
  override readonly name = "ComponentGpuAnalysisValidationError";

  constructor(
    readonly kind: ComponentGpuAnalysisValidationErrorKind,
    message: string,
  ) {
    super(message);
  }
}

interface AnalysisValidationErrorRecord {
  readonly kind: ComponentGpuAnalysisValidationErrorKind;
  readonly message: string;
}

const hasOwn = Object.prototype.hasOwnProperty;

const isValidationErrorKind = (
  value: unknown,
): value is ComponentGpuAnalysisValidationErrorKind =>
  typeof value === "string" && validationErrorKindNames.includes(value);

/** Read a structurally valid WIT validation-error record without throwing. */
const readValidationErrorRecord = (
  value: unknown,
): AnalysisValidationErrorRecord | null => {
  try {
    if (value === null || typeof value !== "object") return null;
    if (!hasOwn.call(value, "kind") || !hasOwn.call(value, "message")) {
      return null;
    }

    const candidate = value as {
      readonly kind: unknown;
      readonly message: unknown;
    };
    const kind = candidate.kind;
    const message = candidate.message;
    if (!isValidationErrorKind(kind)) return null;
    if (typeof message !== "string") return null;
    return { kind, message };
  } catch {
    return null;
  }
};

/**
 * Normalize a directly lifted top-level WIT result error.
 *
 * Package generation disables component-error wrapping, so synchronous and
 * JSPI exports both throw or reject with the directly lifted WIT record. The
 * normalizer therefore accepts only a non-Error value matching that record.
 * Every `Error` and every unrecognized value remains authoritative and is
 * returned unchanged by identity.
 */
export function normalizeComponentGpuAnalysisValidationError(
  caught: unknown,
): unknown {
  try {
    if (caught instanceof WebAssembly.RuntimeError) return caught;
    if (caught instanceof Error) return caught;

    const record = readValidationErrorRecord(caught);
    if (!record) return caught;
    return new ComponentGpuAnalysisValidationError(record.kind, record.message);
  } catch {
    return caught;
  }
}
