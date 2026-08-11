/**
 * Convert any caught JavaScript value into a diagnostic Error without throwing.
 *
 * The original value remains authoritative at invocation boundaries; this
 * helper only creates the typed preparation result or observer payload.
 */
export function normalizeCaughtError(
  caught: unknown,
  fallbackMessage: string,
): Error {
  try {
    if (caught instanceof Error) return caught;
    return new Error(String(caught));
  } catch {
    return new Error(fallbackMessage);
  }
}
