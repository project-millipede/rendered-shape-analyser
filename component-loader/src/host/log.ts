import type { GuestLogLevel } from "../index";

/**
 * Host implementation of the WIT import `millipede:inspector/host-log`.
 *
 * The jco-transpiled modules in `pkg/generated/` import the compiled JS file
 * through the `--map` flags in scripts/sync.sh.
 */

const consoleByLevel: Record<GuestLogLevel, (msg: string) => void> = {
  debug: (msg) => console.debug(msg),
  info: (msg) => console.info(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

function formatComponentLog(msg: string): string {
  const scopedMessage = /^\[([a-z0-9.-]+)]\s*(.*)$/i.exec(msg);
  if (!scopedMessage) {
    return `[inspector-component] ${msg}`;
  }

  const [, scope, message] = scopedMessage;
  return `[${scope}][inspector-component] ${message}`;
}

/**
 * Write one log line attributed to the wasm component.
 */
export function log(lvl: GuestLogLevel, msg: string): void {
  const write = consoleByLevel[lvl] ?? consoleByLevel.info;
  write(formatComponentLog(msg));
}
