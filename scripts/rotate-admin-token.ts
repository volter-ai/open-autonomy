#!/usr/bin/env bun
// Rotate the model-proxy admin token ATOMICALLY across its two homes so they can never silently drift
// again. The token has exactly two legitimate homes now: the CANONICAL worker secret
// (AGENT_PROXY_ADMIN_TOKEN, what the proxy validates) and the local operator .env (what bench --live /
// fund-bootstrap send for treasury ops — mint/grant). They are hand-kept-in-sync, and they DID drift:
// a worker rotation left .env stale (401), with no trace because both are out-of-band secrets. This
// sets a fresh value in both at once and verifies it, so the pair is always consistent.
//
//   bun scripts/rotate-admin-token.ts             # generate a fresh token, set worker + .env, verify
//   bun scripts/rotate-admin-token.ts --token X   # use a specific value (e.g. to adopt an existing one)
//
// DESTRUCTIVE: invalidates the old token immediately. Any OTHER holder of the old value will 401 until
// updated — notably a not-yet-migrated installation whose workflows still admin-mint (current installs
// mint via OIDC and hold NO admin token, so they are unaffected). Migrate such installs to OIDC first.
// Dev/operator tooling — never shipped into an install (see DEV_ONLY in bin/sync-runtime.ts).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const token = arg('--token') ?? randomBytes(32).toString('hex');
const proxyDir = 'services/agent-model-proxy';
const proxyUrl = process.env.MODEL_PROXY_URL || 'https://volter-agent-model-proxy.aaron-0ed.workers.dev';
const ENV_PATH = '.env';
const ENV_KEYS = ['MODEL_PROXY_ADMIN_TOKEN', 'AGENT_PROXY_ADMIN_TOKEN']; // client name + worker name, kept identical

// 1) The canonical home: the worker secret. `wrangler secret put` reads the value from stdin.
console.log('[1/3] setting worker secret AGENT_PROXY_ADMIN_TOKEN …');
const put = spawnSync('bunx', ['wrangler', 'secret', 'put', 'AGENT_PROXY_ADMIN_TOKEN'], {
  cwd: proxyDir,
  input: `${token}\n`,
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (put.status) {
  console.error('wrangler secret put failed (are you logged in to the worker\'s Cloudflare account?)');
  process.exit(1);
}

// 2) The local operator home: .env (both the client and worker env names, kept identical).
let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
for (const key of ENV_KEYS) {
  const line = `${key}=${token}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  env = re.test(env) ? env.replace(re, line) : `${env}${env.endsWith('\n') || env === '' ? '' : '\n'}${line}\n`;
}
writeFileSync(ENV_PATH, env);
console.log('[2/3] updated .env');

// 3) Verify the new token authenticates (the worker secret can take a few seconds to propagate).
console.log('[3/3] verifying against the worker …');
for (let i = 0; i < 6; i++) {
  const res = await fetch(`${proxyUrl}/admin/limits/status`, { headers: { 'x-admin-token': token } });
  if (res.ok) {
    console.log('✓ rotated + verified — worker secret and .env now hold the same token');
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.error('✗ verification failed after retries (worker secret may still be propagating; re-run verify shortly)');
process.exit(1);
