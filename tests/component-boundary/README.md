# Generated-component unit and integration tests

This suite is the canonical executable component-boundary proof for the R2
migration. It has exactly two runnable categories:

1. **Unit tests** exercise the typed test host without loading a component.
2. **Integration tests** load the four real JCO-transpiled components against
   that compiled host.

The integration category proves the generated Component Model boundary in both
directions under Node before browser or website involvement: tests call guest
exports, while the guest calls the compiled typed host imports.

Fixtures, test hosts, component preparation, and reporting support those two
categories; they are not additional test categories. R2-B extends the existing
successful-call coverage in place and adds one focused validation topic; it
does not introduce another runner or a parallel host implementation.

Every spec exposes its score in the test name and orders cases from `[P10]`
downward. See [`PRIORITY-MATRIX.md`](PRIORITY-MATRIX.md) for the complete
priority and ownership table.

## Commands

Run commands from the repository root:

```sh
npm run test:typecheck
npm run test:unit
npm run test:integration
npm run test:all
```

Integration and combined runs require the four component artifacts under
`target/component/`. Run `npm run build` first when they are absent. An
alternate artifact directory can be selected explicitly:

```sh
INSPECTOR_COMPONENT_BUILD_DIR=/absolute/component-directory \
  npm run test:integration
```

Node.js 24 or newer is required because the async generated worlds use the
exact `WebAssembly.Suspending` and `WebAssembly.promising` JSPI APIs. The test
runner enables Node's current JSPI flag; browser loaders perform their own
pre-provider support gate.

## Test ownership

```text
tests/component-boundary/
├── integration/        generated-component boundary tests
├── unit/               typed test-host behavior
├── assertions/         shared domain assertions
├── fixtures/           shared component-boundary GPU workload fixtures
├── host/               typed stateful Component Model test host
├── support/            Vitest setup and test-context helpers
└── scripts/            deterministic host compilation and JCO preparation
```

The preparation step clears only `target/component-tests/`, compiles the typed
host into `target/component-tests/host/`, and transpiles the four worlds into
`target/component-tests/generated/`. The repository already ignores `target/`.

| Generated world              | Component artifact                                    |
| ---------------------------- | ----------------------------------------------------- |
| `gpu-analysis`               | `inspector-component.gpu-analysis.wasm`               |
| `gpu-analysis-async`         | `inspector-component.gpu-analysis-async.wasm`         |
| `gpu-analysis-frame`         | `inspector-component.gpu-analysis-frame.wasm`         |
| `boundary-proofs/wasi-async` | `boundary-proofs/wasi-async/inspector-component.wasm` |

The three GPU worlds exercise product boundaries. The
`boundary-proofs/wasi-async` world is deliberately separate: it proves current
WIT/JCO async projections without adding those proof exports to the product
API.

The public `/boundary-proofs/wasi-async` subpath selects only that isolated
proof. It does not absorb or replace GPU summary behavior. Stable integration
still proves its readback plan, async integration still proves the Rust-decoded
summary, and shared-frame integration still proves the pending-summary
descriptor used after scheduler submission.

JCO names, JSPI exports, component-error wrapping policy, base64 cutoff, and
namespaced-export behavior mirror `scripts/sync.sh`. The mappings intentionally
substitute the typed Node host for the browser host. Preparation resolves the
locally installed TypeScript and JCO entrypoints directly and never invokes
`npx`.

Those are test-preparation parity requirements, not a second description of
generated lowering. JCO provider and core-Wasm mechanics remain centralized in
the
[generated-artifact tooling baseline](../../docs/tooling/jco-generated-artifact-baseline.md).

## One host-module instance

Integration tests import observations and reset helpers from the compiled
`target/component-tests/host/*.js` modules. Generated components map their host
imports to those exact module URLs. This shared module graph is required so the
component and assertions observe the same resource classes, WeakMap registries,
and capture arrays.

Do not replace those imports with direct imports from `host/*.ts`. Source and
emitted files have different ESM URLs and would create separate module
instances: the generated component would mutate the compiled host's arrays and
registries while the test reset a second source-host instance.

Vitest uses one worker, disables file parallelism and module isolation, and
runs tests non-concurrently. `support/vitest-setup.ts` resets all observations
and resource registries before each test, spies on guest logging, and restores
Vitest mocks afterward. Each validation case performs its invalid and later
valid calls inside one test through the same imported generated world, so
module reloading cannot hide a failed recovery. Topic files add only the setup
needed by their world.

The WebGPU host is a typed stateful test double rather than a shallow
`vi.mock()`: JCO links concrete WIT resource classes at instantiation, so a
function-only mock cannot represent the required resource identity and
lifecycle behavior. The command-encoder record tracks whether a compute pass is
open and counts pass begins and ends. That lets the integration suite prove the
R2-B one-pass orchestration rule and reject a summary copy or encoder finish
while the pass remains open. Focused host unit tests protect that accounting;
generated integration then proves the real components obey it. Real shader
execution and rendered output remain browser WebGPU test responsibilities.

`Test` in helper names identifies the typed host implementation. It does not
define a third test category; every runnable spec is either unit or integration.

## Loader contract coverage

`component-capability-state.test.ts` proves the pure
`idle -> preparing -> ready | unsupported | failed` transition table.
`component-capability-loader.test.ts` proves that the canonical loader factory
has one shared preparation Promise and one settled result. Its only lifecycle
operation is `prepare()`; the public shape deliberately has no `retry()` and no
loader `dispose()`. Public-entry singleton identity and selected-world request
isolation remain entry-level and real-browser acceptance responsibilities.

`component-gpu-authored-capability.test.ts` keeps module preparation separate
from ordinary invocation. It also proves the shared-frame rule: `encode()` is
synchronous, and every throw requires the scheduler to abandon that
encoder/frame without appending render work, finishing, or submitting. A native
command stream cannot be rolled back after a partial encode.

`component-gpu-analysis-validation-error.test.ts` proves the authored
normalization boundary without instantiating a generated provider. It accepts
only non-`Error` values structurally matching the directly lifted WIT error
record. It preserves `WebAssembly.RuntimeError` and malformed or inherited raw
records by identity.

## Validation strategy

`gpu-validation.integration.test.ts` exercises recoverable preflight failures
through the raw generated GPU exports, followed by a valid call through the
same generated instance:

1. stable covers `invalid-request`, `texture-mismatch`, and
   `truth-buffer-too-small` as directly lifted WIT error records;
2. async covers the representative truth-buffer error using the same raw
   record representation;
3. shared-frame covers that truth-buffer error as a raw record and leaves its
   borrowed encoder unchanged.

None of those failures is a `WebAssembly.RuntimeError`. Every later valid call
returns the ordinary bare success record and performs the expected work,
proving that the invalid call did not trap the instance. The authored GPU
subpaths normalize the generated error record to
`ComponentGpuAnalysisValidationError`; the unit test above owns that focused
normalization proof.

That representative validation failure occurs before command recording and
therefore proves an untouched encoder. It does not weaken the more general
failure rule: if any later `encode()` step throws after appending commands, the
scheduler abandons the whole frame and encoder.

Rust unit tests own the remaining pure request-metadata cases, their ordering,
and their exact error strings. Stable covers the three public categories and
their cross-layer precedence once; async and frame repeat only the
representative resource failure needed to prove their distinct generated error
shape and lifecycle behavior.

## Shared GPU fixture

`tests/component-boundary/fixtures/gpu-workload.ts` supplies the common
200 × 100 texture dimensions, six-record request count, and expected GPU
plans used by the three product worlds.

Millipede's browser package now also directly owns the three stable, async, and
shared-frame device adapters. Each selected adapter lazily imports its exact
component runtime subpath; there is no `surface-inspector-wasm` wrapper or
mutable backend registry. This suite continues to prove the component and
loader boundary itself. The still-pending H1 and C1/V1 browser evidence owns
real lifetime and deployed request isolation, and Millipede's still-pending
selection/session generation owns stale-result rejection and late cleanup.

## Canonical ownership

This directory owns the Node-side component-boundary test infrastructure. Keep
shared host behavior in `host/` and `support/`, then reuse it from focused topic
specs. Do not add a parallel runner or duplicate host implementation. Later
migration stages must extend the appropriate unit or integration topic here.
