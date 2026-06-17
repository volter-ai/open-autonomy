## Summary

- Updated the three cookbook example READMEs so they explicitly describe the repos as pushable standalone demos and link to their local `docs/ROADMAP.md`.
- Added a root-roadmap pointer to each cookbook roadmap doc so the example docs clearly link back to the canonical roadmap path.
- Tightened release documentation so `release-dogfood` evidence is described in terms of committed artifacts and the release checklist.

## Tests

- `git diff --check`
- `rg -n "pushable standalone repo|Root roadmap:|committed release checklist" examples/docs-only examples/library examples/small-app docs/RELEASE.md docs/PROOF_LEDGER.md`
