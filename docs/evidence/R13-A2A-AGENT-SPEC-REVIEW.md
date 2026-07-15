# R13 independent skeptical review

R13 was reviewed after implementation against the protocol, security, refinement, interoperability, and evolution obligations in the runtime lens audit. The reviewer exercised exact A2A 0.3 JSON-RPC envelopes, task/context identity, streaming artifact closure, file/data/text union preservation, Agent Card endpoint and skill identity, Agent Spec graph authorization, and SSRF handling.

The review found and repaired ambiguous request/response envelopes, unsafe numeric IDs, task and context drift in history, artifact updates after `lastChunk`, inactive-union field loss, expanded IPv4-mapped IPv6 bypasses, duplicate skill identifiers, truncated derived identities, and empty or duplicate signed authorization fields. Tests retain these counterexamples as attacks.

Evidence at closure:

- `bun test packages/core/src/organization-a2a-agent-spec.test.ts`: 16 passed, 100 assertions.
- `bunx tsc -p tsconfig.json --noEmit`: passed.
- `git diff --check`: passed for the scoped implementation.

No reproducible R13 blocker remained after remediation.
