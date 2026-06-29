# Control matrix — soc2-baseline

The authoritative map of each control → the Trust Services Criteria it serves → how it's **enforced**
(deterministic mechanism, not agent behavior) → where the **evidence** is. This is the document an auditor
reads first. Control IDs (C1–C18) match `docs/SOC2-BASELINE-PROFILE.md` in the Open Autonomy repo.

TSC legend: **CC** = Security/Common Criteria (mandatory) · **C** = Confidentiality · **A** = Availability ·
**PI** = Processing Integrity.

## Technical controls (baked into this repo)

| ID | Control | TSC | Enforced by (deterministic) | Evidence |
|----|---------|-----|------------------------------|----------|
| C1 | Least-privilege agent tokens | CC6 | Per-agent `GITHUB_TOKEN` permissions derived from capabilities; read-only baseline | `.github/workflows/<agent>.yml` permission blocks |
| C2 | Merge boundary / segregation of duties | CC6, CC8, **PI** | `code:propose` ≠ `code:review`, no `code:merge`; native auto-merge | IR validation; `agent-review` statuses; merged-PR history |
| C3 | Egress lockdown (exfiltration prevention) | CC6 | `harden-runner egress-policy: block` on every credentialed job | agent workflow harden-runner step + run logs |
| C4 | Human-approval change gate | CC8, **PI** | `human-approval.yml` + `scripts/human-approval-gate.ts`, per-head-SHA maintainer Approve on human-required paths | `human-approval` status; review records |
| C5 | Branch protection (required checks, no self-merge, enforce_admins) | CC8, **PI** | `provision.json` → `scripts/provision-target-repo.ts` (enforce_admins:true, ≥1 review) | `evidence/*/branch-protection.json` |
| C6 | Signed commits | CC8 | **v1: DCO sign-off (compensating).** Keyless commit signing = follow-on | PR template DCO; (future) signature verification |
| C7 | Supply-chain integrity | CC7, CC8, **PI** | `security.yml` → `check-supply-chain.ts` (registry-only + sha + `bun audit`) | Security workflow runs |
| C8 | SAST (CodeQL) | CC7 | `codeql.yml` (push/PR/weekly → Security tab). *Required-check promotion = follow-on* | Code-scanning alerts; `evidence/*/code-scanning-alerts.json` |
| C9 | Dependency vulnerability review | CC7 | `dependency-review.yml` (PR-time, dependency-graph compare) + `dependabot.yml` | PR check runs; Dependabot PRs/alerts |
| C10 | SBOM | CC7, C | `sbom.yml` (CycloneDX on push + weekly) | `sbom-<sha>` artifacts |
| C11 | Actions hardening (pinning, workflow SAST) | CC7 | All actions SHA-pinned; `security.yml` runs zizmor; `dependabot.yml` bumps pins | Security workflow runs |
| C12 | Secret scanning + push protection | CC6, C | `provision.json` `security` block → repo API (GHAS) | `evidence/*/repo-settings.json` |
| C13 | Secret redaction in transcripts | C | `scripts/transcript.ts` token-shape redaction | transcript files |
| C14 | Data classification & transcript retention | C, CC6 | `retention.yml` (gated deletion PR) + data-classification policy | retention PRs; policy |
| C15 | Encryption in transit / at rest | CC6, C | HTTPS-only egress allowlist (transit); GitHub/Cloudflare at-rest (inherited) | egress allowlist; subprocessor reports |
| C16 | Audit logging & tamper-evident evidence | CC7 | `evidence-collect.yml` → `compliance-evidence` branch (git-immutable) + git history + Actions logs | `compliance-evidence` branch |
| C17 | Availability: liveness watchdog | **A** | `heartbeat.yml` (pm-decoupled liveness alert) | heartbeat run history; alert issues |
| C18 | Proxy controls (admin auth, rate limit, ledger backup) | CC6, CC7, A | **Subprocessor** (Open Autonomy model proxy) — not in this repo | `compliance/subprocessors.md` |

## Processing Integrity note (PI)

For an adopter repo, PI = *the change pipeline only lands reviewed, passing, intended code*. It is delivered
by the same controls, viewed as integrity guarantees: **C2** (no unreviewed merge — segregation of duties),
**C5/C4** (required checks + human gate must pass before merge), **C7** (only integrity-verified dependencies
build). The **evidence** that PI operated is the merged-PR history (every merge has a green `ci` +
`agent-review` + `human-approval`) captured in `evidence/*/recent-workflow-runs.json` and the PR record.

## Organizational controls (this repo only scaffolds; the org operates them)

| Ref | Control | TSC | Profile ships | Org must do |
|-----|---------|-----|----------------|-------------|
| O1 | Security policies | CC1–CC5 | `compliance/policies/*` (full set) | Approve, adopt, review annually |
| O2 | Risk assessment | CC3 | `compliance/risk-register.md` | Run + score ≥ annually |
| O3 | Access reviews | CC6 | evidence snapshot of collaborators (C16) | Review quarterly, remediate |
| O4 | Vendor/subprocessor mgmt | CC9 | `compliance/subprocessors.md` (pre-filled) | Collect reports, risk-rank |
| O5 | Incident response | CC7 | `SECURITY.md` + IR policy | Run a tabletop in the window |
| O6 | HR security | CC1 | `hr-security-policy.md` | Onboard/offboard, training |
| O7 | Change management | CC8 | the C2/C4/C5 controls + policy | Operate + retain evidence |
| O8 | Compliance platform | — | (documented) | Adopt Vanta/Drata; feed it C16 |
| O9 | Auditor | — | (documented) | Engage a CPA firm |
| O10 | MFA / org settings | CC6 | C12 (repo-settable parts) | Enforce org MFA |
| O11 | DPA / data commitments | CC9, Privacy | vendor + data policies | Sign DPAs |

See `compliance/README.md` for the honest ceiling: this makes the repo **Type-I-ready by design**; Type II
still requires the org program operating over the observation window.
