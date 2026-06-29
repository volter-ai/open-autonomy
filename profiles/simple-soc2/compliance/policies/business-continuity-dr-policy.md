# Business Continuity & Disaster Recovery Policy

> **Owner:** [OWNER] · **Effective:** [DATE] · **Review:** annually; restore test ≥ annually (Availability).

## Purpose
Ensure the installation can recover from disruption within defined objectives.

## Objectives
- **RTO** (max downtime): [e.g. 24h]. **RPO** (max data loss): [e.g. 24h]. Set these to your needs.

## Backups & recovery
- **Repository / code:** GitHub is the system of record; recoverable via clone + GitHub's own DR. The repo's
  full history (incl. the `compliance-evidence` branch) is distributed across every clone.
- **Compliance evidence:** the `compliance-evidence` branch is git-replicated; mirror it off-platform if your
  RPO requires it.
- **Model proxy / spend ledger:** held by the proxy subprocessor — its backup/DR is **out of this repo's
  control** and must be confirmed with the proxy operator (`subprocessors.md`; risk R7). A proxy outage stops
  agent runs but does not lose repo data.
- **Secrets:** re-provisionable; not backed up in plaintext. Maintain a recovery runbook for re-minting them.

## Availability monitoring
`heartbeat.yml` (C17) detects a stopped fleet and raises an alert issue, decoupled from the PM.

## Testing
Perform and document a recovery test (e.g. restore from a fresh clone + re-provision) at least annually.

## Evidence
This policy with RTO/RPO set, the dated restore-test record, heartbeat alert history.
