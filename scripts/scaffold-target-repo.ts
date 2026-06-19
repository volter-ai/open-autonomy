#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

interface Options {
  target: string;
  force: boolean;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/scaffold-target-repo.ts --target ../my-repo [--force]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const target = value('--target');
  if (!target) usage();
  return { target: resolve(target), force: argv.includes('--force') };
}

// Scaffolding IS compiling the open-autonomy profile onto the github substrate — there is no
// hand-maintained template. The installation = compile(profiles/repo-maintenance, github), which
// injects the substrate runtime and copies the profile's skills/docs/manifest/workflows verbatim.
const PROFILE = 'profiles/repo-maintenance';

async function main(): Promise<void> {
  const { target, force } = parseArgs(process.argv.slice(2));
  if (existsSync(target)) {
    if (!statSync(target).isDirectory()) throw new Error(`target is not a directory: ${target}`);
    if (!force && readdirSync(target).some((name) => name !== '.git')) {
      throw new Error(`${target} is not empty. Re-run with --force to write into it.`);
    }
  }
  execFileSync('bun', ['bin/autonomy-compile.ts', PROFILE, 'github', target], { stdio: 'inherit' });
  process.stdout.write(`Scaffolded open-autonomy into ${target} (compiled from ${PROFILE})\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
