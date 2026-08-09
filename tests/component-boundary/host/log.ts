/**
 * Node test-host implementation of `millipede:inspector/host-log`.
 *
 * Component-boundary tests link this module instead of the website host so
 * every guest log invocation can be captured and asserted. `log()` also
 * forwards lines to `console.error`; shared Vitest setup suppresses that
 * expected test noise while retaining the forwarding behavior.
 */

/** One host log line emitted by the generated component under test. */
export interface CapturedLogLine {
  lvl: string;
  msg: string;
}

/** Captured guest log lines, in call order. */
export const capturedLogLines: CapturedLogLine[] = [];

function formatComponentLog(msg: string): string {
  const scopedMessage = /^\[([a-z0-9.-]+)]\s*(.*)$/i.exec(msg);
  if (!scopedMessage) {
    return `[inspector-component] ${msg}`;
  }

  const [, scope, message] = scopedMessage;
  return `[${scope}][inspector-component] ${message}`;
}

/**
 * Record one guest log line and mirror it to the test process.
 *
 * @param lvl - WIT `level` enum case: `debug`, `info`, `warn`, or `error`.
 * @param msg - Guest-provided log message.
 */
export function log(lvl: string, msg: string): void {
  capturedLogLines.push({ lvl, msg });
  console.error(`[guest:${lvl}] ${formatComponentLog(msg)}`);
}

/** Clear captured logs without replacing the exported array reference. */
export function resetTestLog(): void {
  capturedLogLines.length = 0;
}
