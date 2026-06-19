#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export interface UpgradePlanEntry {
  path: string;
  action: 'add' | 'update' | 'delete';
}

export interface UpgradePlan {
  schema: 'open-autonomy.upgrade-plan.v1';
  template: string;
  target: string;
  changes: UpgradePlanEntry[];
  migration_notes: string[];
}

interface Options {
  template: string;
  target: string;
  out: string;
  apply: boolean;
}

// Template-owned files: propagated verbatim (overwrite on drift). These are the shared
// mechanism — workflows, scripts, agent skills, coding standards, rubrics, policy wiring.
const MANAGED_PREFIXES = [
  '.github/workflows/',
  '.open-autonomy/',
  '.codex/skills/',
  'scripts/',
  'docs/standards/',
  'VERSION',
];

// Local-owned files: seeded into a new repo if missing, but NEVER overwritten by upgrade,
// because each installed repo customizes its own roadmap, agent config, and constitution
// (its north star and merit criteria). Propagating these verbatim would clobber the very
// things the repo is meant to own.
const SEED_ONLY_PATHS = [
  '.open-autonomy/roadmap.yml',
  '.open-autonomy/autonomy.yml',
  '.open-autonomy/strategist-sources.json',
  'docs/CONSTITUTION.md',
  'AGENTS.md',
];

function usage(): never {
  throw new Error(`Usage:
  bun scripts/open-autonomy-upgrade.ts --template <compiled-installation> --target . [--apply] --out upgrade-plan.json
  (produce the template with: bun bin/autonomy-compile.ts profiles/self-driving github <dir>)`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const template = value('--template');
  const target = value('--target');
  if (!template || !target) usage();
  return {
    template: resolve(template),
    target: resolve(target),
    out: value('--out') ?? '.agent-run/upgrade-plan.json',
    apply: argv.includes('--apply'),
  };
}

export function buildUpgradePlan(template: string, target: string): UpgradePlan {
  const templateFiles = managedFiles(template);
  const changes: UpgradePlanEntry[] = [];

  for (const file of templateFiles) {
    const templateText = readFileSync(join(template, file), 'utf8');
    const targetPath = join(target, file);
    if (!existsSync(targetPath)) {
      changes.push({ path: file, action: 'add' });
    } else if (isSeedOnly(file)) {
      // Local-owned and already present: never overwrite the repo's own roadmap/config/constitution.
      continue;
    } else if (readFileSync(targetPath, 'utf8') !== templateText) {
      changes.push({ path: file, action: 'update' });
    }
  }
  return {
    schema: 'open-autonomy.upgrade-plan.v1',
    template,
    target,
    changes: changes.sort((a, b) => a.path.localeCompare(b.path)),
    migration_notes: renderMigrationNotes(changes),
  };
}

export function applyUpgradePlan(plan: UpgradePlan): void {
  for (const change of plan.changes) {
    const source = join(plan.template, change.path);
    const target = join(plan.target, change.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source));
  }
}

function renderMigrationNotes(changes: UpgradePlanEntry[]): string[] {
  if (changes.length === 0) return ['No template changes detected.'];
  return [
    `${changes.length} managed template file(s) need updates.`,
    ...changes.map((change) => `- ${change.action}: ${change.path}`),
  ];
}

function managedFiles(root: string): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`template directory does not exist: ${root}`);
  }
  return walk(root)
    .map((path) => relative(root, path))
    .filter((path) => isInScope(path))
    .sort();
}

function walk(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    if (name === '.git' || name === 'node_modules' || name === '.agent-run') continue;
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (stat.isFile()) out.push(path);
  }
  return out;
}

function isManaged(path: string): boolean {
  return MANAGED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function isSeedOnly(path: string): boolean {
  return SEED_ONLY_PATHS.includes(path);
}

function isInScope(path: string): boolean {
  return isManaged(path) || isSeedOnly(path);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const plan = buildUpgradePlan(options.template, options.target);
  mkdirSync(dirname(resolve(options.out)), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  if (options.apply) applyUpgradePlan(plan);
  process.stdout.write(`upgrade-plan=${plan.changes.length}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
