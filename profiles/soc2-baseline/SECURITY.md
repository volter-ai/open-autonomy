# Security Policy

This repository runs an autonomous software-delivery fleet (Open Autonomy, `soc2-baseline` profile) and ships
a deterministic SOC 2 control layer. We take security seriously and welcome responsible disclosure.

## Reporting a vulnerability

Report security issues **privately** — do not open a public issue or PR.

- **Preferred:** GitHub private vulnerability reporting — the repository's **Security** tab →
  **Report a vulnerability**.
- We aim to acknowledge within **3 business days** and to share a remediation timeline after triage, per
  `compliance/policies/incident-response-policy.md`.

Include: affected component, reproduction steps, impact, and any proof-of-concept.

## Scope

**In scope**
- The agent execution + capability system (`.github/workflows/`, `scripts/`): privilege escalation, any path
  that lets an agent merge or land unreviewed code (defeating the `code:review`/`code:propose` permission
  split or branch protection), secret/token exfiltration, `pull_request_target` / fork escalation.
- The compliance control layer (`compliance/`, the control workflows): a way to defeat a control while it
  still reports green (e.g. evidence tampering, gate bypass).

**Out of scope**
- Vulnerabilities in third-party services (GitHub, Cloudflare, the model proxy/provider) — report to them;
  they are tracked as subprocessors in `compliance/subprocessors.md`.
- Issues requiring a compromised maintainer machine or admin credentials.

## Trust model

Agents act with capability-scoped tokens; the merge boundary is the `code:review`/`code:propose` split +
native auto-merge (no agent can merge). Sensitive paths require a maintainer's per-head-SHA approval via the
`human-approval` gate. See `compliance/control-matrix.md` for the full control set and where each is enforced.

## Operating it

Provided **AS-IS** (Apache-2.0, no warranty). If you deploy this fleet, **you** own the secrets, spend, and
repository access you grant it, and **you** own the SOC 2 organizational program (`compliance/`) — the
profile makes the technical controls default-ready; it cannot run your company's program for you.
