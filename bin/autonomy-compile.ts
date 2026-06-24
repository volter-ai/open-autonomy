#!/usr/bin/env bun
// Compile a profile (an `autonomy.ir.v1` ir.yml) onto a substrate, producing an installation.
//   bun bin/autonomy-compile.ts <profileName|profileDir> <local|github> [outDir]
// The first arg is either a BUNDLED profile name (e.g. `self-driving`, resolved to the profiles/ shipped
// with this package) or a path to a profile dir of your own. With no outDir, prints the installation's file
// list (a dry run). With outDir, materializes it.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIr, compiledPaths, materialize } from '@open-autonomy/core';
import { compileLocal } from '@open-autonomy/substrate-local';
import { compileGithub } from '@open-autonomy/substrate-github';

// The bundled profiles ship next to this module's package root: at dist/cli.js when installed from npm
// (import.meta.url → dist/, profiles/ is its sibling), and at bin/ in the dev checkout (../profiles/). So
// `../profiles` resolves correctly in both. A bare name picks a bundled profile; an existing path wins first.
const profilesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles');
function resolveProfile(arg: string): string | undefined {
  if (existsSync(join(arg, 'ir.yml'))) return arg; // an explicit path to a profile dir
  const bundled = join(profilesRoot, arg); // a bare bundled-profile name
  if (existsSync(join(bundled, 'ir.yml'))) return bundled;
  return undefined;
}
function bundledProfileNames(): string[] {
  try { return readdirSync(profilesRoot).filter((n) => existsSync(join(profilesRoot, n, 'ir.yml'))).sort(); } catch { return []; }
}

const [profileArg, substrate, outDir] = process.argv.slice(2);
if (!profileArg || (substrate !== 'local' && substrate !== 'github')) {
  console.error(`usage: autonomy-compile <profileName|profileDir> <local|github> [outDir]\n  bundled profiles: ${bundledProfileNames().join(', ') || '(none found)'}`);
  process.exit(2);
}

const profileDir = resolveProfile(profileArg);
if (!profileDir) {
  console.error(`open-autonomy: no profile "${profileArg}" — not a path with an ir.yml, and not a bundled profile.\n  bundled profiles: ${bundledProfileNames().join(', ') || '(none found)'}`);
  process.exit(2);
}

const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
const out = substrate === 'local' ? compileLocal(ir) : compileGithub(ir);

if (outDir) {
  const written = materialize(out, outDir, (from) => readFileSync(join(profileDir, from), 'utf8'));
  console.log(`installed ${written.length} files into ${outDir}`);
  if (substrate === 'local') {
    // A local install isn't runnable until termfleet + a logged-in agent CLI are up, and the start
    // command lives only here — print it so the user never has to read source to run the loop.
    const cd = outDir === '.' ? '' : `cd ${outDir} && `;
    console.log(
      `\nNext steps (local loop):\n` +
        `  1. Prereqs: Node 20+, tmux, and termfleet  ->  npm install -g termfleet\n` +
        `  2. Sign in to your agent CLI: run \`claude\` then \`/login\`  (or \`codex login\`)\n` +
        `  3. Start termfleet (console + a local provider):\n` +
        `       termfleet console serve --name dev --port 7373 &\n` +
        `       termfleet provider serve --kind virtual-tmux --prefix dev --count 1 --port 7402 &\n` +
        `  4. Run the loop:  ${cd}node scheduler/run.mjs --once   (one tick)  |  node scheduler/run.mjs   (continuous)\n` +
        `  Full guide: https://github.com/volter-ai/open-autonomy/blob/main/docs/LOCAL-QUICKSTART.md`,
    );
  }
} else {
  console.log(compiledPaths(out).join('\n'));
}
