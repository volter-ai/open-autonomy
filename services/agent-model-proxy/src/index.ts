import { handleAnthropic } from './anthropic.js';
import { limitsFromEnv } from './config.js';
import { error, json, methodNotAllowed, parseJson } from './errors.js';
import { verifyGitHubOidcToken } from './github-oidc.js';
import { LimitLedger, LimitLedgerClient } from './limit-ledger.js';
import { handleOpenAI } from './openai.js';
import { RunBudget, RunBudgetClient } from './run-budget.js';
import { extractBearer, signRunToken, verifyRunToken } from './token.js';
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
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/healthz') return new Response('ok');

  if (path === '/admin/runs/mint') return mintRun(req, env);
  if (path === '/admin/limits/status') {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (req.method !== 'GET') return methodNotAllowed();
    return json(await new LimitLedgerClient(env.LIMITS).status());
  }

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

  const claims = await authedClaims(req, env);
  if (!claims) return error('auth_failed', 401);

  if (path === '/anthropic/v1/messages') return handleAnthropic(req, env, claims, ctx);
  if (path === '/openai/v1/chat/completions') return handleOpenAI(req, env, claims, ctx, '/v1/chat/completions');
  if (path === '/openai/v1/responses') return handleOpenAI(req, env, claims, ctx, '/v1/responses');

  return error('not_found', 404);
}

async function mintRun(req: Request, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return error('auth_failed', 401);
  if (req.method !== 'POST') return methodNotAllowed();

  const bodyText = await req.text();
  const body = parseJson<MintRunRequest>(bodyText);
  if (!body) return error('invalid_json');
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
  if (!Number.isInteger(body.issue) || body.issue <= 0) return error('invalid_issue');
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
  const tokenClaims = await verifyRunToken(env, extractBearer(req));
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
  const allowedWorkflow = env.GITHUB_OIDC_ALLOWED_WORKFLOW ?? `${claims.repo}/.github/workflows/public-agent.yml@`;
  if (!workflowRef.startsWith(allowedWorkflow)) return error('forbidden_workflow', 403);

  return json({ ok: true, run: claims, token: await signRunToken(env, claims) });
}

function isAdmin(req: Request, env: Env): boolean {
  const token = req.headers.get('x-admin-token');
  return Boolean(token && env.AGENT_PROXY_ADMIN_TOKEN && token === env.AGENT_PROXY_ADMIN_TOKEN);
}
