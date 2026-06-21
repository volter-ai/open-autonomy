import { describe, expect, test } from 'bun:test';
import { LimitLedger, LimitLedgerClient, type LimitConfig } from '../src/limit-ledger.js';
import { renderExplore, renderProject } from '../src/platform-html.js';
import { MemoryDurableObjectNamespace } from './memory-do.js';

function ledger(): LimitLedgerClient {
  return new LimitLedgerClient(new MemoryDurableObjectNamespace((state) => new LimitLedger(state)));
}

const CONFIG: LimitConfig = {
  max_active_runs_global: 10,
  max_active_runs_per_repo: 10,
  max_active_runs_per_actor: 10,
  max_active_runs_system: 4,
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

describe('reserved cron/system lane', () => {
  const sys = (id: string) => ({ ...claims({ run_id: id }), purpose: 'pm' as const });

  test('a cron/system (pm) run registers even when the user lane is saturated', async () => {
    const l = ledger();
    const cfg = { ...CONFIG, max_active_runs_global: 5, max_active_runs_per_repo: 5, max_active_runs_per_actor: 1 };
    // Saturate the user/event lane (the abuse surface).
    expect(((await l.register(claims({ run_id: 'u1' }), cfg)) as { ok: boolean }).ok).toBe(true);
    expect(((await l.register(claims({ run_id: 'u2' }), cfg)) as { error?: string }).error).toBe('actor_active_run_limit_reached');
    // The heartbeat still gets a slot — its reserved lane is untouched by user runs.
    expect(((await l.register(sys('pm1'), cfg)) as { ok: boolean }).ok).toBe(true);
  });

  test('the system lane is itself bounded so a runaway cron cannot fork-bomb', async () => {
    const l = ledger();
    const cfg = { ...CONFIG, max_active_runs_system: 2 };
    expect(((await l.register(sys('s1'), cfg)) as { ok: boolean }).ok).toBe(true);
    expect(((await l.register(sys('s2'), cfg)) as { ok: boolean }).ok).toBe(true);
    expect(((await l.register(sys('s3'), cfg)) as { error?: string }).error).toBe('system_active_run_limit_reached');
  });

  test('completing a system run frees the system lane, not the user lane', async () => {
    const l = ledger();
    const cfg = { ...CONFIG, max_active_runs_system: 1 };
    await l.register(sys('pm1'), cfg);
    expect(((await l.register(sys('pm2'), cfg)) as { error?: string }).error).toBe('system_active_run_limit_reached');
    await l.complete('pm1');
    expect(((await l.register(sys('pm2'), cfg)) as { ok: boolean }).ok).toBe(true);
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

describe('platform: money reconciles (grants-out are not hidden or double-counted)', () => {
  const now = () => new Date().toISOString();

  test("a funder's page shows funded-onward so in − onward − spent = balance", async () => {
    const l = ledger();
    await l.mint('acme/widget', 10000);
    await l.grantSurplus('acme/widget', 'beta/helper', 2000);
    const v = await l.project('acme/widget');
    expect(v.granted_out_usd_cents).toBe(2000);
    expect(v.granted_in_usd_cents - v.granted_out_usd_cents - v.consumed_usd_cents).toBe(v.balance_usd_cents);
    const html = renderProject(v);
    expect(html.includes('funded onward')).toBe(true);
    expect(html.includes('$20.00')).toBe(true);
  });

  test('explore fleet total nets internal grants instead of double-counting', async () => {
    const l = ledger();
    await l.mint('acme/widget', 10000);
    await l.setProfile('acme/widget', { synced_at: now() });
    await l.grantSurplus('acme/widget', 'beta/helper', 2000);
    await l.setProfile('beta/helper', { synced_at: now() });
    const { entries } = await l.directory();
    const html = renderExplore(entries);
    // only $100 of real money was minted; the $20 internal grant must not inflate it to $120
    expect(html.includes('$100')).toBe(true);
    expect(html.includes('$120')).toBe(false);
  });
});

describe('platform: review hardening', () => {
  test('a malicious cover URL cannot inject CSS (falls back to the gradient)', async () => {
    const l = ledger();
    await l.mint('acme/widget', 10000);
    // a quote/paren in the URL would break out of url('…') in the style attribute
    await l.setProfile('acme/widget', { cover_url: "https://evil/x');background:red;//", synced_at: new Date().toISOString() });
    const html = renderProject(await l.project('acme/widget'));
    expect(html.includes('background:red')).toBe(false);
    expect(html.includes('linear-gradient')).toBe(true);
  });

  test('non-finite spend cannot poison the ledger', async () => {
    const l = ledger();
    await l.mint('acme/widget', 10000);
    await l.register(claims(), CONFIG); // run_1 → repo acme/widget
    // NaN over JSON-RPC arrives as 0, and the DO guard clamps a true non-finite settle to $0 — either
    // way the balance must never become NaN (which would silently disable enforcement).
    await l.reserve('req-ok', 100, CONFIG, 'run_1');
    await l.consume('req-ok', Number.NaN);
    const v = await l.project('acme/widget');
    expect(Number.isFinite(v.balance_usd_cents)).toBe(true);
    expect(v.balance_usd_cents).toBe(10000);
  });
});
