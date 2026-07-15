#!/usr/bin/env bun
import { chmodSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dist = 'packages/local-runner-cli/dist';
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const [entry, output] of [
  ['packages/local-runner-cli/src/index.ts', `${dist}/index.js`],
  ['packages/local-runner-cli/src/bin/oa.ts', `${dist}/oa.js`],
] as const) {
  const result = spawnSync('bun', [
    'build', entry, '--target=node', '--packages=bundle', '--external', '@termfleet/core/*', '--outfile', output,
  ], { stdio: 'inherit' });
  if (result.status) process.exit(result.status ?? 1);
}
chmodSync(`${dist}/oa.js`, 0o755);
