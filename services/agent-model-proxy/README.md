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

Sponsorship funding pool (org-wide):

- `POST /admin/treasury/credit` — add funding directly. Body `{ amount_usd_cents, key?, sponsors? }`.
  Idempotent on `key`.
- `POST /admin/treasury/accrue` — credit this month's active recurring sponsorship total. Body `{ key }`
  (e.g. `2026-06`). Idempotent; also fired by the monthly cron.
- `POST /admin/treasury/budget` — set the pool to an absolute amount (ops correction). Body `{ budget_usd_cents }`.
- `POST /webhooks/github-sponsors` — GitHub Sponsors webhook (HMAC-verified; no token). Maintains the
  active recurring-sponsor list (created / tier_changed / edited / cancelled) and credits one-time gifts.
- `POST /admin/coupons` / `GET /admin/coupons` — issue/list **sponsorship coupons** (admin). Body
  `{ amount_usd_cents, sponsor?: {login,name,tagline,url,avatar_url}, code?, expires_at? }`.
- `POST /v1/coupons/redeem` — redeem a coupon (public; the code is the bearer credential). Credits the
  pool by the coupon amount and attributes the sponsor for the README. One-time, idempotent per code.
- `GET /v1/funding` — public funding snapshot (balance, burn, runway days, sponsors).
- `GET /v1/funding/runway.svg` — public, Camo-safe SVG for embedding the runway in a README.

The pool is **org-wide**: once funded, cumulative spend across all repos hard-stops with
`sponsorship_pool_exhausted` when it reaches the funded amount. Until the first credit lands the pool is
unfunded-but-open (gate disabled), preserving prior behavior.

Funding it from GitHub Sponsors needs **no GitHub token**:

1. Set the secret `GITHUB_SPONSORS_WEBHOOK_SECRET` (`bunx wrangler secret put GITHUB_SPONSORS_WEBHOOK_SECRET`).
2. In the org's Sponsors dashboard, add a webhook → URL `https://<proxy-host>/webhooks/github-sponsors`,
   content-type `application/json`, the same secret. This keeps the active-sponsor list current.
3. The monthly cron (`[triggers] crons` in `wrangler.toml`) calls `accrue` on the 1st of each month to
   credit the active recurring total — GitHub sends no per-renewal event, so this is the recurring path.

One-time sponsorships are credited the moment the webhook arrives.

**Coupons** are the payment-rail-free path: issue a coupon for a sponsor's committed amount (with their
logo/tagline), hand them the code, and redemption credits the pool and puts them on the README — the
actual money is settled however you arrange it out-of-band. Issue one with:

```bash
curl -X POST https://<proxy-host>/admin/coupons -H "x-admin-token: $AGENT_PROXY_ADMIN_TOKEN" \
  -d '{"amount_usd_cents":5000,"sponsor":{"login":"acme","name":"ACME Cloud","tagline":"infra for builders","url":"https://acme.example"}}'
# → { "ok": true, "coupon": { "code": "SPON-XXXX-XXXX-XXXX", ... } }
curl -X POST https://<proxy-host>/v1/coupons/redeem -d '{"code":"SPON-XXXX-XXXX-XXXX"}'
```

Embed the runway in a README:

```markdown
[![funding](https://<proxy-host>/v1/funding/runway.svg)](https://github.com/sponsors/<org>)
```

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
