# Contributing

`open-autonomy` is the OSS self-driving repository kit. This repo also runs its
own workflows, so changes to workflows, policy, proxy behavior, or publishing
rules should be treated as production changes.

## Setup

- Bun 1.3.10+
- Node 24-compatible GitHub Actions runtime

```bash
bun install
bun run check
```

## Development Loop

For GitHub agent changes:

```bash
bun run check:public-agent
```

For model-proxy changes:

```bash
bun run check:agent-proxy
```

Run the full local gate before pushing:

```bash
bun run check
```

Workflow-facing changes need a live GitHub Actions smoke after push. Record the
run id, result, and any blocker in the relevant issue or PR.

## Boundaries

- An agent job must not receive raw provider keys or model-proxy admin tokens; it holds only a
  token scoped to its declared capabilities.
- No single agent may hold both `code:review` (statuses:write — blesses) and `code:propose`
  (contents:write — pushes), so none can both write code and bless it; merging is GitHub native
  auto-merge, gated on `ci` + `agent-review`, and no agent holds `code:merge`.
- Workflow edits stay blocked (agents hold no workflows:write) unless explicitly changed by a
  human-owned policy update.
- Do not commit real API keys, tokens, cookies, private URLs, or customer data.
- Keep `volter-autonomy` paid-product code out of this OSS repository unless it
  is intentionally released as open source.

## Pull Requests

Keep changes focused, include tests for policy behavior, and describe any live
smoke that was run. Use signed commits when contributing upstream:

```bash
git commit -s
```
