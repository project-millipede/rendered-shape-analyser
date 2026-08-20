# R2 priority and ownership matrix

The score measures how strongly a test protects a product or component-boundary
contract. `10` is mandatory. Lower scores remain useful baseline coverage; they
are ordered below the higher-risk behavior inside every test file.

Priority is a risk score, not a sequence number. Repeated scores are
intentional when several contracts have the same importance.

Only two runnable categories exist: unit and integration. Fixtures, generated
component preparation, typed fake hosts, and shared Vitest setup are support
code rather than additional test categories.

## Integration tests

### `gpu-stable.integration.test.ts`

| Priority | Protected R2 behavior                                                                |
| -------: | ------------------------------------------------------------------------------------ |
|       10 | Stable analysis returns the bare success record with its exact public readback plan. |
|       10 | Stable recording order and finish/submit ownership remain exact.                     |
|        8 | Caller device, texture, and buffer identity survives every stable phase.             |
|        7 | All six renderer-facing stable handles preserve opaque identity.                     |
|        6 | Every stable pipeline and lane is created on the caller's device.                    |
|        5 | Stable indirect arguments remain separate GPU-only draw records.                     |

### `gpu-async.integration.test.ts`

| Priority | Protected R2 behavior                                                          |
| -------: | ------------------------------------------------------------------------------ |
|       10 | Async analysis returns the bare success record and exact Rust-decoded summary. |
|        9 | Rust maps, copies, and unmaps the exact 72-byte summary range.                 |
|        8 | Async owns exactly one complete encoding and submission.                       |
|        7 | All six renderer-facing async handles preserve opaque identity.                |
|        6 | Every async pipeline and lane is created on the caller's device.               |
|        5 | Async indirect arguments remain separate GPU-only draw records.                |

### `gpu-shared-frame.integration.test.ts`

| Priority | Protected R2 behavior                                                              |
| -------: | ---------------------------------------------------------------------------------- |
|       10 | The borrowed scheduler encoder is neither finished nor submitted by the component. |
|       10 | Compatibility opens and closes exactly one compute pass.                           |
|        9 | Shared-frame returns the bare success record with the exact plan and summary size. |
|        9 | All six renderer-facing frame handles preserve opaque identity.                    |
|        7 | Recording prepares every R2-A workload lane.                                       |
|        6 | The scheduler can later finish and submit the same borrowed encoder.               |

### `gpu-validation.integration.test.ts`

| Priority | Protected R2 behavior                                                                                                                 |
| -------: | ------------------------------------------------------------------------------------------------------------------------------------- |
|       10 | Frame sync error exposes the raw WIT record, leaves the encoder untouched, then permits a valid same-instance call.                   |
|       10 | Stable sync errors classify all three categories without captured analyzer lifecycle effects, then permit a valid same-instance call. |
|       10 | Async rejects with the raw WIT error record without captured analyzer lifecycle effects, then permits a valid same-instance call.     |

### `boundary-proofs-wasi-async.integration.test.ts`

| Priority | Protected R2 behavior                                         |
| -------: | ------------------------------------------------------------- |
|       10 | A WIT async function projects to the expected Promise result. |
|        9 | A WIT future projects to the expected Promise-like result.    |
|        8 | A WIT byte stream projects to the expected semantic bytes.    |

This matrix is the complete meaning of the public
`/boundary-proofs/wasi-async` subpath. The stable, async, and shared-frame
summary assertions above remain part of their GPU analyzer contracts; the
boundary-proof entry neither owns nor replaces them.

## Unit tests

### `component-capability-state.test.ts`

| Priority | Protected loader behavior                                                          |
| -------: | ---------------------------------------------------------------------------------- |
|       10 | The pure one-shot transition table enters ready exactly once.                      |
|       10 | Active and settled states keep repeated `prepare-requested` transitions unchanged. |
|       10 | Preparing maps only to ready, unsupported, or failed settlements.                  |
|       10 | A settlement without an active preparation is rejected as an illegal transition.   |

### `component-capability-loader.test.ts`

| Priority | Protected loader behavior                                                                     |
| -------: | --------------------------------------------------------------------------------------------- |
|       10 | Concurrent and later `prepare()` calls share one Promise, provider attempt, and ready result. |
|       10 | Unsupported settles without a provider call; later `prepare()` calls return that same result. |
|       10 | Provider failure settles and reports exactly once without a second attempt.                   |
|       10 | An unreadable rejection still settles as failed instead of stranding the loader in preparing. |
|        9 | Failure reporting cannot replace the authoritative result and is reentrant-safe.              |
|        9 | The loader exposes only read-only `state` and `prepare()`, with no retry or disposal method.  |

### `component-gpu-authored-capability.test.ts`

| Priority | Protected authored-capability behavior                                                     |
| -------: | ------------------------------------------------------------------------------------------ |
|       10 | Preparation occurs once while each stable call receives its own summary resolver.          |
|       10 | Shared-frame invocation stays synchronous and preserves exact output identity.             |
|       10 | Every shared-frame throw requires scheduler abandonment without append, finish, or submit. |
|        9 | Observer events report primitive invocation boundaries without changing outcomes.          |
|        9 | Disabled observation preserves the exact Promise, output, and rejection identities.        |
|        9 | Unreadable thrown values cannot replace the original failure through observation.          |

### `component-gpu-output-cleanup.test.ts`

| Priority | Protected GPU ownership behavior                                                              |
| -------: | --------------------------------------------------------------------------------------------- |
|       10 | First renderer validation failure destroys all six outputs and both summary buffers.          |
|       10 | Either partial summary lookup destroys its independently resolved native buffer exactly once. |
|       10 | Summary unmap and both destruction attempts remain independent and best-effort.               |
|       10 | Failed frame projection cleanup destroys every recorded output without finishing the encoder. |
|        9 | Frame discard reports only native buffers whose destruction actually succeeded.               |

### `component-gpu-analysis-validation-error.test.ts`

| Priority | Protected authored validation-error behavior                                  |
| -------: | ----------------------------------------------------------------------------- |
|       10 | Raw WIT records normalize to `ComponentGpuAnalysisValidationError`.           |
|       10 | `WebAssembly.RuntimeError` preserves its identity.                            |
|        9 | Inherited and malformed raw values preserve their identities.                 |

### `host-gpu-readback.test.ts`

| Priority | Protected fake-host behavior                                       |
| -------: | ------------------------------------------------------------------ |
|       10 | The stable fake resolver synthesizes the exact established result. |

### `webgpu-command-lifecycle.test.ts`

| Priority | Protected fake-host behavior                                                |
| -------: | --------------------------------------------------------------------------- |
|       10 | An open compute pass blocks another pass, summary copy, and encoder finish. |
|       10 | A compute pass ends exactly once and closes its encoder's pass state.       |
|       10 | Explicit encoder finish publishes one command record.                       |
|        9 | Explicit queue submission publishes one submission record.                  |

## Deliberately centralized

1. Stable owns the sole exact ten-entry dispatch-order assertion because all
   three variants call the same compatibility orchestrator.
2. Every generated GPU world retains its own workload-preparation proof.
   Stable and async additionally protect caller-device ownership and indirect-
   buffer shape; shared-frame protects its borrowed-encoder lifecycle.
3. Generated integration covers all three public preflight categories as exact
   records once through stable, then the representative truth-buffer category
   and a subsequent valid call through every GPU variant. Rust unit tests own
   the remaining pure request-metadata cases, their precedence, and their exact
   error strings.
4. Capability state-machine tests are pure transition-table tests. Module-wide
   loader tests separately inject support and instantiation operations to prove
   its one-shot Promise and settled outcomes without generated output.
5. A later real-browser smoke must exercise the authored public loader, current
   provider adapter, and selected component together.

## Explicitly excluded

1. Real shader execution and rendered pixels remain browser WebGPU
   responsibilities. The Node host proves generated resource identity and
   command lifecycle, not GPU results.
2. R2-B adds no test-only WIT export, generated WIT snapshot, or second list of
   shader entry-point strings.
