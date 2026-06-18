#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Provisions (and idempotently reconciles) a GitHub repository for open-autonomy from a committed
// declarative manifest: repo existence, initial content, repo variables, labels, and branch
// protection. Secrets are never set here; the manifest's required_secrets are reported as manual
// follow-up. Safe to re-run: variables/labels/branch-protection are reconciled, and content is only
// pushed to an empty repo unless --force-content is given.

export interface ProvisionManifest {
  description?: string;
  private: boolean;
  required_secrets: string[];
  variables: Array<{ name: string; value: string }>;
  labels: Array<{ name: string; color?: string; description?: string }>;
  branch_protection?: { branch: string; required_checks: string[] };
}

export interface VariablePlan {
  name: string;
  value: string;
  action: 'create' | 'update' | 'unchanged';
}

export interface LabelPlan {
  name: string;
  action: 'create' | 'exists';
}

export function parseManifest(text: string): ProvisionManifest {
  const raw = JSON.parse(text) as Partial<ProvisionManifest>;
  if (!Array.isArray(raw.variables)) throw new Error('manifest.variables must be an array');
  if (!Array.isArray(raw.labels)) throw new Error('manifest.labels must be an array');
  for (const variable of raw.variables) {
    if (!variable?.name || typeof variable.value !== 'string') {
      throw new Error('each manifest variable needs a name and string value');
    }
  }
  return {
    description: raw.description,
    private: raw.private ?? true,
    required_secrets: raw.required_secrets ?? [],
    variables: raw.variables,
    labels: raw.labels,
    branch_protection: raw.branch_protection,
  };
}

export function planVariables(
  desired: ProvisionManifest['variables'],
  existing: Record<string, string>,
): VariablePlan[] {
  return desired.map((variable) => {
    if (!(variable.name in existing)) return { ...variable, action: 'create' as const };
    if (existing[variable.name] !== variable.value) return { ...variable, action: 'update' as const };
    return { ...variable, action: 'unchanged' as const };
  });
}

export function planLabels(desired: ProvisionManifest['labels'], existing: string[]): LabelPlan[] {
  const have = new Set(existing);
  return desired.map((label) => ({ name: label.name, action: have.has(label.name) ? 'exists' : 'create' }));
}

export function missingSecrets(required: string[], present: string[]): string[] {
  const have = new Set(present);
  return required.filter((name) => !have.has(name));
}

export function formatReport(input: {
  repo: string;
  created: boolean;
  pushed: boolean;
  variables: VariablePlan[];
  labels: LabelPlan[];
  branchProtection: 'configured' | 'skipped' | 'failed' | 'none';
  missingSecrets: string[];
  dryRun: boolean;
}): string {
  const lines: string[] = [];
  const tag = input.dryRun ? '[dry-run] ' : '';
  lines.push(`${tag}repo ${input.repo}: ${input.created ? 'created' : 'already exists'}`);
  lines.push(`${tag}content: ${input.pushed ? 'pushed initial commit' : 'left existing history untouched'}`);
  const changed = input.variables.filter((v) => v.action !== 'unchanged');
  lines.push(`${tag}variables: ${changed.length} to apply, ${input.variables.length - changed.length} unchanged`);
  for (const v of changed) lines.push(`  - ${v.action} ${v.name}`);
  const created = input.labels.filter((l) => l.action === 'create');
  lines.push(`${tag}labels: ${created.length} to create, ${input.labels.length - created.length} present`);
  for (const l of created) lines.push(`  - create ${l.name}`);
  lines.push(`${tag}branch protection: ${input.branchProtection}`);
  if (input.missingSecrets.length > 0) {
    lines.push(`${tag}MANUAL: set these secrets (not handled by this script):`);
    for (const name of input.missingSecrets) lines.push(`  - ${name}`);
  } else {
    lines.push(`${tag}secrets: all required secrets present`);
  }
  return lines.join('\n');
}

interface Options {
  repo: string;
  source: string;
  manifest: string;
  private?: boolean;
  forceContent: boolean;
  dryRun: boolean;
}

function usage(): never {
  throw new Error(`Usage:
  bun scripts/provision-target-repo.ts --repo owner/name --source examples/testbed [--manifest path] [--private] [--force-content] [--dry-run]`);
}

function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const repo = value('--repo');
  const source = value('--source');
  if (!repo || !source) usage();
  return {
    repo,
    source: resolve(source),
    manifest: value('--manifest') ?? join(resolve(source), 'provision.json'),
    private: argv.includes('--private') ? true : undefined,
    forceContent: argv.includes('--force-content'),
    dryRun: argv.includes('--dry-run'),
  };
}

function run(cmd: string, args: string[], opts: { input?: string; cwd?: string } = {}): string {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    input: opts.input,
    cwd: opts.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function tryRun(cmd: string, args: string[], opts: { input?: string; cwd?: string } = {}): { ok: boolean; out: string } {
  try {
    return { ok: true, out: run(cmd, args, opts) };
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string };
    return { ok: false, out: String(err.stderr ?? err.stdout ?? error) };
  }
}

function repoExists(repo: string): boolean {
  return tryRun('gh', ['repo', 'view', repo, '--json', 'name']).ok;
}

function mainHasCommits(repo: string): boolean {
  const result = tryRun('gh', ['api', `repos/${repo}/commits`, '--jq', '.[0].sha']);
  return result.ok && result.out.trim().length > 0;
}

const ALWAYS_EXCLUDE = new Set(['.git', 'node_modules', '.agent-run']);

// Enumerate the files to push, relative to `source`. Works whether `source` is a directory inside
// a git repo (committed example like examples/testbed) or a standalone build dir assembled by a
// bootstrap (scaffold + overlay). Git enumeration respects .gitignore (excludes node_modules); the
// filesystem-walk fallback applies when the source is not a git tree.
export function sourceFiles(source: string): string[] {
  const tracked = tryRun('git', ['-C', source, 'ls-files', '--cached', '--others', '--exclude-standard']);
  if (tracked.ok) {
    const files = tracked.out.split('\n').map((line) => line.trim()).filter(Boolean);
    if (files.length > 0) return files;
  }
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (ALWAYS_EXCLUDE.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(source, '');
  return out.sort();
}

function pushInitialContent(repo: string, source: string): void {
  const tmp = mkdtempSync(join(tmpdir(), 'provision-'));
  try {
    for (const rel of sourceFiles(source)) {
      const abs = join(source, rel);
      if (!existsSync(abs)) continue;
      const target = join(tmp, rel);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(abs, target);
    }
    run('git', ['init', '-b', 'main'], { cwd: tmp });
    run('git', ['add', '-A'], { cwd: tmp });
    run('git', ['commit', '-m', 'Initial open-autonomy content'], { cwd: tmp });
    run('git', ['remote', 'add', 'origin', `https://github.com/${repo}.git`], { cwd: tmp });
    run('git', ['push', '-u', '--force', 'origin', 'main'], { cwd: tmp });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifest = parseManifest(readFileSync(options.manifest, 'utf8'));
  const isPrivate = options.private ?? manifest.private;

  const exists = repoExists(options.repo);
  if (!exists && !options.dryRun) {
    const visibility = isPrivate ? '--private' : '--public';
    run('gh', ['repo', 'create', options.repo, visibility, ...(manifest.description ? ['--description', manifest.description] : [])]);
  }

  const hasCommits = exists ? mainHasCommits(options.repo) : false;
  const shouldPush = (!hasCommits || options.forceContent) && !options.dryRun;
  if (shouldPush) {
    // A force-push to an existing protected branch is rejected, so drop protection before pushing;
    // the branch-protection step below re-adds it. Keeps re-provisioning idempotent and hands-free.
    if (exists && manifest.branch_protection) {
      tryRun('gh', ['api', '-X', 'DELETE', `repos/${options.repo}/branches/${manifest.branch_protection.branch}/protection`]);
    }
    pushInitialContent(options.repo, options.source);
  }

  const existingVars: Record<string, string> = {};
  if (exists || shouldPush) {
    const result = tryRun('gh', ['variable', 'list', '-R', options.repo, '--json', 'name,value']);
    if (result.ok) {
      for (const item of JSON.parse(result.out) as Array<{ name: string; value: string }>) {
        existingVars[item.name] = item.value;
      }
    }
  }
  const variablePlan = planVariables(manifest.variables, existingVars);
  if (!options.dryRun) {
    for (const v of variablePlan) {
      if (v.action === 'unchanged') continue;
      run('gh', ['variable', 'set', v.name, '-R', options.repo, '--body', v.value]);
    }
  }

  let existingLabels: string[] = [];
  const labelList = tryRun('gh', ['label', 'list', '-R', options.repo, '--json', 'name', '--limit', '200']);
  if (labelList.ok) existingLabels = (JSON.parse(labelList.out) as Array<{ name: string }>).map((l) => l.name);
  const labelPlan = planLabels(manifest.labels, existingLabels);
  if (!options.dryRun) {
    for (const label of manifest.labels) {
      if (labelPlan.find((l) => l.name === label.name)?.action !== 'create') continue;
      run('gh', [
        'label', 'create', label.name, '-R', options.repo, '--force',
        ...(label.color ? ['--color', label.color] : []),
        ...(label.description ? ['--description', label.description] : []),
      ]);
    }
  }

  let branchProtection: 'configured' | 'skipped' | 'failed' | 'none' = 'none';
  if (manifest.branch_protection) {
    if (options.dryRun || !(hasCommits || shouldPush)) {
      branchProtection = 'skipped';
    } else {
      const body = JSON.stringify({
        required_status_checks: { strict: true, contexts: manifest.branch_protection.required_checks },
        enforce_admins: false,
        required_pull_request_reviews: null,
        restrictions: null,
      });
      const result = tryRun('gh', [
        'api', '-X', 'PUT',
        `repos/${options.repo}/branches/${manifest.branch_protection.branch}/protection`,
        '--input', '-',
      ], { input: body });
      branchProtection = result.ok ? 'configured' : 'failed';
      if (!result.ok) process.stderr.write(`branch protection not applied: ${result.out.trim()}\n`);
    }
  }

  let presentSecrets: string[] = [];
  const secretList = tryRun('gh', ['secret', 'list', '-R', options.repo, '--json', 'name']);
  if (secretList.ok) presentSecrets = (JSON.parse(secretList.out) as Array<{ name: string }>).map((s) => s.name);

  const report = formatReport({
    repo: options.repo,
    created: !exists,
    pushed: shouldPush,
    variables: variablePlan,
    labels: labelPlan,
    branchProtection,
    missingSecrets: missingSecrets(manifest.required_secrets, presentSecrets),
    dryRun: options.dryRun,
  });
  process.stdout.write(`${report}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
