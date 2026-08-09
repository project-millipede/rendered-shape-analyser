/**
 * Node test-host implementation of `millipede:inspector/host-events`.
 *
 * Component-boundary tests link this module instead of the website host. Node
 * has no DOM; the browser host re-dispatches guest emissions as DOM
 * `CustomEvent` instances.
 *
 * Every emission is captured so integration tests can assert the guest-to-host
 * direction.
 */

/** One host event emitted by the generated component under test. */
export interface CapturedEvent {
  name: string;
  payloadJson: string;
}

/** Captured guest events, in call order. */
export const capturedEvents: CapturedEvent[] = [];

/**
 * Record one guest event emission.
 *
 * @param name - Event name; the browser host re-dispatches it as `wgi:<name>`.
 * @param payloadJson - JSON-serialized event payload.
 */
export function emit(name: string, payloadJson: string): void {
  capturedEvents.push({ name, payloadJson });
}

/** Clear captured events without replacing the exported array reference. */
export function resetTestEvents(): void {
  capturedEvents.length = 0;
}
