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
  MODEL_PROXY_URL=... MODEL_PROXY_ADMIN_TOKEN=... bun scripts/model-proxy-mint.ts --issue issue.json --models model-a,model-b [--run-id run_...]`);
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const proxyUrl = process.env.MODEL_PROXY_URL;
  const adminToken = process.env.MODEL_PROXY_ADMIN_TOKEN;
  if (!proxyUrl || !adminToken) throw new Error('MODEL_PROXY_URL and MODEL_PROXY_ADMIN_TOKEN are required');

  const issue = JSON.parse(readFileSync(options.issue, 'utf8')) as { number?: number; user?: { login?: string } };
  const actor = process.env.GITHUB_ACTOR ?? issue.user?.login ?? 'unknown';
  const repo = process.env.GITHUB_REPOSITORY ?? 'local/repo';
  const res = await fetch(new URL('/admin/runs/mint', proxyUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': adminToken,
    },
    body: JSON.stringify({
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
    }),
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
