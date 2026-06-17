Implemented a small docs-only change for the self-hosted fleet scaffold.

What changed:
- Updated [templates/self-driving-repo/README.md](/home/runner/work/open-autonomy/open-autonomy/templates/self-driving-repo/README.md) to explicitly call out repository variables, secrets, and a first-issue flow.
- Added a dedicated `First Issue Flow` section to [templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md](/home/runner/work/open-autonomy/open-autonomy/templates/self-driving-repo/docs/PUBLIC_AGENT_PRODUCTION_ROLLOUT.md).

Verification:
- Scaffoled the template into `/tmp/open-autonomy-scaffold-smoke`.
- Ran `bun test scripts/open-autonomy-fleet.test.ts` in the scaffolded repo successfully.

Artifacts written:
- [pr.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/pr.md)
- [result.json](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/result.json)
- [transcript.md](/home/runner/work/open-autonomy/open-autonomy/.agent-run/out/task/artifacts/transcript.md)