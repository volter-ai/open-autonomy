# R20–R23 external evidence participation manifest

Status: additive `external-validation` evidence. None of the rows below is satisfied by a simulator, generated
identity, local fixture, service twin, or self-attestation. This manifest does not close or block the
`twin-conformant-engineering` profile; it defines the stronger empirical claims that may be bound to the corresponding
engineering closure after its local property and service-twin conformance gates pass.

| Checkpoint | External authority or participant | Required observation | Acceptance boundary |
|---|---|---|---|
| R20 | Slack workspace administrator; installed app signing secret/token; distinct authorized and unauthorized users | Real Events API and block-action requests in a test channel/thread; duplicate delivery, dropped delivery, restart/outbox recovery, cross-thread and wrong-user attacks; resulting durable effects and notifications | Raw Slack request signatures verify; privileged effects require the configured role/quorum and exact confirmation context; replay produces one effect; unauthorized cases fail closed |
| R20 | Preregistered unfamiliar usability/accessibility participants | Complete the status, question/answer, approval, mutation, pause, rollback, and recovery tasks through the real Slack surface, including keyboard and screen-reader coverage | Task completion, error, abandonment, and timing are recorded under the preregistration; no simulated participant is labeled human |
| R21 | Operators of a deployed eight-service topology; telemetry and billing authorities | Load ramp and soak across adapter, compiler, registry, event store, reconciler, interaction, worker, and API; CPU, memory, queue, token and billed-cost telemetry; overload and tenant-fairness outcomes | Every service has independently observable SLI and cost provenance; missing telemetry is unknown, never zero or healthy |
| R21 | Owner of a safe fault environment, secondary region, backup store, and external KMS | Process, storage, dependency, network, control-plane and regional faults; restore, upgrade/downgrade, schema migration, credential rotation, drain and decommission | Declared SLO/RPO/RTO are measured from raw clocks; revocations and acknowledged effects survive restore; signatures resolve to the external KMS key |
| R21 | Genuinely unfamiliar on-call operator | Alert to diagnosis to executable runbook to recovery on the deployed topology | Operator identity and unfamiliarity basis are documented; prerequisites, actions, outcome, and elapsed time are retained; a simulated drill is insufficient |
| R22 | At least two consenting real raters with distinct human identities and distinct Ed25519 keys | Every rater scores every preregistered item; signed observations bind registration, item, rater, score, and time | Complete human-by-item matrix; identity-to-key bijection; no duplicate weighting; agreement and simulator-transfer error are reported separately |
| R22 | Benchmark data/controller and privacy authority | Population definition, consent basis, access policy, hidden-set retention/deletion, and release approval | Public result contains no hidden task, answer, reusable credential, or private participant record; deletion/access evidence is retained |
| R23 | At least two consenting real timing participants with distinct identities and keys | Every participant completes every preregistered task; signed millisecond observations bind the immutable registration | Exact human-by-task matrix with one safe nonnegative integer observation per cell; simulator and real-human timing remain separate |
| R23 | Billing/compute authorities for at least two live providers | Authenticated usage and invoices with provider, model, currency, unit, price date, retry lineage, horizon, and work attribution | Conservation and normalization checks pass; overlapping human time and retries are not double counted; missing or incomparable quantities remain unknown |

## Dependency rule

Evidence may be collected in parallel. Engineering closure follows the normative DAG independently of this manifest;
an external-validation claim may be attached only after the corresponding engineering checkpoint and all of its
dependencies are closed. Validation scripts must reference immutable engineering-evidence digests,
participant/public-key identifiers, provider revisions, and the applicable preregistrations.

## Secret-handling rule

Slack tokens, signing secrets, KMS private material, provider credentials, raw invoices, and participant-private data
must not enter the repository or portable evidence bundles. Repository artifacts retain opaque references, public keys,
redacted raw-evidence digests, access/deletion records, and independently replayable aggregate results only.
