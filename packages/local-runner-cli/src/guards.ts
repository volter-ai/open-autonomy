// Preflight guards ported verbatim from run.mjs (S6/T6, unchanged in either fork): the termfleet
// dependency check, the OA-04 dep-integrity collision probe (RUNNER_SPECS), and the OA-03
// uncommitted-harness guard. `doctor` folds the termfleet + OA-04 checks in as one of its checks; `start`/
// `once` run them as hard preflight gates before the schedule ever fires, exactly like run.mjs did.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProcRunner } from './types.ts';
import { defaultProc, firstErrLine } from './proc.ts';

export interface GuardResult {
  ok: boolean;
  message?: string;
}

/** Does this schedule need the runner (termfleet SDK) at all? A script-only schedule (every agent a
 *  deterministic scripts/*.ts behavior) never touches it — the check is scoped to schedules that
 *  actually need it, never a false alarm on one that doesn't. */
export function needsRunner(cmds: string[]): boolean {
  return cmds.some((c) => c.includes('run-agent.mjs'));
}

/** termfleet-installed check: node_modules/termfleet must exist before a schedule that launches a skill
 *  agent through the runner fires — otherwise the FIRST command an adopter runs dies several process-hops
 *  deep with a raw, buried ERR_MODULE_NOT_FOUND. */
export function checkTermfleetInstalled(cwd: string): GuardResult {
  const termfleetDir = join(cwd, 'node_modules', 'termfleet');
  if (existsSync(termfleetDir)) return { ok: true };
  return {
    ok: false,
    message:
      '[oa] this schedule launches a skill agent through the runner, but termfleet is not installed in this repo.\n' +
      '  Fix:  npm install termfleet   (the local runner drives it via its SDK — see docs/OPERATIONS.md#local-runner-quickstart)',
  };
}

// OA-04: node_modules/termfleet EXISTING is not enough — an npm workspace can symlink a runner-dependency
// path to the HOST's own in-development source (shadowing), or this repo's own root package.json can
// itself be named one of the runner's imported specifiers (Node ESM self-reference). Resolve each
// specifier the runner ACTUALLY imports the way it will at launch (import.meta.resolve from the repo
// root, in a fresh child `node`) and refuse unless it lands on a REAL copy inside node_modules/.
const RUNNER_SPECS: Array<[string, string]> = [
  ['termfleet', 'termfleet'],
  ['@termfleet/core', '@termfleet/core/local-providers.js'],
  ['ztrack', 'ztrack/preset-kit'],
];

function probeSpec(cwd: string, name: string, spec: string, proc: ProcRunner): string | null {
  const pkgDir = join(cwd, 'node_modules', name);
  if (!existsSync(join(pkgDir, 'package.json'))) return null; // not installed -> nothing to probe
  const probe = proc('node', ['--input-type=module', '-e', 'console.log(import.meta.resolve(process.argv[1]))', spec], { cwd });
  if (probe.status !== 0) return `"${spec}" failed to resolve (${firstErrLine(probe.stderr)})`;
  let resolvedPath: string;
  try {
    resolvedPath = fileURLToPath((probe.stdout || '').trim());
  } catch {
    return `could not parse the resolved specifier for "${spec}": ${(probe.stdout || '').trim()}`;
  }
  const expectedPrefix = pkgDir + sep;
  if (resolvedPath !== pkgDir && !resolvedPath.startsWith(expectedPrefix)) {
    return `"${spec}" resolved OUTSIDE node_modules/${name}/ (to ${resolvedPath}) — a self-reference, not the installed package`;
  }
  let real = pkgDir;
  try {
    real = realpathSync(pkgDir);
  } catch {
    /* leave as pkgDir */
  }
  const nodeModulesRoot = join(cwd, 'node_modules');
  if (real !== nodeModulesRoot && !real.startsWith(expectedPrefix) && !real.startsWith(nodeModulesRoot + sep)) {
    return `"${name}" is installed via a link that escapes node_modules into this repo (realpath ${real})`;
  }
  return null;
}

/** OA-04: the dep-integrity probe, folded into both `start`/`once` preflight AND `doctor`. Runs the SAME
 *  specifiers Check C in the compiler's collision-check probes. */
export function checkDepIntegrity(cwd: string, proc: ProcRunner = defaultProc): GuardResult {
  for (const [name, spec] of RUNNER_SPECS) {
    const detail = probeSpec(cwd, name, spec, proc);
    if (detail) {
      return {
        ok: false,
        message:
          `[oa] COLLISION: a runner dependency does not resolve to the published package this repo depends on — ${detail}.\n` +
          '  This means either (a) this repo\'s own root package.json is itself named a runner dependency (Node ESM\n' +
          '  self-reference binds the bare import to THIS repo instead of node_modules/), or (b) an npm workspace\n' +
          '  member is named "termfleet"/"@termfleet/core"/a runner dependency and its symlink shadows the published copy.\n' +
          '  Fix: rename the colliding workspace/root package, or run the loop from a repo that does not itself\n' +
          '  develop the runner\'s own dependencies. (docs/adoption-fixes/OA-04-workspace-name-collision-detection.md)',
      };
    }
  }
  return { ok: true };
}

/** OA-03: agents launched with `--branch` run in git WORKTREES, which materialize only COMMITTED files.
 *  If the compiled harness isn't committed, every worker dies instantly with `Unknown command: /develop`.
 *  Checks EXACTLY the paths `.open-autonomy/generated.json` names (never a guess, never a scan of user
 *  files). Override: AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1 downgrades to a loud warning. */
export function checkUncommittedHarness(cwd: string, proc: ProcRunner = defaultProc, env: NodeJS.ProcessEnv = process.env): GuardResult {
  const manifestPath = join(cwd, '.open-autonomy', 'generated.json');
  const isGitRepo = proc('git', ['rev-parse', '--git-dir'], { cwd }).status === 0;
  if (!isGitRepo || !existsSync(manifestPath)) return { ok: true };
  let manifestFiles: string[] = [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifestFiles = Array.isArray(manifest.files) ? manifest.files : [];
  } catch {
    manifestFiles = [];
  }
  if (!manifestFiles.length) return { ok: true };

  const status = proc('git', ['status', '--porcelain', '--', ...manifestFiles], { cwd });
  const statusPaths = (status.stdout || '')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const raw = line.slice(3);
      return raw.includes(' -> ') ? raw.slice(raw.lastIndexOf(' -> ') + 4) : raw;
    });
  const lsFiles = proc('git', ['ls-files', '--', ...manifestFiles], { cwd });
  const tracked = new Set((lsFiles.stdout || '').split('\n').filter((l) => l.length > 0));
  const statusSet = new Set(statusPaths);
  const untrackedSilent = manifestFiles.filter((f) => !tracked.has(f) && !statusSet.has(f));
  const ignored = untrackedSilent.filter((f) => existsSync(join(cwd, f)));
  const dirty = statusPaths.concat(untrackedSilent.filter((f) => !existsSync(join(cwd, f))));
  if (!dirty.length && !ignored.length) return { ok: true };

  const lines = [
    '[oa] the open-autonomy harness is not (fully) committed — agents run in git worktrees, which only',
    '  see committed files; launching now would produce workers that die at launch (Unknown command: /develop).',
  ];
  if (dirty.length) lines.push(`  uncommitted (${dirty.length}):`, ...dirty.map((f) => `    ${f}`));
  if (ignored.length)
    lines.push(
      `  gitignored (${ignored.length}) — matched by .gitignore so NOT tracked; a worktree will not contain these either:`,
      ...ignored.map((f) => `    ${f}`),
    );
  lines.push(
    `  Fix:  git add ${ignored.length ? '-f ' : ''}<the paths above>  &&  git commit -m "Install the open-autonomy harness"` +
      (ignored.length ? '   (-f stages past .gitignore; or un-ignore the harness paths)' : ''),
    '  (docs/OPERATIONS.md#local-runner-quickstart, step 4. Override: AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1)',
  );
  if (env.AUTONOMY_ALLOW_UNCOMMITTED_HARNESS === '1') {
    return { ok: true, message: ['[oa] WARNING — AUTONOMY_ALLOW_UNCOMMITTED_HARNESS=1: proceeding with an uncommitted harness.'].concat(lines).join('\n') };
  }
  return { ok: false, message: lines.join('\n') };
}
