#!/usr/bin/env node
// The `oa` executable. Deliberately plain, portable TS (erasable syntax only — no enums/namespaces/
// parameter-property shorthand) so Node's built-in type-stripping (unflagged since Node 22.6, and this
// package's own engines floor is 22.18+, matching the root open-autonomy package) can run this file
// directly via `node`; the package remains straightforward to execute from a source checkout. No
// bundler/build step is required to use this package from within the OA monorepo or a bun-based
// adopter repo (bun also runs .ts directly); a real npm publish would additionally ship a built dist/ —
// out of scope here (this PR does not publish).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCli } from '../index.ts';

// Activation validation loads the compiler workspaces, whose source modules intentionally use Bun's
// TypeScript/module resolver. Keep the lightweight help/pause/status/doctor verbs directly Node-runnable;
// re-exec only the resident/activation verbs under the already-required Bun runtime.
const command = process.argv[2];
if (typeof globalThis.Bun === 'undefined' && (!command || command === 'start' || command === 'activate' || command === 'rollback')) {
  const child = spawnSync('bun', [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}

const code = await runCli(process.argv.slice(2));
process.exit(code);
