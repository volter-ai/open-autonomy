# Incident Response Policy

> **Owner:** [OWNER] · **Effective:** [DATE] · **Review:** annually; tabletop ≥ annually (CC7).

## Purpose
Detect, respond to, contain, and learn from security incidents.

## Detection
- Vulnerability reports arrive privately via `SECURITY.md` (GitHub private vulnerability reporting).
- Automated signals: CodeQL / Dependabot / secret-scanning alerts (Security tab), supply-chain gate failures,
  and the liveness watchdog (`heartbeat.yml`, C17) for availability incidents.

## Severities
| Sev | Definition | Target ack | Target mitigation |
|---|---|---|---|
| SEV1 | Active breach / secret exposure / unreviewed code merged | 1 hour | 24 hours |
| SEV2 | Exploitable vuln, no active exploitation | 1 business day | [N] business days |
| SEV3 | Low-impact / hardening gap | 3 business days | next cycle |

## Process
1. **Triage & classify** (severity, scope, data involved). 2. **Contain** — e.g. set
   `PUBLIC_AGENT_REPO_PAUSED=true` (kill-switch), revoke exposed tokens, lock branches. 3. **Eradicate &
   recover** (`business-continuity-dr-policy.md`). 4. **Notify** affected parties / customers per contract +
   law. 5. **Post-incident review** with root cause and corrective actions; update the risk register.

## Roles
[OWNER] is incident commander; maintainers execute containment. Maintain an up-to-date contact list.

## Exercise
Run at least one tabletop exercise during each audit window and record it.

## Evidence
Incident tickets, the post-incident reviews, the tabletop record, alert history.
