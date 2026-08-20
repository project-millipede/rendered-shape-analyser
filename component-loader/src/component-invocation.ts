/** Transform one value thrown across a generated component boundary. */
export type ThrownValueNormalizer = (caught: unknown) => unknown;

/**
 * Invoke one synchronous generated component operation.
 *
 * @param operation - Generated operation to invoke.
 * @param normalizeError - Boundary-specific transformation for thrown values.
 * @returns The operation's inferred success value.
 */
export function invokeComponentOperation<T>(
  operation: () => T,
  normalizeError: ThrownValueNormalizer,
): T {
  try {
    return operation();
  } catch (caught) {
    throw normalizeError(caught);
  }
}

/**
 * Invoke one asynchronous generated component operation.
 *
 * The `await` remains inside the error boundary so it handles both a
 * synchronous invocation throw and an asynchronous rejection.
 *
 * @param operation - Generated asynchronous operation to invoke.
 * @param normalizeError - Boundary-specific transformation for thrown values.
 * @returns A Promise containing the operation's inferred success value.
 */
export async function invokeAsyncComponentOperation<T>(
  operation: () => PromiseLike<T>,
  normalizeError: ThrownValueNormalizer,
): Promise<T> {
  try {
    return await operation();
  } catch (caught) {
    throw normalizeError(caught);
  }
}
