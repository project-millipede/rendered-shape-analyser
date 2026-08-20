# Component instance failure and recovery

> - **Status:** Experimental Strategy 3 architecture candidate
> - **Last reviewed:** 2026-08-19
> - **Applies to:** Failures after a component capability has prepared
> - **Does not authorize:** Invocation retry, new loader states, automatic
>   fallback, provider replacement, or Worker deployment
> - **Current branch:** `wit-result-without-preflight-traps`
> - **Preserved alternative:** Strategy 4 on
>   `jco-preflight-validation-without-traps`
> - **Related:**
>   [Component capability loading contract](component-capability-loading-contract.md#minimal-lifecycle),
>   [component-host communication patterns](component-host-communication-patterns.md#binding-scope-and-encapsulation),
>   and the
>   [JCO-generated artifact baseline](../tooling/jco-generated-artifact-baseline.md)

## Strategy 3 branch experiment

This branch evaluates preflight validation as a recoverable operation outcome.
Each GPU world uses a top-level WIT
`result<T, analysis-validation-error>`, with Rust as the authoritative
validator. Successful generated calls still return the bare success record.
The authored exact GPU subpaths normalize the generated error record to
`ComponentGpuAnalysisValidationError`.

This Strategy 3 candidate lets a later valid request use the same prepared
component instance. It is an API policy, not a requirement imposed by a
dependency upgrade. It avoids duplicating validation in TypeScript and avoids
wrapping every successful value in an authored outcome variant.

### Strategies considered

1. **Strategy 1 — Isolate the destructive test.**

   This is the smallest dependency-upgrade change, but a malformed production
   call would still terminally trap that generated instance.

2. **Strategy 2 — Validate in authored TypeScript.**

   This protects supported package consumers, but duplicates rules and
   buffer-layout constants owned by Rust.

3. **Strategy 3 — Return a top-level WIT `result`.**

   This is implemented on `wit-result-without-preflight-traps`. Rust remains
   authoritative, successful JavaScript calls keep their bare result, and
   validation failure does not trap the instance.

4. **Strategy 4 — Return a tagged success-or-error outcome.**

   The earlier implementation is preserved on
   `jco-preflight-validation-without-traps`. It is also recoverable, but wraps
   every successful generated call and requires positive-path unwrapping.

5. **Strategy 5 — Replace trapped instances.**

   This provides broader recovery, but requires the separate private-instance
   lifecycle work described below.

### Current verification boundary

Current evidence is intentionally separated by runtime and responsibility:

1. **Node generated boundary:** the generated-component suite uses the compiled
   typed fake host and proves WIT `result` lifting plus invalid-to-valid reuse
   of the same stable, async, and shared-frame component instances.

2. **Chromium JSPI:** the repository does not currently contain reproducible
   evidence for async WIT `result` lifting or same-instance reuse in Chromium.

3. **Native WebGPU:** the current suite does not prove shader execution, device
   loss behavior, or native resource reclamation. Those remain owned by the
   browser acceptance and lifetime evidence plans.

4. **Terminal traps:** the current suite does not deliberately trap a generated
   component instance. Its `WebAssembly.RuntimeError` normalization unit test
   proves pass-through identity only; it does not prove terminal re-entry
   behavior. An isolated true-trap proof remains follow-up work.

## Failure classes

| Event                                     | Public or boundary representation              | Instance consequence                                      |
| ----------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| Unsupported platform                      | `prepare()` returns `unsupported`              | No callable capability is exposed                         |
| Preparation failure                       | `prepare()` returns `failed`                   | No callable capability is exposed                         |
| Preflight validation failure              | Authored `ComponentGpuAnalysisValidationError` | Only that invocation fails; the instance remains callable |
| True component trap                       | Preserved `WebAssembly.RuntimeError`           | The current generated instance is terminal                |
| Host, device, readback, or WebGPU failure | Existing operation-specific error              | Must be classified at its actual ownership boundary       |

Preflight validation completes before GPU planning, allocation, recording, or
submission. It covers invalid request metadata, texture-dimension mismatch,
and an undersized truth buffer. It is therefore safe to start a later request
on the same instance.

A panic, Wasm `unreachable`, invalid canonical resource use, or another true
runtime trap is different. As documented by
[JCO's trap handling](https://github.com/bytecodealliance/jco/blob/f4ec96a0eea22ae0f758aee3b6e43a24b0f617eb/docs/src/advanced/detecting-traps.md),
the current provider prevents later calls through that trapped instance.
Dropping a WIT handle, GPU buffer, or JavaScript wrapper does not reset the
instance or evict its evaluated module.

## Preserved loader contract

The public loader remains a preparation-only state machine:

1. Its states remain `idle | preparing | ready | unsupported | failed`.
2. Only preparation requests and outcomes are transition triggers.
3. Invocation success, validation failure, and runtime traps do not mutate
   loader state.
4. `ready` records successful preparation; it is not a live instance-health
   signal after every invocation.
5. The loader gains no `retry()`, `recover()`, or `dispose()` method.

The authored validation error and a terminal trap therefore must not be
modeled as new loader states. Any future instance-health tracking belongs
behind the prepared capability or in the runtime that owns scheduling.

## Failure cleanup and retry boundary

Preflight validation returns before analyzer planning or component-created GPU
resources exist. Existing call scopes release their temporary WIT projections,
so a later request can safely start from new invocation-local inputs.

A post-preflight failure is different: commands or host-visible allocations may
already exist, and the authored caller cannot destroy component-created handles
that were never returned. Cleanup is therefore best-effort at each observable
ownership boundary rather than a guarantee that a trap reclaims every resource.
Any future recovery design must preserve these obligations:

1. release temporary WIT projections;
2. never destroy caller-owned devices, textures, truth buffers, or borrowed
   encoders;
3. destroy untransferred component-created outputs through their real owners;
4. abandon the complete shared-frame encoder after any throwing encode path;
5. never replay a failed invocation automatically.

A trap can occur after host-visible effects or command recording, so automatic
retry could duplicate work or reuse an encoder with unknown state. Recovery
must start with a new request and, for shared-frame execution, a new frame and
encoder. Resource reclamation after a true trap remains part of the browser
[lifetime evidence plan](../testing/browser-lifetime/README.md), not an
established property of this contract.

## Possible long-term instance recovery

The current implementation does not replace trapped instances. The safe reset
boundary remains navigation or an intentionally new deployed module URL.
Possible future designs are:

1. **Quarantine:** a private instance owner stops scheduling calls through a
   known-trapped capability; recovery remains external.
2. **Explicit instantiation:** a private provider factory creates a replacement
   for a later request while preserving one authoritative host registry.
3. **Worker or realm isolation:** terminating the realm resets its module and
   instance state, subject to WebGPU placement and transfer constraints.
4. **Native Component Model provider:** adopt explicit lifecycle support while
   preserving the authored capability and ownership contracts.

Any proposal must separately prove stable, async, and shared-frame cleanup,
must not retry the failed request, and must not extend the public preparation
state machine.
