#!/usr/bin/env bun
import { appendFileSync, readFileSync } from 'node:fs';

interface Options {
  issue: string;
  runId?: string;
  models: string[];
  maxUsdCents?: number;
  maxRequests?: number;
  purpose?: 'triage' | 'agent' | 'review' | 'pm';
}

function usage(): never {
  throw new Error(`Usage:
  MODEL_PROXY_URL=... bun scripts/model-proxy-mint.ts --issue issue.json --models model-a,model-b [--run-id run_...]   (mints via GitHub OIDC; run inside a workflow with id-token: write)`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const issue = value('--issue');
  const models = value('--models')?.split(',').map((m) => m.trim()).filter(Boolean);
  if (!issue || !models?.length) usage();
  return {
    issue,
    runId: value('--run-id'),
    models,
    maxUsdCents: value('--max-usd-cents') ? Number(value('--max-usd-cents')) : undefined,
    maxRequests: value('--max-requests') ? Number(value('--max-requests')) : undefined,
    purpose: parsePurpose(value('--purpose')),
  };
}

function parsePurpose(value: string | undefined): Options['purpose'] {
  if (value === 'triage' || value === 'agent' || value === 'review' || value === 'pm') return value;
  return 'agent';
}

async function getOidcToken(audience: string): Promise<string> {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    throw new Error('no admin token and no GitHub Actions OIDC environment (need id-token: write permission)');
  }
  const oidcUrl = new URL(requestUrl);
  oidcUrl.searchParams.set('audience', audience);
  const res = await fetch(oidcUrl, { headers: { authorization: `Bearer ${requestToken}`, accept: 'application/json' } });
  const body = await res.json() as { value?: string; error?: string };
  if (!res.ok || !body.value) throw new Error(`GitHub OIDC token request failed: ${res.status} ${body.error ?? ''}`);
  return body.value;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const proxyUrl = process.env.MODEL_PROXY_URL;
  if (!proxyUrl) throw new Error('MODEL_PROXY_URL is required');

  const issue = JSON.parse(readFileSync(options.issue, 'utf8')) as { number?: number; user?: { login?: string } };
  const actor = process.env.GITHUB_ACTOR ?? issue.user?.login ?? 'unknown';
  const repo = process.env.GITHUB_REPOSITORY ?? 'local/repo';
  const payload = JSON.stringify({
    run_id: options.runId,
    repo,
    issue: issue.number,
    actor,
    models: options.models,
    max_usd_cents: options.maxUsdCents,
    max_requests: options.maxRequests,
    purpose: options.purpose,
    github_run_id: process.env.GITHUB_RUN_ID,
    github_run_attempt: process.env.GITHUB_RUN_ATTEMPT,
    github_workflow_ref: process.env.GITHUB_WORKFLOW_REF,
  });

  // Mint the run via the workflow's GitHub OIDC identity — NO stored admin secret. The proxy derives
  // repo/actor/run from the OIDC token and gates on its trusted-repo allow-list. (Admin run-minting is an
  // operator/treasury op on the proxy itself, never an in-cell agent's; that's why it isn't here.)
  const audience = process.env.MODEL_PROXY_OIDC_AUDIENCE; // deployment config (policy.box.github) — no org default
  if (!audience) throw new Error('MODEL_PROXY_OIDC_AUDIENCE is required (the install sets it from policy.box.github)');
  const oidc = await getOidcToken(audience);
  const res = await fetch(new URL('/v1/runs/mint', proxyUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${oidc}` },
    body: payload,
  });
  const body = await res.json() as { token?: string; run?: { run_id?: string }; error?: { code?: string } };
  if (!res.ok || !body.token || !body.run?.run_id) {
    throw new Error(`model proxy mint failed: ${res.status} ${body.error?.code ?? JSON.stringify(body)}`);
  }

  process.stdout.write(`::add-mask::${body.token}\n`);
  process.stdout.write(`run_id=${body.run.run_id}\n`);
  process.stdout.write(`token=${body.token}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `run_id=${body.run.run_id}\ntoken=${body.token}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
