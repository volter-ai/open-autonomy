import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import worker, { isTrustedRepoWorkflow } from '../src/index.js';
import { LimitLedger } from '../src/limit-ledger.js';
import { parseUsageFromSse } from '../src/openai.js';
import { RunBudget } from '../src/run-budget.js';
import type { Env } from '../src/types.js';
import { MemoryDurableObjectNamespace } from './memory-do.js';

let pendingWaitUntil: Promise<unknown>[] = [];
const ctx: ExecutionContext = {
  waitUntil(promise: Promise<unknown>) {
    pendingWaitUntil.push(promise);
  },
};

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  pendingWaitUntil = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('oidc mint trust (repo granularity)', () => {
  const env = {
    GITHUB_OIDC_ALLOWED_WORKFLOW:
      'volter-ai/open-autonomy/.github/workflows/public-agent.yml@,volter-ai/open-autonomy-self-driving-testbed/.github/workflows/public-agent.yml@',
  } as unknown as Env;

  test('trusts any workflow in an allowlisted repo', () => {
    expect(isTrustedRepoWorkflow(env, 'volter-ai/open-autonomy-self-driving-testbed',
      'volter-ai/open-autonomy-self-driving-testbed/.github/workflows/open-autonomy-strategist.yml@refs/heads/main')).toBe(true);
  });

  test('rejects a repo not in the allowlist', () => {
    expect(isTrustedRepoWorkflow(env, 'evil/repo', 'evil/repo/.github/workflows/public-agent.yml@x')).toBe(false);
  });

  test('rejects a workflow ref whose repo prefix does not match the claimed repo', () => {
    expect(isTrustedRepoWorkflow(env, 'volter-ai/open-autonomy', 'other/repo/.github/workflows/x.yml@y')).toBe(false);
  });
});

describe('agent model proxy', () => {
  test('mints bounded run tokens and exposes run status', async () => {
    const env = testEnv();
    const minted = await requestJson(env, '/admin/runs/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: {
        repo: 'volter/twin',
        issue: 12,
        actor: 'octocat',
        models: ['claude-sonnet-4-6'],
        max_usd_cents: 123,
        max_requests: 3,
      },
    });

    expect(minted.ok).toBe(true);
    expect(minted.run.max_usd_cents).toBe(123);
    expect(minted.token).toBeString();

    const status = await requestJson(env, `/v1/runs/${minted.run.run_id}`, {
      headers: { authorization: `Bearer ${minted.token}` },
    });
    expect(status.claims.run_id).toBe(minted.run.run_id);
    expect(status.consumed_usd_cents).toBe(0);
  });

  test('exposes admin-only limit ledger status', async () => {
    const env = testEnv();
    const unauthorized = await request(env, '/admin/limits/status');
    expect(unauthorized.status).toBe(401);

    await mint(env, ['gpt-5-mini'], 100, 3);
    const status = await requestJson(env, '/admin/limits/status', {
      headers: { 'x-admin-token': 'admin' },
    });

    expect(status.active_global).toBe(1);
    expect(status.active_by_actor.octocat).toBe(1);
    expect(status.runs_by_repo_day['volter/twin']).toBe(1);
    expect(status.runs_by_actor_day.octocat).toBe(1);
    expect(status.runs_by_issue_day['volter/twin#1']).toBe(1);
  });

  test('refuses to mint once the repo lifetime budget is exhausted', async () => {
    const env = testEnv({ MAX_REPO_LIFETIME_USD_CENTS: '0' });
    const res = await request(env, '/admin/runs/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: { repo: 'volter/twin', issue: 1, actor: 'octocat', models: ['gpt-5-mini'], max_usd_cents: 100, max_requests: 3 },
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('repo_lifetime_budget_exhausted');
  });

  test('proxies Anthropic calls and meters usage against the run', async () => {
    const env = testEnv();
    const minted = await mint(env, ['claude-sonnet-4-6'], 25, 5);

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://api.anthropic.com/v1/messages');
      return new Response(JSON.stringify({
        id: 'msg_1',
        usage: { input_tokens: 1000, output_tokens: 1000 },
      }), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const proxied = await worker.fetch(new Request('https://proxy.test/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${minted.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [] }),
    }), env, ctx);

    expect(proxied.status).toBe(200);
    const status = await requestJson(env, `/v1/runs/${minted.run.run_id}`, {
      headers: { authorization: `Bearer ${minted.token}` },
    });
    expect(status.request_count).toBe(1);
    expect(status.consumed_usd_cents).toBeGreaterThan(0);
    expect(status.recent_events[0].provider).toBe('anthropic');
  });

  test('rejects requests after request limit is reached', async () => {
    const env = testEnv();
    const minted = await mint(env, ['gpt-5-mini'], 100, 1);
    globalThis.fetch = (async () => new Response(JSON.stringify({
      id: 'chatcmpl_1',
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { headers: { 'content-type': 'application/json' } })) as typeof fetch;

    const first = await openaiChat(env, minted.token);
    expect(first.status).toBe(200);
    const second = await openaiChat(env, minted.token);
    expect(second.status).toBe(402);
    expect(await second.json()).toEqual({ error: { code: 'request_limit_reached' } });
  });

  test('uses the stored run contract if a run id is minted twice', async () => {
    const env = testEnv();
    const first = await requestJson(env, '/admin/runs/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: {
        run_id: 'run_stable',
        repo: 'volter/twin',
        issue: 1,
        actor: 'octocat',
        models: ['claude-sonnet-4-6'],
        max_usd_cents: 100,
        max_requests: 3,
      },
    });
    const second = await request(env, '/admin/runs/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: {
        run_id: first.run.run_id,
        repo: 'volter/twin',
        issue: 1,
        actor: 'octocat',
        models: ['gpt-5-mini'],
        max_usd_cents: 100,
        max_requests: 3,
      },
    });

    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: { code: 'run_already_exists' } });
  });

  test('enforces active run limits before minting a second token', async () => {
    const env = testEnv({ MAX_ACTIVE_RUNS_PER_ACTOR: '1' });
    await mint(env, ['gpt-5-mini'], 100, 3);

    const blocked = await request(env, '/admin/runs/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: {
        repo: 'volter/twin',
        issue: 2,
        actor: 'octocat',
        models: ['gpt-5-mini'],
        max_usd_cents: 100,
        max_requests: 3,
      },
    });

    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: { code: 'actor_active_run_limit_reached' } });
  });

  test('enforces repo daily run limits across actors', async () => {
    const env = testEnv({
      MAX_ACTIVE_RUNS_PER_ACTOR: '10',
      MAX_ACTIVE_RUNS_PER_REPO: '10',
      MAX_RUNS_PER_REPO_PER_DAY: '2',
    });
    await mint(env, ['gpt-5-mini'], 100, 3, { runId: 'run_repo_1', actor: 'octocat', issue: 1 });
    await mint(env, ['gpt-5-mini'], 100, 3, { runId: 'run_repo_2', actor: 'hubot', issue: 2 });

    const blocked = await request(env, '/admin/runs/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: {
        run_id: 'run_repo_3',
        repo: 'volter/twin',
        issue: 3,
        actor: 'monalisa',
        models: ['gpt-5-mini'],
        max_usd_cents: 100,
        max_requests: 3,
      },
    });

    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: { code: 'repo_daily_run_limit_reached' } });
  });

  test('keeps daily actor mint limits as high guardrails by default', async () => {
    const env = testEnv({ MAX_ACTIVE_RUNS_PER_ACTOR: '10', MAX_ACTIVE_RUNS_PER_REPO: '10' });
    for (let i = 1; i <= 5; i += 1) {
      const minted = await mint(env, ['gpt-5-mini'], 100, 3, {
        runId: `run_actor_default_${i}`,
        actor: 'octocat',
        issue: i,
      });
      expect(minted.ok).toBe(true);
      await requestJson(env, `/admin/runs/${minted.run.run_id}/revoke`, {
        method: 'POST',
        headers: { 'x-admin-token': 'admin' },
      });
    }
  });

  test('rejects requested run caps above deployment hard limits', async () => {
    const env = testEnv({ MAX_RUN_USD_CENTS: '50' });
    const blocked = await request(env, '/admin/runs/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: {
        repo: 'volter/twin',
        issue: 1,
        actor: 'octocat',
        models: ['gpt-5-mini'],
        max_usd_cents: 51,
        max_requests: 3,
      },
    });

    expect(blocked.status).toBe(400);
    expect(await blocked.json()).toEqual({ error: { code: 'run_spend_cap_too_high' } });
  });

  test('large prompt reservations fail before provider fetch', async () => {
    const env = testEnv();
    const minted = await mint(env, ['claude-sonnet-4-6'], 1, 3);
    let upstreamCalled = false;
    globalThis.fetch = (async () => {
      upstreamCalled = true;
      return new Response('{}');
    }) as typeof fetch;

    const res = await worker.fetch(new Request('https://proxy.test/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${minted.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'x'.repeat(200_000) }],
      }),
    }), env, ctx);

    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: { code: 'spend_limit_reached' } });
    expect(upstreamCalled).toBe(false);
  });

  test('enforces global daily spend across runs', async () => {
    const env = testEnv({
      MAX_ACTIVE_RUNS_PER_ACTOR: '10',
      MAX_GLOBAL_DAILY_USD_CENTS: '0',
    });
    const minted = await mint(env, ['gpt-5-mini'], 100, 3);

    const blocked = await openaiChat(env, minted.token);
    expect(blocked.status).toBe(402);
    expect(await blocked.json()).toEqual({ error: { code: 'global_daily_spend_limit_reached' } });
  });

  test('parses OpenAI-compatible streaming usage events', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode([
          'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":17}}',
          '',
          'data: [DONE]',
          '',
        ].join('\n')));
        controller.close();
      },
    });

    expect(await parseUsageFromSse(stream)).toEqual({
      input_tokens: 11,
      output_tokens: 17,
    });
  });

  test('revoked tokens stop working', async () => {
    const env = testEnv();
    const minted = await mint(env, ['gpt-5-mini'], 100, 3);

    const revoked = await requestJson(env, `/admin/runs/${minted.run.run_id}/revoke`, {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
    });
    expect(revoked.ok).toBe(true);

    const res = await openaiChat(env, minted.token);
    expect(res.status).toBe(401);
  });

  test('exchanges GitHub OIDC for a bounded run token', async () => {
    const oidc = await githubOidcSigner();
    const env = testEnv({ GITHUB_OIDC_JWKS_URL: 'https://jwks.test/keys' });
    globalThis.fetch = oidc.fetch;
    const minted = await mint(env, ['gpt-5-mini'], 100, 3);
    const jwt = await oidc.sign({
      repository: 'volter/twin',
      actor: 'octocat',
      job_workflow_ref: 'volter/twin/.github/workflows/public-agent.yml@refs/heads/main',
    });

    const exchanged = await requestJson(env, `/v1/runs/${minted.run.run_id}/exchange`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}` },
    });

    expect(exchanged.ok).toBe(true);
    expect(exchanged.run.run_id).toBe(minted.run.run_id);
    const status = await requestJson(env, `/v1/runs/${minted.run.run_id}`, {
      headers: { authorization: `Bearer ${exchanged.token}` },
    });
    expect(status.claims.repo).toBe('volter/twin');
  });

  test('rejects GitHub OIDC exchange from a different workflow', async () => {
    const oidc = await githubOidcSigner();
    const env = testEnv({ GITHUB_OIDC_JWKS_URL: 'https://jwks.test/keys' });
    globalThis.fetch = oidc.fetch;
    const minted = await mint(env, ['gpt-5-mini'], 100, 3);
    const jwt = await oidc.sign({
      repository: 'volter/twin',
      actor: 'octocat',
      job_workflow_ref: 'volter/twin/.github/workflows/other.yml@refs/heads/main',
    });

    const blocked = await request(env, `/v1/runs/${minted.run.run_id}/exchange`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}` },
    });

    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: { code: 'forbidden_workflow' } });
  });

  test('allows GitHub OIDC exchange from any configured workflow prefix', async () => {
    const oidc = await githubOidcSigner();
    const env = testEnv({
      GITHUB_OIDC_JWKS_URL: 'https://jwks.test/keys',
      GITHUB_OIDC_ALLOWED_WORKFLOW: 'volter-ai/open-autonomy/.github/workflows/public-agent.yml@,volter-ai/open-autonomy-testbed/.github/workflows/public-agent.yml@',
    });
    globalThis.fetch = oidc.fetch;
    const minted = await mint(env, ['gpt-5-mini'], 100, 3, { repo: 'volter-ai/open-autonomy' });
    const jwt = await oidc.sign({
      repository: 'volter-ai/open-autonomy',
      actor: 'octocat',
      job_workflow_ref: 'volter-ai/open-autonomy/.github/workflows/public-agent.yml@refs/heads/main',
    });

    const exchanged = await requestJson(env, `/v1/runs/${minted.run.run_id}/exchange`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}` },
    });

    expect(exchanged.ok).toBe(true);
  });

  test('rejects GitHub OIDC exchange from a different run id', async () => {
    const oidc = await githubOidcSigner();
    const env = testEnv({ GITHUB_OIDC_JWKS_URL: 'https://jwks.test/keys' });
    globalThis.fetch = oidc.fetch;
    const minted = await requestJson(env, '/admin/runs/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: {
        repo: 'volter/twin',
        issue: 1,
        actor: 'octocat',
        models: ['gpt-5-mini'],
        max_usd_cents: 100,
        max_requests: 3,
        github_run_id: '123',
        github_run_attempt: '1',
      },
    });
    const jwt = await oidc.sign({
      repository: 'volter/twin',
      actor: 'octocat',
      run_id: '456',
      run_attempt: '1',
      job_workflow_ref: 'volter/twin/.github/workflows/public-agent.yml@refs/heads/main',
    });

    const blocked = await request(env, `/v1/runs/${minted.run.run_id}/exchange`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}` },
    });

    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: { code: 'forbidden_run' } });
  });
});

async function mint(
  env: Env,
  models: string[],
  maxUsdCents: number,
  maxRequests: number,
  overrides: { runId?: string; repo?: string; issue?: number; actor?: string } = {},
) {
  return await requestJson(env, '/admin/runs/mint', {
    method: 'POST',
    headers: { 'x-admin-token': 'admin' },
    body: {
      run_id: overrides.runId,
      repo: overrides.repo ?? 'volter/twin',
      issue: overrides.issue ?? 1,
      actor: overrides.actor ?? 'octocat',
      models,
      max_usd_cents: maxUsdCents,
      max_requests: maxRequests,
    },
  });
}

async function openaiChat(env: Env, token: string): Promise<Response> {
  return await worker.fetch(new Request('https://proxy.test/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: 'gpt-5-mini', max_tokens: 10, messages: [] }),
  }), env, ctx);
}

async function requestJson(env: Env, path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const res = await request(env, path, init);
  expect(res.status).toBeLessThan(300);
  return await res.json() as any;
}

async function request(env: Env, path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  return await worker.fetch(new Request(`https://proxy.test${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }), env, ctx);
}

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    AGENT_PROXY_ADMIN_TOKEN: 'admin',
    AGENT_PROXY_HMAC_SECRET: 'secret',
    ANTHROPIC_API_KEY: 'anthropic-key',
    OPENAI_API_KEY: 'openai-key',
    DEFAULT_MAX_USD_CENTS: '500',
    DEFAULT_MAX_REQUESTS: '200',
    DEFAULT_EXPIRES_SECONDS: '7200',
    MAX_BODY_BYTES: '1048576',
    MODEL_PRICES_JSON: '{}',
    RUNS: new MemoryDurableObjectNamespace((state) => new RunBudget(state)),
    LIMITS: new MemoryDurableObjectNamespace((state) => new LimitLedger(state)),
    ...overrides,
  };
}

async function githubOidcSigner() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey) as JsonWebKey & {
    kid?: string;
    alg?: string;
    use?: string;
  };
  publicJwk.kid = 'test-key';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  return {
    fetch: (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://jwks.test/keys');
      return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    sign: async (claims: { repository: string; actor: string; job_workflow_ref: string; run_id?: string; run_attempt?: string }) => {
      const now = Math.floor(Date.now() / 1000);
      const header = base64urlJson({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
      const payload = base64urlJson({
        iss: 'https://token.actions.githubusercontent.com',
        aud: 'volter-agent-model-proxy',
        exp: now + 300,
        nbf: now - 10,
        iat: now,
        ...claims,
      });
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keyPair.privateKey,
        new TextEncoder().encode(`${header}.${payload}`),
      );
      return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
    },
  };
}

function base64urlJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
