# P13 ecosystem mapping decision record

Verified 2026-07-14 against primary specification sources. The pinned descriptor versions are Oracle Agent Spec
25.4.x, MCP 2025-06-18, A2A 0.3.0, CloudEvents 1.0.2, OpenTelemetry 1.58.x, CNCF Serverless Workflow 1.0.0, and
Rego/OPA 1.x. Provider component manifests use Open Autonomy's own `autonomy.component.v2` because none of those
standards spans provider topology, state authority, trust boundaries, operations, and economics.

Primary references: [Agent Spec 25.4.1](https://oracle.github.io/agent-spec/25.4.1/),
[MCP 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/),
[A2A 0.3.0](https://a2a-protocol.org/v0.3.0/specification/),
[CloudEvents 1.0.2](https://github.com/cloudevents/spec/tree/v1.0.2),
[OpenTelemetry specifications](https://opentelemetry.io/docs/specs/),
[Serverless Workflow 1.0.0](https://github.com/serverlessworkflow/specification/releases/tag/v1.0.0), and
[OPA policy language](https://www.openpolicyagent.org/docs/policy-language).

The decisions are semantic rather than popularity-based:

- Agent Spec is adapted for behaviors/components; it does not replace organizational roles, durable work, authority,
  budgets, or governance.
- MCP tool schemas embed cleanly. Resources and prompts are adapted because organizational memory and instruction
  authority have additional semantics.
- A2A cards describe remote implementations, tasks project to portable work only through a state relation, and
  message parts can embed in protocols.
- CloudEvents envelopes are preserved before semantic lifting; they do not establish event truth or organizational
  authority. OpenTelemetry trace context supplies observation provenance/correlation, not control causality.
- Serverless Workflow is a backend for finite control. Rego is an opaque, dialect-bound enforcement implementation.

`organization-ecosystem.test.ts` verifies mapping registry completeness, exact version rejection, a declared MCP
subset round trip, extension preservation/rejection, exact A2A losses, resource bounds, closed constructs, and the
separation of wire/schema/behavioral/semantic claims. The generic mapping envelope is not a native wire codec and
therefore makes no native wire-conformance claim.
