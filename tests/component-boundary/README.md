# Generated-component unit and integration tests

This suite is the canonical executable component-boundary proof for the R2
migration. It has exactly two runnable categories:

1. **Unit tests** exercise the typed test host without loading a component.
2. **Integration tests** load the five real JCO-transpiled components against
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

Integration and combined runs require the five component artifacts under
`target/component/`. Run `npm run build` first when they are absent. An
alternate artifact directory can be selected explicitly:

```sh
INSPECTOR_COMPONENT_BUILD_DIR=/absolute/component-directory \
  npm run test:integration
```

Node.js 24 or newer is required because the async generated worlds use JSPI.

## Test ownership

```text
tests/component-boundary/
├── integration/        generated-component boundary tests
├── unit/               typed test-host behavior
├── assertions/         shared domain assertions
├── fixtures/           shared component-boundary request and tree fixtures
├── host/               typed stateful Component Model test host
├── support/            Vitest setup and test-context helpers
└── scripts/            deterministic host compilation and JCO preparation
```

The preparation step clears only `target/component-tests/`, compiles the typed
host into `target/component-tests/host/`, and transpiles the five worlds into
`target/component-tests/generated/`. The repository already ignores `target/`.

| Generated world      | Component artifact                            |
| -------------------- | --------------------------------------------- |
| `analysis`           | `inspector-component.analysis.wasm`           |
| `gpu-analysis`       | `inspector-component.gpu-analysis.wasm`       |
| `gpu-analysis-async` | `inspector-component.gpu-analysis-async.wasm` |
| `gpu-analysis-frame` | `inspector-component.gpu-analysis-frame.wasm` |
| `wasi-0.3`           | `inspector-component.wasi-0.3.wasm`           |

The analysis world and three GPU worlds exercise product boundaries. `wasi-0.3`
is deliberately separate: it proves current WIT/JCO async projections without
adding those proof exports to the product API.

JCO names, JSPI exports, base64 cutoff, and namespaced-export behavior mirror
`scripts/sync.sh`. The mappings intentionally substitute the typed Node host
for the browser host. Preparation resolves the locally installed TypeScript
and JCO entrypoints directly and never invokes `npx`.

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
Vitest mocks afterward. Topic files add only the setup needed by their world.

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

## Validation strategy

`gpu-validation.integration.test.ts` exercises one representative invalid call
through each retained public GPU world. All three calls use an undersized truth
buffer, and their adapter-specific logs confirm that request and texture
validation reached the intended final truth-buffer branch:

1. stable must trap without any captured pipeline/output, finish/submission,
   resolution, or mapping effects;
2. async must reject without those same captured effects;
3. shared-frame must trap without beginning a pass or changing its borrowed
   encoder.

Rust unit tests own the pure metadata cases, their exact rule ordering, and
metadata error strings. The representative resource failure remains at the
generated boundary. Do not multiply the three component cases by every invalid
field; they prove each adapter's distinct failure and lifecycle behavior, not
the pure validation arithmetic again.

## Canonical ownership

This directory owns the Node-side component-boundary test infrastructure. Keep
shared host behavior in `host/` and `support/`, then reuse it from focused topic
specs. Do not add a parallel runner or duplicate host implementation. Later
migration stages must extend the appropriate unit or integration topic here.
