# Real-browser WebGPU lifetime testing

> - **Status:** Design specification; implementation pending
> - **Last reviewed:** 2026-08-11
> - **Applies to:** Real-browser lifetime evidence for component-backed GPU
>   execution
> - **Current runtime target:** Chromium WebGPU
> - **Roadmap context:** H1 resource-lifetime evidence before R2-C and the P2
>   final discovery topology
> - **Implementation owner:** Rendered Shape Analyser repository
> - **Consumer acceptance target:** Current adopted Millipede browser runtime,
>   without harness-specific changes

This document set defines how the Rendered Shape Analyser will obtain
real-browser evidence about WebGPU resource ownership, command lifetimes,
explicit destruction, replacement, and reuse.

The browser harness closes a specific evidence gap. The existing Rust tests and
typed component-boundary suite prove planning, generated Component Model
wiring, resource identity, dispatch order, and simulated lifecycle behavior.
They do not execute the generated components against Chromium's real WebGPU
implementation and therefore cannot establish native browser behavior.

The harness starts with the smallest valid real component execution path,
asserts only durable semantic invariants, and grows with the implementation.
Allocation counts, object identities, timings, and memory values begin as
observations. They become regression contracts only through an explicit design
decision, a deliberately narrow proof fixture, or a demonstrated defect.

## Measurement eligibility boundary

Every H1 and R2-C browser measurement starts only after preparation of the
selected component variant has produced a callable capability:

```text
select one component variant
    → prepare it through the authored loader
    → callable capability is ready
    → arm measurement capture, events, counters, and clocks
    → create measured GPU/session resources
    → invoke or encode the real compute workload
```

The preparation mechanism is an opaque, untimed prerequisite. The current
build still exercises its real private provider, but that provider's internal
modules, request topology, compilation steps, and timing do not define H1
metrics or architectural invariants. Provider identity, component artifact
identity, and toolchain version may be retained as baseline provenance.

Instrumentation plumbing may be installed before preparation when it must wrap
browser APIs or satisfy component imports. Until the loader reports a callable
capability as ready, that plumbing remains dormant: it emits no measurement
events, reads no measurement clocks, starts no run, and accumulates no counters.
See the
[component capability loading contract](../../architecture/component-capability-loading-contract.md)
for the transport-neutral readiness rules.

That architecture contract is the sole normative owner of component
preparation and readiness. The documents in this directory state only the
local testing, timing, reuse, and comparison consequences of its `ready`
boundary.

## Source-of-truth boundary

This document set owns the browser-harness method:

- where the harness lives;
- which production bindings it reuses;
- which code it must not duplicate;
- how fixtures and variant lifecycles are separated;
- which facts are asserted versus merely observed;
- how the harness grows without freezing speculative implementation details;
- how evidence is recorded and qualified.

The Millipede GPU-discovery migration plan remains authoritative for H1's
roadmap dependencies, required provider-neutral outcomes, and the R2-C/P2
decision boundary. It does not override this repository's capability-loading
or measurement mechanism. The relevant external documents currently live in
the Millipede repository under:

```text
packages/surface/inspector-browser/docs/implementation-plans/
└── gpu-discovery-migration/
    ├── implementation-tasks/
    │   └── h1-resource-lifetime-and-reuse-evidence.md
    └── investigations/h1/
        ├── h1-component-resource-lifetime-and-disposal-proof.md
        └── h1-teardown-semantics-and-persistent-gpu-resource-reuse.md
```

These local documents do not replace that plan. They translate its evidence
requirements into a maintainable test architecture inside the repository that
owns the component and browser host implementation.

The external H1 documents still contain provider-specific preparation
procedures. Before H1 can be declared complete, those procedures must be
updated or explicitly reclassified as temporary
provider-conformance evidence. They are not runtime metrics, permanent
architecture, or requirements inherited by a future native component provider.

## Why this is a separate document set

The subject spans seven distinct concerns:

1. Orientation, roadmap authority, and evidence ownership.
2. Runtime architecture and production-code reuse.
3. Assertion and measurement policy.
4. Incremental scenario construction.
5. Timing mechanisms, clock domains, and observation semantics.
6. Resource reuse, replacement, overlap, and submission strategy.
7. Controlled R2-C comparison and authoritative decision handoff.

Combining them in one test README would make operational instructions,
architectural rules, provisional experiment design, and final decision
reasoning difficult to review independently. The documents below give each
concern one owner while this README remains the orientation layer.

## Document map

| Document                                                                            | Question answered                                                                                                                                           | Authority                                                      |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [Architecture and code reuse](architecture-and-code-reuse.md)                       | Which real runtime path is exercised, which objects does the browser own, and how do stable, async, and shared-frame variants reuse common setup?           | Required harness architecture                                  |
| [Assertion and measurement policy](assertion-and-measurement-policy.md)             | Which facts may fail CI, which remain observations, and how are false positives and unsupported environments handled?                                       | Required evidence policy                                       |
| [Scenario evolution](scenario-evolution.md)                                         | In which order does the harness grow, and what must each phase prove before the next phase begins?                                                          | Planned implementation sequence                                |
| [Timing and observation contract](timing-and-observation-contract.md)               | Which WebGPU, JavaScript, queue, mapping, and Chromium mechanisms measure each boundary, and how are their clock domains kept distinct?                     | Canonical timing events, metrics, profiles, and statuses       |
| [Resource reuse and submission strategy](resource-reuse-and-submission-strategy.md) | What do cold, warm, cached, persistent, pooled, ring-buffered, and batched mean for this analyser, and which resource classes may safely use each strategy? | Canonical lifecycle vocabulary and neutral strategy candidates |
| [R2-C comparison contract](r2-c-comparison-contract.md)                             | How are valid candidates controlled, compared, interpreted, and handed back to the authoritative migration plan as selected or rejected contracts?          | Required comparison and decision methodology                   |

Recommended reading order:

```text
overview and source-of-truth boundary
    ↓
architecture and code reuse
    ↓
assertion and measurement policy
    ↓
scenario evolution
    ↓
timing and observation contract
    +
resource reuse and submission strategy
    ↓
R2-C comparison contract and authoritative-plan handoff
```

## Governing principles

### 1. Use the real production boundary

Browser evidence must exercise this path:

```text
selected component variant
    → authored component loader
    → private selected-world provider
    → callable component capability
    → real browser-owned WebGPU inputs
    → authored wasi:webgpu browser host
    → real Chromium WebGPU compute execution
```

The harness must not replace any layer with a test-specific implementation
when that layer is itself part of the lifetime claim. It exercises the current
private provider to reach the genuine capability, but measurements begin after
that provider has completed and concern the component, authored host, and real
WebGPU execution boundary.

### 2. Begin with the smallest valid real workload

The first browser scenario uses a small deterministic texture and reference
buffer, but it still invokes the genuine component export and genuine compute
shaders. A raw WebGPU self-check can validate harness instrumentation; it is not
component lifetime evidence.

### 3. Centralize raw browser setup

One fixture owns adapter selection, the `GPUDevice`, captured texture,
reference buffer, error observation, and final browser-owned teardown. Stable,
async, and shared-frame sequences consume the same fixture. They must not each
invent their own device and input-resource preparation.

### 4. Encapsulate only real variant differences

The three execution variants differ in completion and encoder ownership:

- stable owns encoder creation, finish, and submission, then delegates compact
  summary readback to the invocation-local browser resolver;
- async owns encoder creation, finish, submission, completion waiting, mapping,
  and summary decoding across JSPI;
- shared-frame borrows a scheduler encoder synchronously and must neither
  finish nor submit it.

Their common validation, observation, output cleanup, and fixture teardown must
stay shared.

### 5. Assert invariants; record observations

The initial harness asserts ownership and submission semantics that must remain
true across internal refactoring. It records allocation, pipeline, binding,
mapping, timing, identity, and memory facts without immediately treating their
current values as permanent contracts.

### 6. Promote evidence deliberately

An observed value becomes gating only when:

1. an accepted architecture explicitly requires it;
2. R2-C selects it as part of a production contract;
3. a demonstrated regression needs durable protection; or
4. a deliberately narrow proof fixture defines that resource shape as the
   subject under test.

Every promotion must name its rationale and owner in the test or accompanying
documentation.

### 7. Grow with available implementation boundaries

The final H1 validation matrix is not the first harness version. Shared-frame,
JSPI, ownership metadata, private resource reuse, replacement, device loss, and
memory evidence are added only when the corresponding implementation seam can
be exercised honestly.

### 8. Keep regression and measurement modes separate

Fast deterministic browser checks are suitable for CI. Long-running
post-readiness device/session/resource cold and warm loops, adapter-specific
counters, traces, and GPU-memory observations are evidence runs. A noisy or
unavailable measurement must not make the basic lifecycle regression suite
unreliable.

### 9. Preserve the compute execution contract

Every browser scenario executes a real compute workload. A no-op host, mocked
pipeline, render-stage substitute, or CPU implementation cannot establish the
required evidence. See the
[GPU compute execution contract](../../architecture/gpu-compute-execution-contract.md).

### 10. Keep consumer integration outside the core proof

The canonical harness belongs in this repository. It may later point at an
unchanged Millipede test URL for black-box acceptance, but the core proof must
not depend on editing Millipede's browser or wasm integration packages.

## Planned repository placement

The detailed design lives here before implementation. The future harness is
expected to begin as:

```text
tests/browser-lifetime/
├── README.md
├── index.html
├── page.ts
└── run-chromium.mjs
```

Files such as `fixture.ts`, `variants.ts`, or `observe-webgpu.ts` are extracted
only after actual duplication or responsibility justifies them. The initial
test README remains operational and links back to this document set.

Generated page bundles, result JSON, traces, screenshots, and machine-specific
measurements belong under ignored output:

```text
target/browser-lifetime/
```

## Current evidence layers

| Layer                             | Establishes                                                                                                                   | Does not establish                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Rust unit tests                   | Planning, layout, validation, capacity, and dispatch math                                                                     | Component lowering or browser execution                                                       |
| Typed component-boundary tests    | Generated module calls, resource identity, simulated command ownership, and deterministic failure observations                | Native WebGPU validation, physical allocation, or browser reclamation                         |
| Real-browser lifecycle tests      | Actual selected-component/host/WebGPU execution, wrapper-release survival, ownership boundaries, and explicit browser cleanup | Component-provider internals, Millipede rendering correctness, or native cross-backend parity |
| Long-running browser measurements | Post-ready device/session/resource churn, identity reuse, memory trends, replacement, and device-generation evidence          | Immediate physical reclamation guarantees                                                     |
| Millipede black-box acceptance    | Consumer scheduler, publication, rendering, removal, and shutdown behavior                                                    | Isolated component ownership attribution without additional evidence                          |

The existing component-boundary suite remains canonical for deterministic Node
coverage. See the [component-boundary test guide](../../../tests/component-boundary/README.md).

## Decision boundary

This documentation does not authorize:

1. A public `discovery-session` or another permanent WIT resource.
2. A new generated production world or package export.
3. A new Millipede backend or consumer API.
4. One lifetime policy shared across stable, async, and shared-frame without
   matching evidence.
5. Exact current resource counts as universal regression contracts.
6. Immediate driver-memory reclamation claims after wrapper drop or
   `GPUBuffer.destroy()`.
7. A native `wgpu` implementation as a substitute for Chromium evidence.
8. A production-sized fixture as a prerequisite for the first valid proof.

H1 establishes supported lifetime behavior and measurements. Millipede already
uses explicit lazy registration, direct selected loaders, and device-generation
adapter retirement. R2-C selects the production execution and packaging
contract, while P2 finalizes the discovery/session/resource topology. C1/V1
still supplies the actual Chromium request inventory for deployed isolation.

## Terminology

| Term                       | Meaning in this document set                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Browser-owned input        | A device, texture, reference buffer, or scheduler encoder created and ultimately disposed by the browser fixture or consumer |
| Component-created resource | A native WebGPU object created because the guest invoked an imported `wasi:webgpu` operation                                 |
| Transferred output         | A component-created output whose native ownership has moved to the browser result owner                                      |
| Wrapper release            | Rust resource drop, Component Model wrapper release, or host-registry identity release; not automatically native destruction |
| Explicit destruction       | An owner-authorized native `GPUBuffer.destroy()` operation                                                                   |
| Observation                | Collected evidence that is not, by itself, a regression requirement                                                          |
| Invariant                  | Stable semantic behavior that may gate the regression suite                                                                  |
| Proof-fixture contract     | An exact shape intentionally defined by a private experiment and applicable only to that experiment                          |
| Evidence run               | A potentially long-running or adapter-specific measurement that is not necessarily suitable for normal CI                    |

## Maintenance rule

When implementation experience contradicts this design, update the smallest
owning document rather than appending exceptions to the overview. Changes that
promote an observation to an invariant must update the assertion policy and
the relevant scenario phase in the same review.
