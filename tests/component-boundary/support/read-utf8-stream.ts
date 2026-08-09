interface ByteReadResult {
  done: boolean;
  value?: number | ArrayLike<number>;
}

interface StandardByteReader {
  read(): Promise<ByteReadResult>;
  cancel(): Promise<void>;
  releaseLock(): void;
}

interface StandardByteStream {
  getReader(): StandardByteReader;
}

interface JcoReadableStream {
  read(maxItems: number): Promise<ByteReadResult>;
  [Symbol.dispose]?: () => void;
}

type AsyncByteStream = AsyncIterable<number | ArrayLike<number>>;

type ProjectedByteStream =
  | StandardByteStream
  | AsyncByteStream
  | JcoReadableStream;

const hasStandardReader = (
  stream: ProjectedByteStream,
): stream is StandardByteStream =>
  "getReader" in stream && typeof stream.getReader === "function";

const hasAsyncIterator = (
  stream: ProjectedByteStream,
): stream is AsyncByteStream =>
  Symbol.asyncIterator in stream &&
  typeof stream[Symbol.asyncIterator] === "function";

const appendByteValue = (
  bytes: number[],
  value: number | ArrayLike<number> | undefined,
): void => {
  if (typeof value === "number") {
    bytes.push(value);
  } else if (value != null) {
    bytes.push(...Array.from(value));
  }
};

/**
 * Decode JCO's JavaScript projection of WIT `stream<u8>`.
 *
 * Generated and browser runtimes may expose one of three projections:
 *
 * 1. a standard `ReadableStream` reader;
 * 2. JCO's current `AsyncIterable` stream;
 * 3. JCO's earlier direct `read(maxItems)` stream API.
 *
 * The boundary assertion cares about bytes, not wrapper or chunking strategy.
 *
 * @param stream - Projected WIT byte stream using a supported reader API.
 * @param expectedByteLength - Maximum semantic byte count to decode and return;
 *   a reader may supply a larger final chunk, which is truncated before decode.
 * @returns UTF-8 text decoded from at most `expectedByteLength` bytes.
 */
export async function readUtf8Stream(
  stream: ProjectedByteStream,
  expectedByteLength: number,
): Promise<string> {
  const bytes: number[] = [];

  if (hasStandardReader(stream)) {
    const reader = stream.getReader();
    try {
      while (bytes.length < expectedByteLength) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        appendByteValue(bytes, value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  } else if (hasAsyncIterator(stream)) {
    for await (const value of stream) {
      appendByteValue(bytes, value);
      if (bytes.length >= expectedByteLength) {
        break;
      }
    }
  } else {
    while (bytes.length < expectedByteLength) {
      const { done, value } = await stream.read(
        expectedByteLength - bytes.length,
      );
      if (done) {
        break;
      }
      appendByteValue(bytes, value);
    }
    stream[Symbol.dispose]?.();
    const legacyDisposable = stream as JcoReadableStream & {
      [key: symbol]: (() => void) | undefined;
    };
    legacyDisposable[Symbol.for("dispose")]?.();
  }

  return new TextDecoder().decode(
    Uint8Array.from(bytes.slice(0, expectedByteLength)),
  );
}
