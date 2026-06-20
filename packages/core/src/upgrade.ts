// Upgrading an installation is a RE-COMPILE, not a file-by-file merge. An installation is
// `compile(profile, substrate)` — everything in it is derived OUTPUT except two things the install
// owns: its source inputs (roadmap, constitution, sources, the repo shell) and its runtime state. So an
// upgrade regenerates the derived set from a fresh compile and leaves the owned inputs alone; a derived
// file the new compile no longer produces simply isn't reproduced — it's an orphan, removed. The
// authority on "what is derived" is the compile itself (`CompileOutput.generated` + `.copies`), not a
// prefix heuristic.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { CompileOutput } from './ir';

// Files the INSTALL owns. `compile` produces them (from the profile's seed), but each installation
// customizes them — its roadmap, its north-star constitution, its repo shell — so on upgrade they are
// seeded only if MISSING and never overwritten. Everything else compile produces is derived output.
// (This is the same set the dogfood check treats as repo-owned.)
export const INSTALL_OWNED_PATHS = [
  'package.json',
  'bun.lock',
  'README.md',
  'CHANGELOG.md',
  '.gitignore',
  'AGENTS.md',
  '.open-autonomy/autonomy.yml',
  '.open-autonomy/roadmap.yml',
  '.open-autonomy/strategist-sources.json',
  'docs/CONSTITUTION.md',
  'docs/PROJECT.md',
  'docs/ROADMAP.md',
  'docs/ARCHITECTURE.md',
];
const installOwned = new Set(INSTALL_OWNED_PATHS);
export function isInstallOwned(path: string): boolean {
  return installOwned.has(path);
}

// Directories that are 100% derived output (the generated workflows, the injected runtime, generated
// skill copies). A file under one of these that the compile no longer produces is a stale orphan and is
// removed. Deliberately NOT `.open-autonomy/` (mixes seed + runtime state like strategist-archive.json)
// and NOT the repo root (install-owned shell).
const PRUNE_DIRS = ['.github/workflows/', 'scripts/', '.codex/skills/'];

export type UpgradeAction = 'add' | 'update' | 'delete';
export interface UpgradeChange {
  path: string;
  action: UpgradeAction;
}
export interface UpgradePlan {
  schema: 'open-autonomy.upgrade-plan.v1';
  changes: UpgradeChange[];
  notes: string[];
}

/** The full derived output of a compile, as installPath -> content bytes. */
function desiredContents(out: CompileOutput, profileDir: string): Map<string, Buffer> {
  const desired = new Map<string, Buffer>();
  for (const [path, content] of Object.entries(out.generated)) desired.set(path, Buffer.from(content));
  for (const { from, to } of out.copies) desired.set(to, readFileSync(join(profileDir, from)));
  return desired;
}

/** Plan the upgrade of `targetDir` to a freshly-compiled installation: regenerate derived files, seed
 *  install-owned inputs only if missing, and prune derived orphans (within PRUNE_DIRS only). */
export function planUpgrade(out: CompileOutput, profileDir: string, targetDir: string): UpgradePlan {
  const desired = desiredContents(out, profileDir);
  const changes: UpgradeChange[] = [];
  for (const [path, content] of desired) {
    const tp = join(targetDir, path);
    if (isInstallOwned(path)) {
      if (!existsSync(tp)) changes.push({ path, action: 'add' }); // seed if missing; never overwrite
      continue;
    }
    if (!existsSync(tp)) changes.push({ path, action: 'add' });
    else if (!readFileSync(tp).equals(content)) changes.push({ path, action: 'update' });
  }
  for (const installed of installedFilesUnder(targetDir, PRUNE_DIRS)) {
    if (!desired.has(installed) && !isInstallOwned(installed)) changes.push({ path: installed, action: 'delete' });
  }
  changes.sort((a, b) => a.path.localeCompare(b.path));
  return { schema: 'open-autonomy.upgrade-plan.v1', changes, notes: renderNotes(changes) };
}

/** Apply a plan: regenerate/seed from the compile output; delete orphans. */
export function applyUpgrade(plan: UpgradePlan, out: CompileOutput, profileDir: string, targetDir: string): void {
  const desired = desiredContents(out, profileDir);
  for (const change of plan.changes) {
    const tp = join(targetDir, change.path);
    if (change.action === 'delete') {
      if (existsSync(tp)) unlinkSync(tp);
      continue;
    }
    const content = desired.get(change.path);
    if (!content) continue;
    mkdirSync(dirname(tp), { recursive: true });
    writeFileSync(tp, content);
  }
}

function renderNotes(changes: UpgradeChange[]): string[] {
  if (changes.length === 0) return ['Already up to date with the open-autonomy template.'];
  return [`${changes.length} change(s):`, ...changes.map((c) => `- ${c.action}: ${c.path}`)];
}

function installedFilesUnder(root: string, dirs: string[]): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    const base = join(root, dir);
    if (!existsSync(base) || !statSync(base).isDirectory()) continue;
    for (const abs of walk(base)) out.push(relative(root, abs));
  }
  return out;
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
