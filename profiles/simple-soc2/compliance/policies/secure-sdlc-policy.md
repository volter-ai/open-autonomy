# Secure SDLC Policy

> **Owner:** [OWNER] · **Effective:** [DATE] · **Review:** annually (CC7, CC8, Processing Integrity).

## Purpose
Build security and integrity into the software-delivery lifecycle so only reviewed, passing, intended code
ships.

## Policy
- **Work is tracked.** Every change traces to an issue with acceptance criteria + evidence
  (`standards/issue-and-evidence.md`).
- **Review + gates before merge.** Independent review (`agent-review`), required CI, and the human gate
  (`change-management-policy.md`, C2/C4/C5). This is also the Processing-Integrity guarantee: nothing merges
  without green checks + review.
- **Static analysis.** CodeQL (C8) runs on changes; findings are triaged.
- **Supply chain.** Dependencies resolve from the registry with integrity hashes and pass `bun audit`
  (C7); dependency review blocks newly-vulnerable deps (C9); an SBOM is produced (C10); Actions are
  SHA-pinned and Dependabot-maintained (C11).
- **Secrets never in code** (`access-control-policy.md`); secret scanning + push protection on (C12).
- **No bypassing controls.** Weakening a control is a human-required change (`standards/compliance.md`).

## Evidence
Issue/PR records with ACs + evidence, check runs, CodeQL/Dependabot findings, SBOM artifacts, the
control-state snapshots.
