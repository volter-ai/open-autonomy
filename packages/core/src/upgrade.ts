// Upgrading an installation is a RE-COMPILE, not a file-by-file merge. An installation is
// `compile(profile, substrate)` — everything in it is derived OUTPUT except two things the install
// owns: its source inputs (roadmap, constitution, sources, the repo shell) and its runtime state. So an
// upgrade regenerates the derived set from a fresh compile and leaves the owned inputs alone; a derived
// file the new compile no longer produces simply isn't reproduced — it's an orphan, removed. The
// authority on "what is derived" is the compile itself (`CompileOutput.generated` + `.copies`), not a
// prefix heuristic.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CompileOutput } from './ir';
import { readGeneratedManifest } from './file-manifest';

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
  '.gitattributes',
  'AGENTS.md',
  '.open-autonomy/roadmap.yml',
  '.open-autonomy/strategist-sources.json',
  '.open-autonomy/architecture-invariants.yml', // the architectural measuring stick — human-owned, ratified
  //   per-install; seed-once, never overwritten by upgrade (like the constitution + roadmap).
  'docs/CONSTITUTION.md',
  'docs/PROJECT.md',
  'docs/ROADMAP.md',
  'docs/ARCHITECTURE.md',
  'provision.json', // the install's branch-protection/required-checks manifest — the adopter tunes it to
  //   their product (e.g. their own `ci` context, their reviewer count); seed-once so upgrade never reverts it.
];
const installOwned = new Set(INSTALL_OWNED_PATHS);
// Path PREFIXES the install owns. Unlike the exact paths above, these cover a whole tree an installation
// fills in and then owns. `compliance/` is the SOC 2 policy/evidence tree a profile seeds as templates
// (information-security policy, risk register, subprocessor list, …): the adopter edits them to match
// THEIR org, so on upgrade they are seeded only if missing and never overwritten — exactly like the
// constitution/roadmap. Security CI (the workflows under `.github/`) stays derived, so upgrades keep
// pushing control improvements; only the human-authored policy bodies are seed-once.
const INSTALL_OWNED_PREFIXES = ['compliance/'];
export function isInstallOwned(path: string): boolean {
  return installOwned.has(path) || INSTALL_OWNED_PREFIXES.some((p) => path.startsWith(p));
}

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
 *  install-owned inputs only if missing, and — ONLY when `opts.prune` is set — prune derived orphans
 *  (within PRUNE_DIRS).
 *
 *  Prune deletes ONLY files THIS install's manifest (`.open-autonomy/generated.json`) records as
 *  open-autonomy-generated and that the new compile no longer produces. Ownership is recorded, not
 *  guessed: a hand-authored file (in `scripts/` or anywhere) is never in the manifest, so it can never
 *  be pruned — no matter its folder name. If there is no manifest (a legacy install, or a directory that
 *  isn't an installation at all), prune finds nothing and deletes nothing. Prune is also OPT-IN
 *  (`opts.prune`); the CLI requires `--prune` AND `--apply` — belt and suspenders on top of the
 *  manifest scoping. (This is the Terraform/Helm model: manage and destroy only what you provably own.) */
export function planUpgrade(
  out: CompileOutput,
  profileDir: string,
  targetDir: string,
  opts: { prune?: boolean } = {},
): UpgradePlan {
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
  if (opts.prune) {
    // Orphans = paths the PRIOR install recorded as generated, that this compile no longer produces.
    // Scoped to the manifest, so only open-autonomy's own files can ever be deleted.
    for (const owned of readGeneratedManifest(targetDir)) {
      if (!desired.has(owned) && existsSync(join(targetDir, owned))) changes.push({ path: owned, action: 'delete' });
    }
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
