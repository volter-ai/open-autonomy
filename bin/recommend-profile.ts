#!/usr/bin/env bun
// TD.2 — the recommender SKILL's thin runnable entry (OA-INSTALL-IMPLEMENTATION-TASKS.md#td2,
// DESIGN §Phase 1 / G1). This file is deliberately NOT the skill itself — the skill is prose doctrine
// (docs/INSTALL-RECOMMENDER.md; CLAUDE.md's "scripts only for security — never script what an agent can
// do; skills are prose doctrine" applies here exactly as it does to every other agent-facing behavior).
// What IS legitimately a script: the mechanical parts an agent would otherwise have to re-derive by hand
// every time — running TD.1's decision tree (packages/core/src/recommend.ts) against the REAL bundled
// `profiles/*/ir.yml` catalog, and reading a handful of repo facts off disk/gh that are tedious and
// error-prone to eyeball (git remotes, tracked-file counts, a `gh api` admin probe). None of that is a
// security boundary — an install agent could do all of this by hand with `git`/`gh`/a text editor — so
// per CLAUDE.md this is "scripted" purely as a convenience/precision aid, not because it must be. The
// agent still owns every judgment call (which profile is *right*, what to tell the operator, whether a
// blocker is really disqualifying); this CLI only supplies FACTS + TD.1's mechanical verdict.
//
// HOME rationale (bin/, not packages/local-runner-cli/): identical reasoning to TA.3's
// bin/ensure-ci-workflow.ts (see its own header comment) — this file needs a RUNTIME import of
// `@open-autonomy/core` (recommendProfile/loadAllProfileFacts/eligible), which only resolves under `bun`
// (this monorepo's own extension-free internal imports), never under plain Node ESM. `bin/` is this
// repo's own dev/install-time tooling, always invoked via `bun bin/<x>.ts`; `packages/local-runner-cli`
// (`@volter/oa`) is the opposite — it ships standalone to an adopter's repo with zero dependencies, so it
// cannot take a monorepo-only dependency like this one. TE.2 (Phase 1 RECOMMEND/CONFIRM, the install
// agent's own consumer of TD.1/TD.2) already calls its peers this exact way.
//
// Test-glob note (same as TA.3): `check:core`'s glob (`packages/*/src/*.test.ts`) does not reach `bin/`,
// so `bin/recommend-profile.test.ts` is wired into its own `check:recommend-cli` package.json script,
// added to the `check` composite (see package.json) — the same pattern `check:ci-scaffold` established.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  eligible,
  loadAllProfileFacts,
  recommendProfile,
  REPO_SHELL_FILES,
  type ProfileFacts,
  type Recommendation,
  type RepoFacts,
  type Substrate,
} from '@open-autonomy/core';
import { profilesRoot as bundledProfilesRoot } from './bundled-profiles';

// --- repo-fact detection (DESIGN §Phase 0 DETECT's mechanically-readable subset, scoped to what TD.1's
// RepoFacts actually consumes) -----------------------------------------------------------------------------

interface ProcResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Subprocess runner shape — matches the `proc()` idiom already used for testable process calls elsewhere
 *  in this repo (packages/local-runner-cli/src/imm-signals.ts's `SignalContext.proc`, injected in
 *  imm-signals.test.ts precisely so `gh`-dependent signals can be tested without a real, authenticated,
 *  network-reachable `gh`). `detectGhAdmin`/`resolveOwnerRepo` below take the same injectable shape —
 *  onGitHub/populated detection stays on the real `git` binary unconditionally (deterministic, offline,
 *  no auth — safe to exercise for real against a throwaway tmp repo in tests, same as imm-signals.ts's
 *  own git-only signals do). */
export type ProcFn = (cmd: string, args: string[], cwd?: string) => ProcResult;

/** The real subprocess runner — never throws; a missing binary or non-zero exit is just a ProcResult the
 *  caller inspects, never an unhandled exception. */
export const defaultProc: ProcFn = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.error) return { status: 1, stdout: '', stderr: String((r.error as Error).message ?? r.error) };
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

// git-only detection (onGitHub/populated) always uses the real subprocess runner directly — no gh, no
// network, safe against any real tmp git repo in tests.
const proc: ProcFn = defaultProc;

function firstLine(s: string): string {
  return s.trim().split('\n')[0] ?? '';
}

interface FactResult<T> {
  value: T;
  note: string;
}

/** onGitHub: does the repo have a git remote pointing at github.com? A repo with no `.git` at all, or a
 *  git repo with no remotes, or remotes that point somewhere else (a self-hosted git server, a different
 *  code host) all read as `false` — this is a plain existence check, never ambiguous, so (unlike ghAdmin)
 *  it never needs an "unknown" state. */
function detectOnGitHub(repoDir: string): FactResult<boolean> {
  if (!existsSync(join(repoDir, '.git'))) {
    return { value: false, note: 'onGitHub=false — no .git directory at all (not a git repository)' };
  }
  const r = proc('git', ['-C', repoDir, 'remote', '-v']);
  if (r.status !== 0 || !r.stdout.trim()) {
    return { value: false, note: 'onGitHub=false — git repository with no remotes configured (git remote -v: empty)' };
  }
  const onGitHub = /github\.com/i.test(r.stdout);
  return {
    value: onGitHub,
    note: onGitHub
      ? `onGitHub=true — git remote -v shows a github.com remote ("${firstLine(r.stdout)}")`
      : `onGitHub=false — git remote -v shows remote(s), none pointing at github.com ("${firstLine(r.stdout)}")`,
  };
}

/** populated: does the repo carry tracked content beyond the whole-repo-scaffold's own shell files
 *  (README.md/package.json/.gitignore/CHANGELOG.md — recommend.ts's REPO_SHELL_FILES, the same set the
 *  compile-time clobber guard uses, bin/autonomy-compile.ts:233-257)? Prefers `git ls-files` (the
 *  mechanically honest answer — untracked/gitignored cruft shouldn't count as "populated"); falls back to
 *  a plain directory listing only when there is no usable git-tracked file list at all (e.g. a directory
 *  that was never `git init`-ed), so an empty scratch repo still reads as unpopulated. */
function detectPopulated(repoDir: string): FactResult<boolean> {
  if (existsSync(join(repoDir, '.git'))) {
    const r = proc('git', ['-C', repoDir, 'ls-files']);
    if (r.status === 0) {
      const files = r.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const beyond = files.filter((f) => !REPO_SHELL_FILES.has(f));
      return {
        value: beyond.length > 0,
        note: `populated=${beyond.length > 0} — git ls-files: ${files.length} tracked file(s), ${beyond.length} beyond the scaffold set [${[...REPO_SHELL_FILES].join(', ')}]`,
      };
    }
  }
  let entries: string[] = [];
  try {
    entries = readdirSync(repoDir).filter((e) => e !== '.git' && e !== 'node_modules' && !e.startsWith('.'));
  } catch {
    entries = [];
  }
  const beyond = entries.filter((e) => !REPO_SHELL_FILES.has(e));
  return {
    value: beyond.length > 0,
    note: `populated=${beyond.length > 0} — no usable git-tracked file list; fell back to a top-level directory listing: ${entries.length} entries, ${beyond.length} beyond the scaffold set`,
  };
}

/** Resolve `<owner>/<repo>` for the ghAdmin probe: prefer `gh repo view` (handles both https/ssh remotes
 *  and any gh-recognized alias), fall back to parsing `git remote get-url origin` directly. `ghProc` is
 *  injectable so tests can stub `gh` without a real, authenticated, network-reachable binary; `git remote
 *  get-url` always runs for real (offline, deterministic). */
function resolveOwnerRepo(repoDir: string, ghProc: ProcFn): string | undefined {
  const viaGh = ghProc('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], repoDir);
  if (viaGh.status === 0 && viaGh.stdout.trim()) return viaGh.stdout.trim();
  const viaGit = proc('git', ['-C', repoDir, 'remote', 'get-url', 'origin']);
  if (viaGit.status === 0) {
    const m = viaGit.stdout.trim().match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
    if (m) return m[1];
  }
  return undefined;
}

/** ghAdmin: does the operator's `gh` token hold repo-admin on this repo? Per STANDING RULE — a GitHub
 *  admin-ish endpoint 404ing (or otherwise erroring) for a non-admin token is NEVER read as a definite
 *  "no", only as "unknown" — mirrors the documented gotcha in
 *  packages/local-runner-cli/src/imm-signals.ts:397-400 (branches/<b>/protection 404s even on a PROTECTED
 *  branch for a non-admin token). IMPORTANT, verified live on this box against volter-ai/open-autonomy:
 *  `gh api repos/<owner>/<repo> --jq .permissions.admin` is a DIFFERENT endpoint from
 *  branches/<b>/protection and does NOT share that ambiguity — GitHub answers it with the caller's own,
 *  real permission level (exit 0, a clean "true"/"false"), because telling you your OWN access level on a
 *  repo you can already read is not itself an admin-gated operation. So: a non-zero exit, empty output,
 *  or anything that doesn't parse as exactly "true"/"false" is `undefined` ("unknown") — never coerced to
 *  false; but a clean "false" IS treated as a confirmed negative, not downgraded to "unknown", because
 *  live evidence (not this file's assumption) is what "adapt honestly" means here — see
 *  docs/INSTALL-RECOMMENDER.md's "ghAdmin honesty" section for the full live transcript this is based on. */
function detectGhAdmin(repoDir: string, ghProc: ProcFn): FactResult<boolean | undefined> {
  const repo = resolveOwnerRepo(repoDir, ghProc);
  if (!repo) {
    return { value: undefined, note: 'ghAdmin=unknown — could not resolve <owner>/<repo> (gh repo view and git remote get-url origin both failed)' };
  }
  const r = ghProc('gh', ['api', `repos/${repo}`, '--jq', '.permissions.admin'], repoDir);
  if (r.status !== 0) {
    return {
      value: undefined,
      note: `ghAdmin=unknown — gh api repos/${repo} --jq .permissions.admin failed (${firstLine(r.stderr) || `exit ${r.status}`}); a failed/unauthenticated admin-ish probe is never read as a negative`,
    };
  }
  const out = r.stdout.trim();
  if (out === 'true') return { value: true, note: `ghAdmin=true — gh api repos/${repo} --jq .permissions.admin -> true (confirmed admin)` };
  if (out === 'false') {
    return {
      value: false,
      note:
        `ghAdmin=false — gh api repos/${repo} --jq .permissions.admin -> false (exit 0, a clean read, ` +
        `NOT a 404). Unlike branches/<b>/protection this endpoint does not 404-ambiguity non-admin tokens, ` +
        `so this is a confirmed negative, not an "unknown" — see the note above this function.`,
    };
  }
  return { value: undefined, note: `ghAdmin=unknown — gh api repos/${repo} --jq .permissions.admin returned an unparseable value (${JSON.stringify(out)})` };
}

export interface DetectedFacts {
  repoFacts: RepoFacts;
  notes: string[];
}

/** Detect the mechanically-readable subset of RepoFacts for `repoDir`, layering in the operator-declared
 *  preferences from `overrides` (hostedRunner/preferNoAutoMerge/canFundProxy/wantsDemo/wantsSOC2 are never
 *  mechanically detectable — see canFundProxy's note below — they are always taken as given, exactly the
 *  way DESIGN §Phase 3 G3 has the human answer them). `ghProc` is injectable (default: the real `gh`
 *  subprocess) so callers — chiefly this file's own tests — can stub the ghAdmin probe deterministically;
 *  onGitHub/populated always run the real `git` binary against `repoDir` (offline, no auth needed). */
export function detectRepoFacts(repoDir: string, overrides: Partial<RepoFacts> = {}, ghProc: ProcFn = defaultProc): DetectedFacts {
  const notes: string[] = [];
  const onGitHub = detectOnGitHub(repoDir);
  notes.push(onGitHub.note);
  const populated = detectPopulated(repoDir);
  notes.push(populated.note);

  let ghAdmin: boolean | undefined;
  if (onGitHub.value) {
    const admin = detectGhAdmin(repoDir, ghProc);
    ghAdmin = admin.value;
    notes.push(admin.note);
  } else {
    notes.push('ghAdmin=not-applicable — repo is not on GitHub, admin rights are moot');
  }

  if (overrides.canFundProxy === undefined) {
    notes.push(
      'canFundProxy=unknown — NOT mechanically detectable (funding/allowlisting a model proxy is a billing/operator decision no local tool can observe); pass --can-fund-proxy or --cannot-fund-proxy to declare it',
    );
  } else {
    notes.push(`canFundProxy=${overrides.canFundProxy} — operator-declared (--${overrides.canFundProxy ? '' : 'cannot-'}can-fund-proxy flag)`);
  }

  const repoFacts: RepoFacts = {
    onGitHub: onGitHub.value,
    populated: populated.value,
    ghAdmin,
    ...overrides,
  };
  return { repoFacts, notes };
}

// --- explain mode --------------------------------------------------------------------------------------

export function formatRecommendation(rec: Recommendation, detection: DetectedFacts): string {
  const lines: string[] = [];
  lines.push(`Recommendation: ${rec.profile} @ ${rec.substrate}`);
  lines.push('');
  lines.push('Why:');
  for (const reason of rec.reasons) lines.push(`  - ${reason}`);
  lines.push('');
  lines.push('Facts this was based on:');
  for (const note of detection.notes) lines.push(`  - ${note}`);
  return lines.join('\n');
}

// --- validate-a-pre-pick mode ---------------------------------------------------------------------------

export interface ValidationResult {
  profile: string;
  substrate: Substrate;
  ok: boolean;
  blocker?: string;
  notes: string[];
}

/** Validate an operator's PRE-PICKED profile against the repo, instead of recommending one — reusing
 *  TD.1's exact `eligible()` check (same clobber-guard citation, same targets/catalog logic) rather than
 *  re-deriving it. On a hard blocker, additionally runs the ordinary recommender against the SAME
 *  repoFacts and folds its top pick into the blocker message as the actionable alternative — this is what
 *  turns "X is blocked" into "X is blocked — pick Y instead" (the spec's own acceptance-case phrasing). */
export function validatePrePick(pickedName: string, substrateArg: Substrate | undefined, repoFacts: RepoFacts, profiles: ProfileFacts[]): ValidationResult {
  const byName = new Map(profiles.map((p) => [p.name, p] as const));
  const picked = byName.get(pickedName);
  const notes: string[] = [];

  let substrate = substrateArg;
  if (!substrate) {
    if (picked) {
      if (repoFacts.hostedRunner && picked.targets.includes('gh-actions')) substrate = 'gh-actions';
      else if (picked.targets.includes('local')) substrate = 'local';
      else substrate = (picked.targets[0] as Substrate) ?? 'local';
      notes.push(`substrate not given — inferred '${substrate}' from "${pickedName}"'s targets [${picked.targets.join(', ')}]${repoFacts.hostedRunner ? ' + --hosted-runner' : ''}`);
    } else {
      substrate = 'local';
      notes.push(`substrate not given and "${pickedName}" is not a known profile — defaulted to 'local' for the eligibility check`);
    }
  }

  const check = eligible(byName, repoFacts, pickedName, substrate);
  if (check.ok) {
    notes.push(
      `"${pickedName}" is eligible for this repo @ ${substrate}: targets [${check.facts.targets.join(', ')}] include '${substrate}'` +
        (check.facts.isWholeRepoScaffold ? `, and although it is a whole-repo scaffold the repo is unpopulated (no clobber risk)` : ''),
    );
    return { profile: pickedName, substrate, ok: true, notes };
  }

  let blocker = check.why;
  try {
    const alt = recommendProfile(repoFacts, profiles);
    if (alt.profile !== pickedName && picked) {
      blocker += ` — pick ${alt.profile}${alt.substrate !== substrate ? ` @ ${alt.substrate}` : ''} (recommended for this repo: ${alt.reasons[alt.reasons.length - 1]}) or use a dedicated, empty repo for "${pickedName}".`;
    } else if (alt.profile !== pickedName) {
      // pickedName isn't a known profile at all — a "use a dedicated, empty repo for it" tail would be
      // nonsense; just point at the recommender's own pick.
      blocker += ` — recommended for this repo instead: ${alt.profile} @ ${alt.substrate}.`;
    }
  } catch {
    // recommendProfile found nothing eligible either — leave the blocker as the bare eligibility reason;
    // nothing honest to add as an alternative.
  }

  return { profile: pickedName, substrate, ok: false, blocker, notes };
}

export function formatValidation(result: ValidationResult, detection: DetectedFacts): string {
  const lines: string[] = [];
  if (result.ok) {
    lines.push(`OK: "${result.profile}" @ ${result.substrate} is valid for this repo.`);
  } else {
    lines.push(`BLOCKED: "${result.profile}" @ ${result.substrate} is NOT valid for this repo.`);
    lines.push('');
    lines.push(result.blocker ?? '(no blocker detail)');
  }
  lines.push('');
  lines.push('Notes:');
  for (const note of [...result.notes, ...detection.notes]) lines.push(`  - ${note}`);
  return lines.join('\n');
}

// --- CLI arg parsing -------------------------------------------------------------------------------------

interface CliOptions {
  repoDir?: string;
  json: boolean;
  pick?: string;
  substrate?: Substrate;
  hostedRunner?: boolean;
  preferNoAutoMerge?: boolean;
  canFundProxy?: boolean;
  wantsDemo?: boolean;
  wantsSOC2?: boolean;
  profilesRoot?: string;
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { json: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--json':
        opts.json = true;
        break;
      case '--pick':
        opts.pick = argv[++i];
        break;
      case '--substrate':
        opts.substrate = argv[++i] as Substrate;
        break;
      case '--hosted-runner':
        opts.hostedRunner = true;
        break;
      case '--no-hosted-runner':
        opts.hostedRunner = false;
        break;
      case '--prefer-no-auto-merge':
        opts.preferNoAutoMerge = true;
        break;
      case '--can-fund-proxy':
        opts.canFundProxy = true;
        break;
      case '--cannot-fund-proxy':
        opts.canFundProxy = false;
        break;
      case '--demo':
        opts.wantsDemo = true;
        break;
      case '--soc2':
        opts.wantsSOC2 = true;
        break;
      case '--profiles-root':
        opts.profilesRoot = argv[++i];
        break;
      default:
        if (!a.startsWith('--')) positional.push(a);
        break;
    }
  }
  opts.repoDir = positional[0];
  return opts;
}

const USAGE = [
  'usage: bun bin/recommend-profile.ts <repoDir> [--json]',
  '                                     [--pick <profileName>] [--substrate local|gh-actions]',
  '                                     [--hosted-runner|--no-hosted-runner] [--prefer-no-auto-merge]',
  '                                     [--can-fund-proxy|--cannot-fund-proxy] [--demo] [--soc2]',
  '                                     [--profiles-root <dir>]',
].join('\n');

export function run(argv: string[], profilesRootDefault: string): { ok: boolean; output: string } {
  const opts = parseArgs(argv);
  if (!opts.repoDir) {
    return { ok: false, output: USAGE };
  }
  if (opts.substrate && opts.substrate !== 'local' && opts.substrate !== 'gh-actions') {
    return { ok: false, output: `error: --substrate must be 'local' or 'gh-actions', got "${opts.substrate}"\n\n${USAGE}` };
  }

  const detection = detectRepoFacts(opts.repoDir, {
    hostedRunner: opts.hostedRunner,
    preferNoAutoMerge: opts.preferNoAutoMerge,
    canFundProxy: opts.canFundProxy,
    wantsDemo: opts.wantsDemo,
    wantsSOC2: opts.wantsSOC2,
  });

  const profilesRoot = opts.profilesRoot ?? profilesRootDefault;
  const profiles = loadAllProfileFacts(profilesRoot);

  if (opts.pick) {
    const result = validatePrePick(opts.pick, opts.substrate, detection.repoFacts, profiles);
    const output = opts.json
      ? JSON.stringify({ mode: 'validate', result, repoFacts: detection.repoFacts, notes: detection.notes }, null, 2)
      : formatValidation(result, detection);
    return { ok: result.ok, output };
  }

  try {
    const rec = recommendProfile(detection.repoFacts, profiles);
    const output = opts.json
      ? JSON.stringify({ mode: 'recommend', recommendation: rec, repoFacts: detection.repoFacts, notes: detection.notes }, null, 2)
      : formatRecommendation(rec, detection);
    return { ok: true, output };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    return { ok: false, output: opts.json ? JSON.stringify({ mode: 'recommend', error: msg, repoFacts: detection.repoFacts, notes: detection.notes }, null, 2) : `error: ${msg}` };
  }
}

// --- standalone CLI: bun bin/recommend-profile.ts <repoDir> [--json] [--pick <profile>] ... -------------
if (import.meta.main) {
  const result = run(process.argv.slice(2), bundledProfilesRoot);
  process.stdout.write(result.output + '\n');
  process.exit(result.ok ? 0 : 1);
}
