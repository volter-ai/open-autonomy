# Adopting soc2-baseline — onboarding guide

Get a self-driving repo to **Type-I-ready by design** in four steps. (This makes the *technical controls*
default-ready; the org program + the Type II observation window are still yours to run — see
`compliance/README.md`.)

## 1. Compile the profile onto your repo's substrate
```bash
bun bin/autonomy-compile.ts profiles/soc2-baseline github <build-dir>
```
This emits the agent workflows, the control workflows (codeql, supply-chain, human-approval, sbom,
evidence-collect, retention, heartbeat), the runtime, and the `compliance/` policy tree.

## 2. Provision the repo (applies the SOC 2 controls)
```bash
bun scripts/provision-target-repo.ts --repo <owner>/<name> --source <build-dir> --manifest <build-dir>/provision.json
```
Applies branch protection (required checks `ci, agent-review, human-approval, supply-chain, code-scan, secret-scan`,
`enforce_admins`, ≥1 review), the **required-signatures ruleset**, and secret-scanning + push-protection, then
sets the repo variables + labels. Tune `provision.json` to your repo first (it's install-owned).

**Prerequisites / gotchas:**
- **`ci`**: soc2-baseline ships **no** `ci.yml` — `ci` is *your product's* CI. Provide a workflow that posts a
  `ci` commit status (the proposer dispatches `ci.yml` with `-f sha -f pr`), or drop `ci` from
  `required_checks`.
- **No-signup required gates (work on private, no GHAS):** the SAST + secret-scan required checks are
  `code-scan` (Semgrep OSS) and `secret-scan` (gitleaks) — free, no account, no GHAS — so a private repo gets
  real code + secret scanning out of the box. **GHAS is OPTIONAL richer-where-available**: GitHub CodeQL
  (`codeql.yml`), GitHub-native secret scanning, and dependency-review (C9) light up on public repos or with
  GHAS on private, but are NOT in `required_checks`, so a no-GHAS private repo never wedges.
- **Maintainers**: set the `PUBLIC_AGENT_MAINTAINERS` repo variable (comma-separated logins) — the
  human-approval gate engages them and they approve sensitive PRs.
- **Egress lockdown (C3/C15)** enforces with **zero signup on BOTH public and private repos**. PUBLIC repos
  use the free harden-runner block (verified: non-allowlisted egress DENIED, exit 7). PRIVATE repos use the
  shipped self-managed `scripts/egress-guard.sh` (iptables allowlist of GitHub `/meta` ranges + the agent's
  hosts, default-deny), auto-wired into the agent jobs via `policy.box.gh-actions.private_egress_guard` —
  verified live on a private repo: example.com DENIED (exit 7) while the proxy/npm/github egress stays intact.
  No StepSecurity account, no GHAS.
- **Dependency review (C9) needs the dependency graph**: free on public repos; on private repos it requires
  GitHub Advanced Security (same GHAS boundary as the optional CodeQL/GitHub-native secret-scanning, G3). Without
  it `dependency-review.yml` no-ops — but dependency **integrity + CVE** scanning still enforces no-signup via the
  required `supply-chain` gate (`bun audit`), so vulnerable deps are still caught on private.
- **Signed commits**: the required-signatures **ruleset** can block native auto-merge under
  `enforce_admins:true` even when commits are Verified (known finding) — until reconciled, an operator/maintainer
  performs the merge.

## 3. Fund the model proxy
Point the repo at your model-proxy (`MODEL_PROXY_URL`, `MODEL_PROXY_OIDC_AUDIENCE` — set by provisioning) and
ensure its run budget is funded. Per-run caps (`PUBLIC_AGENT_MAX_USD_CENTS`, `PUBLIC_AGENT_MAX_REQUESTS`)
bound spend; the proxy hard-stops at the account balance.

## 4. Seed work + operate
- Open an issue describing the work; the `pm` cron triages it (`draft` → `ready`) and launches `develop`.
- `develop` proposes a **GitHub-Verified** PR; the gates fire; a maintainer **approves**; it merges.
- **Operate the cadence** (`compliance/README.md`): review SBOM/findings weekly, run access reviews quarterly
  off the `compliance-evidence` snapshots, re-approve policies + run the IR tabletop annually.

## What you own vs. what's automated
| Automated (the profile) | Yours (the org) |
|---|---|
| The controls + their evidence collection | Approving the `compliance/policies/*`, the auditor, the platform (Vanta/Drata) |
| Verified commits, gated merges, retention sweeps | Access reviews, vendor DPAs, IR tabletop, MFA enforcement |

Fill in the `[ORG]`/`[OWNER]`/`[DATE]` placeholders across `compliance/`, connect a compliance platform to the
`compliance-evidence` branch, engage a CPA auditor, and run the controls for the observation window.
