#!/usr/bin/env bun
// TE.1 — Phase 0 DETECT (OA-INSTALL-IMPLEMENTATION-TASKS.md#te1, DESIGN §Phase 0 + hardening #8;
// docs/INSTALL-AGENT.md:84-139; env checks bin/doctor-checks.ts:382-489,622-657).
//
// This is the install agent's read-only reconnaissance step: read the target repo, `gh`, the local
// toolchain, and any pre-existing `.open-autonomy/` install, and produce a DETECT REPORT — inputs for
// later phases (TE.2 RECOMMEND, TE.3 CAPTURE DIRECTION, TE.4 AUTHORIZE). Per DESIGN's own framing
// ("never ask for what it can read") this file asks NOTHING and writes NOTHING: every field is a fact
// read off disk or from a read-only `gh`/tool probe. `git status` on the probed repo is clean before and
// after a run (proven live — see the acceptance transcripts in the PR body).
//
// HOME rationale (bin/, not packages/local-runner-cli/): identical reasoning to TA.3's
// bin/ensure-ci-workflow.ts and TD.2's bin/recommend-profile.ts (see their own header comments) — this
// file takes a RUNTIME (value, not type-only) import of `@open-autonomy/core`
// (`GENERATED_MANIFEST_PATH`/`readGeneratedManifest`), which resolves its own internal modules
// extension-free — fine under `bun`, never resolvable by plain Node ESM. `bin/` is this repo's own
// dev/install-time tooling (`bun bin/<x>.ts`); `packages/local-runner-cli` (`@volter/oa`) ships
// standalone to an adopter's repo with zero dependencies and cannot take this dependency.
//
// TD.2 REUSE DECISION (per the STANDING RULE — "reuse detectGhAdmin from TD.2/#152 if merged, else
// mirror it"): PR #152 (TD.2, `bin/recommend-profile.ts`) merged to `main` (f401fa4) partway through this
// unit's build — REUSED, not mirrored. `onGitHub`/`populated`/`ghAdmin` (incl. the "never coerce an
// admin-probe error/404 to a definite negative" doctrine) are now sourced from a single call to TD.2's own
// exported `detectRepoFacts()` below — not re-derived. `ProcFn`/`defaultProc` are also imported straight
// from `bin/recommend-profile.ts` rather than re-declared, so both files share one injectable subprocess
// seam. What is NOT reused, and why: `detectRepoFacts()`'s own git/ghAdmin helpers
// (`detectOnGitHub`/`detectPopulated`/`detectGhAdmin`/`resolveOwnerRepo`) are module-PRIVATE in
// `bin/recommend-profile.ts` (not `export`ed) — only the composed `detectRepoFacts()` is public, and it
// intentionally returns booleans + prose notes, not the richer facts this DETECT REPORT also needs
// (`remoteUrl`, `defaultBranch`, `trackedFileCount`, gh `visibility`/`plan`/`login` — none of which TD.1's
// recommender consumes, so TD.2 never computes them). Below, `detectGitFacts` calls `detectRepoFacts` for
// the authoritative onGitHub/populated/ghAdmin booleans, then adds a few small, non-duplicative extra
// `git`/`gh` reads for those extra fields — it does not re-derive TD.2's own ambiguity-handling logic.
//
// DOCTOR REUSE (mirrors, not reimplements, "oa doctor"'s own env/auth/provider checks — exactly what the
// task brief asks for): `checkEnv`/`checkAuth`/`checkProvider` are imported verbatim from
// `./doctor-checks.ts` and their real `CheckResult`s are embedded in the report's `doctorChecks` field —
// this is the SAME mechanism `bin/doctor-checks.ts:622-657` (auth) and `:382-489` (env) already use, not
// a reimplementation. `checkAuth()` in particular already IS the honest "unverifiable without a live
// probe" seam the task brief asks for (its `UNSUPPORTED_SUBCOMMAND` branch returns WARN with exactly that
// wording) — this file does not re-derive that logic, it calls the same function doctor calls. Per
// doctor-checks.ts's own "SPEND guarantee" comment, `checkAuth()`'s subprocess call is each coding CLI's
// own NON-SPENDING introspection command (`claude auth status` / `codex login status`), never a real
// prompt/session — so calling it here does not violate "no agent launches": nothing is dispatched, no
// model is called, no work session starts.
//
// Test-glob note (same pattern as TA.3/TD.2): `check:core`'s glob (`packages/*/src/*.test.ts`) does not
// reach `bin/`, so `bin/install-detect.test.ts` is wired into its own `check:install-detect` package.json
// script, added to the `check` composite (see package.json).
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GENERATED_MANIFEST_PATH, readGeneratedManifest } from '@open-autonomy/core';
import { checkAuth, checkEnv, checkProvider, type CheckResult } from './doctor-checks.ts';
import { defaultProc, detectRepoFacts, type ProcFn } from './recommend-profile.ts';

// Re-export the shared injectable subprocess seam (TD.2's `ProcFn`/`defaultProc`, bin/recommend-profile.ts)
// so this file's own tests/CLI can import it from one place — packages/local-runner-cli/src/imm-
// signals.ts's `SignalContext.proc` is the same idiom in a different package.
export { defaultProc, type ProcFn };

function firstLine(s: string): string {
  return s.trim().split('\n')[0] ?? '';
}

// =========================================================================================================
// Repo facts: language/build, git remote + onGitHub, empty-vs-populated.
// =========================================================================================================

const LANGUAGE_MANIFESTS: Array<{ file: string; language: string }> = [
  { file: 'package.json', language: 'node' },
  { file: 'go.mod', language: 'go' },
  { file: 'Cargo.toml', language: 'rust' },
  { file: 'pyproject.toml', language: 'python' },
  { file: 'setup.py', language: 'python' },
  { file: 'requirements.txt', language: 'python' },
  { file: 'pom.xml', language: 'java' },
  { file: 'build.gradle', language: 'java' },
  { file: 'build.gradle.kts', language: 'java' },
  { file: 'Gemfile', language: 'ruby' },
];
const LOCKFILE_MANAGERS: Array<{ file: string; manager: string }> = [
  { file: 'bun.lock', manager: 'bun' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'package-lock.json', manager: 'npm' },
];

export interface RepoBuildFacts {
  hasPackageJson: boolean;
  language: string;
  buildFiles: string[];
  packageManager?: string;
  notes: string[];
}

/** Language/build from package.json + lockfiles + other manifests (DESIGN §Phase 0 first line). Presence-
 *  only, never content-parsed judgment — the same "existence, not content" bar TA.1's vision gate uses. */
export function detectLanguageAndBuild(repoDir: string): RepoBuildFacts {
  const buildFiles: string[] = [];
  let language: string | undefined;
  for (const { file, language: lang } of LANGUAGE_MANIFESTS) {
    if (existsSync(join(repoDir, file))) {
      buildFiles.push(file);
      if (!language) language = lang;
    }
  }
  let packageManager: string | undefined;
  for (const { file, manager } of LOCKFILE_MANAGERS) {
    if (existsSync(join(repoDir, file))) {
      buildFiles.push(file);
      if (!packageManager) packageManager = manager;
    }
  }
  const hasPackageJson = existsSync(join(repoDir, 'package.json'));
  const notes: string[] = [];
  if (language) notes.push(`language=${language} — found ${buildFiles.filter((f) => LANGUAGE_MANIFESTS.some((m) => m.file === f)).join(', ')}`);
  else notes.push('language=unknown — none of package.json/go.mod/Cargo.toml/pyproject.toml|setup.py|requirements.txt/pom.xml|build.gradle[.kts]/Gemfile found');
  notes.push(packageManager ? `packageManager=${packageManager} — found ${LOCKFILE_MANAGERS.find((m) => m.manager === packageManager)!.file}` : 'packageManager=none detected (no lockfile)');
  return { hasPackageJson, language: language ?? 'unknown', buildFiles, packageManager, notes };
}

export interface GitFacts {
  isGitRepo: boolean;
  onGitHub: boolean;
  remoteUrl?: string;
  defaultBranch?: string;
  populated: boolean;
  trackedFileCount: number;
  notes: string[];
}

/** onGitHub + populated: sourced from TD.2's own `detectRepoFacts()` (bin/recommend-profile.ts) — see
 *  this file's header "TD.2 REUSE DECISION". `remoteUrl`/`defaultBranch`/`trackedFileCount` are extra
 *  facts TD.1's recommender never needed and TD.2 never computes; they're added here via small, plain
 *  `git` reads (no ambiguity handling to re-derive — `detectRepoFacts` already owns that). */
export function detectGitFacts(repoDir: string, proc: ProcFn = defaultProc): GitFacts {
  const isGitRepo = existsSync(join(repoDir, '.git'));
  const { repoFacts, notes } = detectRepoFacts(repoDir, {}, proc);

  let remoteUrl: string | undefined;
  let defaultBranch: string | undefined;
  let trackedFileCount = 0;
  if (isGitRepo) {
    const remoteR = proc('git', ['-C', repoDir, 'remote', '-v'], repoDir);
    if (remoteR.status === 0 && remoteR.stdout.trim()) remoteUrl = firstLine(remoteR.stdout).split(/\s+/)[1];
    const branchR = proc('git', ['-C', repoDir, 'symbolic-ref', '--short', 'HEAD'], repoDir);
    if (branchR.status === 0 && branchR.stdout.trim()) defaultBranch = branchR.stdout.trim();
    const lsR = proc('git', ['-C', repoDir, 'ls-files'], repoDir);
    if (lsR.status === 0) trackedFileCount = lsR.stdout.split('\n').map((s) => s.trim()).filter(Boolean).length;
  } else {
    try {
      trackedFileCount = readdirSync(repoDir).filter((e) => e !== '.git' && e !== 'node_modules' && !e.startsWith('.')).length;
    } catch {
      trackedFileCount = 0;
    }
  }

  return { isGitRepo, onGitHub: repoFacts.onGitHub, remoteUrl, defaultBranch, populated: repoFacts.populated, trackedFileCount, notes };
}

// =========================================================================================================
// gh facts: auth status, admin (confirmed/unknown per STANDING RULE), visibility + plan.
// =========================================================================================================

export interface GhFacts {
  ghInstalled: boolean;
  authStatus: 'authenticated' | 'not-authenticated' | 'gh-not-installed';
  login?: string;
  /** true/false = CONFIRMED (a clean, non-erroring read); undefined = UNKNOWN (an error/404/unparseable
   *  result) — NEVER coerced to false. See detectGhAdmin's own doc comment for the live-verified basis. */
  admin?: boolean;
  adminBasis: string;
  visibility?: string;
  plan?: string;
  notes: string[];
}

/** Resolve `<owner>/<repo>` for the visibility probe. TD.2's own `resolveOwnerRepo` (bin/recommend-
 *  profile.ts) does the identical resolution for its ghAdmin probe, but it is module-private (not
 *  exported) and TD.2 never needs visibility — so this is a small, low-risk, intentionally-duplicated
 *  helper (see this file's header "TD.2 REUSE DECISION"), not a re-derivation of the actual admin-probe
 *  ambiguity handling (that part IS reused, via `detectRepoFacts` below). */
function resolveOwnerRepo(repoDir: string, proc: ProcFn): string | undefined {
  const viaGh = proc('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], repoDir);
  if (viaGh.status === 0 && viaGh.stdout.trim()) return viaGh.stdout.trim();
  const viaGit = defaultProc('git', ['-C', repoDir, 'remote', 'get-url', 'origin']);
  if (viaGit.status === 0) {
    const m = viaGit.stdout.trim().match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
    if (m) return m[1];
  }
  return undefined;
}

export function detectGhFacts(repoDir: string, onGitHub: boolean, proc: ProcFn = defaultProc): GhFacts {
  const notes: string[] = [];
  const versionR = proc('gh', ['--version'], repoDir);
  const ghInstalled = versionR.status === 0;
  if (!ghInstalled) {
    return { ghInstalled: false, authStatus: 'gh-not-installed', adminBasis: 'gh CLI not found on PATH — cannot probe auth/admin/visibility/plan', notes: ['gh not installed on PATH'] };
  }
  const authR = proc('gh', ['auth', 'status'], repoDir);
  const authenticated = authR.status === 0;
  notes.push(authenticated ? `gh auth status: signed in ("${firstLine(`${authR.stdout}${authR.stderr}`)}")` : `gh auth status: not signed in (exit ${authR.status})`);

  let login: string | undefined;
  if (authenticated) {
    const loginR = proc('gh', ['api', 'user', '--jq', '.login'], repoDir);
    if (loginR.status === 0 && loginR.stdout.trim()) login = loginR.stdout.trim();
  }

  if (!authenticated) {
    return { ghInstalled: true, authStatus: 'not-authenticated', adminBasis: 'gh CLI is installed but not authenticated — admin/visibility/plan cannot be probed until sign-in', notes };
  }
  if (!onGitHub) {
    return { ghInstalled: true, authStatus: 'authenticated', login, adminBasis: 'not-applicable — repo has no github.com remote, admin rights are moot', notes };
  }

  // ghAdmin (STANDING RULE: a 404/error on an admin-ish endpoint is NEVER a confirmed negative, only
  // "unknown" — mirrors packages/local-runner-cli/src/imm-signals.ts:397-400's documented branches/<b>/
  // protection gotcha) — sourced from TD.2's own `detectRepoFacts()` (bin/recommend-profile.ts, REUSED,
  // see this file's header), not re-derived. VERIFIED LIVE against volter-ai/open-autonomy (2026-07-11,
  // `gh` 2.95.0, token identity otto-runhuman): `gh api repos/<owner>/<repo> --jq .permissions.admin`
  // returned a clean, exit-0 `{"admin":false,...}` for this genuinely non-admin token — a confirmed
  // negative, not a 404-ambiguous ANY. `detectRepoFacts` only invokes this probe when `onGitHub` is true,
  // matching this function's own `if (!onGitHub) return …` short-circuit above.
  const { repoFacts: adminFacts, notes: adminNotes } = detectRepoFacts(repoDir, {}, proc);
  const admin = adminFacts.ghAdmin;
  const adminNote = adminNotes.find((n) => n.startsWith('ghAdmin=')) ?? 'ghAdmin=unknown (no admin note produced by detectRepoFacts)';
  notes.push(adminNote);

  let visibility: string | undefined;
  const repo = resolveOwnerRepo(repoDir, proc);
  if (repo) {
    const visR = proc('gh', ['repo', 'view', repo, '--json', 'visibility', '--jq', '.visibility'], repoDir);
    if (visR.status === 0 && visR.stdout.trim()) {
      visibility = visR.stdout.trim();
      notes.push(`visibility=${visibility} — gh repo view ${repo} --json visibility`);
    } else {
      notes.push(`visibility=unknown — gh repo view ${repo} --json visibility failed (${firstLine(visR.stderr) || `exit ${visR.status}`})`);
    }
  }

  // Plan: `.owner.type` is account type, not plan (docs/INSTALL-AGENT.md:120-122) — probe the plan
  // separately; it is the AUTHENTICATED USER's own plan (gh has no unauthenticated "org plan" read), may
  // come back empty for an org-owned repo, and is honestly reported as such rather than guessed.
  let plan: string | undefined;
  const planR = proc('gh', ['api', 'user', '--jq', '.plan.name'], repoDir);
  if (planR.status === 0 && planR.stdout.trim()) {
    plan = planR.stdout.trim();
    notes.push(`plan=${plan} — gh api user --jq .plan.name (the AUTHENTICATED USER's plan, not necessarily the repo owner's — this is a personal-account field; empty/absent for many org-owned repos)`);
  } else {
    notes.push('plan=unknown — gh api user --jq .plan.name returned nothing (common for org-owned repos; the token holder is not the org)');
  }

  return { ghInstalled: true, authStatus: 'authenticated', login, admin, adminBasis: adminNote, visibility, plan, notes };
}

// =========================================================================================================
// Existing `.open-autonomy/` — re-install/upgrade detection.
// =========================================================================================================

export interface ExistingInstallFacts {
  dirPresent: boolean;
  manifestPresent: boolean;
  manifestFileCount: number;
  autonomyYmlPresent: boolean;
  installJsonPresent: boolean;
  roadmapYmlPresent: boolean;
  pausedPresent: boolean;
  reinstall: boolean;
  notes: string[];
}

export function detectExistingInstall(repoDir: string): ExistingInstallFacts {
  const dir = join(repoDir, '.open-autonomy');
  const dirPresent = existsSync(dir);
  const notes: string[] = [];
  if (!dirPresent) {
    notes.push('.open-autonomy/ not present — this is a fresh install target, not a re-install/upgrade');
    return { dirPresent: false, manifestPresent: false, manifestFileCount: 0, autonomyYmlPresent: false, installJsonPresent: false, roadmapYmlPresent: false, pausedPresent: false, reinstall: false, notes };
  }
  // readGeneratedManifest (@open-autonomy/core, GENERATED_MANIFEST_PATH='.open-autonomy/generated.json')
  // never throws — an absent/unparseable manifest just reads as [] (legacy install or non-installation).
  const manifestFiles = readGeneratedManifest(repoDir);
  const manifestPresent = manifestFiles.length > 0;
  notes.push(manifestPresent ? `${GENERATED_MANIFEST_PATH}: ${manifestFiles.length} generated path(s) recorded` : `${GENERATED_MANIFEST_PATH} missing or unparseable`);
  const autonomyYmlPresent = existsSync(join(dir, 'autonomy.yml'));
  notes.push(`.open-autonomy/autonomy.yml: ${autonomyYmlPresent ? 'present' : 'absent'}`);
  const installJsonPresent = existsSync(join(dir, 'install.json'));
  notes.push(`.open-autonomy/install.json (TB.2 maturity record): ${installJsonPresent ? 'present' : 'absent — TB.2 has not run here yet, or this repo predates it'}`);
  const roadmapYmlPresent = existsSync(join(dir, 'roadmap.yml'));
  notes.push(`.open-autonomy/roadmap.yml: ${roadmapYmlPresent ? 'present' : 'absent (expected for non-GitHub-roadmap profiles, e.g. simple-sdlc)'}`);
  const pausedPresent = existsSync(join(dir, 'paused'));
  notes.push(`.open-autonomy/paused marker: ${pausedPresent ? 'present (install is paused / never unpaused)' : 'absent (either never installed with a pause marker, or already unpaused)'}`);
  const reinstall = manifestPresent || autonomyYmlPresent;
  notes.push(reinstall ? 'RE-INSTALL/UPGRADE DETECTED — an open-autonomy install already exists at this path' : '.open-autonomy/ exists but carries no recognizable manifest/config — likely a stale/partial directory, not a real prior install');
  return { dirPresent: true, manifestPresent, manifestFileCount: manifestFiles.length, autonomyYmlPresent, installJsonPresent, roadmapYmlPresent, pausedPresent, reinstall, notes };
}

// =========================================================================================================
// Tool presence: node floor, tmux, bun, ztrack (vendored/global), termfleet (installed?/reachable?).
// =========================================================================================================

function probe(cmd: string, args: string[]): { present: boolean; output?: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) return { present: false };
  return { present: true, output: firstLine(`${r.stdout ?? ''}${r.stderr ?? ''}`) };
}

function parseVersionNumbers(s: string): number[] {
  return (s.match(/\d+/g) ?? []).slice(0, 3).map(Number);
}
function versionAtLeast(actual: number[], min: number[]): boolean {
  for (let i = 0; i < Math.max(actual.length, min.length); i++) {
    const a = actual[i] ?? 0;
    const m = min[i] ?? 0;
    if (a > m) return true;
    if (a < m) return false;
  }
  return true;
}

/** The doctor's own node floor — read from THIS repo's own package.json `engines.node`, exactly the way
 *  `bin/doctor-checks.ts`'s (unexported) `ownPackageJson()`/checkEnv do (`bin/doctor-checks.ts:387-391`).
 *  Verified: this repo's package.json:22 declares `"node": ">=22.18"`, matching the '>=22.18' fallback
 *  doctor-checks.ts itself uses if the field were ever absent. */
function ownNodeFloor(): string {
  try {
    const pkgPath = join(import.meta.dir, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { engines?: { node?: string } };
    return typeof pkg.engines?.node === 'string' ? pkg.engines.node : '>=22.18';
  } catch {
    return '>=22.18';
  }
}

export interface ToolFacts {
  node: { version: string; floor: string; meetsFloor: boolean };
  git: { present: boolean; version?: string };
  tmux: { present: boolean; version?: string };
  bun: { present: boolean; version?: string };
  ztrack: { vendored: boolean; global: boolean; note: string };
  termfleet: { installed: boolean; reachable: 'reachable' | 'not-running' | 'occupied-by-other' | 'unverifiable'; note: string };
  codingCli: CheckResult;
  notes: string[];
}

export async function detectTools(repoDir: string): Promise<ToolFacts> {
  const notes: string[] = [];

  const floor = ownNodeFloor();
  const nodeVersion = process.versions.node;
  const meetsFloor = versionAtLeast(parseVersionNumbers(nodeVersion), parseVersionNumbers(floor));
  notes.push(`node ${nodeVersion} ${meetsFloor ? 'meets' : 'is BELOW'} the doctor's own floor ${floor} (package.json:22, bin/doctor-checks.ts:387-391)`);

  const gitP = probe('git', ['--version']);
  notes.push(gitP.present ? `git present: ${gitP.output}` : 'git NOT found on PATH');
  const tmuxP = probe('tmux', ['-V']);
  notes.push(tmuxP.present ? `tmux present: ${tmuxP.output}` : "tmux NOT found on PATH (termfleet's local provider runs sessions in tmux)");
  const bunP = probe('bun', ['--version']);
  notes.push(bunP.present ? `bun present: ${bunP.output}` : 'bun NOT found on PATH (the emitted scripts/runner.ts and ztrack presets run under bun)');

  // ztrack: vendored (resolves from repoDir's own node_modules) vs global (a `ztrack` binary directly on
  // PATH, NOT scoped to repoDir — spawnSync does not prepend a cwd's node_modules/.bin to PATH).
  let ztrackVendored = false;
  if (existsSync(join(repoDir, 'package.json'))) {
    try {
      createRequire(join(repoDir, 'package.json')).resolve('ztrack');
      ztrackVendored = true;
    } catch {
      ztrackVendored = false;
    }
  }
  const ztrackGlobalP = probe('ztrack', ['--version']);
  const ztrackNote = `ztrack vendored=${ztrackVendored} (resolves from ${repoDir}/node_modules), global=${ztrackGlobalP.present} (a bare 'ztrack' on PATH)`;
  notes.push(ztrackNote);

  // termfleet: installed (resolves from repoDir's node_modules) — a RUNNING provider is NOT required at
  // detect time (DESIGN §Phase 0), so "reachable" is reported honestly via checkProvider's real TCP+
  // /healthz-identity probe, never assumed. SKIP (not installed / nothing running yet) reads as
  // 'not-running', not a failure.
  let termfleetInstalled = false;
  if (existsSync(join(repoDir, 'package.json'))) {
    try {
      createRequire(join(repoDir, 'package.json')).resolve('termfleet');
      termfleetInstalled = true;
    } catch {
      termfleetInstalled = false;
    }
  }
  const providerCheck = await checkProvider(repoDir);
  let reachable: ToolFacts['termfleet']['reachable'];
  if (providerCheck.status === 'PASS') reachable = 'reachable';
  else if (providerCheck.status === 'SKIP') reachable = 'not-running';
  else if (providerCheck.status === 'FAIL') reachable = 'occupied-by-other';
  else reachable = 'unverifiable';
  const termfleetNote = `termfleet installed=${termfleetInstalled}; reachable=${reachable} (${providerCheck.detail})`;
  notes.push(termfleetNote);

  // coding-CLI sign-in: reuse doctor's own checkAuth() verbatim (see this file's header "DOCTOR REUSE").
  const codingCli = checkAuth();
  notes.push(`coding-CLI sign-in (checkAuth): ${codingCli.status} — ${codingCli.detail}`);

  return {
    node: { version: nodeVersion, floor, meetsFloor },
    git: { present: gitP.present, version: gitP.output },
    tmux: { present: tmuxP.present, version: tmuxP.output },
    bun: { present: bunP.present, version: bunP.output },
    ztrack: { vendored: ztrackVendored, global: ztrackGlobalP.present, note: ztrackNote },
    termfleet: { installed: termfleetInstalled, reachable, note: termfleetNote },
    codingCli,
    notes,
  };
}

// =========================================================================================================
// The two latent human gates (hardening #8) — named prerequisites, never buried.
// =========================================================================================================

export interface HumanGate {
  id: string;
  name: string;
  status: 'clear' | 'blocked' | 'unverifiable' | 'not-applicable';
  detail: string;
}

export function buildHumanGates(gh: GhFacts, onGitHub: boolean, codingCli: CheckResult): HumanGate[] {
  const gates: HumanGate[] = [];

  // Gate (i): CLI sign-in. codingCli is doctor's own checkAuth() result — PASS=clear, WARN=unverifiable
  // (its own "cannot verify sign-in without a live probe" case), FAIL/SKIP=blocked (not signed in, or no
  // known non-spending introspection command for the configured harness).
  gates.push({
    id: 'cli-sign-in',
    name: 'Coding CLI sign-in (interactive OAuth the agent cannot perform)',
    status: codingCli.status === 'PASS' ? 'clear' : codingCli.status === 'WARN' ? 'unverifiable' : 'blocked',
    detail: codingCli.detail,
  });

  // Gate (ii): non-admin gh -> branch-protection provisioning cannot succeed.
  if (!onGitHub) {
    gates.push({ id: 'gh-admin', name: 'GitHub repo-admin (branch-protection provisioning)', status: 'not-applicable', detail: 'repo has no github.com remote — no branch protection to provision' });
  } else if (gh.authStatus !== 'authenticated') {
    gates.push({ id: 'gh-admin', name: 'GitHub repo-admin (branch-protection provisioning)', status: 'blocked', detail: `gh CLI auth status is "${gh.authStatus}" — cannot even check admin rights until signed in` });
  } else if (gh.admin === true) {
    gates.push({ id: 'gh-admin', name: 'GitHub repo-admin (branch-protection provisioning)', status: 'clear', detail: gh.adminBasis });
  } else if (gh.admin === false) {
    gates.push({
      id: 'gh-admin',
      name: 'GitHub repo-admin (branch-protection provisioning)',
      status: 'blocked',
      detail: `${gh.adminBasis} — a non-admin token cannot provision branch protection (the PUT will 403/404 and provision-target-repo continues past a failed protection PUT, scripts/provision-target-repo.ts:305); this is a human gate, not an autonomous step.`,
    });
  } else {
    gates.push({
      id: 'gh-admin',
      name: 'GitHub repo-admin (branch-protection provisioning)',
      status: 'unverifiable',
      detail: `${gh.adminBasis} — admin rights could not be confirmed; treat as a potential human gate until resolved (never assume admin from an unknown result).`,
    });
  }

  return gates;
}

// =========================================================================================================
// Compose the full DETECT REPORT.
// =========================================================================================================

export interface DetectReport {
  repoDir: string;
  build: RepoBuildFacts;
  git: GitFacts;
  gh: GhFacts;
  existingInstall: ExistingInstallFacts;
  tools: ToolFacts;
  humanGates: HumanGate[];
  doctorChecks: { env: CheckResult; auth: CheckResult; provider: CheckResult };
}

export async function detect(repoDir: string, proc: ProcFn = defaultProc): Promise<DetectReport> {
  const build = detectLanguageAndBuild(repoDir);
  const git = detectGitFacts(repoDir, proc);
  const gh = detectGhFacts(repoDir, git.onGitHub, proc);
  const existingInstall = detectExistingInstall(repoDir);
  const tools = await detectTools(repoDir);
  const env = checkEnv(repoDir);
  const provider = await checkProvider(repoDir);
  const humanGates = buildHumanGates(gh, git.onGitHub, tools.codingCli);
  return { repoDir, build, git, gh, existingInstall, tools, humanGates, doctorChecks: { env, auth: tools.codingCli, provider } };
}

// =========================================================================================================
// Rendering
// =========================================================================================================

export function renderHuman(r: DetectReport): string {
  const lines: string[] = [];
  lines.push(`OA install-detect report — ${r.repoDir}`);
  lines.push('='.repeat(60));
  lines.push('');
  lines.push('HUMAN GATES (surfaced first — never buried):');
  for (const g of r.humanGates) {
    lines.push(`  [${g.status.toUpperCase()}] ${g.name} (${g.id})`);
    lines.push(`    ${g.detail}`);
  }
  lines.push('');
  lines.push('REPO:');
  lines.push(`  language=${r.build.language}  buildFiles=[${r.build.buildFiles.join(', ') || 'none'}]  packageManager=${r.build.packageManager ?? 'none'}`);
  lines.push(`  isGitRepo=${r.git.isGitRepo}  onGitHub=${r.git.onGitHub}  remote=${r.git.remoteUrl ?? '(none)'}  defaultBranch=${r.git.defaultBranch ?? '(none)'}`);
  lines.push(`  populated=${r.git.populated}  trackedFileCount=${r.git.trackedFileCount}`);
  for (const n of [...r.build.notes, ...r.git.notes]) lines.push(`    - ${n}`);
  lines.push('');
  lines.push('GH:');
  lines.push(`  ghInstalled=${r.gh.ghInstalled}  authStatus=${r.gh.authStatus}  login=${r.gh.login ?? '(n/a)'}`);
  lines.push(`  admin=${r.gh.admin === undefined ? 'unknown' : r.gh.admin}  visibility=${r.gh.visibility ?? '(n/a)'}  plan=${r.gh.plan ?? '(n/a)'}`);
  for (const n of r.gh.notes) lines.push(`    - ${n}`);
  lines.push('');
  lines.push('EXISTING .open-autonomy/ INSTALL:');
  lines.push(`  reinstall=${r.existingInstall.reinstall}  dirPresent=${r.existingInstall.dirPresent}  manifestPresent=${r.existingInstall.manifestPresent} (${r.existingInstall.manifestFileCount} paths)  autonomy.yml=${r.existingInstall.autonomyYmlPresent}  install.json=${r.existingInstall.installJsonPresent}  roadmap.yml=${r.existingInstall.roadmapYmlPresent}  paused=${r.existingInstall.pausedPresent}`);
  for (const n of r.existingInstall.notes) lines.push(`    - ${n}`);
  lines.push('');
  lines.push('TOOLS:');
  lines.push(`  node ${r.tools.node.version} (floor ${r.tools.node.floor}) meetsFloor=${r.tools.node.meetsFloor}`);
  lines.push(`  git present=${r.tools.git.present} (${r.tools.git.version ?? 'n/a'})`);
  lines.push(`  tmux present=${r.tools.tmux.present} (${r.tools.tmux.version ?? 'n/a'})`);
  lines.push(`  bun present=${r.tools.bun.present} (${r.tools.bun.version ?? 'n/a'})`);
  lines.push(`  ztrack vendored=${r.tools.ztrack.vendored} global=${r.tools.ztrack.global}`);
  lines.push(`  termfleet installed=${r.tools.termfleet.installed} reachable=${r.tools.termfleet.reachable}`);
  lines.push(`  coding-CLI: ${r.tools.codingCli.status} — ${r.tools.codingCli.detail}`);
  lines.push('');
  lines.push('DOCTOR CHECKS (verbatim reuse of bin/doctor-checks.ts):');
  lines.push(`  env:      ${r.doctorChecks.env.status} — ${r.doctorChecks.env.detail}`);
  lines.push(`  auth:     ${r.doctorChecks.auth.status} — ${r.doctorChecks.auth.detail}`);
  lines.push(`  provider: ${r.doctorChecks.provider.status} — ${r.doctorChecks.provider.detail}`);
  return lines.join('\n');
}

// =========================================================================================================
// CLI: bun bin/install-detect.ts <repoDir> [--json]
// =========================================================================================================
const USAGE = 'usage: bun bin/install-detect.ts <repoDir> [--json]';

export function parseArgs(argv: string[]): { repoDir?: string; json: boolean } {
  const json = argv.includes('--json');
  const repoDir = argv.find((a) => !a.startsWith('--'));
  return { repoDir, json };
}

if (import.meta.main) {
  const { repoDir, json } = parseArgs(process.argv.slice(2));
  if (!repoDir) {
    process.stderr.write(USAGE + '\n');
    process.exit(2);
  }
  if (!existsSync(repoDir)) {
    process.stderr.write(`error: ${repoDir} does not exist\n`);
    process.exit(2);
  }
  const report = await detect(repoDir);
  process.stdout.write((json ? JSON.stringify(report, null, 2) : renderHuman(report)) + '\n');
  process.exit(0);
}
