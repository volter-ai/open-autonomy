# Access Control Policy

> **Owner:** [OWNER] · **Effective:** [DATE] · **Review:** annually; access reviews quarterly (CC6).

## Purpose
Ensure access to systems and data is least-privilege, authenticated, and reviewed.

## Policy
- **Least privilege.** Agents run with capability-scoped `GITHUB_TOKEN`s (read-only baseline; writes only
  per declared capability — C1). No human or agent holds more access than their role requires.
- **Segregation of duties.** No actor holds both `code:propose` and `code:review`; no actor holds
  `code:merge` (C2). Enforced at compile time.
- **MFA.** Org-wide multi-factor authentication is **required** for all GitHub and Cloudflare accounts.
  *(Organizational setting — enforce in the GitHub org and Cloudflare; not settable from this repo.)*
- **Branch protection.** `main` requires PRs + the required status checks; `enforce_admins` is on; ≥1
  review (C5, `provision.json`).
- **Secrets.** Stored only in GitHub Actions / Cloudflare secret stores; never in code or `.env` committed to
  git. Model access is OIDC-minted (no long-lived provider keys in the repo).
- **Provisioning/admin tokens** are scoped to the minimum and rotated on role change or suspected exposure.

## Access reviews (quarterly)
Using `compliance-evidence/*/collaborators.json` (snapshotted by `evidence-collect.yml`, C16), [OWNER]
reviews every collaborator and their permission level, removes stale/over-privileged access, and records the
review (R9 in the risk register).

## Onboarding / offboarding
Per `hr-security-policy.md`: grant on documented need; revoke all access on the same day as departure.

## Evidence
Collaborator snapshots, branch-protection snapshots, dated quarterly review records.
