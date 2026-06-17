Implemented the docs-only OSS-readiness fix.

- Updated the three cookbook example READMEs so they explicitly describe the repos as pushable standalone demos and link to local `docs/ROADMAP.md`.
- Added a root-roadmap pointer to each cookbook roadmap doc.
- Clarified release evidence in [docs/RELEASE.md](/home/runner/work/open-autonomy/open-autonomy/docs/RELEASE.md) and [docs/PROOF_LEDGER.md](/home/runner/work/open-autonomy/open-autonomy/docs/PROOF_LEDGER.md) so `release-dogfood` points at committed artifacts.

Verification:
- `git diff --check`
- targeted `rg` checks for the new wording and links

Artifacts written:
- [.agent-run/out/task/artifacts/pr.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md)
- [.agent-run/out/task/artifacts/result.json](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json)
- [.agent-run/out/task/artifacts/transcript.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md)

I did not run the full Bun check suite because this change is documentation-only.