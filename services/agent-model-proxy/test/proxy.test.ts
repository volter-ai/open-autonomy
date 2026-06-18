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

  test('with enforcement on, refuses to mint for an unfunded account', async () => {
    const env = testEnv({ ENFORCE_ACCOUNT_BALANCE: 'true' });
    const res = await request(env, '/admin/runs/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: { repo: 'volter/twin', issue: 1, actor: 'octocat', models: ['gpt-5-mini'], max_usd_cents: 100, max_requests: 3 },
    });
    expect(res.status).toBe(429);
    const body = await res.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('account_unfunded');
  });

  test('a mint into the account lets an unfunded repo mint runs again', async () => {
    const env = testEnv({ ENFORCE_ACCOUNT_BALANCE: 'true' });
    const refused = await request(env, '/admin/runs/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: { repo: 'volter/twin', issue: 1, actor: 'octocat', models: ['gpt-5-mini'], max_usd_cents: 100, max_requests: 3 },
    });
    expect(refused.status).toBe(429);

    const funded = await requestJson(env, '/admin/accounts/volter%2Ftwin/mint', {
      method: 'POST',
      headers: { 'x-admin-token': 'admin' },
      body: { amount_usd_cents: 5000 },
    });
    expect(funded.ok).toBe(true);
    expect(funded.balance_usd_cents).toBe(5000);

    const minted = await mint(env, ['gpt-5-mini'], 100, 3);
    expect(minted.ok).toBe(true);
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

describe('account funding (mint / grant / spend)', () => {
  const acct = (id: string) => `/v1/accounts/${encodeURIComponent(id)}`;
  const mintAcct = (env: Env, id: string, body: unknown) => requestJson(env, `/admin/accounts/${encodeURIComponent(id)}/mint`, {
    method: 'POST', headers: { 'x-admin-token': 'admin' }, body,
  });

  test('an account is unfunded by default', async () => {
    const env = testEnv();
    const f = await requestJson(env, acct('volter/twin'));
    expect(f.funded).toBe(false);
    expect(f.balance_usd_cents).toBe(0);
    expect(f.granted_in_usd_cents).toBe(0);
  });

  test('mint adds money at a node and the snapshot reflects it', async () => {
    const env = testEnv();
    const minted = await mintAcct(env, 'volter/twin', {
      amount_usd_cents: 20000,
      sponsor: { login: 'acme', name: 'ACME Cloud', tagline: 'infra for builders' },
    });
    expect(minted.ok).toBe(true);
    expect(minted.balance_usd_cents).toBe(20000);

    const f = await requestJson(env, acct('volter/twin'));
    expect(f.funded).toBe(true);
    expect(f.balance_usd_cents).toBe(20000);
    expect(f.granted_in_usd_cents).toBe(20000);
    expect(f.sponsors).toEqual([{ login: 'acme', name: 'ACME Cloud', tagline: 'infra for builders' }]);
  });

  test('mint is idempotent per key, accumulates across keys', async () => {
    const env = testEnv();
    expect((await mintAcct(env, 'volter/twin', { amount_usd_cents: 1000, key: 'a' })).balance_usd_cents).toBe(1000);
    const again = await mintAcct(env, 'volter/twin', { amount_usd_cents: 1000, key: 'a' });
    expect(again.idempotent).toBe(true);
    expect(again.balance_usd_cents).toBe(1000);
    expect((await mintAcct(env, 'volter/twin', { amount_usd_cents: 500, key: 'b' })).balance_usd_cents).toBe(1500);
  });

  test('grant transfers down the tree, debiting the source', async () => {
    const env = testEnv();
    await mintAcct(env, 'open-autonomy', { amount_usd_cents: 50000 });
    const granted = await requestJson(env, '/admin/accounts/open-autonomy/grant', {
      method: 'POST', headers: { 'x-admin-token': 'admin' }, body: { to: 'volter/twin', amount_usd_cents: 5000 },
    });
    expect(granted.ok).toBe(true);
    expect(granted.from_balance_usd_cents).toBe(45000);
    expect(granted.to_balance_usd_cents).toBe(5000);
    expect((await requestJson(env, acct('open-autonomy'))).balance_usd_cents).toBe(45000);
    expect((await requestJson(env, acct('volter/twin'))).balance_usd_cents).toBe(5000);
  });

  test('a grant beyond the source balance is refused', async () => {
    const env = testEnv();
    await mintAcct(env, 'open-autonomy', { amount_usd_cents: 1000 });
    const res = await request(env, '/admin/accounts/open-autonomy/grant', {
      method: 'POST', headers: { 'x-admin-token': 'admin' }, body: { to: 'volter/twin', amount_usd_cents: 5000 },
    });
    expect(res.status).toBe(400);
    expect((await res.json() as { error?: string }).error).toBe('insufficient_balance');
  });

  test('spend draws down the spending account', async () => {
    const env = testEnv();
    await mintAcct(env, 'volter/twin', { amount_usd_cents: 5000 });
    const minted = await mint(env, ['claude-sonnet-4-6'], 100, 5);

    globalThis.fetch = (async () => new Response(JSON.stringify({
      id: 'msg_1', usage: { input_tokens: 1000, output_tokens: 1000 },
    }), { headers: { 'content-type': 'application/json' } })) as typeof fetch;

    const proxied = await worker.fetch(new Request('https://proxy.test/anthropic/v1/messages', {
      method: 'POST',
      headers: { authorization: `Bearer ${minted.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [] }),
    }), env, ctx);
    expect(proxied.status).toBe(200);

    const f = await requestJson(env, acct('volter/twin'));
    expect(f.consumed_usd_cents).toBeGreaterThan(0);
    expect(f.balance_usd_cents).toBe(5000 - f.consumed_usd_cents);
  });

  test('with enforcement on, spend hard-stops once the balance is gone', async () => {
    const env = testEnv({ ENFORCE_ACCOUNT_BALANCE: 'true' });
    await mintAcct(env, 'volter/twin', { amount_usd_cents: 1 }); // balance 1¢ — passes the mint gate, fails the request reservation
    const minted = await mint(env, ['claude-sonnet-4-6'], 500, 5);

    const res = await worker.fetch(new Request('https://proxy.test/anthropic/v1/messages', {
      method: 'POST',
      headers: { authorization: `Bearer ${minted.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, messages: [] }),
    }), env, ctx);
    expect(res.status).toBe(402);
    expect((await res.json() as { error?: { code?: string } }).error?.code).toBe('account_balance_exhausted');
  });

  test('serves a per-account runway SVG', async () => {
    const env = testEnv();
    await mintAcct(env, 'volter/twin', { amount_usd_cents: 20000 });
    const res = await request(env, `/v1/accounts/${encodeURIComponent('volter/twin')}/runway.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')?.includes('image/svg+xml')).toBe(true);
    const svg = await res.text();
    expect(svg.includes('<svg')).toBe(true);
    expect(svg.includes('of $200.00')).toBe(true);
  });
});

describe('github sponsors webhook', () => {
  async function sign(body: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode('whsecret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    return `sha256=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  async function webhook(env: Env, event: string, payload: unknown, signature?: string): Promise<Response> {
    const body = JSON.stringify(payload);
    return await worker.fetch(new Request('https://proxy.test/webhooks/github-sponsors', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-github-event': event, 'x-hub-signature-256': signature ?? await sign(body) },
      body,
    }), env, ctx);
  }

  test('rejects a bad signature', async () => {
    const env = testEnv();
    const res = await webhook(env, 'sponsorship', { action: 'created' }, 'sha256=deadbeef');
    expect(res.status).toBe(401);
  });

  test('acknowledges the ping event', async () => {
    const env = testEnv();
    const res = await webhook(env, 'ping', { zen: 'Keep it logically awesome.' });
    expect(res.status).toBe(200);
  });

  test('created recurring sponsor shows in funding; accrue mints the sponsor account (idempotent)', async () => {
    const env = testEnv(); // DEFAULT_SPONSOR_ACCOUNT = volter/twin
    const created = await webhook(env, 'sponsorship', {
      action: 'created',
      sponsorship: { sponsor: { login: 'acme', avatar_url: 'https://x/a.png' }, tier: { monthly_price_in_cents: 5000, is_one_time: false } },
    });
    expect(created.status).toBe(200);

    let funding = await requestJson(env, '/v1/funding');
    expect(funding.sponsors).toEqual([{ login: 'acme', avatar_url: 'https://x/a.png', monthly_usd_cents: 5000 }]);
    expect(funding.funded).toBe(false); // upsert alone does not fund; accrual does

    const accrue = (key: string) => requestJson(env, `/admin/accounts/${encodeURIComponent('volter/twin')}/accrue`, {
      method: 'POST', headers: { 'x-admin-token': 'admin' }, body: { key },
    });
    expect((await accrue('2026-07')).balance_usd_cents).toBe(5000);
    const again = await accrue('2026-07');
    expect(again.idempotent).toBe(true);
    expect(again.balance_usd_cents).toBe(5000);

    funding = await requestJson(env, '/v1/funding');
    expect(funding.funded).toBe(true);
    expect(funding.balance_usd_cents).toBe(5000);
  });

  test('tier_changed updates the amount; cancelled removes the sponsor', async () => {
    const env = testEnv();
    await webhook(env, 'sponsorship', { action: 'created', sponsorship: { sponsor: { login: 'acme' }, tier: { monthly_price_in_cents: 5000, is_one_time: false } } });
    await webhook(env, 'sponsorship', { action: 'tier_changed', sponsorship: { sponsor: { login: 'acme' }, tier: { monthly_price_in_cents: 10000, is_one_time: false } } });
    let funding = await requestJson(env, '/v1/funding');
    expect(funding.sponsors).toEqual([{ login: 'acme', monthly_usd_cents: 10000 }]);

    await webhook(env, 'sponsorship', { action: 'cancelled', sponsorship: { sponsor: { login: 'acme' }, tier: { monthly_price_in_cents: 10000, is_one_time: false } } });
    funding = await requestJson(env, '/v1/funding');
    expect(funding.sponsors).toEqual([]);
  });

  test('one-time sponsorship mints immediately and idempotently', async () => {
    const env = testEnv();
    const payload = {
      action: 'created',
      sponsorship: { node_id: 'S_one', sponsor: { login: 'gift' }, tier: { monthly_price_in_cents: 2500, is_one_time: true } },
    };
    await webhook(env, 'sponsorship', payload);
    expect((await requestJson(env, '/v1/funding')).balance_usd_cents).toBe(2500);
    await webhook(env, 'sponsorship', payload); // replay
    expect((await requestJson(env, '/v1/funding')).balance_usd_cents).toBe(2500);
  });
});

describe('sponsorship coupons', () => {
  const issue = (env: Env, body: unknown) => requestJson(env, '/admin/coupons', {
    method: 'POST', headers: { 'x-admin-token': 'admin' }, body,
  });
  const redeem = (env: Env, code: string, account: string) => request(env, '/v1/coupons/redeem', {
    method: 'POST', body: { code, account },
  });

  test('issue (admin) then redeem (public) into an account, attributing the sponsor', async () => {
    const env = testEnv();
    const created = await issue(env, {
      amount_usd_cents: 5000,
      sponsor: { login: 'acme', name: 'ACME Cloud', tagline: 'infra for builders', url: 'https://acme.example' },
    });
    expect(created.ok).toBe(true);
    const code = created.coupon.code as string;
    expect(code.startsWith('SPON-')).toBe(true);

    expect((await requestJson(env, `/v1/accounts/${encodeURIComponent('volter/twin')}`)).funded).toBe(false);

    const redeemed = await (await redeem(env, code, 'volter/twin')).json() as { ok: boolean; amount_usd_cents: number };
    expect(redeemed.ok).toBe(true);
    expect(redeemed.amount_usd_cents).toBe(5000);

    const f = await requestJson(env, `/v1/accounts/${encodeURIComponent('volter/twin')}`);
    expect(f.funded).toBe(true);
    expect(f.balance_usd_cents).toBe(5000);
    expect(f.sponsors).toEqual([{ login: 'acme', name: 'ACME Cloud', tagline: 'infra for builders', url: 'https://acme.example' }]);
  });

  test('an issuer-backed coupon transfers from the issuer (grant)', async () => {
    const env = testEnv();
    await requestJson(env, '/admin/accounts/open-autonomy/mint', {
      method: 'POST', headers: { 'x-admin-token': 'admin' }, body: { amount_usd_cents: 10000 },
    });
    const code = (await issue(env, { amount_usd_cents: 5000, from: 'open-autonomy' })).coupon.code as string;
    const res = await redeem(env, code, 'volter/twin');
    expect(res.status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/open-autonomy')).balance_usd_cents).toBe(5000);
    expect((await requestJson(env, `/v1/accounts/${encodeURIComponent('volter/twin')}`)).balance_usd_cents).toBe(5000);
  });

  test('a coupon can only be redeemed once', async () => {
    const env = testEnv();
    const code = (await issue(env, { amount_usd_cents: 1000 })).coupon.code as string;
    expect((await redeem(env, code, 'volter/twin')).status).toBe(200);
    const second = await redeem(env, code, 'volter/twin');
    expect(second.status).toBe(409);
    expect((await second.json() as { error?: string }).error).toBe('coupon_already_redeemed');
    expect((await requestJson(env, `/v1/accounts/${encodeURIComponent('volter/twin')}`)).balance_usd_cents).toBe(1000);
  });

  test('redeeming an unknown code is 404', async () => {
    const env = testEnv();
    const res = await redeem(env, 'SPON-NOPE-NOPE-NOPE', 'volter/twin');
    expect(res.status).toBe(404);
  });

  test('an expired coupon is refused', async () => {
    const env = testEnv();
    const code = (await issue(env, { amount_usd_cents: 1000, code: 'OLD1', expires_at: '2000-01-01T00:00:00Z' })).coupon.code as string;
    const res = await redeem(env, code, 'volter/twin');
    expect(res.status).toBe(400);
    expect((await res.json() as { error?: string }).error).toBe('coupon_expired');
  });

  test('issuing requires admin', async () => {
    const env = testEnv();
    const res = await request(env, '/admin/coupons', { method: 'POST', body: { amount_usd_cents: 1000 } });
    expect(res.status).toBe(401);
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
    GITHUB_SPONSORS_WEBHOOK_SECRET: 'whsecret',
    DEFAULT_FUNDING_ACCOUNT: 'volter/twin',
    DEFAULT_SPONSOR_ACCOUNT: 'volter/twin',
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
