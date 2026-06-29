# Changelog — soc2-baseline profile

All notable changes to the `soc2-baseline` profile. Versions follow semver for the profile's control set.

## 1.0.0 — v1 shipped

First release. `simple-gh-sdlc` (4-agent PR loop) + a deterministic SOC 2 control layer. Makes an adopting
repo **Type-I-ready by design**. Scope: **Security (CC) + Confidentiality + Availability + Processing
Integrity** (Privacy out of scope).

### Controls delivered (enforced deterministically — see `compliance/control-matrix.md`)
- **C1** least-privilege capability-scoped agent tokens.
- **C2** merge boundary / segregation of duties (`code:propose` ≠ `code:review`, no `code:merge`; native auto-merge).
- **C3** egress lockdown (`harden-runner`) on every credentialed job.
- **C4** deterministic per-head-SHA human-approval change gate (`human-approval.yml`).
- **C5** profile-derived branch protection (`provision.json`: `enforce_admins:true`, ≥1 review, required checks).
- **C6** **GitHub-Verified signed commits** — keyless via the git/commits API + the job's `GITHUB_TOKEN`;
  `required_signatures` enforced via repository ruleset. Live-proven end-to-end (no merge wedge).
- **C7** supply-chain integrity (lockfile + `bun audit`) — **blocking** required check on bot PRs.
- **C8** SAST (CodeQL) — **blocking** required check on bot PRs (+ monitoring).
- **C9** dependency vulnerability review · **C10** CycloneDX SBOM · **C11** Actions pinning + workflow SAST.
- **C12** secret scanning + push protection (provisioned).
- **C13** secret redaction in transcripts · **C14** transcript retention sweep (gated).
- **C15** encryption in transit / at rest (transit enforced; at-rest inherited).
- **C16** tamper-evident automated evidence collection → `compliance-evidence` branch.
- **C17** fleet-liveness watchdog (Availability).
- **PI** the change pipeline guarantees only reviewed, passing, intended code lands (C2/C4/C5/C7).

### Org scaffolding (install-owned)
Full SOC 2 policy set, control matrix, risk register, and subprocessor inventory (names the OA model proxy
as a subprocessor) under `compliance/`.

### Honest ceiling
Makes the technical controls present, deterministic, and auditable on day one — **default-ready, not
certified**. Does not run the organizational program (policy approval, access reviews, vendor management,
MFA enforcement, auditor) and does not provide the **Type II observation window** (~3–12 months of the
controls demonstrably operating).
