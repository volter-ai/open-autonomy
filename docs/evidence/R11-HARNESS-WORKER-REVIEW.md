# R11 independent skeptical review

R11 was independently attacked across organization semantics, context reconstruction, distributed execution, sandbox security, epistemic evidence, and harness interoperability. The review exercised real bubblewrap isolation, a live installed Codex JSONL CLI, an independent stateful process harness, concurrent duplicate delivery, dead-owner recovery, DNS rebinding, executable replacement between authorization and execution, cross-tenant session collision, adapter substitution, typed interactions, fencing, and evidence/usage substitution.

Remediation bound adapter protocol and implementation identities, made process effects atomic and interprocess-linearizable, staged byte-attested executables into private immutable execution paths, re-resolved network authority at effect time, persisted typed questions and exactly-once answers, bound artifacts/reports/usage to completed results and schemas, and made reconstruction independent of conversation memory.

Evidence at closure:

- `bun test packages/core/src/organization-harness-worker.test.ts`: 17 passed, 98 assertions, including live subprocess and sandbox attacks.
- `bunx tsc -p tsconfig.json --noEmit`: passed.
- `git diff --check`: passed for the scoped implementation.

No reproducible R11 blocker remained after remediation.
