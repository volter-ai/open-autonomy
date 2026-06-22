#!/usr/bin/env bun
// Build the self-contained, Node-runnable `open-autonomy` CLI published to npm.
//
// The library is bun-native (TS run directly, a few bun globals). For npm we bundle it for Node via
// `bun build --target=node`, polyfilling the bun globals in the node entry (bin/open-autonomy.node.ts).
// The emit code reads sibling DATA files relative to import.meta.url (the runtime backends + the github
// runtime mirror); the bundle keeps import.meta.url pointing at dist/, so we copy those files next to
// the bundle. The result runs under plain `node` (hence `npx open-autonomy`) with no bun required.
import { chmodSync, copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DIST = 'dist';
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const build = spawnSync(
  'bun',
  ['build', 'bin/open-autonomy.node.ts', '--target=node', '--outfile', `${DIST}/cli.js`],
  { stdio: 'inherit' },
);
if (build.status) process.exit(build.status ?? 1);

// Data files the bundled emit reads at runtime via import.meta.url (now resolving to dist/).
copyFileSync('packages/substrate-local/src/backend.mjs', `${DIST}/backend.mjs`);
copyFileSync('packages/substrate-local/src/runner-frontend.ts', `${DIST}/runner-frontend.ts`);
copyFileSync('packages/substrate-github/src/control-backend.mjs', `${DIST}/control-backend.mjs`);
cpSync('packages/substrate-github/src/runtime', `${DIST}/runtime`, { recursive: true });

// Force a Node shebang (the bun entry's shebang is carried through otherwise).
let cli = readFileSync(`${DIST}/cli.js`, 'utf8');
cli = cli.replace(/^#![^\n]*\n/, '');
writeFileSync(`${DIST}/cli.js`, `#!/usr/bin/env node\n${cli}`);
chmodSync(`${DIST}/cli.js`, 0o755);

console.log(`built ${DIST}/cli.js (node) + runtime data files`);
