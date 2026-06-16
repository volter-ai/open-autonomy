# Agent Model Proxy

Cloudflare Worker for public issue-agent runs.

It is intentionally separate from the twin packages. Twins emulate the app's
vendor world; this service mints bounded model tokens and protects sponsor
spend while GitHub Actions runs semi-untrusted agents.

## API

- `GET /healthz`
- `POST /admin/runs/mint`
- `POST /admin/runs/:run_id/revoke`
- `GET /admin/runs/:run_id`
- `GET /v1/runs/:run_id`
- `POST /anthropic/v1/messages`
- `POST /openai/v1/chat/completions`
- `POST /openai/v1/responses`

Admin routes require:

```text
X-Admin-Token: $AGENT_PROXY_ADMIN_TOKEN
```

Model routes require:

```text
Authorization: Bearer $MODEL_PROXY_TOKEN
```

## Secrets

```bash
bunx wrangler secret put AGENT_PROXY_ADMIN_TOKEN
bunx wrangler secret put AGENT_PROXY_HMAC_SECRET
bunx wrangler secret put ANTHROPIC_API_KEY
bunx wrangler secret put OPENAI_API_KEY
```

`MODEL_PRICES_JSON` should be set for production so model pricing can be
updated without code changes. Shape:

```json
{
  "claude-sonnet-4-6": { "provider": "anthropic", "input_usd_per_mtok": 3, "output_usd_per_mtok": 15 },
  "gpt-5-mini": { "provider": "openai", "input_usd_per_mtok": 0.25, "output_usd_per_mtok": 2 }
}
```

The built-in table is only a deployment bootstrap. Keep production pricing in
Worker vars.

The fallback table lives in `src/model-prices.ts`. Current defaults are based
on the public provider pricing pages:

- OpenAI API pricing: https://openai.com/api/pricing/
- Anthropic Claude API pricing: https://docs.anthropic.com/en/docs/about-claude/pricing

## Spend And Rate Limits

The proxy enforces limits in two layers:

- `RunBudget` Durable Object: per-run spend, request count, revocation, and
  immutable run contract.
- `LimitLedger` Durable Object: global daily spend plus active/daily run limits
  by actor, repo, and issue.

Default Worker vars:

```text
MAX_RUN_USD_CENTS=500
MAX_RUN_REQUESTS=200
MAX_ACTIVE_RUNS_GLOBAL=10
MAX_ACTIVE_RUNS_PER_REPO=3
MAX_ACTIVE_RUNS_PER_ACTOR=1
MAX_RUNS_PER_REPO_PER_DAY=500
MAX_RUNS_PER_ACTOR_PER_DAY=200
MAX_RUNS_PER_ISSUE_PER_DAY=50
MAX_GLOBAL_DAILY_USD_CENTS=5000
```

`/admin/runs/mint` refuses requested per-run caps above `MAX_RUN_USD_CENTS` or
`MAX_RUN_REQUESTS`. Provider calls reserve against both `RunBudget` and
`LimitLedger`; if either reservation fails, the request does not reach the
provider.

Admin operators can inspect the current ledger without exposing run tokens:

```bash
curl -H "x-admin-token: $AGENT_PROXY_ADMIN_TOKEN" \
  "$MODEL_PROXY_URL/admin/limits/status"
```

The response includes the UTC `day_key`, active run counters, daily run counters
by actor and issue, and global consumed/reserved cents.

## Local Check

```bash
bun run check:agent-proxy
```
