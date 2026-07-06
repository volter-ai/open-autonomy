# `soc2-baseline` — Design Doc (PHASE 1: design only, nothing built)

> **Goal.** A new OA profile, `soc2-baseline`, so any self-driving repo that adopts it **ships SOC 2-relevant
> controls baked in by default** — as concrete, deterministic controls (CI workflows, branch protection,
> config files, policy templates, evidence-collection crons), **never** "the agents will handle it."
>
> **Status.** Design only. This doc defines the profile-mechanism menu, the per-control checklist with
> candidate solutions, and an honest can/can't-be-a-default split. **No profile and no functional code were
> created.** It builds directly on [`SOC2-READINESS.md`](../SOC2-READINESS.md) (§3 technical, §4 org, §6
> scorecard) and is grounded entirely in the canonical OA source (citations throughout).
>
> **Companion read.** `SOC2-READINESS.md` is OA's *own* org-compliance gap analysis. This doc is the
> opposite direction: making *adopter* repos default-ready. They share the control taxonomy; they differ in
> who owns what (see §3 — the proxy is OA's infra but the *adopter's subprocessor*).

---

## 1. What a profile is, and why it's the right vehicle

An OA profile is a directory compiled onto a substrate by `compile(profile, substrate)`
(`bin/autonomy-compile.ts`, `packages/substrate-github/src/emit.ts`). The canonical adopter-facing GitHub
profile is **`profiles/simple-gh-sdlc`** — a 4-agent PR-based SDLC loop (pm/draft/develop/reviewer) with
the merge boundary baked in. **`soc2-baseline` is its SOC 2-hardened sibling**: same loop, plus a deterministic
compliance control layer.

This matters because SOC 2 controls are *exactly* the case OA's own doctrine reserves for determinism.
Per `CLAUDE.md` ("Scripts only for security — never script what an agent can do"), a deterministic control
is justified by **a boundary an agent must not control**. Compliance controls — change management, the merge
boundary, evidence integrity, branch protection — are security/assurance boundaries. So baking them as
**CI + config + branch-protection + policy files** (not agent behavior) is not a workaround; it is the
doctrinally-correct shape. This is the through-line of every solution below.

---

## 2. The profile-mechanism menu — how a profile injects defaults into a target repo

These are the **levers** `soc2-baseline` can pull. Each is cited from source.

| # | Mechanism | What it injects | How it works (citation) |
|---|---|---|---|
| **M1** | **`resources:` carry-verbatim** | Arbitrary files copied as-is into the target repo root: **CI workflows, dependabot config, policy docs, standards, settings, SECURITY.md, SBOM/evidence workflows** | `ir.yml` `resources: [...]` → compiler emits `copies` → `materialize.ts:14-16` writes each `{from,to}`. `simple-gh-sdlc/ir.yml` already ships `.github/workflows/merge.yml`, `security.yml`, `.github/dependabot.yml`, `standards/*.md`, `.claude/settings.json`. **This is the primary SOC 2 lever.** |
| **M2** | **Generated per-agent workflows w/ least-privilege + egress lockdown** | One `.github/workflows/<agent>.yml` per agent, with a `permissions:` block derived from capabilities and a `harden-runner` egress allowlist | `emit.ts:264-420` (per-agent workflow), `emit.ts:215-237` (capability→permission map), `emit.ts:130-145` (harden-runner `egress-policy: block`). **Least-privilege + egress are automatic — already a control.** |
| **M3** | **Capability scopes / the merge boundary** | `code:propose` ≠ `code:review`, no agent holds `code:merge`; native auto-merge lands PRs | `ir.ts:102-112` (validation forbids both-on-one + any `code:merge`), `emit.ts:215-237`. **Segregation-of-duties, enforced at compile time.** |
| **M4** | **`policy.box.risk` → human-required gate** | `human_required_paths` + `human_required_topics` → materialized to `.open-autonomy/human-required-paths.json`, enforced by the deterministic `human-approval` gate (per-head-SHA maintainer approve) | `emit.ts:474-475` (materialize), `scripts/human-approval-gate.ts:47-94` (deterministic gate). **Deterministic change-management control over sensitive paths.** |
| **M5** | **`policy.box.merge`** | `maintainer_block_labels` — the org's hold vocabulary (the required-check set + per-head-SHA re-earn are the seam CONTRACT, enforced by branch protection + the gate, not box parameters) | `profiles/self-driving/ir.yml` policy box; read at runtime by `scripts/rearm-auto-merge.ts` (a labeled PR is never re-armed) and consulted by the pm/reviewer skills. **Deterministic merge-hold config.** |
| **M6** | **Provisioning → branch protection / repo settings** | Required status checks, `enforce_admins`, required PR reviews, `allow_auto_merge`, (and settable: required signatures, secret-scanning, push-protection) | `scripts/provision-target-repo.ts:269-278` sets `required_status_checks`, `enforce_admins:false`, `required_pull_request_reviews`, `restrictions:null`; `allow_auto_merge=true` at :268. Required checks come from a **provision manifest** (`branch_protection.required_checks`, today `["ci","agent-review"]` via `bench/provision.template.json:31-34`). **This is where SOC 2 branch-protection hardening lands — but the manifest is not yet profile-derived (see §3 gap G1).** |
| **M7** | **Scheduled (cron) workflows shipped as resources** | Any deterministic recurring job: **evidence collection, SBOM, dependency audit, retention/pruning, liveness/heartbeat** | A profile resource workflow with `on: schedule:` runs deterministically on GitHub's cron. `security.yml` already runs weekly. **This is how the profile automates Type-II evidence — see §4 the "evidence hooks" idea.** |
| **M8** | **`standards/*.md` + skill prose** | Shared standards every skill reads (carried verbatim) | `simple-gh-sdlc/standards/{workflow,issue-and-evidence,risk-and-review}.md`. *Note: these steer agent behavior — useful for documentation, but **not** an auditable deterministic control on their own. SOC 2 evidence must come from M1–M7, not M8.* |

**Install-ownership nuance (matters for upgrades):** `INSTALL_OWNED_PATHS` (`packages/core/src/upgrade.ts:17-33`)
files are seeded once and never overwritten on upgrade (e.g. `docs/CONSTITUTION.md`, `package.json`). Policy
templates the *adopter must edit and own* (their risk register, their IR plan) should be install-owned;
controls OA wants to *keep current* (the security CI, dependabot) should stay derived/regenerated so upgrades
push improvements. This is a real design choice per-file (see §6).

---

## 3. The honest scope — what a repo profile can and cannot own

Three buckets. Getting this split right is the whole point of the task.

### 3a. The proxy is OA's infra but the **adopter's subprocessor**
Adopter repos **do not run** the `agent-model-proxy` — they call OA's hosted proxy via OIDC
(`scripts/model-proxy-mint.ts`, no secrets stored in the fleet repo). So every proxy-side control in
`SOC2-READINESS.md` (§3.2 admin-token hardening, §3.3 ledger audit log, §3.5 HMAC rotation, §3.8 ledger
backup/DR) is **out of the adopter repo's control entirely**. From the adopter's SOC 2 perspective the proxy
is a **subprocessor**, exactly like GitHub or Cloudflare. `soc2-baseline` therefore **cannot** bake those in;
what it *can* do is **ship a subprocessor inventory that names the OA proxy** and point at OA's own
attestation. (Which loops back to why `SOC2-READINESS.md` matters: OA must make the *proxy* compliant so
adopters can rely on it.)

### 3b. Some controls are inherently **org-level** — no repo can own them
MFA enforcement, the actual policy approvals, access-review *execution*, vendor risk decisions, HR
background checks, picking an auditor, the compliance platform subscription. A profile can **scaffold the
template and automate the evidence collection**, but a human/org must operate them.

### 3c. Everything else is **repo-bakeable** — the profile's real territory
Least-privilege tokens, the merge boundary, branch protection, supply-chain CI, SAST, secret scanning,
SBOM, secret redaction, the human-approval change gate, transcript retention, and — crucially —
**deterministic evidence-collection crons** that make the org program auditable. This is §4.

---

## 4. The `soc2-baseline` control checklist

For each control: **TSC served**, **classification**, **candidate solutions with tradeoffs**. Classification
legend:
- **DEFAULT** = bakeable as a deterministic repo control (resource/CI/config/branch-protection).
- **PROVISION** = bakeable, but lives in the provisioning script / branch protection (needs M6 + gap G1).
- **SCAFFOLD** = profile ships a template/evidence-hook; a human/org must operate it (can't be fully owned).
- **ORG-ONLY** = cannot live in a repo at all; documented for completeness.
- **N/A-PROXY** = OA-infra/subprocessor; out of adopter-repo scope (§3a).

Status of the *baseline* `simple-gh-sdlc` today is noted as **[have]** / **[add]** / **[harden]**.

### TECHNICAL CONTROLS (from SOC2-READINESS §3)

#### C1 — Least-privilege agent tokens · CC6 (Security) · **DEFAULT [have]**
Capability→permission map already yields read-only baseline + scoped writes (`emit.ts:215-237`). No work;
document it as a control in the policy narrative. **Auditable as-is.**

#### C2 — Merge boundary / segregation of duties · CC6, CC8 · **DEFAULT [have]**
`code:propose` ≠ `code:review`, no `code:merge`, native auto-merge (`ir.ts:102-112`). Core of
`simple-gh-sdlc`. **Auditable as-is.**

#### C3 — Egress lockdown (exfil prevention) · CC6 · **DEFAULT [have]**
`harden-runner egress-policy: block` on every credentialed job (`emit.ts:130-145`). **Auditable as-is.**

#### C4 — Deterministic human-approval change gate · CC8 (Change Mgmt) · **DEFAULT [harden]**
The per-head-SHA maintainer gate (`human-approval-gate.ts`). **Gap:** `simple-gh-sdlc` ships the `risk` box
but **not** `human-approval.yml` (only `self-driving` does). `soc2-baseline` must add it as a resource and add
`human-approval` to required checks (C8).
- **A.** Ship `human-approval.yml` + add `human-approval` to required checks → strongest, true human gate on sensitive paths. *Tradeoff: needs a maintainer to act; slows merges in scope.*
- **B.** Keep auto-pass for routine PRs, gate only `human_required_paths`/topics (current self-driving behavior) → low friction. *Tradeoff: narrower coverage — fine for SOC 2 if scope is well-chosen.*
- **Recommend A scope = B behavior** (ship the gate; scope it to sensitive paths).

#### C5 — Branch protection: required checks, no self-merge, enforce_admins · CC8 · **PROVISION [harden]**
Today provisioning sets `enforce_admins:false`, `required_approving_review_count:0`, checks `["ci","agent-review"]`
(`provision-target-repo.ts:269-278`).
- **A.** Make the provision manifest **profile-derived** (gap G1): `soc2-baseline` declares required checks =
  `[ci, agent-review, human-approval, codeql, supply-chain]`, `enforce_admins:true`, `≥1` review. *Tradeoff:
  needs a small build to thread profile→manifest; highest assurance.*
- **B.** Ship a documented `provision.soc2.json` the adopter passes manually. *Tradeoff: deterministic but a
  manual step (drift risk).*
- **Recommend A** — it's the clean home for SOC 2 branch protection and removes the doc/script `enforce_admins`
  mismatch flagged in `SOC2-READINESS.md` §3.7.

#### C6 — Signed commits · CC8 · **PROVISION [add]**
Today: DCO only, no signature enforcement.
- **A.** Branch protection `required_signatures: true` + bot/agent commits GPG-signed via a signing key in
  Actions. *Tradeoff: real key management; agent commits must sign — non-trivial.*
- **B.** Sigstore/gitsign keyless signing in the effect step. *Tradeoff: newer, lighter key mgmt, less
  universally recognized by auditors.*
- **C.** Keep DCO + document as compensating control. *Tradeoff: weakest; some auditors accept.*
- **Recommend B** if we want true signing; **C** is an acceptable v1.

#### C7 — Supply-chain integrity (lockfile + audit) · CC7, CC8 · **DEFAULT [have]**
`security.yml` + `check-supply-chain.ts` (registry-only + sha + `bun audit`) already shipped by
`simple-gh-sdlc`. **Auditable as-is.**

#### C8 — SAST (CodeQL) as a required check · CC7 · **DEFAULT+PROVISION [add]**
`simple-gh-sdlc` ships **no** `codeql.yml` (only `self-driving` does).
- **A.** Add `codeql.yml` resource **and** make it a required check via C5/G1. *Tradeoff: must dispatch it on
  bot PRs (GITHUB_TOKEN anti-recursion, `CLAUDE.md`) — same pattern as ci/agent-review.*
- **B.** Add `codeql.yml` on push/weekly only (not required). *Tradeoff: lighter; SOC 2-acceptable as
  "monitoring" rather than a gate.*
- **Recommend A.**

#### C9 — Dependency update automation · CC7 · **DEFAULT [harden]**
`simple-gh-sdlc` ships `dependabot.yml` for **GitHub Actions only**.
- **A.** Extend to npm/bun ecosystem + grouped weekly. *Tradeoff: noisier PRs — but they flow through the
  same gated loop.* **Recommend A.**

#### C10 — SBOM generation · CC7, Confidentiality · **DEFAULT [add]**
- **A.** Ship `sbom.yml` (cron + on release) emitting CycloneDX/SPDX as a committed artifact under
  `compliance/sbom/`. *Tradeoff: small maintenance; high auditor value.* **Recommend A.**

#### C11 — Actions hardening (pinning, workflow SAST) · CC7 · **DEFAULT [harden]**
Shipped workflows are SHA-pinned; `self-driving` ships `zizmor`. For adopters' *own* workflows:
- **A.** Ship `zizmor` + `actionlint` + a pin-checker in `security.yml`. *Tradeoff: may flag adopter
  workflows — desired.* **Recommend A.**

#### C12 — Secret scanning + push protection · CC6, Confidentiality · **PROVISION [add]**
GitHub repo-level setting, API-settable.
- **A.** Provisioning enables `secret_scanning` + `push_protection`. *Tradeoff: requires GHAS on private repos
  (cost/plan). Free on public.* **Recommend A**, with a documented plan caveat.

#### C13 — Secret redaction in transcripts · Confidentiality · **DEFAULT [have]**
Pattern redaction in `transcript.ts:41-49`. **Auditable as-is** — but see C14 (PII not redacted).

#### C14 — Data classification & transcript retention · Confidentiality, Privacy · **DEFAULT+SCAFFOLD [add]**
Source code is captured into **permanently git-committed** transcripts (`transcript.ts:62-123`); no PII
redaction; unbounded.
- **A.** Ship a `retention.yml` cron that prunes `.open-autonomy/history/**` older than N days. *Tradeoff:
  loses old audit detail — balance with a documented retention period.*
- **B.** Redirect transcripts to private artifact storage instead of git. *Tradeoff: bigger change to the
  runtime; removes confidential code from git.*
- **C.** Ship a data-classification policy + ensure repo private + keep transcripts. *Tradeoff: weakest
  technically, simplest.*
- **Recommend A + C** (prune on a documented schedule + classification policy). B is a follow-on.

#### C15 — Encryption in transit / at rest · CC6, Confidentiality · **DEFAULT(transit)/SCAFFOLD(rest) [have/add]**
Transit: HTTPS-only egress allowlist — **have**. At-rest: inherited from GitHub/Cloudflare — ship a
one-page **data-handling assertion** template referencing subprocessor SOC 2 reports. **SCAFFOLD.**

#### C16 — Audit logging & tamper-evidence (repo side) · CC7 · **DEFAULT+SCAFFOLD [harden]**
In the *adopter repo*, the audit trail = git history (tamper-evident) + Actions logs + committed transcripts.
- **A.** Ship an `evidence-collect.yml` cron that snapshots branch-protection config, collaborators+permissions,
  required checks, dependabot/secret-scanning status into a committed, timestamped `compliance/evidence/` tree.
  *Tradeoff: small; **this is the single highest-value addition** — it makes Type-II evidence automatic and
  tamper-evident in git (see §5).*
- **B.** Configure Actions log retention + document it. *Tradeoff: retention is an org/repo setting.*
- **Recommend A + B.** (Centralized SIEM/log-aggregation is **N/A-PROXY/ORG** for the adopter.)

#### C17 — Availability: liveness / monitoring · Availability · **SCAFFOLD [add]** (only if Availability in scope)
Proxy uptime/backup is **N/A-PROXY**. For the adopter org's *own* liveness:
- **A.** Ship a `heartbeat.yml` cron that asserts the fleet ran recently and opens an issue/alert if not
  (addresses the operator-down gap analog). *Tradeoff: basic; real paging is org tooling.* **Recommend A** if
  Availability is a chosen TSC; otherwise defer.

#### C18 — Rate limiting / admin-token / HMAC / ledger backup · CC6, CC7, Availability · **N/A-PROXY**
All proxy-side. **Out of adopter-repo scope.** Document as subprocessor reliance (C20/O4). Drives OA's own
`SOC2-READINESS.md` remediation, not this profile.

### ORGANIZATIONAL CONTROLS (from SOC2-READINESS §4) — what the profile can *scaffold*

The profile cannot *operate* these, but it can ship **editable, install-owned templates** + **evidence
hooks** so the org work is "fill in the blanks + the cron collects proof," not "start from zero."

| Item | TSC | Class | What `soc2-baseline` ships |
|---|---|---|---|
| **O1 Security policies** | CC1–CC5 | SCAFFOLD | `compliance/policies/` template set (InfoSec, Access Control, Change Mgmt, Vendor Mgmt, Data Classification & Retention, Encryption, IR, BC/DR, SDLC, Risk) — install-owned, pre-mapped to the C-controls above. |
| **O2 Risk assessment** | CC3 | SCAFFOLD | `compliance/risk-register.md` template + the cadence documented. |
| **O3 Access reviews** | CC6 | SCAFFOLD + **evidence hook** | Template review checklist **+** the C16 cron snapshots collaborators/permissions each period so the review has data. |
| **O4 Vendor/subprocessor mgmt** | CC9 | SCAFFOLD | `compliance/subprocessors.md` **pre-filled** with GitHub, **OA model proxy (§3a)**, Cloudflare, OpenRouter, model providers — and where to get each one's report. |
| **O5 Incident response** | CC7 | SCAFFOLD + DEFAULT | Ship a `SECURITY.md` (deterministic, real) + an IR-plan template + tabletop checklist. |
| **O6 HR onboarding/offboarding** | CC1 | SCAFFOLD | Checklists template. |
| **O7 Change management (formalized)** | CC8 | SCAFFOLD (control is DEFAULT) | The *control* exists (C2/C4/C5); ship the **policy narrative** that maps PR-review+CI+gate+branch-protection to CC8 with evidence pointers. Strongest scaffold because the underlying control is real. |
| **O8 Compliance platform** | — | ORG-ONLY | Document Vanta/Drata adoption; the C16 evidence tree feeds it. |
| **O9 CPA auditor** | — | ORG-ONLY | Documented. |
| **O10 MFA / org settings** | CC6 | ORG-ONLY (MFA) / PROVISION (secret-scanning=C12) | Document MFA requirement; C12 covers the repo-settable parts. |
| **O11 DPA / data commitments** | CC9, Privacy | SCAFFOLD | DPA + data-handling templates (ties to C15). |

---

## 5. The honest ceiling — "Type-I-ready by design" vs the rest

**What `soc2-baseline` *can* deliver:**
- A repo whose **technical controls are present, deterministic, and auditable on day one** — least-privilege,
  segregation of duties, branch protection, supply-chain + SAST + SBOM, secret scanning, the human-approval
  change gate, secret redaction, retention.
- **Pre-mapped policy templates** so the org program is fill-in-the-blanks, not blank-page.
- **Automated, tamper-evident evidence collection** (C16/M7) — the closest a repo can get to "continuous
  control monitoring," which is what a Type II actually examines.

This makes a repo **"Type-I-ready by design"**: an auditor could attest the controls are *designed*
appropriately as of a date, with far less prep than a cold start.

**What no profile can provide:**
1. **The org program *operating*** (§3b) — someone must approve policies, run the access reviews, sign DPAs,
   pick the auditor, enforce MFA. The profile scaffolds; humans operate.
2. **The Type II observation window** — Type II attests controls *operated effectively* over ~3–12 months.
   That is *time + operation*, not artifacts. A profile cannot compress it. The C16 evidence cron *shortens
   prep and strengthens the evidence*, but the clock still runs.
3. **Subprocessor compliance** (§3a) — the OA model proxy's own SOC 2 posture is OA's job
   (`SOC2-READINESS.md`), surfaced here only as a vendor-management item the adopter must track.

So the precise claim is: **`soc2-baseline` makes the *technical-control design* Type-I-ready and the *org
program* materially easier — but Type II still requires the company to run the controls for the observation
window.** Anyone who says a profile "makes you SOC 2 compliant" is wrong; this makes you *default-ready*.

---

## 6. Proposed composition (preview for the build phase — NOT built)

`soc2-baseline` = `simple-gh-sdlc` + the deterministic compliance layer. Sketch of the delta (to be decided in
the build phase once solutions are picked):

- **New resources (M1):** `.github/workflows/human-approval.yml` (C4), `codeql.yml` (C8), `sbom.yml` (C10),
  `evidence-collect.yml` (C16), `retention.yml` (C14), optional `heartbeat.yml` (C17); a hardened
  `dependabot.yml` (C9) and `security.yml` w/ zizmor+actionlint (C11); `SECURITY.md` (O5);
  `compliance/policies/**`, `compliance/risk-register.md`, `compliance/subprocessors.md` (O1/O2/O4, install-owned).
- **Policy box (M4/M5):** a SOC 2-tuned `risk.human_required_paths`/`topics` + `merge` block.
- **Provisioning (M6 + gap G1):** profile-derived branch protection — required checks
  `[ci, agent-review, human-approval, codeql, supply-chain]`, `enforce_admins:true`, `≥1` review,
  secret-scanning/push-protection on, optional `required_signatures` (C6).
- **Skills (M8):** a `compliance` standard read by develop/reviewer so changes *respect* the controls (steers
  behavior; not itself the auditable control).

**Known build-phase gaps to resolve:**
- **G1 — provision manifest is not profile-derived.** Required checks/branch-protection come from a manifest
  (`bench/provision.template.json`), not the IR. C5/C6/C8/C12 need a small mechanism to derive provisioning
  from the profile (or a shipped `provision.soc2.json`). **Decide A vs B in C5.**
- **G2 — install-ownership per file** (`upgrade.ts`): policy templates the adopter edits must be
  install-owned (seed-once); security CI must stay derived (upgrade-pushed). Decide per file.
- **G3 — GHAS cost** for secret scanning/CodeQL on private repos (C8/C12) — document the plan requirement.

---

## 7. Decisions to make before building (Phase 2 gate)

1. **TSC scope:** Security + Confidentiality only, or add Availability (turns on C17) / Processing Integrity?
2. **C4 human gate:** ship-and-require (A) vs scope-to-sensitive (B)? *(Recommend ship + scope.)*
3. **C5/G1 provisioning:** profile-derived manifest (A) vs shipped `provision.soc2.json` (B)? *(Recommend A.)*
4. **C6 signed commits:** gitsign/sigstore (B) vs DCO-as-compensating (C) for v1? *(Recommend B or C.)*
5. **C8 CodeQL:** required check (A) vs monitoring-only (B)? *(Recommend A.)*
6. **C14 transcripts:** prune-cron + classification (A+C) now, private-storage (B) later? *(Recommend A+C.)*
7. **C16 evidence cron:** in scope for v1? *(Strongly recommend yes — highest leverage.)*
8. **Policy template depth:** thin stubs vs fully-drafted SOC 2 policy set in `compliance/policies/`?

---

*Phase 1 deliverable. Design only — no profile created, no functional code changed. Citations reflect repo
state at authoring; re-verify line numbers before building. Next: pick the §7 decisions, then build
`profiles/soc2-baseline`.*
