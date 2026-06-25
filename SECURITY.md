# Security Policy

open-autonomy runs semi-untrusted AI agents against repositories and operates a bounded
model-token / funding proxy that handles real money. We take security seriously and welcome
responsible disclosure.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue or PR.

- **Preferred:** GitHub private vulnerability reporting — the repository's **Security** tab →
  **Report a vulnerability** (GitHub Security Advisories).
- We aim to acknowledge within 3 business days and to share a remediation timeline after triage.

Include: the affected component, reproduction steps, impact, and any proof-of-concept.

## Scope

**In scope**
- The agent execution + capability system (`packages/`, `scripts/`, `.github/workflows/`): privilege
  escalation, any path that lets an agent merge or land unreviewed code (defeating the
  `code:review`/`code:propose` permission split or branch protection), secret/token exfiltration, and
  `pull_request_target` / fork escalation in the workflows.
- The model-token / funding proxy (`services/agent-model-proxy`): auth bypass, minting tokens beyond
  their bounds, spend-cap bypass, fund manipulation, webhook-signature bypass, storefront injection.

**Out of scope**
- Vulnerabilities in third-party services (GitHub, the model provider, Cloudflare).
- Issues requiring a compromised maintainer machine or admin credentials.
- Self-XSS, or missing hardening headers without demonstrated impact.

## Trust model

The intended trust boundaries are documented in `docs/SPEC.md#capabilities` (agents act with
capability-scoped tokens; the merge boundary is the `code:review`/`code:propose` split + native
auto-merge — no agent can merge) and the proxy's abuse/spend model in
`services/agent-model-proxy/README.md`. Reports that violate those boundaries are especially valuable.

## Operating it yourself

open-autonomy is provided **AS-IS** (Apache-2.0, no warranty). If you deploy the agent system or the
funding proxy, **you** are responsible for the secrets, spend, and repository access you grant it.
