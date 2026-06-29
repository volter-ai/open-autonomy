# simple-soc2

`simple-gh-sdlc` **+ a deterministic SOC 2 control layer.** The same 4-agent GitHub PR loop
(pm/draft/develop/reviewer) and the same merge boundary, but every install ships the SOC 2-relevant controls
baked in **as deterministic CI / config / branch-protection / policy files — not as agent behavior**. The
agents run the SDLC; the controls are enforced by the substrate and GitHub.

The full design rationale, the control menu, and the honest can/can't split live in the Open Autonomy repo at
[`docs/SIMPLE-SOC2-PROFILE.md`](../../docs/SIMPLE-SOC2-PROFILE.md). The per-control → TSC → enforcement →
evidence map ships in the install at [`compliance/control-matrix.md`](compliance/control-matrix.md).

## What it adds over simple-gh-sdlc

Same agents, same loop. The delta is a control layer:

**Control workflows** (`.github/workflows/`)
- `codeql.yml` — SAST (C8) · `human-approval.yml` — per-head-SHA maintainer change gate (C4)
- `dependency-review.yml` — PR-time dependency vuln review (C9) · `sbom.yml` — CycloneDX SBOM (C10)
- `evidence-collect.yml` — tamper-evident control-evidence → `compliance-evidence` branch (C16)
- `retention.yml` — transcript retention sweep via gated PR (C14) · `heartbeat.yml` — fleet liveness (C17)
- (inherited from simple-gh-sdlc: `security.yml` supply-chain + zizmor (C7/C11), `merge.yml`, `dependabot.yml`)

**Branch protection** (`provision.json`, applied by `scripts/provision-target-repo.ts`)
- required checks, `enforce_admins: true`, ≥1 review, secret-scanning + push-protection (C5/C12).

**Policy + evidence tree** (`compliance/`, install-owned — you edit it)
- a full SOC 2 policy set, risk register, subprocessor inventory, and the control matrix.

## Compile

```bash
bun bin/autonomy-compile.ts profiles/simple-soc2 github /tmp/simple-soc2
```

## Provision (applies the SOC 2 branch protection)

```bash
bun scripts/provision-target-repo.ts --repo <owner>/<name> --source <build-dir> --manifest provision.json
```

`provision.json` is the **profile-derived branch-protection control** (design-doc gap G1): the hardening is a
committed, change-managed file, not an out-of-band console click. It is install-owned — tune it to your repo
(e.g. your own `ci` context) and upgrades won't revert it.

## TSC scope

**Security (CC) + Confidentiality + Availability + Processing Integrity.** Privacy is out of scope (this
installation is not designed to process end-user PII; keep PII out of inputs — see the data-classification
policy). Processing Integrity is delivered by the change pipeline: only reviewed, passing, intended code
lands (C2/C4/C5/C7) — see the control matrix PI note.

## Two honest v1 decisions (read these)

- **C6 signed commits — chose DCO (compensating control), not keyless signing, for v1.** Cryptographically
  signing *agent/bot* commits requires wiring keyless signing (gitsign/Sigstore) into the shared runtime
  effect step that creates commits — a cross-cutting change to every profile's runtime, out of scope for a
  profile-only build. v1 ships DCO sign-off as the compensating control; `provision.json` keeps
  `required_signatures: false` (turning it on without runtime signing would wedge every agent commit). The
  provisioning script already supports flipping it on once signing lands.
- **C8/C7 as *required* checks — shipped + running, but not yet *blocking* on bot PRs.** CodeQL and the
  supply-chain gate run on every push / PR / weekly and surface findings, but they are **not** in
  `provision.json`'s `required_checks`. A bot-authored agent PR doesn't fire `pull_request` (GITHUB_TOKEN
  anti-recursion), so a required check only blocks bot PRs if the proposer **dispatches** it — `ci`,
  `agent-review`, and `human-approval` are dispatched today; wiring CodeQL + supply-chain dispatch is a
  runtime follow-on. Listing them as required now would **wedge every agent PR**, so they are enforced as
  blocking on **human** PRs and as monitoring on bot PRs until that wiring lands.

## The ceiling

This makes an adopter repo **Type-I-ready by design** — technical controls present, deterministic, auditable
— and scaffolds the org program (policies + automated evidence). It **cannot** operate your org program or
provide the **Type II observation window** (~3–12 months of the controls demonstrably operating), and it
**cannot** make the subprocessors (model proxy, GitHub, Cloudflare) compliant. See
[`compliance/README.md`](compliance/README.md).

## Gaps tracked from design (G1–G3)

- **G1 resolved** — branch protection is profile-derived via `provision.json` + the extended provisioning
  script (`enforce_admins` / reviews / signatures / secret-scanning knobs).
- **G2 resolved** — `compliance/**` and `provision.json` are install-owned (seed-once; upgrades never clobber
  your edited policies); the security **workflows** stay derived so upgrades push improvements.
- **G3 documented** — secret scanning, push protection, CodeQL, and dependency review are free on **public**
  repos but require **GitHub Advanced Security** on **private** repos. On a private repo without GHAS those
  specific controls no-op (the workflows record it); budget for GHAS or run the repo public.
