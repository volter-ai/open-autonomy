#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

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

interface ManagedFilesManifest {
  schema: 'open-autonomy.managed-files.v1';
  files: string[];
}

interface Options {
  template: string;
  target: string;
  out: string;
  apply: boolean;
}

const MANAGED_FILES_PATH = '.open-autonomy/managed-files.json';

function usage(): never {
  throw new Error(`Usage:
  bun scripts/open-autonomy-upgrade.ts --template templates/self-driving-repo --target . [--apply] --out upgrade-plan.json`);
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
  const templateFiles = readManagedFilesManifest(template, { required: true });
  const targetFiles = readManagedFilesManifest(target, { required: false });
  const changes: UpgradePlanEntry[] = [];

  for (const file of templateFiles) {
    const templateText = readFileSync(join(template, file), 'utf8');
    const targetPath = join(target, file);
    if (!existsSync(targetPath)) {
      changes.push({ path: file, action: 'add' });
    } else if (readFileSync(targetPath, 'utf8') !== templateText) {
      changes.push({ path: file, action: 'update' });
    }
  }
  for (const file of targetFiles) {
    if (!templateFiles.includes(file)) changes.push({ path: file, action: 'delete' });
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
    if (change.action === 'delete') {
      rmSync(target, { force: true });
      continue;
    }
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

function readManagedFilesManifest(root: string, options: { required: boolean }): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    if (options.required) throw new Error(`template directory does not exist: ${root}`);
    return [];
  }
  const manifestPath = join(root, MANAGED_FILES_PATH);
  if (!existsSync(manifestPath)) {
    if (options.required) throw new Error(`managed files manifest is missing: ${manifestPath}`);
    return [];
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManagedFilesManifest;
  if (manifest.schema !== 'open-autonomy.managed-files.v1' || !Array.isArray(manifest.files)) {
    throw new Error(`managed files manifest is invalid: ${manifestPath}`);
  }
  const files = Array.from(new Set([...manifest.files, MANAGED_FILES_PATH])).sort();
  for (const file of files) {
    validateManagedPath(file, manifestPath);
    const path = join(root, file);
    if (options.required && (!existsSync(path) || !statSync(path).isFile())) {
      throw new Error(`managed file listed in template manifest is missing: ${file}`);
    }
  }
  return files;
}

function validateManagedPath(path: string, manifestPath: string): void {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..') || path === '') {
    throw new Error(`managed files manifest contains unsafe path in ${manifestPath}: ${path}`);
  }
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
