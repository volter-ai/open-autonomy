# Acceptable Use Policy

> **Owner:** [OWNER] · **Effective:** [DATE] · **Review:** annually (CC1).

## Purpose
Define acceptable use of [ORG]'s systems, repositories, and the autonomous fleet.

## Policy
- Use access only for authorized [ORG] purposes and at least privilege.
- **Protect credentials.** Never share, hardcode, or commit secrets/tokens. Use the approved secret stores.
  Enable MFA on all accounts.
- **Protect data.** Handle data per its classification (`data-classification-and-retention-policy.md`); keep
  customer data and PII out of issues, PRs, and code.
- **Don't subvert controls.** Do not attempt to bypass branch protection, the merge boundary, the human gate,
  or evidence collection. Report weaknesses via `SECURITY.md`.
- **Devices.** Maintainer machines that hold admin/provisioning credentials must be kept patched, encrypted,
  and screen-locked.
- **Reporting.** Report suspected incidents immediately per `incident-response-policy.md`.

## Enforcement
Violations are handled by [OWNER] and may result in access revocation. Acknowledged by all personnel at
onboarding (`hr-security-policy.md`).
