# R15 independent skeptical review

R15 was independently reviewed against distributed, operational, human-interaction, and epistemic obligations using a real isolated Hermes 0.18.2 installation. The review exercised manifest/source/executable pinning, durable CAS and fences, dispatch mutation verification, Slack replay/equivocation and typed decisions, R11 launch receipts, stale completion rejection, authenticated event cursors, restartable teardown, backup policy, and remote-upstream drift.

The reviewer repaired moving remote-main identity coupling, resetting dispatcher fences, reported spawn without native mutation, Slack input/output equivocation, unbound decisions, non-durable worker launches, stale completions, incomplete event validation, non-restartable teardown, false permanent health failure, and optional manifests. Counterexamples remain regression tests.

Evidence at closure:

- Deterministic suite: 9 passed, 144 assertions, live test skipped by default.
- Opt-in real Hermes suite: 10 passed, 146 assertions, including deploy/create/observe/health/teardown.
- `bunx tsc -p tsconfig.json --noEmit`: passed.
- `git diff --check`: passed for the scoped implementation.

No reproducible R15 blocker remained after remediation.
