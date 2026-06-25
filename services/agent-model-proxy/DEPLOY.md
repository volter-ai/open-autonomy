# Deploying the agent model proxy — security model + go-live runbook

The proxy holds the crown jewels (admin token, HMAC secret, provider keys, the funding ledger). This
document is the safe path to automated deploys. **It is parked until deliberately armed** — see "Flip to
safe" below. Nothing here deploys anything on its own.

## Security model (why this is safe)

A funnel where each layer fails differently, plus a containment backstop outside the trust loop:

- **Allowlist wall:** deploy fires only on a human-cut `deploy-v*` tag. A repo ruleset
  (`deploy-tags-admin-only`) restricts create/update/delete of `deploy-v*` tags to **admins**, so the
  fleet's CI agents (write role, GITHUB_TOKEN) cannot create one — and a GITHUB_TOKEN-pushed tag wouldn't
  trigger the workflow anyway (Actions anti-recursion).
- **Human gate:** the `production` environment admits only `deploy-v*` tags and requires a maintainer to
  approve each deployment; `can_admins_bypass=false` so the approval can't be skipped.
- **Trusted build:** the deployed commit is human-promoted (the tag) and human-reviewed (`services/**` is a
  `human_required_path`), so no build/publish split is needed. wrangler is pinned in the lockfile and
  integrity-verified by `check:security`; egress is locked to npm + Cloudflare so the deploy token can't be
  exfiltrated. The token is scoped to Workers-edit on this one worker, so a leak can only redeploy it.
- **Containment backstop (the only control outside the loop — agents are funded *by* the proxy they edit):**
  hard provider-side spend caps + instant Cloudflare rollback bound the worst case to "a few dollars + a
  revert."

The only GitHub secret the system needs is the Cloudflare deploy token. Everything else is keyless.

## What is already built + live

- `.github/workflows/deploy.yml` — tag-triggered, egress-locked, pinned wrangler, `environment: production`.
- `production` environment — required reviewer (`yueranyuan`), `deploy-v*` tag-only policy, no admin bypass.
- `deploy-tags-admin-only` ruleset — only admins create `deploy-v*` tags.
- `CLOUDFLARE_ACCOUNT_ID` repo variable — set.
- GitHub secret-scanning + push-protection — enabled.
- Supply-chain + workflow gates in CI (`check:security`, zizmor, CodeQL, Dependabot).

## ⚠️ Load-bearing precondition (decide before arming)

The environment approver is `yueranyuan`, and **`yueranyuan`'s full-scope `gh` token (`repo`+`workflow`+
`admin:org`) lives in this machine's keyring**, used by every local Claude/termfleet session. So a local
session can both push a `deploy-v*` tag (admin → bypasses the ruleset) and approve the deployment. The
GitHub gates defend against CI-side agents and external actors, **not** against a rogue/injected *local*
session holding that token.

To make the human gate robust against that, the approver credential must live **off this machine** — e.g.
approve only from GitHub mobile / a separate device, or use a second maintainer / a dedicated approver
account whose token never touches the fleet machine. If the local fleet sessions are trusted, the current
setup is acceptable — but that is the real trust boundary, so make it a conscious choice.

## Flip to safe (the go-live checklist — only when ready)

1. **Resolve the approver-credential question above.**
2. **Set hard provider-side spend caps** (OpenAI + OpenRouter dashboards). Check current monthly spend
   first and set the cap safely above it — the proxy is serving the live fleet, so a too-low cap breaks it.
3. **Mint a scoped Cloudflare API token:** dashboard → My Profile → API Tokens → Create → "Edit Cloudflare
   Workers" template, narrowed to this account (`0ed031cc83dad4ad191efba7076074d0`) and ideally just the
   `volter-agent-model-proxy` worker. Nothing else.
4. **Set it as the environment secret** (write-only; never stored locally):
   `gh secret set CLOUDFLARE_API_TOKEN --env production -R volter-ai/open-autonomy`
5. **Cut the first tag (admin only)** and watch it:
   `git tag deploy-v0.1.x && git push origin deploy-v0.1.x`
   → the run pauses on the `production` gate → approve (GitHub UI → Actions → run → Review deployments) →
   confirm the deploy succeeds.
6. **Test rollback:** `cd services/agent-model-proxy && bunx wrangler rollback` (or dashboard → Workers →
   Deployments → Rollback). Confirm the worker serves the prior version.

Until step 4 sets `CLOUDFLARE_API_TOKEN`, `deploy.yml` cannot deploy — it is inert by construction.
