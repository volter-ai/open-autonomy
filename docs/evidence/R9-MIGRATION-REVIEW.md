# R9 skeptical migration review

Final disposition: **PASS** after seven adversarial cycles.

The review rejected earlier implementations that trusted hard-coded compiler labels, compared shared command constants, accepted caller closures as content-addressed handlers, and synthesized dogfood observations in-process. Those designs were removed.

The accepted implementation has these independently replayable properties:

- actual v1 and v2 compiler executions retain raw outputs, compiler source locks, invocation evidence, lowering certificates, and provenance chains;
- an independent verifier recompiles every discovered repository profile and exact-compares the complete execution result before shadow readiness;
- command surfaces are derived again from emitted dispatcher files, with missing and unrecognized required channels producing residuals;
- mutation modules are loaded as bytes, hashed by core, and only then passed to a separate evaluator;
- the canonical self-driving local installation is materialized and its emitted runner is spawned as a separate process;
- a separate observer process reads the durable runtime effect and signs process/effect statements with Ed25519 under a pinned public trust root;
- an R8 bundle, release, and live-instance attestation bind the organization, compiler descriptor, native output, release, instance, and runtime identities;
- shadow, canary, and cutover evidence are Ed25519-signed and replay to the exact committed checkpoint;
- the freshness gate verifies R8 artifacts, observation identities/signatures, the evidence digest, current compiler/source bindings, and the complete cutover chain.

The final reviewer found no remaining conceptual R9 soundness blocker. The last reported issue was evidence freshness after a test-source edit; the artifact was regenerated after source stabilization and the enforced freshness gate passed.
