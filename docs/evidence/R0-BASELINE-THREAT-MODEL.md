# R0 runtime baseline, boundary inventory, and threat ownership

Status: implementation evidence for R0. This inventory describes the current repository and the planned R1–R28
runtime. It grants no checkpoint assurance by itself. Every accepted finding has exactly one downstream owner.

## Baseline scope

The reproducible content inventory is `docs/runtime-ledgers/baseline-manifest.json`. It hashes the normative and
planning semantics plus every Organization IR executable test fixture using SHA-256. The proof-accounting corpus is
`docs/runtime-ledgers/baseline.json`; its initializer is deterministic and all 121 new obligations begin unresolved
with assurance `unknown`.

## Boundary inventory

| Boundary or asset | Current fact / assumption | External effect or sensitive data | Owner |
|---|---|---|---|
| Authored profile and imported modules | Untrusted structured input, paths, package identities, and opaque extensions | local/network reads by future resolvers | R2 |
| Compiler and plugins | Core currently runs in-process; future plugins must have declared inputs and budgets | CPU, memory, diagnostics, artifact writes | R5 |
| Component/substrate adapters | Provider claims are not trusted as guarantees | provider API calls and native state | R6, R14 |
| GitHub Actions runner | Uses OIDC, scoped GitHub tokens, repository secrets/variables, logs, issues, PRs, and statuses | code/repository mutation and public comments | R10, R15 |
| Local/termfleet runner | Uses local filesystem, shell, git credentials, model endpoint, sessions, and process control | code/files/process mutation | R10, R16 |
| Model proxy/providers | Raw provider keys stay outside worker; prompts, completions, token use, and spend cross a service boundary | potentially personal/proprietary text and billable requests | R10, R11 |
| Coding worker/session | Actor, worker, model, account, runtime, session, and credential are distinct identities | tool calls, code changes, messages, cost | R11 |
| Registry and event store | Planned multi-tenant durable identity/state boundary | organization specs, events, evidence, user identifiers | R17, R18 |
| Reconciler and command plane | Planned authority-bearing control boundary | deployment mutation, pause, approval, rollback | R19, R20 |
| Slack/other interaction seams | Transport identity/thread is not work or actor identity | message text, user IDs, channel/thread IDs | R10, R20 |
| Bench/twin/optimizer | Workloads, graders, traces, costs, and human-simulator observations are sensitive evaluation assets | task content, telemetry, rankings, rollout proposals | R22–R28 |

Tenancy is not implemented by the present Organization IR compiler. Any cross-tenant runtime claim therefore remains
`unknown` until R10 and the relevant control-plane checkpoint provide live evidence. No current test credential,
provider availability, daemon, or human action is silently treated as portable semantics.

## STRIDE, distributed-failure, and economic-abuse register

| ID | Class | Minimal threat/failure | Required control and falsifier | Owner |
|---|---|---|---|---|
| T01 | Spoofing | Transport identity is equated with an organizational actor | authenticated issuer-to-actor binding; wrong-tenant identity must fail | R10 |
| T02 | Tampering | Package, lock, artifact, event, or approval changes after validation | content/signature binding and replay rejection | R2, R18, R20 |
| T03 | Repudiation | A privileged effect lacks actor, artifact, scope, and causal evidence | immutable provenance; reconstruction must name the issuer | R18, R20 |
| T04 | Information disclosure | Secret or personal task text enters diagnostics, traces, benchmark bundles, or Slack | classification, redaction, retention, and access tests | R5, R10, R22 |
| T05 | Denial of service | Cyclic/deep input, plugin, tenant, event flood, or retry storm exhausts resources | admission, budgets, cancellation, backpressure, fairness | R2, R5, R19, R21 |
| T06 | Elevation of privilege | Worker, adapter, optimizer, or natural-language command expands authority | attenuation, typed authorization, external policy ceiling | R10, R20, R28 |
| T07 | Duplicate/reorder | Crash or retry repeats an external effect or applies stale state | idempotency key, fence, causal order, durable outbox | R14, R18, R19 |
| T08 | Partition/split brain | Multiple reconcilers or workers believe they own a singleton action | leases/fencing and deterministic conflict evidence | R11, R19 |
| T09 | Clock/version skew | Expiry, migration, event, or adapter version is interpreted differently | pinned versions and explicit clock assumptions | R4, R9, R10, R18 |
| T10 | Partial failure | Provider accepts an effect but acknowledgement is lost | observe-before-retry and exact reconciliation | R14, R19 |
| T11 | Hidden human labor | Manual repair, review, or data preparation disappears from autonomy score | conserved work/cost accounting with off-ledger audit | R23 |
| T12 | Spend amplification | Retry, fan-out, adversarial prompt, or one tenant consumes unbounded spend | per-scope budgets, quotas, fairness, stop state | R11, R21, R23 |
| T13 | Benchmark gaming | Candidate sees/edits grader or suppresses failed trials | criterion-owner separation and complete outcomes | R22, R27, R28 |
| T14 | Optimization ratchet | Individually safe changes accumulate unsafe scope or irreversible cost | cumulative bounds, canary, approval, rollback | R26–R28 |
| T15 | Provider capture | A provider-only behavior is mislabeled portable or required for closure | typed loss/unsupported result and independent matched run | R3, R14, R24 |

## Concrete implementation findings

The skeptical implementation audit found the following current, non-portable facts. These are downstream work, not
ambient assumptions: model-proxy session views need repository/tenant authorization (R17–R18); durable run sessions
and sponsor/profile data need retention, correction, and deletion rules (R18, R22–R23); pattern redaction does not
establish absence of arbitrary secrets or personal data (R11, R18); repository slug currently conflates tenant,
account, billing, and authorization scope (R10, R17); credentials include proxy admin bearer, token HMAC, provider
key, webhook secret, GitHub OIDC token, minted run token, GitHub token/CLI auth, and ambient local credentials (R10).

Owner-wildcard OIDC trust makes repository administration an indirect spend authority (R10, R20, R23). GitHub
issuer/JWKS and OpenRouter are live availability, privacy, substitution, cost, and version dependencies (R10–R11,
R15–R16, R21, R23–R24). Local provider discovery and workers inherit ambient host authority; an absent Claude tool
allowlist currently selects bypass-permissions and forwards the host environment (R10–R11, R16). Economic effects
include mint, grant, accrue, coupon redemption, sponsorship accrual, balance enforcement, and system-run lanes; the
current 500-key idempotency tail is not permanent replay protection (R18, R21, R23, R28).

Provisioning may temporarily remove branch protection between remote calls (R8, R20–R21). External effects include
repository creation/deletion, pushes, variables, labels, protection, auto-merge, issues, comments, statuses, PRs,
process launch/cancel, transcript upload, provider calls, run revocation, and credit transfer (R11, R15, R20–R21).
Separate Cloudflare Durable Objects create cross-object consistency, backup, restore, and partition questions
(R17–R18, R21). Full tool/model transcripts are themselves privacy and supply-chain assets (R8, R18, R22).

## Residual disposition

This baseline has no unowned parking-lot residual. The table above is the owner ledger: comma/range owners mean the
finding creates distinct controls at each named checkpoint, not shared ownership of one unresolved fact. Rejected
baseline assumptions: ambient credentials, universally available network/model providers, single tenancy, reliable
clocks, exactly-once transport, and hidden operator repair. Future discoveries must enter the runtime residual ledger
before a checkpoint can close.
