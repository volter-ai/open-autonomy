# Encryption Policy

> **Owner:** [OWNER] · **Effective:** [DATE] · **Review:** annually (CC6, Confidentiality).

## Policy
- **In transit.** All network egress from credentialed jobs is HTTPS (TLS 1.2+) and constrained to an
  allowlist by `harden-runner` (C3/C15). No plaintext transport.
- **At rest.** Data at rest is encrypted by the platform subprocessors: GitHub (repos, Actions secrets,
  artifacts) and Cloudflare (the proxy's Durable Object state). [ORG] relies on and retains their SOC 2
  attestations for this control (`subprocessors.md`).
- **Secrets** are stored encrypted in GitHub Actions / Cloudflare secret stores; provider model access is
  short-lived OIDC-minted tokens, not long-lived keys in the repo.
- **Key management** for any [ORG]-held keys: least access, rotation on exposure/role change, no keys in git.

## Evidence
The `harden-runner` egress allowlist in the agent workflows; subprocessor encryption attestations; secret
store configuration.

## Egress enforcement note
The in-transit allowlist (C3/C15) is enforced by the **free** harden-runner `egress-policy: block` Action on
**public** hosted runners — no StepSecurity account required (the shipped allowlist includes harden-runner's
own agent endpoints so the block agent initializes). Verified live: on a public repo non-allowlisted egress is
DENIED. On **private** repos the free tier does not block — StepSecurity Enterprise is required (public-free/
private-paid boundary). [ORG] chooses public repos or budgets Enterprise for private.
