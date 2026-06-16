#!/usr/bin/env bun
import { appendFileSync } from 'node:fs';

interface Options {
  runId: string;
  audience: string;
}

function usage(): never {
  throw new Error(`Usage:
  MODEL_PROXY_URL=... ACTIONS_ID_TOKEN_REQUEST_URL=... ACTIONS_ID_TOKEN_REQUEST_TOKEN=... bun scripts/model-proxy-exchange.ts --run-id run_... [--audience volter-agent-model-proxy]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const runId = value('--run-id');
  if (!runId) usage();
  return {
    runId,
    audience: value('--audience') ?? process.env.MODEL_PROXY_OIDC_AUDIENCE ?? 'volter-agent-model-proxy',
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const proxyUrl = process.env.MODEL_PROXY_URL;
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!proxyUrl || !requestUrl || !requestToken) {
    throw new Error('MODEL_PROXY_URL and GitHub Actions OIDC environment are required');
  }

  const oidcUrl = new URL(requestUrl);
  oidcUrl.searchParams.set('audience', options.audience);
  const oidcRes = await fetch(oidcUrl, {
    headers: {
      authorization: `Bearer ${requestToken}`,
      accept: 'application/json',
    },
  });
  const oidcBody = await oidcRes.json() as { value?: string; error?: string };
  if (!oidcRes.ok || !oidcBody.value) {
    throw new Error(`GitHub OIDC token request failed: ${oidcRes.status} ${oidcBody.error ?? JSON.stringify(oidcBody)}`);
  }

  const exchangeRes = await fetch(new URL(`/v1/runs/${encodeURIComponent(options.runId)}/exchange`, proxyUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${oidcBody.value}`,
      accept: 'application/json',
    },
  });
  const exchangeBody = await exchangeRes.json() as { token?: string; error?: { code?: string } };
  if (!exchangeRes.ok || !exchangeBody.token) {
    throw new Error(`model proxy exchange failed: ${exchangeRes.status} ${exchangeBody.error?.code ?? JSON.stringify(exchangeBody)}`);
  }

  process.stdout.write(`::add-mask::${exchangeBody.token}\n`);
  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `MODEL_PROXY_TOKEN=${exchangeBody.token}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
