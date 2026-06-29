# Information Security Policy

> **Owner:** [OWNER] · **Approved by:** [APPROVER] · **Effective:** [DATE] · **Review:** annually (CC1).

## Purpose
Establish [ORG]'s commitment to protecting the confidentiality, integrity, and availability of the systems
and data it operates — including the autonomous software fleet in this repository.

## Scope
All [ORG] personnel, contractors, systems, repositories, and subprocessors involved in operating this
installation.

## Policy
- Security is owned at the leadership level; [OWNER] is accountable for this program.
- All other policies in `compliance/policies/` are subordinate to this one and reviewed on the same cadence.
- Controls are **deterministic and enforced by tooling**, not left to discretion (see `control-matrix.md`).
- Access follows least privilege (`access-control-policy.md`); changes follow `change-management-policy.md`.
- Risks are assessed at least annually (`risk-management-policy.md`); incidents follow
  `incident-response-policy.md`.
- Exceptions require [OWNER] written approval, a compensating control, and an expiry date.

## Roles
- **[OWNER]** — accountable for the program. **Maintainers** — operate the day-to-day controls.
  **All personnel** — comply with these policies and complete security awareness training (`hr-security-policy.md`).

## Evidence
Approved policy set (this tree), the control matrix, and the automated `compliance-evidence` branch.

## Review
Reviewed and re-approved at least annually and after any material change. Record the review date above.
