# Change Management Policy

> **Owner:** [OWNER] · **Effective:** [DATE] · **Review:** annually (CC8).

## Purpose
Ensure every change to systems and code is reviewed, tested, and authorized before it lands — and that the
record proves it.

## Policy
- **All changes go through a pull request.** Direct push to `main` is blocked by branch protection (C5).
- **Independent review is mandatory.** An agent change is verified by an independent reviewer that posts the
  `agent-review` status; the proposer cannot self-approve (C2, merge boundary).
- **Required checks must pass.** Native auto-merge lands a PR only when the required checks are green
  (`ci`, `agent-review`, `human-approval` — C4/C5).
- **Sensitive changes require a human.** PRs touching human-required paths (workflows, the control layer,
  `compliance/`, the OA harness) require a maintainer's per-head-SHA Approve via the `human-approval` gate.
- **Quality gates.** Supply-chain integrity (C7), SAST (C8), and dependency review (C9) run on changes.
- **Emergency changes** still go through a PR; if expedited, [OWNER] documents the justification and a
  retrospective review within [N] business days.

## Code provenance
Commits carry DCO sign-off (`git commit -s`). *(Cryptographic commit signing is a planned hardening — see the
profile README C6; until then DCO is the compensating control.)*

## Evidence
Merged-PR history (each merge has green required checks + review), the `human-approval` status records, and
the `recent-workflow-runs` / `branch-protection` snapshots on the `compliance-evidence` branch.
