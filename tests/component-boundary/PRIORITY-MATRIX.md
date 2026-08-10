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

### `analysis.integration.test.ts`

| Priority | Protected R2 behavior                                                         |
| -------: | ----------------------------------------------------------------------------- |
|       10 | Typed layout records cross WIT and return the exact hand-computed aggregates. |
|        9 | Public ping preserves component identity, version, and caller input.          |
|        8 | The plain JSON parameter string crosses without trapping.                     |
|        7 | Existing guest log calls and the exact analysis event remain connected.       |

### `gpu-stable.integration.test.ts`

| Priority | Protected R2 behavior                                                             |
| -------: | --------------------------------------------------------------------------------- |
|       10 | Stable analysis returns the exact public readback plan and summary byte boundary. |
|       10 | Stable recording order and finish/submit ownership remain exact.                  |
|        8 | Caller device, texture, and buffer identity survives every stable phase.          |
|        7 | All six renderer-facing stable handles preserve opaque identity.                  |
|        6 | Every stable pipeline and lane is created on the caller's device.                 |
|        5 | Stable indirect arguments remain separate GPU-only draw records.                  |

### `gpu-async.integration.test.ts`

| Priority | Protected R2 behavior                                            |
| -------: | ---------------------------------------------------------------- |
|       10 | Async analysis returns the exact Rust-decoded summary.           |
|        9 | Rust maps, copies, and unmaps the exact 72-byte summary range.   |
|        8 | Async owns exactly one complete encoding and submission.         |
|        7 | All six renderer-facing async handles preserve opaque identity.  |
|        6 | Every async pipeline and lane is created on the caller's device. |
|        5 | Async indirect arguments remain separate GPU-only draw records.  |

### `gpu-shared-frame.integration.test.ts`

| Priority | Protected R2 behavior                                                              |
| -------: | ---------------------------------------------------------------------------------- |
|       10 | The borrowed scheduler encoder is neither finished nor submitted by the component. |
|       10 | Compatibility opens and closes exactly one compute pass.                           |
|        9 | Shared-frame returns the exact plan and summary byte length.                       |
|        9 | All six renderer-facing frame handles preserve opaque identity.                    |
|        7 | Recording prepares every R2-A workload lane.                                       |
|        6 | The scheduler can later finish and submit the same borrowed encoder.               |

### `gpu-validation.integration.test.ts`

| Priority | Protected R2 behavior                                                                                                                             |
| -------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
|       10 | Final validation failure leaves the borrowed shared-frame encoder completely untouched.                                                           |
|        8 | Stable reaches the intended truth-buffer branch, then traps without captured pipeline/output, finish/submission, resolution, or mapping effects.  |
|        8 | Async reaches the intended truth-buffer branch, then rejects without captured pipeline/output, finish/submission, resolution, or mapping effects. |

### `wasi.integration.test.ts`

| Priority | Protected R2 behavior                                         |
| -------: | ------------------------------------------------------------- |
|       10 | A WIT async function projects to the expected Promise result. |
|        9 | A WIT future projects to the expected Promise-like result.    |
|        8 | A WIT byte stream projects to the expected semantic bytes.    |

## Unit tests

### `component-capability-state.test.ts`

| Priority | Protected loader behavior                                                        |
| -------: | -------------------------------------------------------------------------------- |
|       10 | The pure preparation and retirement transition table remains explicit and legal. |
|       10 | Ready is entered only by a successful active attempt and reused by normal calls. |
|       10 | Retry starts only from idle, unsupported, or failed lifecycle outcomes.          |
|       10 | Disposed absorbs repeated requests and every late preparation outcome.           |

### `component-capability-loader.test.ts`

| Priority | Protected loader behavior                                                         |
| -------: | --------------------------------------------------------------------------------- |
|       10 | Concurrent preparation shares one provider attempt and one ready capability.      |
|       10 | Unsupported and failed outcomes remain typed until an explicit retry.             |
|       10 | Nullable compatibility loading follows the same current or retried attempt.       |
|       10 | Disposal quarantines late completion and retires a ready provider exactly once.   |
|        9 | Disposal is idempotent and private provider ownership never enters ready results. |

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
3. Generated integration uses one final truth-buffer validation failure per
   public variant. Rust unit tests own pure metadata cases, their precedence,
   and metadata error strings.
4. Capability state-machine tests are pure transition-table tests. Loader
   controller tests separately use an injected provider to cover promises and
   cleanup without generated output. A later real-browser smoke must exercise
   the authored public loader, current provider adapter, and selected component
   together.

## Explicitly excluded

1. Real shader execution and rendered pixels remain browser WebGPU
   responsibilities. The Node host proves generated resource identity and
   command lifecycle, not GPU results.
2. R2-B adds no test-only WIT export, generated WIT snapshot, or second list of
   shader entry-point strings.
