#!/usr/bin/env bun
// The github box's model-endpoint provisioning — runs ONCE in a deterministic job's setup step, the only
// place the admin credential lives. It mints a bounded run token and writes the stock SDK env vars to
// $GITHUB_ENV, so the agent step that follows makes plain transparent calls with NO admin token and does
// no minting of its own. github is the untrusted-keyless substrate, so its box endpoint is the remote
// proxy + a bounded mint; a trusted substrate (local) provisions the box differently — usually not at
// all (ambient keys). The agent code is identical across substrates; only THIS provisioning differs.
import { $ } from 'bun';
import { appendFileSync, mkdirSync } from 'node:fs';

const env = (k: string, d = '') => process.env[k] || d;
const proxyUrl = process.env.MODEL_PROXY_URL;
const githubEnv = process.env.GITHUB_ENV;
if (!proxyUrl) throw new Error('MODEL_PROXY_URL is required');
if (!githubEnv) throw new Error('GITHUB_ENV is required');

// One bounded token for the whole run. The cap covers the run's sweep (kept equivalent to the prior
// per-issue ceiling × the sweep limit), so the spend wall is preserved while the agent never mints.
const models = env('MODEL_ALLOWLIST', 'gpt-4o-mini');
const maxUsdCents = env('PUBLIC_AGENT_RUN_MAX_USD_CENTS', '500');
const maxRequests = env('PUBLIC_AGENT_RUN_MAX_REQUESTS', '60');

mkdirSync('.agent-run', { recursive: true });
await Bun.write(
  '.agent-run/run-issue.json',
  JSON.stringify({ number: 0, title: 'agent run', body: '', user: { login: env('GITHUB_ACTOR', 'open-autonomy') } }),
);

const res = await $`bun scripts/model-proxy-mint.ts --issue .agent-run/run-issue.json --models ${models} --max-usd-cents ${maxUsdCents} --max-requests ${maxRequests}`
  .nothrow()
  .quiet();
const out = res.stdout.toString() + res.stderr.toString();

if (res.exitCode !== 0) {
  // Lifetime budget exhausted is terminal: auto-pause the repo until a top-up + maintainer resume.
  if (out.includes('repo_lifetime_budget_exhausted')) {
    await $`gh label create agent-repo-paused --color b60205 --description "Repo-level autonomy pause"`.nothrow().quiet();
    if ((await $`gh issue list --state open --label agent-repo-paused --limit 1 --json number --jq 'length'`.text()).trim() === '0') {
      await $`gh issue create --title "Repo paused: lifetime model budget exhausted" --label agent-repo-paused --body ${'This repository has spent its lifetime model budget and is paused. Top up its budget (sponsorship) via the model proxy, then remove the `agent-repo-paused` label / close this issue to resume.'}`.nothrow();
    }
    console.error('lifetime budget exhausted; repo auto-paused');
    process.exit(1);
  }
  console.error('model token mint failed; the agent run cannot reach the model endpoint');
  process.exit(1);
}

const token = out.match(/^token=(.*)$/m)?.[1] ?? '';
if (!token) {
  console.error('mint succeeded but no token returned');
  process.exit(1);
}

const base = proxyUrl.replace(/\/$/, '');
appendFileSync(githubEnv, [
  `OPENAI_BASE_URL=${base}/v1`,
  `ANTHROPIC_BASE_URL=${base}`,
  `OPENAI_API_KEY=${token}`,
  `ANTHROPIC_API_KEY=${token}`,
  '',
].join('\n'));
console.log('model endpoint provisioned (bounded run token; admin credential stays in this step)');
