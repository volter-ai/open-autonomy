# R14 closure

R14 closes only when telemetry is observational rather than authoritative, trace/delivery/control causality are distinct, workflow and policy mappings are honest, and every interpretation-bearing version is replay-pinned.

| Obligation | Constructive evidence |
|---|---|
| R14-EPI-1 | CloudEvents and pinned OpenTelemetry spans, metrics, and logs cannot complete work. Completion requires independently signed work/attempt/artifact/predicate evidence, including after authenticated restore. |
| R14-DIST-1 | Delivery receipts deduplicate transport only. Trace parents create no control edge unless exact ingested spans match a signed adapter rule bound to the pinned rule bundle. |
| R14-REF-1 | Lowering emits a closed pinned workflow artifact and a total disposition/loss certificate that an independent recomputation verifies. Policy decisions fail closed and cannot authorize an effect without a separately signed enforcement receipt. |
| R14-EVO-1 | CloudEvents, OpenTelemetry, semantic conventions, workflows, policy engine/bundle, and adapter rules are content/version locked; signed checkpoints reject tampering and revision substitution. |
