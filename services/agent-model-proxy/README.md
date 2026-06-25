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

## Funding: a tree of accounts

Funding is a **tree of accounts** (every repo slug + named roots like `volter`). An account's spendable
`balance = granted_in − granted_out − consumed`, on three operations:

- **mint** — new credits enter at a node (real money). The only thing that increases the total.
- **grant** — credits move between accounts (transfer; conserves the total).
- **consume** — agent spend leaves the system (paid to the model provider), debiting that project's account.

Invariant: **total minted = total consumed + total still held.** Volter mints the root, open-autonomy
grants down to its testbeds, and each project spends its own balance and hard-stops at zero.

Endpoints:

- `POST /admin/accounts/:id/mint` — money in at `:id`. Body `{ amount_usd_cents, key?, sponsor? }`. Idempotent on `key`.
- `POST /admin/accounts/:id/grant` — transfer from `:id`. Body `{ to, amount_usd_cents, key? }`. Refused if `:id` lacks the balance.
- `POST /admin/accounts/:id/accrue` — mint `:id` with its active recurring sponsors' monthly total. Body `{ key }`. Also fired by the monthly cron.
- `GET /v1/accounts/:id` — public funding snapshot (balance, granted in/out, consumed, burn, runway, sponsors).
- `GET /v1/accounts/:id/runway.svg` — public, Camo-safe runway SVG for that account's README.
- `GET /v1/funding` + `GET /v1/funding/runway.svg` — aliases for `DEFAULT_FUNDING_ACCOUNT`.
- `POST /webhooks/github-sponsors` — GitHub Sponsors webhook (HMAC-verified, no token); maintains the
  `DEFAULT_SPONSOR_ACCOUNT`'s recurring-sponsor list and mints one-time gifts.
- `POST /admin/coupons` / `GET /admin/coupons` — issue/list **coupons** (bearer/deferred grants).
- `POST /v1/coupons/redeem` — redeem a coupon into an account. Body `{ code, account }`.

**Enforcement / rollout.** Spend is hard-stopped on the account balance only when
`ENFORCE_ACCOUNT_BALANCE=true`. Default is `false` so the model can be deployed and the tree
bootstrapped (mint root, grant to active repos) BEFORE the gate turns on — otherwise every unfunded
repo would stop the instant this ships. Bootstrap with `bun scripts/fund-bootstrap.ts`, verify balances,
then flip the var.

**Coupons** decouple granting funding from paying: issue a coupon for a sponsor's committed amount (with
their logo/tagline), hand them the code; redemption mints (or, with `from`, grants from an issuer
account) into the recipient and puts them on the README. Money is settled out-of-band.

```bash
# fund the tree (root + grants down), idempotent
MODEL_PROXY_URL=... MODEL_PROXY_ADMIN_TOKEN=... bun scripts/fund-bootstrap.ts
# issue + redeem a coupon
curl -X POST https://<proxy-host>/admin/accounts/volter/mint -H "x-admin-token: $TOK" -d '{"amount_usd_cents":50000}'
curl -X POST https://<proxy-host>/admin/coupons -H "x-admin-token: $TOK" \
  -d '{"amount_usd_cents":5000,"from":"volter-ai/open-autonomy","sponsor":{"login":"acme","name":"ACME Cloud","tagline":"infra for builders"}}'
curl -X POST https://<proxy-host>/v1/coupons/redeem -d '{"code":"SPON-XXXX-XXXX-XXXX","account":"volter-ai/some-project"}'
```

GitHub Sponsors funding needs **no GitHub token**: set `GITHUB_SPONSORS_WEBHOOK_SECRET`, add the webhook
in the org's Sponsors dashboard (URL `/webhooks/github-sponsors`, JSON, same secret); the monthly cron
(`[triggers] crons`) accrues recurring sponsorships (GitHub sends no per-renewal event).

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
bunx wrangler secret put OPENROUTER_API_KEY        # the ONLY provider key — all model spend routes here
bunx wrangler secret put GITHUB_SPONSORS_WEBHOOK_SECRET
```

**Single provider.** Every model settles through OpenRouter — it speaks **both**
wires, so the proxy shares its native routes on each side: the Anthropic
`/v1/messages` (→ OpenRouter `/api/v1/messages`) and the OpenAI
`/v1/chat/completions` (→ OpenRouter `/api/v1/chat/completions`). A `vendor/slug`
id (e.g. `deepseek/deepseek-v4-flash`) passes through; a bare id is mapped to its
vendor slug (`gpt-4o` → `openai/gpt-4o`, `claude-sonnet-4-6` →
`anthropic/claude-sonnet-4-6`). OpenRouter reports the real cost and the proxy
settles against it, reserving `OPENROUTER_RESERVE_USD_PER_MTOK` (default 30) up
front and truing it down; a price-table entry only tightens the reservation.

Routing everything through one **prepaid** provider is deliberate: the loaded
OpenRouter credit balance is the hard ceiling on all model spend — the one limit a
compromised proxy can't raise (it lives at OpenRouter, not in the worker). There is
no first-party `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` anymore; delete them from the
Cloudflare secrets if previously set.

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
