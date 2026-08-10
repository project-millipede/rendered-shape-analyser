# Browser-lifetime scenario evolution

> - **Status:** Planned incremental implementation
> - **Last reviewed:** 2026-08-10
> - **Sequence rule:** Add a scenario only when its real implementation boundary
>   exists
> - **Completion rule:** The final H1 matrix is an end state, not the first
>   harness version

## Purpose

This document defines how the browser-lifetime harness grows from a small
instrumentation self-check into the real-Chromium evidence required by H1.

It deliberately avoids designing the complete final harness upfront. Each
phase introduces only the fixture, variant logic, observation, and assertions
needed for evidence that can be obtained honestly at that point.

## Evolution rules

1. A phase begins only when its required production or private-proof boundary
   exists.
2. Every phase reuses the fixture and result policy established earlier unless
   a documented ownership difference prevents reuse.
3. New observations remain non-gating until the assertion policy permits
   promotion.
4. The harness does not create speculative public APIs to make a planned
   scenario executable.
5. A later phase may refine the source layout, but it must not duplicate the
   production loader or WebGPU host.
6. Realistic fixtures are added after the minimal semantic boundary is proven.
7. Measurement-only scenarios remain separate from fast deterministic tests.
8. Every component scenario starts from a prepared callable component. Loading
   and provider wiring are functional setup, never part of measured execution.

## Common component-scenario boundary

Phase 0 is the raw WebGPU observer self-check and therefore has no component.
Every later component scenario follows this boundary:

```text
prepare selected component through the production boundary
    → require a callable capability
    → record preparation outcome as functional setup
    → arm runtime and WebGPU measurement
    → enter the scenario's declared post-ready device/resource state
    → invoke or encode
```

Preparation may have `fresh-process`, `fresh-page`, or `artifact-cold`
provenance. Those labels help reproduce package and loading behavior, but they
do not form a timed population. Each measured scenario instead declares one or
more post-ready categories such as `device-generation-cold`, `session-cold`,
`entry-cold`, `resource-cold`, or `compatible-warm`.

## Phase overview

| Phase | Capability added                                               | Initial gating status                 |
| ----- | -------------------------------------------------------------- | ------------------------------------- |
| 0     | Chromium launch and raw WebGPU observer self-check             | Harness infrastructure only           |
| 1     | Minimal stable component execution                             | CI candidate                          |
| 2     | Scheduler-owned shared-frame lifecycle                         | CI candidate                          |
| 3     | Conditional async/JSPI lifecycle                               | CI candidate on promised environments |
| 4     | Component-resource origin, transfer, and explicit destruction  | CI candidate                          |
| 5     | Private H1 resource reuse and disposal proof                   | Focused proof suite                   |
| 6     | Resize, replacement, device loss, failure, and memory evidence | Mixed CI and measurement              |
| 7     | Realistic fixtures and unchanged Millipede acceptance          | Acceptance/evidence                   |

## Phase 0: harness and observer self-check

### Purpose

Prove that the test runner can launch a suitable Chromium instance, communicate
with the page, acquire WebGPU, and observe raw WebGPU calls before component
evidence is attempted.

### Prerequisites

- Chromium executable can be located or configured.
- The runner can serve or navigate to the local test page.
- `navigator.gpu` is exposed.
- A qualifying adapter and device can be requested.

### Minimal action

```text
launch Chromium
    → load page
    → request adapter and device
    → install error/loss observation
    → create one labeled raw buffer
    → observe its JavaScript identity
    → destroy it
    → observe destruction
    → return structured result to runner
```

### Gating assertions

- Runner/page communication succeeds.
- The result uses the policy's explicit `pass`, `fail`, or `unsupported`
  status rather than treating absence of an exception as success.
- When supported, the observer sees the self-check buffer's creation and
  destruction in the correct phase.
- No unexpected uncaptured WebGPU error is reported.

### Observations

- Chromium and platform provenance.
- Adapter information and fallback status when available.
- Device features and limits.
- Raw observer events.

### Explicit limitation

Phase 0 is not H1 component lifetime evidence. It bypasses the selected
component provider and authored `wasi:webgpu` host.

### Exit condition

The same runner can reproduce a structured supported or unsupported result
without manual browser interaction.

## Phase 1: minimal stable component execution

### Purpose

Establish the first real-browser evidence across the complete current stable
call chain.

### Prerequisites

- Phase 0 is reliable.
- The existing stable artifact and authored loading boundary can prepare a
  callable stable capability.
- A test-owned stable summary resolver can honor the current resolver contract.

### Fixture

Begin with the proposed 8×8 texture and one valid reference record described
in [Architecture and code reuse](architecture-and-code-reuse.md). This fixture
is intentionally small but invokes real shader, resource, encoder, submission,
and mapping behavior.

### Action

```text
prepare selected stable component and require callable capability
    → arm post-ready observation and timing
    → create raw browser fixture
    → configure stable summary resolver
    → call runComponentGpuAnalysis(input)
    → reach resolver completion and staging readback
    → receive transferred renderer-facing outputs
    → release outputs through browser owner
    → in an outer finally, configureGpuAnalysisSummaryResolver(null)
    → dispose fixture resources
```

### Initial gating assertions

1. Stable component preparation produces a callable capability on a supported
   environment; this is functional acceptance outside the timed invocation.
2. The invocation reaches summary-resolution completion.
3. No WebGPU validation or uncaptured error appears.
4. The fixture's device, texture, and reference buffer are not destroyed by
   component cleanup.
5. Returned outputs are not destroyed before transfer to the browser owner.
6. Every output category included in the initial liveness-probe plan accepts a
   valid later GPU use after the component export and transient wrapper
   release. Categories not yet probed are reported explicitly rather than
   implied by JavaScript reachability.
7. Browser-owned output cleanup is harmless when invoked according to its
   documented ownership boundary.
8. The module-global stable summary resolver is cleared even when invocation,
   readback, validation, or output handling fails.

### Initial observations

- API-object creations by kind and phase.
- Command encoder, finish, and submit activity.
- Summary mapping and unmapping.
- Output JavaScript identities.
- Explicit destruction events.
- Post-ready stable invocation duration.

Exact counts are reported, not asserted.

### Non-goals

- Pixel-perfect algorithm output.
- Exact buffer/pipeline/bind-group counts.
- Warm reuse.
- Shared-frame ownership.
- Memory plateau claims.
- Production-sized capture data.

### Exit condition

One stable real component call deterministically proves the ownership and
completion invariants above without relying on Millipede application code.

## Phase 2: scheduler-owned shared-frame lifecycle

### Purpose

Prove the lifetime boundary that cannot be inferred from stable execution: the
component returns while the scheduler's encoder remains unfinished and
unsubmitted.

### Prerequisites

- Phase 1 fixture and error observation are reusable.
- The frame component can be prepared into a callable capability before
  synchronous encoding.
- The harness can act as the scheduler for one encoder.

### Successful submission action

```text
require prepared callable frame capability
    → arm post-ready observation and timing
    → create scheduler-owned encoder from fixture device
    → call encodeComponentGpuFrameAnalysis synchronously
    → observe component return with pending summary and outputs
    → finish the same encoder in the harness
    → submit once through the fixture queue
    → resolve pending summary after submission
    → release outputs
```

### Initial gating assertions

1. Encoding returns synchronously after component readiness.
2. The component does not finish the borrowed encoder.
3. The component does not submit it.
4. The harness can finish and submit the same encoder afterward.
5. Submitted commands complete without validation errors after transient guest
   and host wrappers have returned.
6. Pending summary resolution begins only after scheduler submission.

### Abort action

```text
encode into scheduler-owned encoder
    → choose abort
    → ensure the encoder will never be submitted
    → dispose pending summary
    → release browser-owned outputs
    → perform only cleanup safe after abandonment
```

### Abort assertions

- No queue submission occurs.
- Pending-summary disposal is repeatable and harmless.
- Browser-owned inputs are not destroyed.
- No resource is destroyed while the encoder remains a possible future
  submission candidate.

### Initial observations

- Encoder identity through register/encode/finish.
- Component and scheduler finish/submit phases.
- Wrapper-return time relative to scheduler submission.
- Pending-summary transfer or disposal.
- Output transfer and browser cleanup.

### Non-goals

- A production scheduler abstraction.
- Mid-pass transactional recovery after arbitrary browser errors.
- Generalizing borrowed-encoder semantics to stable or async.
- A final public submit/abandon notification API.

### Exit condition

The real browser proves both successful post-return submission and explicit
abandonment without component finish/submit ownership.

## Phase 3: conditional async/JSPI lifecycle

### Purpose

Prove the async variant's distinct completion, mapping, and transferred-output
behavior rather than assuming stable evidence applies across an `await`.

### Prerequisites

- Shared fixture and result cleanup from Phase 1.
- Chromium exposes the JSPI features required by the generated async module.
- Unsupported JSPI results are represented explicitly.
- The selected async component can be prepared before measured invocation.

### Action

```text
probe JSPI support
    ├── unsupported → record unsupported result
    └── supported
            → prepare selected async component and require callable capability
            → arm post-ready observation and timing
            → call runComponentGpuAnalysisAsync(input)
            → await component submission/completion/readback
            → receive decoded summary and outputs
            → release outputs
```

### Initial gating assertions

1. Supported environments complete the awaited call without validation or
   uncaptured errors.
2. Summary mapping completes and leaves no mapped staging buffer behind.
3. Returned output identities survive the awaited boundary.
4. Browser-owned inputs remain untouched by component cleanup.
5. Unsupported environments do not report the scenario as passed.

### Initial observations

- Queue-completion waits.
- Mapping, mapped-range copy, and unmap events.
- Output identity before browser disposal.
- Async duration and in-flight state.

### Non-goals

- Requiring JSPI in every Chromium environment.
- Requiring stable and async object counts to match.
- Treating async timing as a performance budget.

### Exit condition

The async output and summary lifecycle is proven on an explicitly supported
environment and explicitly classified elsewhere.

## Phase 4: ownership and destruction instrumentation

### Purpose

Move from coarse API observations to owner-aware lifetime assertions once the
host can classify component-created and browser-owned resources.

### Prerequisites

- Production host buffer-origin/current-owner metadata exists.
- Provider resource release and native destruction are separately observable.
- Explicit component-owned destruction is idempotent.
- Deterministic fake-host tests already cover the corresponding transitions.

### Planned source evolution

Only at this phase does `observe-webgpu.ts` become a justified separate file.
The result schema gains explicit origin, purpose, transfer, generation, and
destroy state.

### Gating assertions

1. Browser-owned device, texture, reference buffer, and scheduler encoder are
   never destroyed by component cleanup.
2. Generic Component Model/provider resource release is not reported as native
   destruction.
3. Successfully transferred outputs are not destroyed by the component.
4. Explicit cleanup is idempotent.
5. Cleanup from one device generation cannot target another generation.

### Observations

- Purpose-specific resource histories.
- Provider-drop versus native-destroy ordering.
- Transfer points.
- Submission state at cleanup time.
- Resources still live at scenario completion.

### Non-goals

- Exact total resource counts for the mixed world.
- A selected persistent production session.
- Replacing fake-host failure injection with browser monkey-patching.

### Exit condition

Every browser-relevant resource in the exercised paths has an attributable
origin and terminal ownership state without freezing aggregate counts.

## Phase 5: private H1 reuse and disposal proof

### Purpose

Evaluate the maximum-reuse lifetime shape without publishing it or forcing it
onto all variants.

### Prerequisites

- A feature-gated, unpublished H1 component resource or equivalent private
  proof boundary exists.
- It uses the real discovery workload core.
- It maps imports to the existing authored browser host.
- It is built only for tests under `target/` and is absent from normal package
  exports and product synchronization.

### Post-ready `session-cold` proof

Prepare the private component and obtain its callable capability before
starting this proof. The first measured call then begins from an explicitly
declared `session-cold` state; `entry-cold` and `resource-cold` are recorded as
additional labels where they apply.

The private fixture may define exact proof-owned facts such as:

- five named discovery intermediates;
- two discovery outputs transferred once;
- seven discovery pipelines;
- one compatible bind group.

Because those facts define the experiment, their exact identities and
ownership transitions may be asserted inside this proof.

### Post-ready `compatible-warm` proof

Run at least two compatible calls first. Record longer batches only after the
short proof is deterministic.

Prove for every resource proposed as persistent:

- native/host identity is reused;
- no replacement is created on the compatible warm call;
- transferred output identity remains stable when the proof design requires
  it;
- the variant retains its own encoder and completion semantics.

Longer warm loops remain measurement evidence until R2-C selects a production
requirement.

### Disposal proof

```text
stop accepting calls
    → ensure referencing encoders were submitted or abandoned
    → dispose private resource
    → destroy proof-owned intermediates once
    → preserve browser-owned inputs
    → leave transferred output destruction to browser owner
    → repeat disposal harmlessly
```

### Stable, async, and frame applicability

The same discovery workload and ownership vocabulary should be reused, but the
proof must not force one completion shape onto all variants:

- stable remains component-owned submission with browser-side summary behavior
  only if that candidate requests it;
- async retains its awaited completion behavior;
- shared-frame borrows a fresh scheduler encoder per call and performs no
  finish or submit.

### Non-goals

- Publishing the private resource.
- Adding it to `scripts/sync.sh` product worlds.
- Treating maximum reuse as selected production policy.
- Adding diagnostics to a discovery-only proof merely to reuse the mixed
  compatibility fixture.

### Exit condition

H1 has real-browser identity, transfer, and exactly-once disposal evidence for
the private candidate without changing public component or consumer APIs.

## Phase 6: replacement, device loss, failure, and memory

### Purpose

Extend the proven ownership primitives to lifecycle transitions and repeated
measurement.

### Resize and capacity scenarios

Start with one incompatible change at a time:

1. Same dimensions, new compatible texture identity.
2. Larger dimensions or output capacity.
3. Configuration change without layout change.
4. Layout/usage incompatibility.

Record the smallest replacement scope actually implemented. Do not assert a
partial-rebuild optimization before R2-C selects it.

Required semantic assertions:

- old and replacement generations are distinguishable;
- late cleanup from the old generation cannot destroy replacement resources;
- a failed replacement leaves the previously committed generation usable when
  that behavior is part of the candidate;
- no resource is destroyed before every referencing encoder is submitted or
  abandoned.

### Device-loss scenario

```text
complete work on generation A
    → trigger or observe device loss
    → dispose A repeatedly without secondary failure
    → create generation B
    → prove no A identity is reused as a B resource
```

Device-loss simulation method and browser support must be recorded. A normal
environment that cannot deterministically trigger a specific loss mode should
report that limitation instead of fabricating success.

### Failure scenarios

The typed fake host remains canonical for exhaustive injection after each
allocation, finish, submit, and trap boundary. Real Chromium adds only selected
representative failures that can be induced honestly, such as:

- invalid input rejected before GPU mutation;
- shared-frame abort before submission;
- summary mapping rejection;
- device loss during an in-flight or completed generation.

Browser method monkey-patching is not the canonical exhaustive failure model.

### Memory evidence

Begin with a small configurable batch rather than a fixed permanent count:

```text
require prepared callable component
    → arm measurement and record post-ready baseline
    → one post-ready cold call labeled with every applicable scope
    → a configured `compatible-warm` batch
    → await selected completion boundary
    → record peak and settled observations
    → dispose
    → record post-disposal observations
```

Increase repetitions only after the scenario is stable and the environment is
recorded. Report sustained growth or plateau evidence without requiring
immediate physical memory reclamation.

The selected cold labels must match the candidate's actual starting state. A
new device generation additionally records `device-generation-cold`; a first
object kind inside an existing session may instead be `resource-cold`.

### Gating split

- ownership, generation isolation, and idempotent cleanup may gate CI;
- long-run timing and memory values remain measurement evidence by default;
- adapter-specific unavailable counters are explicit, not failures of the core
  lifecycle suite.

### Exit condition

H1 has qualified browser evidence for replacement, device loss, selected
failures, and repeated behavior without turning noisy measurements into normal
regression thresholds.

## Phase 7: realistic and consumer acceptance

### Purpose

Confirm that conclusions drawn from the small fixture remain valid in more
representative workflows without making the consumer application the owner of
the core proof.

### Fixture growth order

1. Partial workgroup dimensions.
2. Multiple and nested reference nodes.
3. Larger captured textures.
4. Repeated compatible captures.
5. Realistic captured-pixel patterns.
6. Existing shared 200×100 compatibility fixture.
7. Unchanged Millipede application route.

Each fixture is added for a named semantic or lifecycle reason. Fixture growth
must not merely increase load without identifying what new risk it covers.

### Millipede mode

The component-owned runner may later accept a configured URL and install
observation before the existing application loads. This mode verifies:

- package refresh and loading as functional acceptance only;
- existing stable/async/frame adapter selection;
- scheduler submission;
- result publication and removal;
- output cleanup during deactivation or shutdown.

It does not authorize source changes in Millipede during H1 and does not
replace the isolated page's attribution evidence.

The Millipede mode may fail when the package cannot prepare its selected
callable capability. When preparation succeeds, runtime measurement begins at
that readiness boundary; package import, download, compilation, and
instantiation duration never enter the H1 or R2-C comparison.

### Native future direction

A later native `wgpu` runner can consume neutral fixture descriptions and
result semantics, but it remains a separate provider/backend test. It is not a
Phase 7 requirement for H1.

### Exit condition

At least one representative consumer workflow confirms the selected H1 facts
without introducing a second implementation of the analyser or scheduler.

## Traceability to H1 evidence

The external H1 validation matrix names the final evidence requirements. This
local sequence maps them to implementation phases without copying their status
ownership.

| H1 evidence category                                     | Primary local phase                                |
| -------------------------------------------------------- | -------------------------------------------------- |
| Real command execution survives wrapper release          | 1 and 2                                            |
| Stable result valid after wrapper release                | 1                                                  |
| Async output identity stable across await                | 3                                                  |
| Shared-frame no finish/submit and post-return submission | 2                                                  |
| Browser-owned resources never destroyed by component     | 1, 2, then owner-aware in 4                        |
| Provider release distinct from native destruction        | 4                                                  |
| Warm resource identity and allocation evidence           | 5                                                  |
| Exactly-once session and output disposal                 | 5                                                  |
| Pre-submit abort and representative browser failures     | 2 and 6                                            |
| Exhaustive allocation/finish/submit/trap injection       | Typed component-boundary suite, not browser phases |
| Resize and replacement isolation                         | 6                                                  |
| Device-loss generation isolation                         | 6                                                  |
| Repeated memory behavior                                 | 6                                                  |
| Consumer removal/deactivation/shutdown confirmation      | 7                                                  |

## Criteria for adding a scenario

A proposed scenario should answer all of these questions before code is added:

1. Which H1 requirement or demonstrated defect does it address?
2. Why is existing Rust, fake-host, or browser evidence insufficient?
3. Which real implementation boundary now exists to exercise it?
4. Which setup and cleanup code can be reused directly?
5. Which lifecycle behavior is genuinely variant-specific?
6. Which facts are invariants and which remain observations?
7. What unsupported result is possible?
8. What is the smallest deterministic fixture?
9. What artifact is retained on failure?
10. What would justify removing or changing the scenario later?

If those answers are unclear, document the question as pending rather than
building speculative harness infrastructure.

## Scenario-plan non-goals

This sequence does not require:

1. Every phase to land as one commit.
2. One file per scenario.
3. One common lifecycle state machine for all variants.
4. Long-running measurement in every CI run.
5. A private proof resource before host ownership primitives exist.
6. Millipede package changes for core H1 evidence.
7. Native `wgpu` before a concrete native target is selected.
