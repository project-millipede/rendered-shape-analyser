/** Stable authored classification for recoverable guest validation failures. */
export type ComponentGpuAnalysisValidationErrorKind =
  | "invalid-request"
  | "texture-mismatch"
  | "truth-buffer-too-small";

/**
 * Recoverable validation failure returned by a prepared GPU-analysis guest.
 *
 * Generated WIT outcome records stay private to the provider boundary. Public
 * authored capabilities preserve their success-only return types and surface
 * this error through the ordinary synchronous throw or Promise rejection
 * channel instead.
 */
export class ComponentGpuAnalysisValidationError extends Error {
  readonly kind: ComponentGpuAnalysisValidationErrorKind;

  constructor(kind: ComponentGpuAnalysisValidationErrorKind, message: string) {
    super(message);
    this.name = "ComponentGpuAnalysisValidationError";
    this.kind = kind;
  }
}

/** Private structural mirror of the shared generated validation record. */
type GeneratedAnalysisValidationError = {
  readonly kind: ComponentGpuAnalysisValidationErrorKind;
  readonly message: string;
};

/** Private structural mirror shared by the three generated outcome variants. */
type GeneratedComponentGpuAnalysisOutcome<Success> =
  | {
      readonly tag: "success";
      readonly val: Success;
    }
  | {
      readonly tag: "validation-error";
      readonly val: GeneratedAnalysisValidationError;
    };

/** Unwrap one private generated outcome into the authored success/error API. */
export function unwrapComponentGpuAnalysisOutcome<Success>(
  outcome: GeneratedComponentGpuAnalysisOutcome<Success>,
): Success {
  if (outcome.tag === "success") {
    return outcome.val;
  }
  if (outcome.tag === "validation-error") {
    throw new ComponentGpuAnalysisValidationError(
      outcome.val.kind,
      outcome.val.message,
    );
  }

  throw new Error("component GPU analysis returned an unknown outcome");
}
