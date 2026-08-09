/**
 * Host implementation of the WIT import `millipede:inspector/host-events`.
 *
 * Each guest emission is re-dispatched as a DOM CustomEvent named
 * `wgi:<name>` with the raw JSON payload string as `detail`.
 */

export function emit(name: string, payloadJson: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(`wgi:${name}`, { detail: payloadJson }));
}
