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

## C6 — signed commits: DCO today; keyless gitsign analyzed, `required_signatures` deliberately OFF

`provision.json` keeps `required_signatures: false`, and the provisioning script supports flipping it. We did
**not** enable keyless signing because it hits a hard GitHub limitation:

- **gitsign/Sigstore commits are not marked "Verified" by GitHub.** GitHub's Verified badge (and the
  `required_signatures` protection) only trusts GPG/SSH/S-MIME keys registered to the committing account;
  Sigstore's ephemeral Fulcio certs (tied to the Actions OIDC identity) are not in that trust root. So
  flipping `required_signatures: true` with gitsign would mark the agent's own commits **Unverified and
  reject them → every agent PR wedges.**
- gitsign would also need three Sigstore endpoints (`fulcio`/`rekor`/`tuf-repo-cdn.sigstore.dev`) added to
  the agent job's `harden-runner` egress allowlist — a deliberate egress-posture change.

So v1 ships **DCO sign-off** as the compensating control. The two real paths to *GitHub-verifiable* signed
commits — (a) create the agent commit via the GitHub commits API so GitHub server-signs it Verified, or
(b) register an SSH/GPG signing key for the bot identity — are larger decisions (rewrite the propose flow, or
introduce bot key management). Flagged for an explicit decision rather than wired blind. gitsign-for-provenance
(real Rekor transparency, verifiable out-of-band but Unverified on GitHub) remains an option if desired.

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
