# soc2-baseline

`simple-gh-sdlc` **+ a deterministic SOC 2 control layer.** The same 4-agent GitHub PR loop
(pm/draft/develop/reviewer) and the same merge boundary, but every install ships the SOC 2-relevant controls
baked in **as deterministic CI / config / branch-protection / policy files — not as agent behavior**. The
agents run the SDLC; the controls are enforced by the substrate and GitHub.

The full design rationale, the control menu, and the honest can/can't split live in the Open Autonomy repo at
[`docs/SOC2-BASELINE-PROFILE.md`](../../docs/SOC2-BASELINE-PROFILE.md). The per-control → TSC → enforcement →
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
bun bin/autonomy-compile.ts profiles/soc2-baseline github /tmp/soc2-baseline
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

## C8/C7 — CodeQL + supply-chain are now BLOCKING required checks on bot PRs ✅

These are in `provision.json`'s `required_checks` and enforced on **every** PR including bot-authored agent
PRs. A bot PR fires no `pull_request` (GITHUB_TOKEN anti-recursion), so the **propose effect dispatches** the
gate workflows so their status posts on the head SHA — wired generically via
`policy.box.gh-actions.propose_dispatch_checks` (→ `EXTRA_CHECK_WORKFLOWS` → `scripts/agent-propose.ts`), the
same mechanism that dispatches `ci`/`agent-review`/`human-approval`:
- `.github/workflows/supply-chain.yml` — checks out the head, runs the supply-chain gate (lockfile integrity
  + `bun audit`), posts a `supply-chain` commit status. **Hard block.**
- `.github/workflows/codeql-gate.yml` — runs CodeQL on the head, posts a `codeql` commit status: fails on a
  non-completing analysis or on open error/high-severity alerts; degrades to pass (with an honest description)
  if the alerts API is unavailable (no GHAS on a private repo, see G3) so it never wedges.

The monitoring `codeql.yml` / `security.yml` (push/weekly → Security tab) are unchanged; the above are their
dispatched, blocking realization for the agent-PR path.

## C6 — GitHub-Verified signed commits ✅ (`required_signatures` ON)

`provision.json` sets `required_signatures: true`, and the propose effect now produces **GitHub-"Verified"**
agent commits — keyless, no key to register:

- The effect (`scripts/agent-propose.ts`, gated by `policy.box.gh-actions.commit_signing: verified-api`)
  re-creates the just-pushed agent commit through GitHub's **git/commits API**. A commit created via the API
  by the job's `GITHUB_TOKEN` (github-actions[bot], a GitHub App identity) is **signed by GitHub** and shows
  "Verified"; it then moves the branch ref to that signed copy (same tree/parents/author; only the committer
  becomes the signing bot). A plain `git commit`, or an API commit made with a *personal* token, is
  **unsigned** — only the Actions bot / a GitHub App gets GitHub's signature (verified empirically).
- This needs **no new infra**: the ambient Actions `GITHUB_TOKEN` already present in every agent job is the
  signing identity. No GPG/SSH key registration, no GitHub App to create, no egress change.
- It does not wedge the loop: the agent's PR commit is Verified, and GitHub server-signs the squash-merge
  commit it creates on the protected branch, so `required_signatures` is satisfied at merge.
- Best-effort: if the API re-create hiccups, the effect keeps the (unsigned) pushed commit rather than
  failing the propose — a squash-merge still lands a GitHub-signed commit on `main`.

This upgrades C6 from the prior DCO compensating control to a **real signing control**. (DCO sign-off remains
in the commit body as defense-in-depth.)

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
