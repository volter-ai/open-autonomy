#!/usr/bin/env bun
// Revoke a bounded model-proxy run via the workflow's GitHub OIDC identity — no admin secret in the repo
// (the owning repo, proven via OIDC, may revoke its own run). Best-effort — revocation is cost/concurrency
// hygiene; bounded tokens also expire on their own, so a failure here never fails the job.

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function getOidcToken(audience: string): Promise<string | undefined> {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) return undefined;
  const url = new URL(requestUrl);
  url.searchParams.set('audience', audience);
  const res = await fetch(url, { headers: { authorization: `Bearer ${requestToken}`, accept: 'application/json' } });
  const body = await res.json() as { value?: string };
  return res.ok ? body.value : undefined;
}

async function main(): Promise<void> {
  const runId = arg('--run-id');
  const proxyUrl = process.env.MODEL_PROXY_URL;
  if (!runId || !proxyUrl) {
    process.stderr.write('revoke: missing --run-id or MODEL_PROXY_URL; skipping\n');
    return;
  }
  const audience = process.env.MODEL_PROXY_OIDC_AUDIENCE; // deployment config (policy.box.github) — no org default
  if (!audience) {
    process.stderr.write('revoke: missing MODEL_PROXY_OIDC_AUDIENCE; relying on run expiry\n');
    return;
  }
  try {
    const oidc = await getOidcToken(audience);
    if (!oidc) {
      process.stderr.write('revoke: no OIDC token available; relying on run expiry\n');
      return;
    }
    const res = await fetch(new URL(`/v1/runs/${encodeURIComponent(runId)}/revoke`, proxyUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${oidc}` },
    });
    if (!res.ok) process.stderr.write(`revoke: proxy returned ${res.status}; run will expire on its own\n`);
  } catch (error) {
    process.stderr.write(`revoke: ${error instanceof Error ? error.message : String(error)}; ignoring\n`);
  }
}

main();
