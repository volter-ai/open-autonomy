#!/usr/bin/env bun
import { chmodSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dist = 'packages/local-runner-cli/dist';
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const result = spawnSync('bun', [
  'build',
  'packages/local-runner-cli/src/bin/oa.ts',
  '--target=node',
  '--packages=bundle',
  '--external', '@termfleet/core/*',
  '--outfile', `${dist}/oa.js`,
], { stdio: 'inherit' });
if (result.status) process.exit(result.status ?? 1);
chmodSync(`${dist}/oa.js`, 0o755);
