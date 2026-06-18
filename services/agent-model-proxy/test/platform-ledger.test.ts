import { describe, expect, test } from 'bun:test';
import { LimitLedger, LimitLedgerClient, type LimitConfig } from '../src/limit-ledger.js';
import { MemoryDurableObjectNamespace } from './memory-do.js';

function ledger(): LimitLedgerClient {
  return new LimitLedgerClient(new MemoryDurableObjectNamespace((state) => new LimitLedger(state)));
}

const CONFIG: LimitConfig = {
  max_active_runs_global: 10,
  max_active_runs_per_repo: 10,
  max_active_runs_per_actor: 10,
  max_runs_per_repo_per_day: 100,
  max_runs_per_actor_per_day: 100,
  max_runs_per_issue_per_day: 100,
  max_global_daily_usd_cents: 100000,
  enforce_account_balance: false,
};

const claims = (over: Partial<{ run_id: string; repo: string; issue: number; actor: string }> = {}) => ({
  run_id: over.run_id ?? 'run_1',
  repo: over.repo ?? 'acme/widget',
  issue: over.issue ?? 7,
  actor: over.actor ?? 'octocat',
  max_usd_cents: 500,
  max_requests: 10,
  models: ['claude-sonnet-4-6'],
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  purpose: 'agent' as const,
});

describe('platform: flows + activity feed', () => {
  test('mint, grant, and consume each append a flow visible in the project feed', async () => {
    const l = ledger();
    await l.mint('root', 50000);
    await l.grant('root', 'acme/widget', 10000);
    await l.reserve('req-1', 300, CONFIG, 'run_1');
    // reserve needs the run registered to resolve the account
    const view0 = await l.project('acme/widget');
    expect(view0.found).toBe(true);

    // register the run so consume can attribute the account
    await l.register(claims(), CONFIG);
    await l.reserve('req-2', 300, CONFIG, 'run_1');
    await l.consume('req-2', 250);

    const view = await l.project('acme/widget');
    const kinds = view.feed.map((f) => f.kind);
    expect(kinds.includes('grant')).toBe(true);
    expect(kinds.includes('consume')).toBe(true);
    const consume = view.feed.find((f) => f.kind === 'consume');
    expect(consume?.amount_usd_cents).toBe(250);
    expect(consume?.issue).toBe(7);
    expect(consume?.actor).toBe('octocat');
  });
});

describe('platform: permissionless discovery', () => {
  test('registering a run materializes the account so it is discoverable', async () => {
    const l = ledger();
    const before = await l.directory();
    expect(before.entries.find((e) => e.account === 'acme/widget') === undefined).toBe(true);

    await l.register(claims(), CONFIG);

    const after = await l.directory();
    const entry = after.entries.find((e) => e.account === 'acme/widget');
    expect(entry !== undefined).toBe(true);
    expect(entry?.funded).toBe(false);
    // not listed yet — no GitHub sync has happened, so it is not on the public storefront
    expect(entry?.listed).toBe(false);
  });

  test('a project lists publicly only once it has a synced profile', async () => {
    const l = ledger();
    await l.register(claims(), CONFIG);
    await l.setProfile('acme/widget', { tagline: 'a self-coding widget', avatar_url: 'https://github.com/acme.png', synced_at: new Date().toISOString() });
    const dir = await l.directory();
    expect(dir.entries.find((e) => e.account === 'acme/widget')?.listed).toBe(true);
  });

  test('named roots (no slash) never list as projects', async () => {
    const l = ledger();
    await l.mint('volter', 50000);
    await l.setProfile('volter', { synced_at: new Date().toISOString() });
    const dir = await l.directory();
    expect(dir.entries.find((e) => e.account === 'volter')?.is_project).toBe(false);
    expect(dir.entries.find((e) => e.account === 'volter')?.listed).toBe(false);
  });
});

describe('platform: moderation', () => {
  test('a banned account cannot register a run (abuse hard-stop)', async () => {
    const l = ledger();
    await l.moderate('evil/repo', 'banned', 'spam');
    const reg = await l.register(claims({ repo: 'evil/repo' }), CONFIG) as { ok: boolean; error?: string };
    expect(reg.ok).toBe(false);
    expect(reg.error).toBe('account_banned');
  });

  test('hidden keeps the page + ledger working but drops it from listings', async () => {
    const l = ledger();
    await l.register(claims(), CONFIG);
    await l.setProfile('acme/widget', { tagline: 't', synced_at: new Date().toISOString() });
    expect((await l.directory()).entries.find((e) => e.account === 'acme/widget')?.listed).toBe(true);
    await l.moderate('acme/widget', 'hidden');
    expect((await l.directory()).entries.find((e) => e.account === 'acme/widget')?.listed).toBe(false);
    // still reachable as a project view
    expect((await l.project('acme/widget')).found).toBe(true);
  });

  test('tagline override wins over the synced tagline', async () => {
    const l = ledger();
    await l.setProfile('acme/widget', { tagline: 'sketchy synced text', synced_at: new Date().toISOString() });
    await l.moderate('acme/widget', 'listed', undefined, { tagline_override: 'curated copy' });
    expect((await l.project('acme/widget')).profile.tagline).toBe('curated copy');
  });
});

describe('platform: surplus-above-goal redistribution', () => {
  test('a project may grant only the surplus above its own goal-days runway', async () => {
    const l = ledger();
    // fund a project with $100 and no spend history → burn falls back to the prior (~$0.50/day)
    await l.mint('acme/widget', 10000);
    const view = await l.project('acme/widget');
    const floor = view.goal_days * view.burn_per_day_usd_cents; // 30 * 50 = 1500
    const surplus = 10000 - floor;

    const tooMuch = await l.grantSurplus('acme/widget', 'beta/helper', surplus + 100);
    expect(tooMuch.ok).toBe(false);
    expect(tooMuch.error).toBe('insufficient_surplus');

    const ok = await l.grantSurplus('acme/widget', 'beta/helper', surplus);
    expect(ok.ok).toBe(true);
    expect(ok.to_balance_usd_cents).toBe(surplus);
  });

  test('the recipient shows the funder as a project-patron', async () => {
    const l = ledger();
    await l.mint('acme/widget', 10000);
    await l.grantSurplus('acme/widget', 'beta/helper', 2000);
    const view = await l.project('beta/helper');
    const patron = view.patrons.find((p) => p.kind === 'project');
    expect(patron?.login).toBe('acme/widget');
    expect((patron?.amount_label ?? '').includes('granted')).toBe(true);
    // the funding project also counts toward the recipient's patron total on its card
    expect(view.patron_count).toBe(1);
  });
});
