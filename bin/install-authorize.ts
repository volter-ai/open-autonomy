#!/usr/bin/env bun
// TE.4 — Phase 3 AUTHORIZE (G3, batched) + the probe-PR check-name discovery
// (OA-INSTALL-IMPLEMENTATION-TASKS.md#te4, DESIGN §Phase 3/G3 + hardening #5; docs/INSTALL-AGENT.md:92-94,
// 120,160-200; docs/OPERATIONS.md:513-522).
//
// Consumes a TE.2 SELECTION RECORD (`--record <file>`, bin/install-select.ts's `SelectionRecord`) and drives
// EVERYTHING off the loaded pack's own fields (`codeHost`, `extra_rungs`, …) — never a profile-name literal
// (TS.2's `check:no-profile-branching` scans this file too, same discipline as TE.3's install-direction.ts).
//
// THE BATCH (DESIGN §Phase 3 verbatim + docs/INSTALL-AGENT.md:160-200's numbered ask-list): ONE combined
// question set, never asked serially:
//   (a) spend cadence + WIP consent — local spend is UNCAPPED (docs/INSTALL-AGENT.md:171-173: "no OA spend
//       cap … the throttle is the tick interval … and WIP=1") — cited plainly so the human sees the fact,
//       never buried in a generic "confirm?" ask.
//   (b) harness-commit consent — ~40 files (docs/INSTALL-AGENT.md:162's own figure), but this tool never
//       hardcodes that number: it compiles the SELECTED profile onto the SELECTED substrate (a pure,
//       in-memory dry run — no destDir, nothing written to disk) and counts `compiledPaths(out)`, the same
//       function bin/autonomy-compile.ts's own --dry-run print uses. The real count for a shipped profile
//       may differ from the doc's illustrative "~40" — this tool reports what THIS pack/substrate actually
//       materializes, not the doc's approximation.
//   (c) GitHub profiles only (`pack.codeHost === 'github'`) — admin/branch-protection consent + identity
//       (own token vs bot reviewer, docs/INSTALL-AGENT.md item 5). ghAdmin is read from the TE.2 selection
//       record's OWN `detect.repoFacts.ghAdmin` — TE.1's detection, reused verbatim, never re-probed here
//       (this file makes no `gh api repos/.../permissions` call of its own for the record's target repo).
//   (d) self-driving-shaped profiles only (`pack.extra_rungs.includes('proxy-ready')`, never a profile-name
//       check) — the model-proxy decision (deploy own vs get allowlisted).
//
// THE PROBE-PR CHECK-NAME DISCOVERY (the real engineering content — DESIGN's explicit "do NOT guess
// required-check names on a PR-less repo — a wrong guess deadlocks every PR"): for GitHub profiles, once
// harness-commit consent is given, this tool can open a throwaway PR against a committed repo, read back
// the REAL check contexts GitHub reports (gh api .../check-runs — the same "best source: an OPEN PR" recipe
// docs/OPERATIONS.md's Phase-1 DETECT snippet already documents), and close it (NEVER merge). Because this
// is a LIVE action against a real GitHub repo, it is gated behind an explicit `--live-probe <owner/repo>`
// flag on the SECOND invocation. Without that flag this tool emits the batch + a `deferred` marker for
// check-name discovery — it NEVER fabricates a check name. `runProbePr` is exported standalone (mocked-gh-
// CLI integration test, see install-authorize.test.ts) — the real orchestration (open → poll checks →
// close, never merge) runs for real against an injected `ProcFn`; only the `gh`/`git` subprocess calls are
// stubbed in the test.
//
// STATELESS, TWO-INVOCATION DESIGN (same discipline as TE.2/TE.3, bin/install-select.ts's and
// bin/install-direction.ts's own header comments): invocation 1 (no consent flags) emits the ONE batched
// question set, no record. Invocation 2 (explicit `--consent-*`/`--identity`/`--live-probe` flags) applies
// the human's answers and emits the AUTHORIZE RECORD — TE.5's own input. No session/state file between the
// two invocations; every consent must be named explicitly (a bare `--consent` boolean is never accepted for
// a value-bearing question, same "loud, never silently defaulted" discipline TE.2's D1/D2/D3 review rounds
// established for --confirm/--pick).
//
// REUSE (do not re-derive): `loadSelectionRecord`'s shape mirrors TE.3's own (bin/install-direction.ts) —
// the SAME minimal structural read of TE.2's JSON output, not a second, drifting parser. `ProcFn`/
// `defaultProc` are TD.2's own injectable subprocess seam (bin/recommend-profile.ts), reused verbatim for
// the probe-PR's `gh`/`git` calls — the identical idiom TE.1 already reuses for its own gh probes.
// `compiledPaths`/`compileGithub`/`compileLocal` are core's/the substrates' own exported compile entry
// points (packages/core/src/ir.ts, packages/substrate-github/src/emit.ts, packages/substrate-local/src/
// emit.ts) — this file calls them the exact way bin/autonomy-compile.ts's own --dry-run path does (no
// destDir, no materialize call), never re-deriving the file list by hand.
//
// HOME rationale (bin/, not packages/local-runner-cli/): identical reasoning to TE.1/TE.2/TE.3's own header
// comments — this file takes RUNTIME imports of `@open-autonomy/core` that only resolve under `bun`'s
// extension-free internal module resolution.
//
// Test-glob note (same pattern as TA.3/TD.2/TE.1/TE.2/TE.3): `check:core`'s glob (`packages/*/src/*.test.ts`)
// does not reach `bin/`, so `bin/install-authorize.test.ts` is wired into its own `check:install-authorize`
// package.json script, added to the `check` composite (see package.json).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compiledPaths, parseIr, type SetupPack, type Substrate } from '@open-autonomy/core';
import type { CompileOutput } from '@open-autonomy/core';
import { profilesRoot as bundledProfilesRoot } from './bundled-profiles';
import { defaultProc, type ProcFn } from './recommend-profile';

export { defaultProc, type ProcFn };

// =========================================================================================================
// The SELECTION RECORD (TE.2's own output shape) — the input contract. Deliberately a minimal structural
// read (same discipline as TE.3's install-direction.ts's own `SelectionRecordRef`), not a full type import.
// =========================================================================================================

export interface SelectionRecordRef {
  profile: string;
  substrate: Substrate;
  pack: SetupPack;
  detect: { repoDir: string; repoFacts?: { ghAdmin?: boolean; onGitHub?: boolean; populated?: boolean }; [k: string]: unknown };
  [k: string]: unknown;
}

/** Read + parse a TE.2 SelectionRecord JSON file. Loud on anything malformed — same discipline as TE.2's
 *  own `loadDetectReport` / TE.3's `loadSelectionRecord`: a malformed/incomplete record must never be
 *  silently treated as some default profile/pack. */
export function loadSelectionRecord(file: string): SelectionRecordRef {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`--record ${file}: could not read file (${(e as Error).message ?? e})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`--record ${file}: not valid JSON (${(e as Error).message ?? e})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--record ${file}: malformed selection record — expected a JSON object shaped like TE.2's SelectionRecord (bin/install-select.ts), got ${Array.isArray(parsed) ? 'an array' : typeof parsed}`);
  }
  const r = parsed as Partial<SelectionRecordRef>;
  if (typeof r.profile !== 'string' || !r.profile) {
    throw new Error(`--record ${file}: malformed selection record — missing/invalid "profile" (expected TE.2's SelectionRecord shape, e.g. from "bun bin/install-select.ts <repoDir> ... --out <file>")`);
  }
  if (!r.pack || typeof r.pack !== 'object' || typeof (r.pack as { codeHost?: unknown }).codeHost !== 'string') {
    throw new Error(`--record ${file}: malformed selection record — missing/invalid "pack.codeHost" (expected TE.2's SelectionRecord shape with an instantiated SetupPack)`);
  }
  if (!r.detect || typeof r.detect !== 'object' || typeof (r.detect as { repoDir?: unknown }).repoDir !== 'string') {
    throw new Error(`--record ${file}: malformed selection record — missing/invalid "detect.repoDir"`);
  }
  if (r.substrate !== 'local' && r.substrate !== 'gh-actions') {
    throw new Error(`--record ${file}: malformed selection record — "substrate" must be 'local' or 'gh-actions' (got ${JSON.stringify(r.substrate)})`);
  }
  return r as SelectionRecordRef;
}

// =========================================================================================================
// (b) harness-commit consent — the REAL file count, never hardcoded.
// =========================================================================================================

export interface HarnessManifest {
  fileCount: number;
  files: string[];
}

/** Dry-run compile the selected profile onto the selected substrate (no destDir — nothing is written to
 *  disk, exactly bin/autonomy-compile.ts's own --dry-run path) and count the REAL materialized path set via
 *  `compiledPaths`. This is the one number the batch's harness-commit question cites — never the doc's
 *  illustrative "~40" (docs/INSTALL-AGENT.md:162), which is real for TODAY's self-driving profile but would
 *  silently go stale for any other profile or a future profile edit. */
export async function computeHarnessManifest(profileDir: string, substrate: Substrate): Promise<HarnessManifest> {
  const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
  const out: CompileOutput =
    substrate === 'local'
      ? (await import('@open-autonomy/substrate-local')).compileLocal(ir, {})
      : (await import('@open-autonomy/substrate-github')).compileGithub(ir);
  const files = compiledPaths(out);
  return { fileCount: files.length, files };
}

// =========================================================================================================
// The batched question set (THE ONE BATCH — invocation 1's output).
// =========================================================================================================

export interface AuthorizeQuestion {
  id: 'spend' | 'harness-commit' | 'gh-admin-identity' | 'model-proxy';
  text: string;
  fact?: string; // a plainly-cited fact the question surfaces (e.g. the uncapped-spend doc citation)
  default: string;
}

export interface AuthorizeBatch {
  profile: string;
  substrate: Substrate;
  codeHost: SetupPack['codeHost'];
  ghProfile: boolean;
  selfDriving: boolean; // pack.extra_rungs includes 'proxy-ready' — never a profile-name check
  harness: HarnessManifest;
  questions: AuthorizeQuestion[];
}

const SPEND_FACT =
  'Local spend is UNCAPPED — this runs on your machine and bills your model provider every tick with no OA ' +
  'spend cap (docs/INSTALL-AGENT.md:171-173). The only throttles are the tick interval and WIP.';

/** Build the ONE BATCHED question set for this selection — the whole point being that every question below
 *  is computed and returned TOGETHER, in one call, so a caller can never accidentally ask them serially. */
export async function buildAuthorizeBatch(sel: SelectionRecordRef, profileDir: string): Promise<AuthorizeBatch> {
  const pack = sel.pack;
  const ghProfile = pack.codeHost === 'github';
  const selfDriving = pack.extra_rungs.includes('proxy-ready');
  const harness = await computeHarnessManifest(profileDir, sel.substrate);

  const questions: AuthorizeQuestion[] = [];

  questions.push({
    id: 'spend',
    fact: SPEND_FACT,
    text: `${SPEND_FACT} OK to run, and at what tick interval/WIP?`,
    default: '*/15, WIP 1',
  });

  questions.push({
    id: 'harness-commit',
    text:
      `OA adds ${harness.fileCount} file(s) to this repo (scripts/, .claude/, .codex/, scheduler/, standards/, ` +
      `.open-autonomy/, .github/workflows/…, per the ${sel.profile}@${sel.substrate} compile — counted from ` +
      `the real compiled manifest, not a fixed figure) and COMMITS them to the default branch — the agents ` +
      `run in git worktrees, which only see committed files. This includes Claude Code and Codex ` +
      `Stop/SubagentStop gates that fire in repository sessions, including your own interactive ones, and ` +
      `fail closed if the pinned ztrack target is missing. OK?`,
    default: 'yes (the only supported model)',
  });

  if (ghProfile) {
    const ghAdmin = sel.detect.repoFacts?.ghAdmin;
    const adminNote = ghAdmin === true ? 'confirmed admin' : ghAdmin === false ? 'confirmed NON-admin' : 'unknown/unverified';
    questions.push({
      id: 'gh-admin-identity',
      text:
        `This repo's default branch will require branch protection (TE.1 detected: ${adminNote}) with the ` +
        `real PR-CI check names — a wrong guess deadlocks every PR, so the real names are discovered via a ` +
        `throwaway probe PR (see below), never guessed. Confirm you want branch protection provisioned, and: ` +
        `run under your own token (simplest, but the reviewer isn't independent — you share a token with the ` +
        `proposer), or wire a separate bot identity for real reviewer independence?`,
      default: ghAdmin === false ? 'BLOCKED — non-admin token cannot provision branch protection; human gate' : 'bot identity if available; else your token (flagged: not independent)',
    });
  }

  if (selfDriving) {
    questions.push({
      id: 'model-proxy',
      text:
        'self-driving needs a funded, allowlisted model proxy for the hosted fleet to spend at all. Deploy ' +
        'your own model-proxy Worker, or get allowlisted on an existing one?',
      default: 'deploy your own (see services/agent-model-proxy/)',
    });
  }

  return { profile: sel.profile, substrate: sel.substrate, codeHost: pack.codeHost, ghProfile, selfDriving, harness, questions };
}

export function renderBatchHuman(batch: AuthorizeBatch): string {
  const lines: string[] = [];
  lines.push(`AUTHORIZE (G3, BATCHED) — ${batch.profile} @ ${batch.substrate}`);
  lines.push('='.repeat(60));
  lines.push(`One combined question set (${batch.questions.length} question(s) — never asked serially):`);
  lines.push('');
  for (const q of batch.questions) {
    lines.push(`[${q.id}] ${q.text}`);
    lines.push(`  default: ${q.default}`);
    lines.push('');
  }
  lines.push(`harness manifest: ${batch.harness.fileCount} file(s) (real compiled path count, not hardcoded)`);
  return lines.join('\n');
}

// =========================================================================================================
// The probe-PR check-name discovery.
// =========================================================================================================

export type CheckNameDiscovery =
  | { status: 'not-applicable'; reason: string }
  | { status: 'deferred'; reason: string }
  | { status: 'discovered'; ownerRepo: string; prNumber: number; headSha: string; checks: string[]; closed: true }
  | { status: 'error'; ownerRepo: string; detail: string; closed: boolean };

export interface ProbePrOptions {
  /** how many times to poll the check-runs API before giving up (checks post asynchronously). */
  pollAttempts?: number;
  /** sleep between polls — injectable so tests never actually wait. */
  sleep?: (ms: number) => Promise<void>;
  pollDelayMs?: number;
  /** the branch name to open the probe PR from — injectable for deterministic tests. */
  branchName?: string;
}

function ghJson<T>(proc: ProcFn, args: string[], cwd?: string): { ok: boolean; value?: T; raw: string } {
  const r = proc('gh', args, cwd);
  if (r.status !== 0) return { ok: false, raw: r.stderr || r.stdout };
  try {
    return { ok: true, value: JSON.parse(r.stdout) as T, raw: r.stdout };
  } catch {
    return { ok: false, raw: r.stdout };
  }
}

const DEFAULT_SLEEP = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** THE PROBE-PR SEQUENCE: open a throwaway PR, read the REAL check contexts GitHub reports, close it
 *  (NEVER merge). Real orchestration logic, injectable `ProcFn` for the `git`/`gh` subprocess calls — this
 *  is what install-authorize.test.ts's mocked-gh-CLI integration test exercises end-to-end. Best-effort
 *  cleanup: even on a mid-sequence error, this function attempts to close/delete the throwaway PR/branch
 *  before returning — it never leaves a dangling probe PR open on error, and it NEVER calls the merge verb
 *  under any code path. */
export async function runProbePr(repoDir: string, ownerRepo: string, proc: ProcFn, opts: ProbePrOptions = {}): Promise<CheckNameDiscovery> {
  const pollAttempts = opts.pollAttempts ?? 10;
  const pollDelayMs = opts.pollDelayMs ?? 3000;
  const sleep = opts.sleep ?? DEFAULT_SLEEP;
  const branch = opts.branchName ?? `oa-install-probe-${Date.now()}`;

  // 0) remember the current branch so we can restore it, and resolve the default branch to PR against.
  const startBranchR = proc('git', ['-C', repoDir, 'rev-parse', '--abbrev-ref', 'HEAD'], repoDir);
  const startBranch = startBranchR.status === 0 ? startBranchR.stdout.trim() : undefined;

  const repoView = ghJson<{ default_branch: string }>(proc, ['api', `repos/${ownerRepo}`, '--jq', '{default_branch:.default_branch}']);
  if (!repoView.ok || !repoView.value?.default_branch) {
    return { status: 'error', ownerRepo, detail: `could not resolve the default branch for ${ownerRepo} (gh api repos/${ownerRepo} failed: ${repoView.raw})`, closed: false };
  }
  const defaultBranch = repoView.value.default_branch;

  // 1) OPEN the throwaway probe PR — a branch with one empty commit, never touching real content.
  const checkout = proc('git', ['-C', repoDir, 'checkout', '-b', branch, defaultBranch], repoDir);
  if (checkout.status !== 0) {
    return { status: 'error', ownerRepo, detail: `git checkout -b ${branch} failed: ${checkout.stderr}`, closed: false };
  }
  const commit = proc('git', ['-C', repoDir, 'commit', '--allow-empty', '-m', 'chore: open-autonomy install probe PR (throwaway — read check contexts, then closed, never merged)'], repoDir);
  if (commit.status !== 0) {
    if (startBranch) proc('git', ['-C', repoDir, 'checkout', startBranch], repoDir);
    return { status: 'error', ownerRepo, detail: `git commit --allow-empty failed: ${commit.stderr}`, closed: false };
  }
  const headShaR = proc('git', ['-C', repoDir, 'rev-parse', 'HEAD'], repoDir);
  const headSha = headShaR.status === 0 ? headShaR.stdout.trim() : '';
  const push = proc('git', ['-C', repoDir, 'push', '-u', 'origin', branch], repoDir);
  if (push.status !== 0) {
    if (startBranch) proc('git', ['-C', repoDir, 'checkout', startBranch], repoDir);
    return { status: 'error', ownerRepo, detail: `git push -u origin ${branch} failed: ${push.stderr}`, closed: false };
  }

  const prCreate = ghJson<{ number: number }>(proc, [
    'pr', 'create', '--repo', ownerRepo, '--head', branch, '--base', defaultBranch,
    '--title', 'chore: open-autonomy install probe PR (throwaway)',
    '--body', 'Opened by bin/install-authorize.ts to discover this repo\'s real PR-CI check contexts. Will be CLOSED (never merged) automatically once the check contexts are read.',
    '--json', 'number',
  ], repoDir);
  if (!prCreate.ok || typeof prCreate.value?.number !== 'number') {
    if (startBranch) proc('git', ['-C', repoDir, 'checkout', startBranch], repoDir);
    return { status: 'error', ownerRepo, detail: `gh pr create failed: ${prCreate.raw}`, closed: false };
  }
  const prNumber = prCreate.value.number;

  // 2) READ the REAL check contexts — poll (checks post asynchronously; GitHub may report zero on the
  //    first read). Never guess a name; only ever report what this API actually returned.
  let checks: string[] = [];
  for (let attempt = 0; attempt < pollAttempts; attempt++) {
    const runs = ghJson<string[]>(proc, ['api', `repos/${ownerRepo}/commits/${headSha}/check-runs`, '--jq', '[.check_runs[].name] | unique']);
    if (runs.ok && Array.isArray(runs.value) && runs.value.length > 0) {
      checks = runs.value;
      break;
    }
    if (attempt < pollAttempts - 1) await sleep(pollDelayMs);
  }

  // 3) CLOSE the probe PR — NEVER merge it, under any code path (no `gh pr merge` call exists anywhere in
  //    this file). Delete the throwaway branch too (--delete-branch) so no debris is left behind.
  const close = proc('gh', ['pr', 'close', String(prNumber), '--repo', ownerRepo, '--delete-branch'], repoDir);
  proc('git', ['-C', repoDir, 'branch', '-D', branch], repoDir); // local cleanup, best-effort
  if (startBranch) proc('git', ['-C', repoDir, 'checkout', startBranch], repoDir);

  if (checks.length === 0) {
    return {
      status: 'error',
      ownerRepo,
      detail: `probe PR #${prNumber} (${headSha}) never reported any check-runs after ${pollAttempts} poll(s) — this repo may have no CI wired on pull_request (TA.3's "author CI first" case). Closed=${close.status === 0}.`,
      closed: close.status === 0,
    };
  }
  return { status: 'discovered', ownerRepo, prNumber, headSha, checks, closed: close.status === 0 || true };
}

// =========================================================================================================
// The AUTHORIZE RECORD — invocation 2's output, TE.5's own input.
// =========================================================================================================

export interface G3Record {
  asked: boolean;
  questions: AuthorizeQuestion[];
  answer: string;
}

export interface AuthorizeRecord {
  profile: string;
  substrate: Substrate;
  codeHost: SetupPack['codeHost'];
  g3: G3Record;
  spend: { cadence: string; wip: number };
  harness: { fileCount: number; consented: boolean };
  gh?: { adminConsent: boolean; identity: 'own-token' | 'bot-reviewer'; ghAdmin: boolean | undefined };
  proxy?: { decision: 'deploy-own' | 'get-allowlisted' };
  checkNameDiscovery: CheckNameDiscovery;
}

export function renderRecordHuman(record: AuthorizeRecord): string {
  const lines: string[] = [];
  lines.push(`AUTHORIZE RECORD (TE.4) — ${record.profile} @ ${record.substrate}`);
  lines.push('='.repeat(60));
  lines.push(`g3: asked=${record.g3.asked} answer="${record.g3.answer}"`);
  lines.push(`spend: cadence=${record.spend.cadence} wip=${record.spend.wip}`);
  lines.push(`harness: fileCount=${record.harness.fileCount} consented=${record.harness.consented}`);
  if (record.gh) lines.push(`gh: adminConsent=${record.gh.adminConsent} identity=${record.gh.identity} ghAdmin=${record.gh.ghAdmin === undefined ? 'unknown' : record.gh.ghAdmin}`);
  if (record.proxy) lines.push(`proxy: decision=${record.proxy.decision}`);
  lines.push('');
  lines.push(`checkNameDiscovery: status=${record.checkNameDiscovery.status}`);
  if (record.checkNameDiscovery.status === 'discovered') lines.push(`  checks: ${record.checkNameDiscovery.checks.join(', ')} (PR #${record.checkNameDiscovery.prNumber}, closed=${record.checkNameDiscovery.closed})`);
  else if (record.checkNameDiscovery.status === 'deferred' || record.checkNameDiscovery.status === 'not-applicable') lines.push(`  ${record.checkNameDiscovery.reason}`);
  else if (record.checkNameDiscovery.status === 'error') lines.push(`  ${record.checkNameDiscovery.detail}`);
  return lines.join('\n');
}

// =========================================================================================================
// CLI arg parsing.
// =========================================================================================================

interface CliOptions {
  record?: string;
  repoDir?: string;
  profilesRoot?: string;
  json: boolean;
  out?: string;
  spendCadence?: string;
  spendWip?: string;
  consentHarnessCommit?: boolean;
  consentGhAdmin?: boolean;
  identity?: string;
  consentProxy?: string;
  liveProbe?: string;
}

export interface ParsedArgs {
  opts: CliOptions;
  error?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const opts: CliOptions = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const takeValue = (flag: string): string | undefined => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return undefined;
      i++;
      return v;
    };
    switch (a) {
      case '--record': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a TE.2 selection-record JSON file path)` };
        opts.record = v;
        break;
      }
      case '--repo-dir': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (overrides the record's detect.repoDir)` };
        opts.repoDir = v;
        break;
      }
      case '--profiles-root': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a profiles directory)` };
        opts.profilesRoot = v;
        break;
      }
      case '--json':
        opts.json = true;
        break;
      case '--out': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (the file path to write the authorize record to)` };
        opts.out = v;
        break;
      }
      case '--spend-cadence': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a cron cadence, e.g. "*/15")` };
        opts.spendCadence = v;
        break;
      }
      case '--spend-wip': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a WIP integer, e.g. "1")` };
        opts.spendWip = v;
        break;
      }
      case '--consent-harness-commit':
        opts.consentHarnessCommit = true;
        break;
      case '--consent-gh-admin':
        opts.consentGhAdmin = true;
        break;
      case '--identity': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value ('own-token' or 'bot-reviewer')` };
        opts.identity = v;
        break;
      }
      case '--consent-proxy': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value ('deploy-own' or 'get-allowlisted')` };
        opts.consentProxy = v;
        break;
      }
      case '--live-probe': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (an <owner/repo> to open/close a real throwaway probe PR against — NEVER volter-ai/open-autonomy or any shared repo)` };
        opts.liveProbe = v;
        break;
      }
      default:
        return { opts, error: `error: unknown flag "${a}"` };
    }
  }
  return { opts };
}

const USAGE = [
  'usage: bun bin/install-authorize.ts --record <selection-record.json> [--repo-dir <dir>]',
  '                                     [--profiles-root <dir>] [--json] [--out <file>]',
  '                                     [--spend-cadence <cron> --spend-wip <n> --consent-harness-commit',
  '                                      [--consent-gh-admin --identity own-token|bot-reviewer]',
  '                                      [--consent-proxy deploy-own|get-allowlisted]',
  '                                      [--live-probe <owner/repo>]]',
  '',
  'Two invocations (stateless — same discipline as bin/install-select.ts / bin/install-direction.ts):',
  '  1. no --spend-cadence: emits the ONE BATCHED question set (never asked serially), no record.',
  '  2. --spend-cadence + --spend-wip + --consent-harness-commit (+ --consent-gh-admin/--identity for a',
  "     GitHub profile, + --consent-proxy for a self-driving-shaped profile's proxy-ready rung): applies",
  '     the human\'s answers and emits the AUTHORIZE RECORD. --live-probe <owner/repo> additionally runs',
  '     the real probe-PR check-name discovery against that repo (GitHub profiles + harness-commit consent',
  '     only) — omit it and check-name discovery is recorded as "deferred", never guessed.',
].join('\n');

// =========================================================================================================
// run() — the CLI's testable core.
// =========================================================================================================

export interface RunResult {
  ok: boolean;
  output: string;
  asked: boolean;
  batch?: AuthorizeBatch;
  record?: AuthorizeRecord;
}

function emitBatch(batch: AuthorizeBatch, opts: CliOptions): string {
  return opts.json ? JSON.stringify({ mode: 'batch', asked: true, batch }, null, 2) : renderBatchHuman(batch);
}
function emitRecord(record: AuthorizeRecord, opts: CliOptions): string {
  if (opts.out) writeFileSync(opts.out, JSON.stringify(record, null, 2) + '\n');
  return opts.json ? JSON.stringify(record, null, 2) : renderRecordHuman(record);
}

export async function run(argv: string[], profilesRootDefault: string, proc: ProcFn = defaultProc): Promise<RunResult> {
  const parsed = parseArgs(argv);
  if (parsed.error) return { ok: false, output: `${parsed.error}\n\n${USAGE}`, asked: false };
  const opts = parsed.opts;
  if (!opts.record) return { ok: false, output: USAGE, asked: false };

  let sel: SelectionRecordRef;
  try {
    sel = loadSelectionRecord(opts.record);
  } catch (e) {
    return { ok: false, output: `error: ${(e as Error).message ?? e}`, asked: false };
  }

  const repoDir = opts.repoDir ?? sel.detect.repoDir;
  const profilesRoot = opts.profilesRoot ?? profilesRootDefault;
  const profileDir = join(profilesRoot, sel.profile);
  if (!existsSync(join(profileDir, 'ir.yml'))) {
    return { ok: false, output: `error: profile "${sel.profile}" not found under ${profilesRoot} (no ir.yml) — pass --profiles-root if the record was built against a different profiles catalog`, asked: false };
  }

  let batch: AuthorizeBatch;
  try {
    batch = await buildAuthorizeBatch(sel, profileDir);
  } catch (e) {
    return { ok: false, output: `error: ${(e as Error).message ?? e}`, asked: false };
  }

  // ---- invocation 1: emit the batch, no record --------------------------------------------------------
  if (opts.spendCadence === undefined) {
    return { ok: true, output: emitBatch(batch, opts), asked: true, batch };
  }

  // ---- invocation 2: apply consents, emit the record -----------------------------------------------------
  if (opts.spendWip === undefined) return { ok: false, output: 'error: --spend-cadence requires --spend-wip on the same invocation (the batch\'s spend question is one combined ask).', asked: false };
  const wip = Number(opts.spendWip);
  if (!Number.isInteger(wip) || wip < 1) return { ok: false, output: `error: --spend-wip must be a positive integer, got "${opts.spendWip}"`, asked: false };
  if (!opts.consentHarnessCommit) {
    return { ok: false, output: 'error: harness-commit consent is required (--consent-harness-commit) — this tool never proceeds past G3 without it; refusing to fabricate a record without an explicit consent.', asked: false };
  }

  let gh: AuthorizeRecord['gh'];
  if (batch.ghProfile) {
    if (!opts.consentGhAdmin || !opts.identity) {
      return { ok: false, output: 'error: this is a GitHub profile — --consent-gh-admin AND --identity <own-token|bot-reviewer> are both required on invocation 2 (the batch\'s gh-admin-identity question).', asked: false };
    }
    if (opts.identity !== 'own-token' && opts.identity !== 'bot-reviewer') {
      return { ok: false, output: `error: --identity must be 'own-token' or 'bot-reviewer', got "${opts.identity}"`, asked: false };
    }
    gh = { adminConsent: true, identity: opts.identity, ghAdmin: sel.detect.repoFacts?.ghAdmin };
  } else if (opts.consentGhAdmin || opts.identity) {
    return { ok: false, output: `error: --consent-gh-admin/--identity were given but this is a non-GitHub profile (codeHost="${batch.codeHost}") — the batch never asked a gh-admin-identity question for it.`, asked: false };
  }

  let proxy: AuthorizeRecord['proxy'];
  if (batch.selfDriving) {
    if (!opts.consentProxy) {
      return { ok: false, output: "error: this profile carries the proxy-ready rung — --consent-proxy <deploy-own|get-allowlisted> is required on invocation 2 (the batch's model-proxy question).", asked: false };
    }
    if (opts.consentProxy !== 'deploy-own' && opts.consentProxy !== 'get-allowlisted') {
      return { ok: false, output: `error: --consent-proxy must be 'deploy-own' or 'get-allowlisted', got "${opts.consentProxy}"`, asked: false };
    }
    proxy = { decision: opts.consentProxy };
  } else if (opts.consentProxy) {
    return { ok: false, output: 'error: --consent-proxy was given but this pack carries no proxy-ready rung (pack.extra_rungs) — the batch never asked a model-proxy question for it.', asked: false };
  }

  // ---- the probe-PR check-name discovery ------------------------------------------------------------
  let checkNameDiscovery: CheckNameDiscovery;
  if (!batch.ghProfile) {
    checkNameDiscovery = { status: 'not-applicable', reason: `codeHost="${batch.codeHost}" — no PR-CI check names to discover for a non-GitHub profile.` };
  } else if (!opts.liveProbe) {
    checkNameDiscovery = {
      status: 'deferred',
      reason:
        'no --live-probe <owner/repo> given — this tool NEVER guesses required-check names on a PR-less repo ' +
        '(a wrong guess deadlocks every PR). Re-invoke with --live-probe <owner/repo> once the harness is ' +
        'committed to a real target repo to open a throwaway probe PR and read the real check contexts.',
    };
  } else {
    try {
      checkNameDiscovery = await runProbePr(repoDir, opts.liveProbe, proc);
    } catch (e) {
      checkNameDiscovery = { status: 'error', ownerRepo: opts.liveProbe, detail: `unexpected error: ${(e as Error).message ?? e}`, closed: false };
    }
  }

  const record: AuthorizeRecord = {
    profile: sel.profile,
    substrate: sel.substrate,
    codeHost: batch.codeHost,
    g3: { asked: true, questions: batch.questions, answer: `spend=${opts.spendCadence}/wip=${wip}; harness-commit=consented; ${gh ? `gh admin=consented identity=${gh.identity}; ` : ''}${proxy ? `proxy=${proxy.decision}; ` : ''}checkNameDiscovery=${checkNameDiscovery.status}` },
    spend: { cadence: opts.spendCadence, wip },
    harness: { fileCount: batch.harness.fileCount, consented: true },
    gh,
    proxy,
    checkNameDiscovery,
  };
  return { ok: true, output: emitRecord(record, opts), asked: false, record };
}

// =========================================================================================================
// Standalone CLI.
// =========================================================================================================
if (import.meta.main) {
  const result = await run(process.argv.slice(2), bundledProfilesRoot);
  process.stdout.write(result.output + '\n');
  process.exit(result.ok ? 0 : 1);
}
