#!/usr/bin/env bun
// TA.3 — minimal CI-workflow scaffolding for bare-repo GitHub profiles
// (OA-INSTALL-IMPLEMENTATION-TASKS.md#ta3, DESIGN build-plan #7 + hardening #5).
//
// The problem: a REQUIRED check with no workflow behind it wedges every PR forever. simple-gh's
// provision.json requires `ci`; self-driving's ir.yml strips ci.yml from its own resources (pr-141) because
// it treats ci.yml as REPO-owned, not profile-shipped. On a bare/new repo neither profile's own machinery
// authors a workflow that will ever post the required context, so provisioning branch protection with that
// required check name is a guaranteed wedge.
//
// HOME rationale (this unit's "your call", one-line): `bin/ensure-ci-workflow.ts` — a `bin/` script, NOT a
// `packages/local-runner-cli` module, and this is a hard constraint, not a style pick. This step's contract
// ("takes ... the chosen profile's SetupPack (packages/core getSetupPack ...)") REQUIRES a runtime (value,
// not type-only) import of `@open-autonomy/core`, which resolves its own internal modules extension-free
// (`from './ir'`, bundler-style resolution) — fine under `bun`, but NOT resolvable by plain Node ESM. Every
// other `bin/*.ts` script that needs `getSetupPack`/`parseIr`/etc. already takes exactly this dependency
// (`bin/check-setup-pack.ts`, `bin/autonomy-compile.ts`, `bin/autonomy-upgrade.ts`, …) because `bin/` is
// this repo's own dev/install-time tooling, always invoked via `bun bin/<x>.ts` (see package.json's
// `check:*`/`autonomy` scripts) — never shipped standalone. `packages/local-runner-cli` (`@volter/oa`) is
// the OPPOSITE: its `src/bin/oa.ts` entrypoint is deliberately "plain, portable TS ... so Node's built-in
// type-stripping ... can run this file directly via node" with ZERO dependencies (`package.json`'s
// `dependencies: {}`), because it ships standalone to an adopter's repo, which may not even have this
// monorepo (or `@open-autonomy/core`) present at all. Empirically confirmed: wiring `getSetupPack` into
// `packages/local-runner-cli/src/index.ts` breaks `cli.test.ts`'s real-`node`-subprocess tests (`doctor`,
// `dispatch`) with `ERR_MODULE_NOT_FOUND` for `@open-autonomy/core`'s own internal extensionless imports —
// i.e. it isn't just inconsistent with local-runner-cli's design, it's outright broken there. TE.5 (the
// install agent's Phase 4 EXECUTE), which calls this step, already orchestrates its peers this exact way
// ("compile()", "provision-target-repo" — both `bin/`/`scripts/` invoked via `bun`), so this fits the same
// call surface. "Runnable standalone" is satisfied the same way `bin/check-setup-pack.ts` already is: a
// `import.meta.main` CLI block below, invoked as `bun bin/ensure-ci-workflow.ts <repoDir> <profileDir>`.
//
// Test-glob note (per the task brief): `check:core`'s glob (`packages/*/src/*.test.ts`) does NOT reach
// `bin/`, so `bin/*.test.ts` files are individually wired into a `check:*` package.json script instead —
// exactly the pattern `check:setup-pack`/`check:compile`/`check:dogfood` already use. This file's test
// (`bin/ensure-ci-workflow.test.ts`) is wired into a new `check:ci-scaffold` script (see package.json),
// added to the `check` composite so it runs in `bun run check`.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { getSetupPack } from '@open-autonomy/core';
import type { CheckRealization, SetupPack } from '@open-autonomy/core';

export type CiScaffoldStatus = 'already-realized' | 'authored' | 'would-author' | 'blocked';

export interface CiScaffoldCheckResult {
  check: string;
  status: CiScaffoldStatus;
  /** repo-relative path of the workflow that realizes (or now realizes) `check` — set for
   *  'already-realized' and 'authored', omitted for 'blocked'. */
  workflowPath?: string;
  detail: string;
}

export interface CiScaffoldResult {
  /** false iff ANY authored-workflow check ended up 'blocked' — the step never provisions a wedge. */
  ok: boolean;
  results: CiScaffoldCheckResult[];
  /** the exact named blocker message, present iff !ok. TE.5 must surface this verbatim and halt, never
   *  proceed to provision branch protection for a check nothing will ever post. */
  blocker?: string;
}

type DetectedRuntime = 'bun' | 'node';

interface DetectedLanguage {
  runtime: DetectedRuntime;
  /** the repo's own `package.json` "scripts.test" value, if any — run it verbatim rather than guessing a
   *  test command. Absent => the authored workflow's CI step is a no-op build step (per spec: "a sane
   *  default ... runs the repo's test script if present, else a no-op build step"). */
  hasTestScript: boolean;
}

// --- (ii) detect whether an existing workflow already plausibly posts a given check context -------------

interface WorkflowDoc {
  file: string; // repo-relative path, e.g. .github/workflows/ci.yml
  contexts: string[]; // every name this workflow could plausibly post: workflow `name:`, each job's
  // `name:` (or job id when a job has no explicit name)
}

function listWorkflowFiles(targetRepoDir: string): string[] {
  const dir = join(targetRepoDir, '.github', 'workflows');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => join('.github', 'workflows', f));
}

function parseWorkflow(targetRepoDir: string, relPath: string): WorkflowDoc {
  let raw: string;
  try {
    raw = readFileSync(join(targetRepoDir, relPath), 'utf8');
  } catch {
    return { file: relPath, contexts: [] };
  }
  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch {
    // an unparsable workflow file can't be plausibly matched — treat as carrying no contexts (never
    // silently claim a check is realized by a file we can't actually read).
    return { file: relPath, contexts: [] };
  }
  if (!doc || typeof doc !== 'object') return { file: relPath, contexts: [] };
  const d = doc as { name?: unknown; jobs?: Record<string, { name?: unknown }> };
  const contexts: string[] = [];
  if (typeof d.name === 'string') contexts.push(d.name);
  if (d.jobs && typeof d.jobs === 'object') {
    for (const [jobId, job] of Object.entries(d.jobs)) {
      const jobName = job && typeof job === 'object' && typeof job.name === 'string' ? job.name : jobId;
      contexts.push(jobName);
    }
  }
  return { file: relPath, contexts };
}

/** Does any workflow already on disk plausibly post `check`? Exact match (case-sensitive) against every
 *  workflow's own `name:` and every job's `name:`/job-id — the same identifiers GitHub actually displays
 *  as the check-run/context name, so "plausibly posts" here means "would display exactly this context". */
function findRealizingWorkflow(targetRepoDir: string, check: string): WorkflowDoc | undefined {
  for (const relPath of listWorkflowFiles(targetRepoDir)) {
    const wf = parseWorkflow(targetRepoDir, relPath);
    if (wf.contexts.includes(check)) return wf;
  }
  return undefined;
}

// --- (i)/(iii) language detection (node/bun via package.json + lockfiles) --------------------------------

function detectLanguage(targetRepoDir: string): DetectedLanguage | undefined {
  const pkgPath = join(targetRepoDir, 'package.json');
  if (!existsSync(pkgPath)) return undefined; // no package.json => undetectable (this scaffold only knows node/bun)
  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return undefined; // an unparsable package.json is just as undetectable as a missing one
  }
  const isBun = existsSync(join(targetRepoDir, 'bun.lock')) || existsSync(join(targetRepoDir, 'bun.lockb'));
  const runtime: DetectedRuntime = isBun ? 'bun' : 'node';
  const hasTestScript = typeof pkg.scripts?.test === 'string' && pkg.scripts.test.trim().length > 0;
  return { runtime, hasTestScript };
}

// --- authoring a minimal, language-aware workflow whose JOB NAME equals the check context ----------------

/** A valid GitHub Actions job id: starts with a letter/`_`, then letters/digits/`_`/`-`. `check` is
 *  typically already simple (`ci`), but sanitize defensively so an unusual check name (spaces, slashes)
 *  still produces a syntactically valid workflow — the `name:` field (not the id) is what actually carries
 *  the exact display context. */
function jobIdFor(check: string): string {
  const cleaned = check
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/^[^A-Za-z_]+/, '');
  return cleaned.length > 0 ? cleaned : 'ci';
}

function workflowYaml(check: string, lang: DetectedLanguage): string {
  const jobId = jobIdFor(check);
  const setupStep =
    lang.runtime === 'bun'
      ? ['      - uses: oven-sh/setup-bun@v2', '        with:', '          bun-version: latest'].join('\n')
      : ['      - uses: actions/setup-node@v4', '        with:', '          node-version: 22'].join('\n');
  const installCmd = lang.runtime === 'bun' ? 'bun install' : 'npm ci || npm install';
  const testCmd = lang.runtime === 'bun' ? 'bun run test' : 'npm test';
  const testOrNoop = lang.hasTestScript
    ? `      - run: ${testCmd}`
    : ['      - name: no-op build step (no test script declared)', '        run: echo "no test script in package.json — nothing to run"'].join('\n');

  return [
    `# Authored by open-autonomy's TA.3 CI-workflow scaffold (bin/ensure-ci-workflow.ts) — an install-time`,
    `# minimal CI so the required check '${check}' has a real workflow behind it (branch protection is never`,
    `# provisioned for a check nothing posts). Safe to replace with your own real CI at any time; re-running`,
    `# the scaffold is then a no-op ('already realized') because a job named '${check}' will already exist.`,
    `name: ${check}`,
    `on:`,
    `  push:`,
    `    branches: [main]`,
    `  pull_request:`,
    `  workflow_dispatch:`,
    `jobs:`,
    `  ${jobId}:`,
    `    name: ${check}`,
    `    runs-on: ubuntu-latest`,
    `    steps:`,
    `      - uses: actions/checkout@v4`,
    setupStep,
    `      - run: ${installCmd}`,
    testOrNoop,
    '',
  ].join('\n');
}

/** Pick a workflow filename that does not collide with a file already on disk (that file, by construction
 *  at the call site, does NOT already realize `check` — findRealizingWorkflow said so — so we must not
 *  clobber it; append `-oa-ci` / an incrementing suffix instead). */
function pickWorkflowFilename(targetRepoDir: string, check: string): string {
  const base = jobIdFor(check);
  const dir = join(targetRepoDir, '.github', 'workflows');
  let candidate = `${base}.yml`;
  if (!existsSync(join(dir, candidate))) return candidate;
  candidate = `${base}-oa-ci.yml`;
  let n = 2;
  while (existsSync(join(dir, candidate))) {
    candidate = `${base}-oa-ci-${n}.yml`;
    n += 1;
  }
  return candidate;
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

// --- the public entry point -------------------------------------------------------------------------------

/** ensureCiScaffold — TA.3's deterministic step.
 *
 *  For every `pack.check_realizations` entry whose `via === 'authored-workflow'`:
 *   (ii) checks whether `targetRepoDir` already carries a workflow that plausibly posts that check context;
 *   (iii) if absent, EITHER authors a minimal language-aware workflow (job name === check context) OR, when
 *         the language is undetectable, returns a named blocker and writes NOTHING for ANY authored-workflow
 *         check (a partially-scaffolded repo — some checks realized, the rest silently missing — is exactly
 *         the wedge this step exists to prevent, so an undetectable language halts the whole batch);
 *   (iv) never overwrites an existing workflow file; a second invocation on an already-authored repo is a
 *        no-op, reporting 'already-realized' for every check.
 *
 *  Checks whose realization is NOT 'authored-workflow' (native, propose_dispatch_checks) are out of scope —
 *  this step only ever touches the authored-workflow subset (the probe-PR check-name discovery that reads
 *  what a CI already posts is TE.4, not this unit).
 *
 *  `opts.dryRun` (--dry-run seam, additive/opt-in — every existing call site that omits it is BYTE-FOR-BYTE
 *  unchanged): every step above (ii) is already a pure filesystem READ (`findRealizingWorkflow`,
 *  `detectLanguage`) — only the FINAL loop (iii) writes. Under dryRun, that loop never calls
 *  `mkdirSync`/`writeFileSync`; it reports the exact path+language a real run would author, status
 *  'would-author' instead of 'authored'. */
export function ensureCiScaffold(targetRepoDir: string, pack: SetupPack, opts: { dryRun?: boolean } = {}): CiScaffoldResult {
  const authoredChecks = dedupe((pack.check_realizations ?? []).filter((cr: CheckRealization) => cr.via === 'authored-workflow').map((cr) => cr.check));

  if (authoredChecks.length === 0) {
    return { ok: true, results: [] };
  }

  const results: CiScaffoldCheckResult[] = [];
  const remaining: string[] = [];

  for (const check of authoredChecks) {
    const existing = findRealizingWorkflow(targetRepoDir, check);
    if (existing) {
      results.push({ check, status: 'already-realized', workflowPath: existing.file, detail: `already realized by ${existing.file}` });
    } else {
      remaining.push(check);
    }
  }

  if (remaining.length === 0) {
    return { ok: true, results };
  }

  const lang = detectLanguage(targetRepoDir);
  if (!lang) {
    const first = remaining[0];
    const blocker = `author CI first: required check '${first}' has no workflow and language is undetectable`;
    for (const check of remaining) results.push({ check, status: 'blocked', detail: blocker });
    return { ok: false, results, blocker };
  }

  if (opts.dryRun) {
    for (const check of remaining) {
      const filename = pickWorkflowFilename(targetRepoDir, check);
      const relPath = join('.github', 'workflows', filename);
      results.push({
        check,
        status: 'would-author',
        workflowPath: relPath,
        detail: `[DRY-RUN] would author ${relPath} (${lang.runtime}, ${lang.hasTestScript ? 'runs package.json test script' : 'no-op build step'}) — NOT written.`,
      });
    }
    return { ok: true, results };
  }

  const workflowsDir = join(targetRepoDir, '.github', 'workflows');
  for (const check of remaining) {
    mkdirSync(workflowsDir, { recursive: true });
    const filename = pickWorkflowFilename(targetRepoDir, check);
    const relPath = join('.github', 'workflows', filename);
    writeFileSync(join(targetRepoDir, relPath), workflowYaml(check, lang));
    results.push({
      check,
      status: 'authored',
      workflowPath: relPath,
      detail: `authored ${relPath} (${lang.runtime}, ${lang.hasTestScript ? 'runs package.json test script' : 'no-op build step'})`,
    });
  }

  return { ok: true, results };
}

/** Loads the target profile's SetupPack (packages/core getSetupPack) and runs ensureCiScaffold against it —
 *  the exact call TE.5 (Phase 4 EXECUTE) makes: "for GitHub, ensure a CI workflow exists (TA.3) then run
 *  provision-target-repo with the probe-discovered check names". */
export function ensureCiWorkflowForProfile(targetRepoDir: string, profileDir: string): CiScaffoldResult {
  const pack = getSetupPack(profileDir);
  return ensureCiScaffold(targetRepoDir, pack);
}

/** Human-readable report, one line per check. */
export function formatCiScaffoldResult(r: CiScaffoldResult): string {
  const lines = r.results.map((cr) => `  [${cr.status}] ${cr.check}${cr.workflowPath ? ` -> ${cr.workflowPath}` : ''} — ${cr.detail}`);
  if (!r.ok && r.blocker) lines.push(`BLOCKED: ${r.blocker}`);
  return lines.join('\n');
}

// --- standalone CLI: bun bin/ensure-ci-workflow.ts <targetRepoDir> <profileDir> [--json] -----------------
if (import.meta.main) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const positional = args.filter((a) => !a.startsWith('--'));
  const [targetRepoDir, profileDir] = positional;
  if (!targetRepoDir || !profileDir) {
    process.stderr.write('usage: bun bin/ensure-ci-workflow.ts <targetRepoDir> <profileDir> [--json]\n');
    process.exit(1);
  }
  const result = ensureCiWorkflowForProfile(targetRepoDir, profileDir);
  process.stdout.write((json ? JSON.stringify(result, null, 2) : formatCiScaffoldResult(result) || '(no authored-workflow required checks — nothing to do)') + '\n');
  process.exit(result.ok ? 0 : 1);
}
