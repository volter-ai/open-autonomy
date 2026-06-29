# Compliance standard (read by develop + reviewer)

This repo ships a deterministic SOC 2 control layer. When you implement or review a change, treat these as
invariants — a PR that weakens a control is human-required, never auto-merged.

1. **Don't defeat the merge boundary.** No change may give one actor both `code:propose` and `code:review`,
   or grant `code:merge`. The reviewer posts `agent-review`; native auto-merge lands the PR.
2. **Don't weaken branch protection or the gates.** `provision.json` (required checks, `enforce_admins`,
   required reviews), the control workflows under `.github/workflows/`, and the `human-approval` gate are
   change-managed (human-required paths). Edits need a maintainer Approve.
3. **Don't bypass the controls' evidence.** `evidence-collect.yml` snapshots control state to the
   `compliance-evidence` branch; don't disable it or write to that branch by hand.
4. **Respect data handling.** Don't commit secrets; the transcript redactor strips token shapes but not all
   PII — keep customer data out of issue/PR bodies. Retention is enforced by `retention.yml`.
5. **Keep the policy tree honest.** If a change alters how a control actually works, update the mapped policy
   in `compliance/policies/` and `compliance/control-matrix.md` in the same PR.

The authoritative, machine-and-auditor-readable mapping of control → TSC → enforcement → evidence is
`compliance/control-matrix.md`.
