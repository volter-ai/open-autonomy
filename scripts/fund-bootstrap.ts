#!/usr/bin/env bun
export {}; // module marker
// Bootstrap the funding tree: mint the root (real money from Volter) and grant down to open-autonomy
// and its testbeds, so each project starts with non-zero credits BEFORE balance enforcement turns on.
//
// Every step is idempotent on a stable key, so this is safe to re-run (per the project's
// "infra setup = committed idempotent scripts" norm). It does NOT enable enforcement — flip
// ENFORCE_ACCOUNT_BALANCE=true (wrangler var) only after verifying balances here.
//
// Env: MODEL_PROXY_URL, MODEL_PROXY_ADMIN_TOKEN
// Flags: --dry-run (print the plan without applying)

interface Plan {
  root: string;
  root_mint_usd_cents: number;
  grants: { from: string; to: string; amount_usd_cents: number }[];
}

// Default tree: Volter funds open-autonomy; open-autonomy funds its testbeds.
const PLAN: Plan = {
  root: 'volter',
  root_mint_usd_cents: 50000, // $500
  grants: [
    { from: 'volter', to: 'volter-ai/open-autonomy', amount_usd_cents: 50000 },
    { from: 'volter-ai/open-autonomy', to: 'volter-ai/open-autonomy-testbed', amount_usd_cents: 5000 },
    { from: 'volter-ai/open-autonomy', to: 'volter-ai/open-autonomy-self-driving-testbed', amount_usd_cents: 5000 },
  ],
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

async function api(path: string, body: unknown, base: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(new URL(path, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok || json.ok === false) throw new Error(`${path} failed: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function balance(account: string, base: string): Promise<number> {
  const res = await fetch(new URL(`/v1/accounts/${encodeURIComponent(account)}`, base));
  const json = await res.json() as { balance_usd_cents?: number };
  return json.balance_usd_cents ?? 0;
}

async function main(): Promise<void> {
  const base = process.env.MODEL_PROXY_URL;
  const token = process.env.MODEL_PROXY_ADMIN_TOKEN;
  const dryRun = process.argv.includes('--dry-run');
  if (!base) throw new Error('MODEL_PROXY_URL is required');

  process.stdout.write(`Funding tree bootstrap (${dryRun ? 'DRY RUN' : 'APPLY'}):\n`);
  process.stdout.write(`  mint ${PLAN.root} ${usd(PLAN.root_mint_usd_cents)}\n`);
  for (const g of PLAN.grants) process.stdout.write(`  grant ${g.from} -> ${g.to} ${usd(g.amount_usd_cents)}\n`);
  if (dryRun) return;
  if (!token) throw new Error('MODEL_PROXY_ADMIN_TOKEN is required to apply');

  await api(`/admin/accounts/${encodeURIComponent(PLAN.root)}/mint`, { amount_usd_cents: PLAN.root_mint_usd_cents, key: 'boot:mint:root' }, base, token);
  for (const g of PLAN.grants) {
    await api(`/admin/accounts/${encodeURIComponent(g.from)}/grant`, { to: g.to, amount_usd_cents: g.amount_usd_cents, key: `boot:grant:${g.from}->${g.to}` }, base, token);
  }

  process.stdout.write('\nResulting balances:\n');
  const accounts = [PLAN.root, ...new Set(PLAN.grants.flatMap((g) => [g.from, g.to]))];
  for (const a of accounts) process.stdout.write(`  ${a}: ${usd(await balance(a, base))}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
