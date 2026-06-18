#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

// Never copy build/VCS artifacts into a scaffolded repo — they are regenerated locally and would
// bloat the target (and the provisioner's pushed content).
const SCAFFOLD_EXCLUDE = new Set(['node_modules', '.git', '.agent-run']);

function copyTemplate(template: string, target: string, force: boolean): string[] {
  mkdirSync(target, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(template)) {
    if (SCAFFOLD_EXCLUDE.has(name)) continue;
    const from = join(template, name);
    const to = join(target, name);
    if (existsSync(to) && !force) {
      throw new Error(`${to} already exists. Re-run with --force to overwrite template files.`);
    }
    cpSync(from, to, { recursive: true, force });
    copied.push(name);
  }
  return copied;
}

function assertTargetDirectory(path: string): void {
  if (!existsSync(path)) return;
  if (!statSync(path).isDirectory()) throw new Error(`target is not a directory: ${path}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertTargetDirectory(options.target);
  const template = resolve('templates/self-driving-repo');
  if (!existsSync(template)) throw new Error(`template directory not found: ${template}`);
  const copied = copyTemplate(template, options.target, options.force);
  process.stdout.write(`Installed open-autonomy template into ${options.target}\n`);
  process.stdout.write(`Copied: ${copied.sort().join(', ')}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
