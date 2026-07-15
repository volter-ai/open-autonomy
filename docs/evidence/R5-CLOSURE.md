# R5 stable compiler API closure

R5 adds a versioned, generated-schema-validated, content-addressed compiler artifact protocol and a deterministic artifact DAG. Explicit semantic content kinds prevent level-equal artifacts such as analysis reports and normalized organizations from being substituted. Audited adapters expose parse, link, normalize, analyze, solve, lower, emit, lift, and replay while retaining the organization and selected candidate through constructive solve/lower bundles.

Pass declarations and artifacts are immutable and byte-bounded; cancellation, wall/output/diagnostic/pass/parallelism bounds are explicit. Diagnostics are redacted and escaped before streaming while fatal control state remains uncapped. Cache keys cover API/pass/configuration/capabilities/input identity, entries require HMAC authentication, and artifacts are schema/digest/provenance checked on read. Clean, incremental, warm-cache, serial, and parallel results are compared canonically.

Arbitrary callbacks cannot enter the compiler realm. Third-party executables run through a cleared-environment Bubblewrap namespace with declared bindings, network opt-in, `prlimit` memory/CPU bounds, wall timeout, and bounded output. Live hostile C fixtures attempt secret, host-file, network, external-process, memory, and infinite-loop escapes.

The skeptical review rejected four earlier revisions using executable counterexamples. Each counterexample became a regression test or structural invariant before the final review.
