import { handleAnthropic } from './anthropic.js';
import { limitsFromEnv } from './config.js';
import { error, json, methodNotAllowed, parseJson } from './errors.js';
import { verifyGitHubOidcToken } from './github-oidc.js';
import { isStale, syncAllStale, syncProfile } from './github-sync.js';
import { LimitLedger, LimitLedgerClient, type Moderation, type Sponsor, type Tier, type AccountProfile } from './limit-ledger.js';
import { handleOpenAI } from './openai.js';
import { LOGO_SVG, renderExplore, renderProject, renderRedeemResult } from './platform-html.js';
import { RunBudget, RunBudgetClient } from './run-budget.js';
import { renderRunwaySvg } from './runway-svg.js';
import { handleSponsorsWebhook } from './sponsors-webhook.js';
import { extractBearer, extractModelToken, signRunToken, verifyRunToken } from './token.js';
import type { Env, MintRunRequest, RunClaims } from './types.js';

export { LimitLedger, RunBudget };

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (err) {
      console.error('[agent-model-proxy] unhandled error', err);
      return error('internal_error', 500);
    }
  },

  // Monthly cron (see [triggers] in wrangler.toml): mint the sponsor account with its active recurring
  // sponsorships. Idempotent on the YYYY-MM key. This is the recurring-funding path GitHub's webhook
  // can't provide (no per-renewal event).
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    const key = new Date(event.scheduledTime).toISOString().slice(0, 7); // YYYY-MM (UTC)
    const account = sponsorAccount(env);
    const result = await new LimitLedgerClient(env.LIMITS).accrue(account, key);
    console.log('[agent-model-proxy] monthly accrue', account, key, JSON.stringify(result));
    // Refresh every public project's GitHub-synced display metadata.
    const synced = await syncAllStale(env);
    console.log('[agent-model-proxy] profile sync', synced);
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/healthz') return new Response('ok');
  if (path === '/favicon.svg') return new Response(LOGO_SVG, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'max-age=86400' } });
  if (path === '/favicon.ico') return new Response(null, { status: 204 });

  // ---- Funding platform (server-rendered HTML storefront) ----
  // Explore grid: every discovered public project. Stale profiles refresh in the background.
  if (path === '/') {
    if (req.method !== 'GET') return methodNotAllowed();
    const { entries } = await new LimitLedgerClient(env.LIMITS).directory();
    for (const e of entries) if (e.is_project && isStale(e.profile.synced_at)) ctx.waitUntil(syncProfile(env, e.account));
    return html(renderExplore(entries));
  }
  // Coupon redemption form (must precede the project-page match — greedy capture).
  const redeemForm = path.match(/^\/p\/(.+)\/redeem$/);
  if (redeemForm) {
    if (req.method !== 'POST') return methodNotAllowed();
    const account = decodeURIComponent(redeemForm[1]);
    const form = await req.formData();
    const code = String(form.get('code') ?? '').trim();
    if (!code) return html(renderRedeemResult(account, false, 'Enter a coupon code.'), 400);
    const result = await new LimitLedgerClient(env.LIMITS).couponRedeem(code, account);
    const message = result.ok
      ? `Added $${((result.amount_usd_cents ?? 0) / 100).toFixed(2)} to ${account}.`
      : redeemMessage(result.error);
    return html(renderRedeemResult(account, result.ok, message), result.ok ? 200 : 400);
  }
  // Creator page.
  const projectPage = path.match(/^\/p\/(.+)$/);
  if (projectPage) {
    if (req.method !== 'GET') return methodNotAllowed();
    const account = decodeURIComponent(projectPage[1]);
    const view = await new LimitLedgerClient(env.LIMITS).project(account);
    // Don't render a fake, zeroed-out page for an account that has never been seen.
    if (!view.found) return html(renderRedeemResult(account, false, `No project found for ${account}.`), 404);
    if (view.is_project && isStale(view.profile.synced_at)) ctx.waitUntil(syncProfile(env, account));
    return html(renderProject(view));
  }

  if (path === '/admin/runs/mint') return mintRun(req, env);
  if (path === '/v1/runs/mint') return mintRunOidc(req, env);
  if (path === '/admin/limits/status') {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (req.method !== 'GET') return methodNotAllowed();
    return json(await new LimitLedgerClient(env.LIMITS).status());
  }
  // GitHub Sponsors webhook: maintains the sponsor account's active-sponsor list (no token; HMAC-verified).
  if (path === '/webhooks/github-sponsors') return handleSponsorsWebhook(req, env, sponsorAccount(env));

  // Account funding ops (admin). mint = money in at a node; grant = transfer down the tree; accrue =
  // mint the month's recurring sponsorships.
  const acctOp = path.match(/^\/admin\/accounts\/([^/]+)\/(mint|grant|accrue)$/);
  if (acctOp) {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (req.method !== 'POST') return methodNotAllowed();
    const ledger = new LimitLedgerClient(env.LIMITS);
    const id = decodeURIComponent(acctOp[1]);
    const body = parseJson<{ amount_usd_cents?: number; to?: string; key?: string; sponsor?: Sponsor }>(await req.text()) ?? {};
    if (acctOp[2] === 'mint') {
      if (typeof body.amount_usd_cents !== 'number') return error('invalid_request');
      return json(await ledger.mint(id, body.amount_usd_cents, body.key, body.sponsor));
    }
    if (acctOp[2] === 'grant') {
      if (!body.to || typeof body.amount_usd_cents !== 'number') return error('invalid_request');
      const result = await ledger.grant(id, body.to, body.amount_usd_cents, body.key);
      return json(result, { status: result.ok ? 200 : 400 });
    }
    if (!body.key) return error('invalid_request'); // accrue
    return json(await ledger.accrue(id, body.key));
  }

  // Account curation (admin): set the operator-owned profile bits, moderate (ban/hide/pin), or force
  // a GitHub metadata sync now instead of waiting for the cron / next view.
  const acctAdmin = path.match(/^\/admin\/accounts\/([^/]+)\/(profile|moderate|sync)$/);
  if (acctAdmin) {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (req.method !== 'POST') return methodNotAllowed();
    const id = decodeURIComponent(acctAdmin[1]);
    const ledger = new LimitLedgerClient(env.LIMITS);
    if (acctAdmin[2] === 'sync') return json({ ok: await syncProfile(env, id), account: id });
    const body = parseJson<{ profile?: Partial<AccountProfile>; goal_days?: number; tiers?: Tier[]; status?: Moderation; reason?: string; tagline_override?: string; cover_override?: string }>(await req.text()) ?? {};
    if (acctAdmin[2] === 'profile') return json(await ledger.setProfile(id, body.profile ?? {}, body.goal_days, body.tiers));
    if (!body.status) return error('invalid_request');
    return json(await ledger.moderate(id, body.status, body.reason, { tagline_override: body.tagline_override, cover_override: body.cover_override }));
  }

  // Sponsorship coupons: issue + list (admin). A coupon is a bearer grant; `from` makes it transfer
  // from that account's balance, otherwise it mints on redeem.
  if (path === '/admin/coupons') {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    const ledger = new LimitLedgerClient(env.LIMITS);
    if (req.method === 'GET') return json(await ledger.couponList());
    if (req.method !== 'POST') return methodNotAllowed();
    const body = parseJson<{ amount_usd_cents?: number; from?: string; sponsor?: Sponsor; code?: string; expires_at?: string }>(await req.text());
    if (!body || typeof body.amount_usd_cents !== 'number') return error('invalid_request');
    const result = await ledger.couponCreate(body as { amount_usd_cents: number; from?: string; sponsor?: Sponsor; code?: string; expires_at?: string });
    return json(result, { status: result.ok ? 200 : 409 });
  }

  // Redeem a coupon into an account (public — the code is the bearer credential).
  if (path === '/v1/coupons/redeem') {
    if (req.method !== 'POST') return methodNotAllowed();
    const body = parseJson<{ code?: string; account?: string }>(await req.text());
    if (!body?.code || !body.account) return error('invalid_request');
    const result = await new LimitLedgerClient(env.LIMITS).couponRedeem(body.code, body.account);
    if (result.ok) return json(result);
    const status = result.error === 'coupon_not_found' ? 404 : result.error === 'coupon_already_redeemed' ? 409 : 400;
    return json(result, { status });
  }

  // Autonomous project→project redistribution. The OIDC repo claim must equal the source account, so
  // a project can only spend its OWN balance; the ledger enforces the surplus-above-goal floor.
  const acctGrant = path.match(/^\/v1\/accounts\/(.+)\/grant$/);
  if (acctGrant) {
    if (req.method !== 'POST') return methodNotAllowed();
    const from = decodeURIComponent(acctGrant[1]);
    const oidc = await verifyGitHubOidcToken(env, extractBearer(req));
    if (!oidc) return error('auth_failed', 401);
    if (oidc.repository !== from) return error('forbidden_account', 403);
    const body = parseJson<{ to?: string; amount_usd_cents?: number }>(await req.text());
    if (!body?.to || typeof body.amount_usd_cents !== 'number') return error('invalid_request');
    const result = await new LimitLedgerClient(env.LIMITS).grantSurplus(from, body.to, body.amount_usd_cents);
    return json(result, { status: result.ok ? 200 : 402 });
  }

  // Public per-account funding status + runway badge.
  const acctRunway = path.match(/^\/v1\/accounts\/([^/]+)\/runway\.svg$/);
  if (acctRunway) return runwaySvg(env, decodeURIComponent(acctRunway[1]), req);
  const acctStatus = path.match(/^\/v1\/accounts\/([^/]+)$/);
  if (acctStatus) {
    if (req.method !== 'GET') return methodNotAllowed();
    return json(await new LimitLedgerClient(env.LIMITS).funding(decodeURIComponent(acctStatus[1])));
  }
  // Default-account aliases (the canonical README badge URL).
  if (path === '/v1/funding') {
    if (req.method !== 'GET') return methodNotAllowed();
    return json(await new LimitLedgerClient(env.LIMITS).funding(fundingAccount(env)));
  }
  if (path === '/v1/funding/runway.svg') return runwaySvg(env, fundingAccount(env), req);

  const adminRun = path.match(/^\/admin\/runs\/([^/]+)(?:\/(revoke))?$/);
  if (adminRun) {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    const runId = decodeURIComponent(adminRun[1]);
    if (adminRun[2] === 'revoke') {
      if (req.method !== 'POST') return methodNotAllowed();
      await new RunBudgetClient(env.RUNS, runId).revoke();
      await new LimitLedgerClient(env.LIMITS).complete(runId);
      return json({ ok: true, run_id: runId });
    }
    if (req.method !== 'GET') return methodNotAllowed();
    return json(await new RunBudgetClient(env.RUNS, runId).status());
  }

  const statusRun = path.match(/^\/v1\/runs\/([^/]+)$/);
  if (statusRun) {
    const claims = await authedClaims(req, env);
    if (!claims) return error('auth_failed', 401);
    const runId = decodeURIComponent(statusRun[1]);
    if (runId !== claims.run_id) return error('forbidden_run', 403);
    return json(await new RunBudgetClient(env.RUNS, runId).status());
  }

  const exchangeRun = path.match(/^\/v1\/runs\/([^/]+)\/exchange$/);
  if (exchangeRun) {
    if (req.method !== 'POST') return methodNotAllowed();
    return exchangeRunToken(req, env, decodeURIComponent(exchangeRun[1]));
  }

  // OIDC-gated revoke: the owning repo (proven via OIDC) may revoke its own run, so fleet repos
  // need no admin token for run cleanup. (Bounded tokens also expire on their own.)
  const revokeRun = path.match(/^\/v1\/runs\/([^/]+)\/revoke$/);
  if (revokeRun) {
    if (req.method !== 'POST') return methodNotAllowed();
    const oidc = await verifyGitHubOidcToken(env, extractBearer(req));
    if (!oidc) return error('auth_failed', 401);
    const runId = decodeURIComponent(revokeRun[1]);
    const status = await new RunBudgetClient(env.RUNS, runId).status() as { claims?: RunClaims | null };
    if (!status.claims || status.claims.repo !== oidc.repository) return error('forbidden_run', 403);
    await new RunBudgetClient(env.RUNS, runId).revoke();
    await new LimitLedgerClient(env.LIMITS).complete(runId);
    return json({ ok: true, run_id: runId });
  }

  const claims = await authedClaims(req, env);
  if (!claims) return error('auth_failed', 401);

  // Universal (native) routes: a stock provider SDK pointed at this host Just Works — Anthropic at
  // `/v1/messages`, OpenAI at `/v1/chat/completions` and `/v1/responses`. No prefix, no dialect.
  if (path === '/v1/messages') return handleAnthropic(req, env, claims, ctx);
  if (path === '/v1/chat/completions') return handleOpenAI(req, env, claims, ctx, '/v1/chat/completions');
  if (path === '/v1/responses') return handleOpenAI(req, env, claims, ctx, '/v1/responses');

  return error('not_found', 404);
}

async function mintRun(req: Request, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return error('auth_failed', 401);
  if (req.method !== 'POST') return methodNotAllowed();
  const body = parseJson<MintRunRequest>(await req.text());
  if (!body) return error('invalid_json');
  return mintFromRequest(env, body);
}

// Repos in the OIDC allowlist may mint via OIDC instead of the admin token, so a fleet repo needs
// no stored admin secret. Identity (repo/actor/run) comes from the verified OIDC token, never the
// client body; caps are still clamped to the proxy's ceilings. Trust is at repo granularity for
// mint: any workflow in a repo whose entry is in GITHUB_OIDC_ALLOWED_WORKFLOW may mint.
async function mintRunOidc(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  const oidc = await verifyGitHubOidcToken(env, extractBearer(req));
  if (!oidc) return error('auth_failed', 401);
  const workflowRef = oidc.job_workflow_ref ?? oidc.workflow_ref ?? '';
  if (!oidc.repository || !isTrustedRepoWorkflow(env, oidc.repository, workflowRef)) {
    return error('forbidden_workflow', 403);
  }
  const body = parseJson<MintRunRequest>(await req.text()) ?? ({} as MintRunRequest);
  const merged: MintRunRequest = {
    ...body,
    repo: oidc.repository,
    actor: oidc.actor ?? body.actor ?? 'unknown',
    issue: Number.isInteger(body.issue) && (body.issue as number) >= 0 ? body.issue : 0,
    github_run_id: oidc.run_id ?? body.github_run_id,
    github_run_attempt: oidc.run_attempt ?? body.github_run_attempt,
    github_workflow_ref: workflowRef || body.github_workflow_ref,
  };
  return mintFromRequest(env, merged);
}

export function isTrustedRepoWorkflow(env: Env, repo: string, workflowRef: string): boolean {
  const trustedRepos = new Set(
    (env.GITHUB_OIDC_ALLOWED_WORKFLOW ?? '')
      .split(',')
      .map((value) => value.trim().split('/.github/')[0])
      .filter(Boolean),
  );
  if (!trustedRepos.has(repo)) return false;
  return workflowRef.startsWith(`${repo}/.github/workflows/`);
}

async function mintFromRequest(env: Env, body: MintRunRequest): Promise<Response> {
  const validation = validateMint(body);
  if (validation) return validation;

  const maxUsdCents = body.max_usd_cents
    ?? (typeof body.max_usd === 'number' ? Math.round(body.max_usd * 100) : undefined)
    ?? Number(env.DEFAULT_MAX_USD_CENTS ?? 500);
  const maxRequests = body.max_requests ?? Number(env.DEFAULT_MAX_REQUESTS ?? 200);
  const expiresSeconds = body.expires_in_seconds ?? Number(env.DEFAULT_EXPIRES_SECONDS ?? 7200);
  const limitConfig = limitsFromEnv(env);
  if (maxUsdCents > Number(env.MAX_RUN_USD_CENTS ?? 500)) return error('run_spend_cap_too_high', 400);
  if (maxRequests > Number(env.MAX_RUN_REQUESTS ?? 200)) return error('run_request_cap_too_high', 400);

  const runId = body.run_id ?? `run_${crypto.randomUUID()}`;
  const claims: RunClaims = {
    run_id: runId,
    repo: body.repo,
    issue: body.issue,
    actor: body.actor,
    max_usd_cents: maxUsdCents,
    max_requests: maxRequests,
    models: body.models,
    expires_at: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
    purpose: body.purpose ?? 'agent',
    github_run_id: body.github_run_id,
    github_run_attempt: body.github_run_attempt,
    github_workflow_ref: body.github_workflow_ref,
  };

  const runInit = await new RunBudgetClient(env.RUNS, runId).init(claims);
  if (!runInit.ok) return error(runInit.error, 409);

  const ledger = await new LimitLedgerClient(env.LIMITS).register(claims, limitConfig);
  if (!ledger.ok) {
    await new RunBudgetClient(env.RUNS, runId).revoke();
    return error(ledger.error, 429);
  }

  const token = await signRunToken(env, claims);
  return json({ ok: true, run: claims, token });
}

function validateMint(body: MintRunRequest): Response | null {
  if (!body || typeof body !== 'object') return error('invalid_request');
  if (!body.repo || !/^[^/\s]+\/[^/\s]+$/.test(body.repo)) return error('invalid_repo');
  if (!Number.isInteger(body.issue) || body.issue < 0) return error('invalid_issue');
  if (!body.actor || typeof body.actor !== 'string') return error('invalid_actor');
  if (!Array.isArray(body.models) || body.models.length === 0 || body.models.some((m) => typeof m !== 'string' || !m)) {
    return error('invalid_models');
  }
  if (body.max_usd_cents !== undefined && (!Number.isInteger(body.max_usd_cents) || body.max_usd_cents <= 0)) {
    return error('invalid_max_usd_cents');
  }
  if (body.max_requests !== undefined && (!Number.isInteger(body.max_requests) || body.max_requests <= 0)) {
    return error('invalid_max_requests');
  }
  if (body.expires_in_seconds !== undefined && (!Number.isInteger(body.expires_in_seconds) || body.expires_in_seconds <= 0)) {
    return error('invalid_expires_in_seconds');
  }
  if (body.github_run_id !== undefined && typeof body.github_run_id !== 'string') return error('invalid_github_run_id');
  if (body.github_run_attempt !== undefined && typeof body.github_run_attempt !== 'string') return error('invalid_github_run_attempt');
  if (body.github_workflow_ref !== undefined && typeof body.github_workflow_ref !== 'string') return error('invalid_github_workflow_ref');
  return null;
}

async function authedClaims(req: Request, env: Env): Promise<RunClaims | null> {
  const tokenClaims = await verifyRunToken(env, extractModelToken(req));
  if (!tokenClaims) return null;
  const status = await new RunBudgetClient(env.RUNS, tokenClaims.run_id).status() as { revoked?: boolean; claims?: RunClaims | null };
  if (status.revoked || !status.claims) return null;
  if (status.claims.run_id !== tokenClaims.run_id) return null;
  return status.claims;
}

async function exchangeRunToken(req: Request, env: Env, runId: string): Promise<Response> {
  const oidc = await verifyGitHubOidcToken(env, extractBearer(req));
  if (!oidc) return error('auth_failed', 401);

  const status = await new RunBudgetClient(env.RUNS, runId).status() as { revoked?: boolean; claims?: RunClaims | null };
  const claims = status.claims;
  if (status.revoked || !claims) return error('run_not_found', 404);
  if (claims.purpose !== 'agent') return error('forbidden_run', 403);
  if (Date.parse(claims.expires_at) <= Date.now()) return error('run_expired', 401);
  if (oidc.repository !== claims.repo || oidc.actor !== claims.actor) return error('forbidden_run', 403);
  if (claims.github_run_id && oidc.run_id !== claims.github_run_id) return error('forbidden_run', 403);
  if (claims.github_run_attempt && oidc.run_attempt !== claims.github_run_attempt) return error('forbidden_run', 403);

  const workflowRef = oidc.job_workflow_ref ?? oidc.workflow_ref ?? '';
  if (claims.github_workflow_ref && workflowRef !== claims.github_workflow_ref) return error('forbidden_workflow', 403);
  const allowedWorkflows = (env.GITHUB_OIDC_ALLOWED_WORKFLOW ?? `${claims.repo}/.github/workflows/public-agent.yml@`)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowedWorkflows.some((allowedWorkflow) => workflowRef.startsWith(allowedWorkflow))) {
    return error('forbidden_workflow', 403);
  }

  return json({ ok: true, run: claims, token: await signRunToken(env, claims) });
}

function isAdmin(req: Request, env: Env): boolean {
  const token = req.headers.get('x-admin-token');
  return Boolean(token && env.AGENT_PROXY_ADMIN_TOKEN && token === env.AGENT_PROXY_ADMIN_TOKEN);
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function redeemMessage(code?: string): string {
  switch (code) {
    case 'coupon_not_found': return 'That coupon code was not found.';
    case 'coupon_already_redeemed': return 'That coupon has already been redeemed.';
    case 'coupon_expired': return 'That coupon has expired.';
    case 'insufficient_balance': return 'The coupon issuer no longer has the balance to back it.';
    default: return 'Coupon could not be redeemed.';
  }
}

// The account whose runway the default README badge (/v1/funding*) shows.
function fundingAccount(env: Env): string {
  return env.DEFAULT_FUNDING_ACCOUNT || 'volter-ai/open-autonomy';
}

// The account that org-level GitHub Sponsors funding lands on (the org's own project).
function sponsorAccount(env: Env): string {
  return env.DEFAULT_SPONSOR_ACCOUNT || fundingAccount(env);
}

async function runwaySvg(env: Env, account: string, req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const snapshot = await new LimitLedgerClient(env.LIMITS).funding(account);
  return new Response(renderRunwaySvg(snapshot), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Short cache so the README badge updates within minutes (GitHub's Camo proxy caches too).
      'cache-control': 'max-age=300, s-maxage=300',
    },
  });
}
