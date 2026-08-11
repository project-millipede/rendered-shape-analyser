/** Component execution variant exposed to post-readiness observation. */
export type ComponentGpuAnalysisVariant = "stable" | "async" | "frame";

/** Invocation boundary reported immediately before an authored capability call. */
export interface ComponentGpuAnalysisInvocationStarted {
  readonly phase: "started";
  readonly variant: ComponentGpuAnalysisVariant;
  readonly entryId: string;
}

/** Invocation boundary reported after the authored capability call returns. */
export interface ComponentGpuAnalysisInvocationReturned {
  readonly phase: "returned";
  readonly variant: ComponentGpuAnalysisVariant;
  readonly entryId: string;
}

/** Invocation boundary reported when the authored capability call throws. */
export interface ComponentGpuAnalysisInvocationThrew {
  readonly phase: "threw";
  readonly variant: ComponentGpuAnalysisVariant;
  readonly entryId: string;
  readonly errorName: string;
  readonly errorMessage: string;
}

/**
 * Provider-neutral notification reported only around normal ready execution.
 *
 * Invocation notifications are observer payloads, not loader transition
 * triggers. They neither represent readiness nor change capability state.
 */
export type ComponentGpuAnalysisInvocationEvent =
  | ComponentGpuAnalysisInvocationStarted
  | ComponentGpuAnalysisInvocationReturned
  | ComponentGpuAnalysisInvocationThrew;

/** Optional best-effort sink for post-readiness invocation boundaries. */
export interface ComponentGpuAnalysisObserver {
  readonly observe: (event: ComponentGpuAnalysisInvocationEvent) => void;
}

/** Deliver one observation without allowing diagnostics to change execution. */
const deliver = (
  observer: ComponentGpuAnalysisObserver,
  event: ComponentGpuAnalysisInvocationEvent,
): void => {
  try {
    observer.observe(event);
  } catch {
    // Measurement plumbing is intentionally non-authoritative.
  }
};

/** Report the start of an already prepared capability invocation. */
export function notifyComponentGpuAnalysisStarted(
  observer: ComponentGpuAnalysisObserver | undefined,
  variant: ComponentGpuAnalysisVariant,
  entryId: string,
): void {
  if (!observer) return;
  deliver(observer, { phase: "started", variant, entryId });
}

/** Report that an already prepared capability invocation returned. */
export function notifyComponentGpuAnalysisReturned(
  observer: ComponentGpuAnalysisObserver | undefined,
  variant: ComponentGpuAnalysisVariant,
  entryId: string,
): void {
  if (!observer) return;
  deliver(observer, { phase: "returned", variant, entryId });
}

/** Report that an already prepared capability invocation threw. */
export function notifyComponentGpuAnalysisThrew(
  observer: ComponentGpuAnalysisObserver | undefined,
  variant: ComponentGpuAnalysisVariant,
  entryId: string,
  error: Error,
): void {
  if (!observer) return;
  let errorName = "Error";
  let errorMessage = "component invocation failed";
  try {
    if (typeof error.name === "string") errorName = error.name;
  } catch {
    // Hostile error accessors must not alter invocation behavior.
  }
  try {
    if (typeof error.message === "string") errorMessage = error.message;
  } catch {
    // Hostile error accessors must not alter invocation behavior.
  }
  deliver(observer, {
    phase: "threw",
    variant,
    entryId,
    errorName,
    errorMessage,
  });
}
