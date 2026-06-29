# Vendor / Subprocessor Management Policy

> **Owner:** [OWNER] · **Effective:** [DATE] · **Review:** annually + on each new vendor (CC9).

## Purpose
Ensure third parties that process [ORG]'s data meet [ORG]'s security bar.

## Policy
- Maintain a current subprocessor inventory (`compliance/subprocessors.md`).
- Before onboarding a vendor that processes [ORG] or customer data: review its **SOC 2 (or equivalent)
  report**, assess the data shared, risk-rank it, and sign a **Data Processing Agreement**.
- Re-review each subprocessor's report at least annually; track remediation of any noted exceptions.
- Removing or replacing a vendor follows `change-management-policy.md`.

## This stack's subprocessors
GitHub, the Open Autonomy **model proxy**, Cloudflare, OpenRouter, and the model provider(s) are the
processors of code-in-flight; npm is a read-only dependency source (integrity-enforced). The proxy →
OpenRouter → provider chain is the highest-risk path (your source code transits it) and the priority
vendor-review item. See `subprocessors.md` for the inventory and DPA status.

## Evidence
The inventory, collected vendor SOC 2 reports, signed DPAs, dated review records.
