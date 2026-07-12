#!/usr/bin/env bun
// TE.8 — the unified `oa install` command: chains all seven install phases (TE.1-TE.7) into ONE real
// product entrypoint (OA-INSTALL-IMPLEMENTATION-TASKS.md's own critical path: "TE.1 DETECT -> TE.2 SELECT
// -> TE.3 DIRECTION -> TE.4 AUTHORIZE -> TE.5 EXECUTE+VALIDATE -> TE.6 HAND-OFF -> TE.7 PROVE ADVANCING";
// DESIGN §Q3: "there is exactly one install agent ... not three separate installers").
//
// THE GAP THIS UNIT CLOSES: TE.1-TE.7 were each built and Fable-reviewed individually, but nothing chained
// them — a real adopter had to invoke 7 scripts by hand in the right order, hand-plumbing each phase's JSON
// output into the next phase's `--record`/`--authorize`/`--direction-fill` input. This file IMPORTS and
// CALLS each phase's own exported function directly (never a subprocess re-invocation of a sibling TE.*
// file — the phases already ARE plain functions, `run()`/`runExecute()`/`runValidate()`/`runG4a()`/
// `proveAdvancing()`), threading each phase's real output record into the next phase's real input, exactly
// the way the DESIGN doc's phase sequence describes. Every record is ALSO written to disk under
// `--work-dir` (default `<repoDir>/.open-autonomy/install-work/`) purely for auditability/debuggability —
// this orchestrator does not rely on reading those files back to resume (see "RESUME MODEL" below); it
// re-derives everything fresh on every invocation, the same statelessness discipline TE.2/TE.3/TE.4
// individually already established for their own two-invocation CLIs.
//
// THE FOUR HUMAN GATES (DESIGN §Q3's own table — this orchestrator pauses at every one of them BY DEFAULT):
//   G1 PROFILE   (TE.2)  confirm/override the recommended profile+substrate (or validate a --pick).
//   G2 DIRECTION (TE.3)  the mission is the human's — this tool never authors/invents it; it can only
//                        detect that positioning already exists, or that a human has already supplied
//                        --direction-fill (already-gathered content), never fabricate one on its own.
//   G3 AUTHORIZE (TE.4)  spend cadence + WIP, harness-commit consent, (GitHub) admin+identity consent,
//                        (self-driving) model-proxy decision — named security boundaries the agent must
//                        not self-grant (DESIGN §Phase 3).
//   G4a GO-LIVE  (TE.6)  verifies the human already promoted the first board item to ready/oa-approved,
//                        then (local only) PERFORMS the safe `oa resume` fence-lift for real and
//                        CONSTRUCTS (never executes) `oa start` — the launch half — for the human to run.
//
// --auto-approve (alias --non-interactive) is the TEST/PROOF HARNESS's own mechanism for driving straight
// through G1/G3 with safe, named defaults in a single invocation — documented per-flag below, and NEVER a
// silent bypass of G2 (direction/mission content is never fabricated, auto-approve or not; see phaseDirection)
// or of the GitHub-admin/model-proxy legs of G3 (those stay explicit-consent-only regardless of
// --auto-approve — see phaseAuthorize's own comment). This is the PROOF harness's concern, not a production
// shortcut: a real operator installing onto a real repo should default to the interactive, gate-pausing
// behavior and answer each gate deliberately; --auto-approve exists so this unit's own dry-run acceptance
// test (bin/install.test.ts) can drive the ENTIRE chain end-to-end against a scratch fixture without a human
// in the loop, per this program's own acceptance bar.
//
// RESUME MODEL (no persisted "which gate am I at" cursor — deliberately): every invocation re-runs DETECT
// (cheap, read-only) and re-derives each gate's question from scratch (the same statelessness TE.2/TE.3/
// TE.4 already use). A human answers a gate by adding the printed flag(s) to their NEXT invocation — the
// orchestrator applies whatever answers are present on THIS invocation and pauses again at the first gate
// still lacking one. There is no separate "resume" subcommand: `bun bin/install.ts <repoDir> <answers...>`
// IS the resume — this mirrors the individual TE.2/TE.3/TE.4 CLIs' own "second invocation" idiom, just
// applied uniformly across the whole chain instead of one phase at a time.
//
// ⛔⛔⛔ SAFETY — the two dangerous legs stay exactly as mocked/construct-only as TE.5/TE.6 individually
// proved; this unit only CHAINS already-proven phases, it does not re-open either hazard:
//   - Board-seeding (EXECUTE step 7, TE.5's `stepSeedBoardDrafts`): dispatches the profile's planner via an
//     injectable `proc`. In THIS unit's own tests/dry-run proof, `proc` is ALWAYS a stub for that one
//     command shape (see bin/install.test.ts) — no real agent is ever launched by this repo's own CI/build.
//     In real production use (`oa install` against a real repo, no injected stub), `proc` defaults to a
//     REAL subprocess runner and genuinely dispatches the planner — that is the intended, designed behavior
//     of a real one-shot install (DESIGN §Phase 4), not a safety gap.
//   - Go-live (HAND-OFF, TE.6's `runG4a`): TE.6's own `buildLocalGoLive`/`buildHostedGoLive` NEVER execute a
//     launch command under any code path (structurally — no `spawn`/`proc` call of the constructed
//     `startCommand`/`command` exists in install-handoff.ts) — they only ever construct+report it. (Local
//     substrate's safe `oa resume` fence-lift is the one exception — a real `unlinkSync`, zero spawn risk,
//     performed for real once G4a verifies readiness; see install-handoff.ts's own header for the split.) This
//     orchestrator inherits that guarantee unchanged: it prints/records `report.handoff.goLive`, it never
//     spawns it. Every dispatch/launch-command this file's own phases construct forces the provider URL
//     from the install's own `scheduler/schedule.json` pin (TE.5's `buildBoardSeedDispatchCommand` / TE.6's
//     `buildLocalGoLive` — reused verbatim, never reinvented) — never an ambient/box-wide provider.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detect, type DetectReport } from './install-detect.ts';
import { run as runSelect, type SelectionRecord, type RunResult as SelectRunResult } from './install-select.ts';
import { run as runDirection, type DirectionRecord } from './install-direction.ts';
import { run as runAuthorize, type AuthorizeBatch, type AuthorizeRecord } from './install-authorize.ts';
import {
  runExecute,
  runValidate,
  renderExecuteHuman,
  renderValidateHuman,
  type ExecuteReport,
  type Substrate,
  type ValidateReport,
} from './install-execute.ts';
import { runG4a, G4B_RUNBOOK, type Launcher, type RunG4aReport } from './install-handoff.ts';
import { proveAdvancing, renderReportHuman as renderProveAdvancingHuman, type ProveAdvancingReport } from './install-prove-advancing.ts';
import { profilesRoot as bundledProfilesRoot } from './bundled-profiles.ts';
import { cleanupProbe } from './doctor-checks.ts';
import { providerDown, readProviderState, type BringUpOptions } from '../packages/local-runner-cli/src/provider.ts';
import type { ProcRunner } from '../packages/local-runner-cli/src/types.ts';
import { defaultProc } from '../packages/local-runner-cli/src/proc.ts';
import type { ProcFn } from './recommend-profile.ts';

export { defaultProc };
export type { ProcRunner };

// TE.1/TE.2/TE.4 (install-detect/install-select/install-authorize) share ONE injectable subprocess seam
// (`ProcFn`, bin/recommend-profile.ts's own `(cmd, args, cwd?: string) => ProcResult`); TE.5/TE.6/TE.7
// (install-execute/install-handoff/install-prove-advancing) share a DIFFERENT one (`ProcRunner`,
// packages/local-runner-cli/src/types.ts's own `(cmd, args, opts?: {cwd, ...}) => ProcResult`) — the two
// pre-date this orchestrator and were never unified (each phase's own PR reused whichever seam its OWN
// sibling files already used). This orchestrator exposes exactly ONE `proc` option (`InstallOptions.proc`,
// `ProcRunner`-shaped, matching 3 of the 7 phases directly) and adapts it to `ProcFn` for the other 3 — so
// a test/caller stubs ONE function and it applies uniformly across every phase, never two separately-
// injected (and possibly inconsistent) stubs for the same underlying subprocess call.
export function toProcFn(proc: ProcRunner): ProcFn {
  return (cmd, args, cwd) => {
    const r = proc(cmd, args, cwd !== undefined ? { cwd } : undefined);
    return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
  };
}

// =========================================================================================================
// A gate's outcome — shared shape across G1/G2/G3 (G4a is a verify+construct, not a question/answer gate,
// so it uses TE.6's own RunG4aReport directly instead of this type).
// =========================================================================================================

export type GateStatus = 'ok' | 'paused' | 'blocked';

export interface GateResult<T> {
  status: GateStatus;
  record?: T;
  /** the question/detail put to the human — populated for 'paused' (an ask) and 'blocked' (why it cannot
   *  proceed even with an answer) so the CLI/render layer never has to re-derive wording. */
  question?: string;
  /** what flag(s) to add on the next invocation to answer this gate — only for 'paused'. */
  resumeHint?: string;
}

export function ok<T>(record: T): GateResult<T> {
  return { status: 'ok', record };
}
export function paused<T>(question: string, resumeHint: string): GateResult<T> {
  return { status: 'paused', question, resumeHint };
}
export function blocked<T>(question: string): GateResult<T> {
  return { status: 'blocked', question };
}

// =========================================================================================================
// InstallOptions — every gate-answer flag the CLI parser below also exposes. Every field here is OPTIONAL:
// omitted answers mean "not yet answered" (pause, unless --autoApprove supplies a safe default for that
// specific gate — see each phase function's own comment for exactly which ones it will and will not do
// that for).
// =========================================================================================================

export interface InstallOptions {
  repoDir: string;
  workDir?: string;
  profilesRoot?: string;
  proc?: ProcRunner;
  /** PROOF/TEST HARNESS flag (see file header) — never a production shortcut for G2 or GitHub-admin/proxy
   *  consent, which stay explicit-only regardless. */
  autoApprove?: boolean;
  ownerRepo?: string;
  force?: boolean;
  /** passthrough to EXECUTE step 5 (provider-up) — production default is a REAL termfleet bring-up
   *  (TG.1's own `bringUpProvider`); a test/proof harness injects fake port/spawn/fetch seams here so no
   *  real termfleet process is ever started by this repo's own CI/build (see bin/install.test.ts). */
  bringUp?: Partial<BringUpOptions>;
  /** test seam only — overrides Phase 0's own call to TE.1's `detect()`. Production never sets this. */
  detectHook?: (repoDir: string, proc: ProcRunner) => Promise<DetectReport>;

  /** THE SAFE WAY TO REHEARSE A REAL INSTALL (see this file's own header + the USAGE banner below): runs
   *  every phase for real EXCEPT every side-effecting operation EXECUTE/HAND-OFF would otherwise perform —
   *  no real npm/bun install, no real compile write (reuses autonomy-compile.ts's own built-in file-list
   *  dry-run), no real git commit, no real termfleet provider bring-up (the single most important leg — a
   *  real provider bring-up is itself the first half of the near-miss this flag exists to close), no real
   *  branch-protection/CI mutation, no real agent dispatch, no real `oa resume` unlink, no real go-live
   *  launch (already construct-only). Orthogonal to `--auto-approve`: `--dry-run` alone still pauses at each
   *  human gate exactly like a normal run (safety of REAL operations and interactive-gate pausing are
   *  different concerns) — combine `--dry-run --auto-approve` for a full non-interactive rehearsal of the
   *  entire chain. Defaults `--work-dir` OUTSIDE the target repo (a fresh tmp dir) when not explicitly
   *  overridden, so a dry-run leaves the target repo's working tree byte-for-byte untouched (verifiable via
   *  `git status`), not just free of npm/git/termfleet mutations. */
  dryRun?: boolean;

  // ---- G1 SELECT --------------------------------------------------------------------------------------
  pick?: string;
  substrate?: Substrate;
  /** the exact <profile>@<substrate> token a human confirmed on a PRIOR invocation's printed question. */
  confirmSelect?: string;
  overrideSelect?: string;
  hostedRunner?: boolean;
  preferNoAutoMerge?: boolean;
  canFundProxy?: boolean;
  wantsDemo?: boolean;
  wantsSOC2?: boolean;

  // ---- G2 DIRECTION ------------------------------------------------------------------------------------
  /** already-gathered fill content (a human/operator's own words) — this tool applies it verbatim in
   *  EXECUTE step 3, it never invents any of it (see phaseDirection's own comment). */
  directionFill?: string;
  filled?: string[];

  // ---- G3 AUTHORIZE ------------------------------------------------------------------------------------
  spendCadence?: string;
  spendWip?: number;
  consentHarnessCommit?: boolean;
  consentGhAdmin?: boolean;
  identity?: 'own-token' | 'bot-reviewer';
  consentProxy?: 'deploy-own' | 'get-allowlisted';
  /** opens a REAL throwaway probe PR against a REAL GitHub repo (TE.4's own `runProbePr`) — never set by
   *  this unit's own tests/proof; a real operator supplies it deliberately once the harness is committed. */
  liveProbe?: string;

  // ---- HAND-OFF -----------------------------------------------------------------------------------------
  launcher?: Launcher;
}

export interface Ctx {
  repoDir: string;
  workDir: string;
  profilesRoot: string;
  proc: ProcRunner;
  autoApprove: boolean;
  opts: InstallOptions;
}

function writeWork(ctx: Ctx, name: string, value: unknown): string {
  const file = join(ctx.workDir, name);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

// =========================================================================================================
// Phase 0 — DETECT (TE.1). Always re-run fresh (read-only, cheap) — never cached/skipped, so every gate
// downstream reasons from CURRENT repo facts, never a stale snapshot from an earlier paused invocation.
// =========================================================================================================

export async function phaseDetect(ctx: Ctx): Promise<DetectReport> {
  const report = ctx.opts.detectHook ? await ctx.opts.detectHook(ctx.repoDir, ctx.proc) : await detect(ctx.repoDir, toProcFn(ctx.proc));
  writeWork(ctx, '00-detect.json', report);
  return report;
}

// =========================================================================================================
// Phase 1 — SELECT (TE.2, G1). Drives TE.2's own stateless two-invocation CLI: invocation 1 always runs to
// get the recommendation/question (or validate a --pick); invocation 2 applies an answer already present on
// THIS call (an explicit --confirm-select/--override-select, or --auto-approve's own safe default: accept
// the recommendation verbatim). Never fabricates an override — --auto-approve only ever ACCEPTS what the
// recommender itself proposes, it never picks a different profile on the human's behalf.
// =========================================================================================================

export async function phaseSelect(ctx: Ctx, detectFile: string): Promise<GateResult<SelectionRecord>> {
  const outFile = join(ctx.workDir, '01-selection.json');
  const baseArgv = [ctx.repoDir, '--detect', detectFile, '--json', '--out', outFile];
  const o = ctx.opts;
  if (o.hostedRunner === true) baseArgv.push('--hosted-runner');
  if (o.hostedRunner === false) baseArgv.push('--no-hosted-runner');
  if (o.preferNoAutoMerge) baseArgv.push('--prefer-no-auto-merge');
  if (o.canFundProxy === true) baseArgv.push('--can-fund-proxy');
  if (o.canFundProxy === false) baseArgv.push('--cannot-fund-proxy');
  if (o.wantsDemo) baseArgv.push('--demo');
  if (o.wantsSOC2) baseArgv.push('--soc2');

  if (o.pick) {
    const argv = [...baseArgv, '--pick', o.pick];
    if (o.substrate) argv.push('--substrate', o.substrate);
    const r: SelectRunResult = await runSelect(argv, ctx.profilesRoot, toProcFn(ctx.proc));
    if (!r.ok || !r.record) {
      return paused(r.output, `re-invoke with a different --pick <profile> (this repo does not validate for "${o.pick}"), or drop --pick to use the recommend flow instead.`);
    }
    return ok(r.record);
  }

  // recommend flow — invocation 1 always runs (cheap, stateless) to get the CURRENT recommendation.
  const r1: SelectRunResult = await runSelect(baseArgv, ctx.profilesRoot, toProcFn(ctx.proc));
  let parsed: { question: string; recommendation: { profile: string; substrate: Substrate } };
  try {
    parsed = JSON.parse(r1.output);
  } catch {
    return blocked(`G1 recommend flow returned unparseable output: ${r1.output}`);
  }
  const rec = parsed.recommendation;
  const confirmToken = o.confirmSelect ?? (ctx.autoApprove && !o.overrideSelect ? `${rec.profile}@${rec.substrate}` : undefined);

  if (!confirmToken && !o.overrideSelect) {
    return paused(
      parsed.question,
      `re-invoke with --confirm-select ${rec.profile}@${rec.substrate} to accept, or --override-select <profileName> to choose differently.`,
    );
  }

  const argv2 = [...baseArgv];
  if (confirmToken) argv2.push('--confirm', confirmToken);
  else argv2.push('--override', o.overrideSelect as string);
  const r2: SelectRunResult = await runSelect(argv2, ctx.profilesRoot, toProcFn(ctx.proc));
  if (!r2.ok || !r2.record) {
    // A drifted recommendation or an invalid override — a genuine error, not a normal pause (per TE.2's own
    // "recommendation drifted since the question was asked ... re-ask G1" — the fix is a fresh invocation
    // with no prior answer, which naturally re-derives the current question).
    return blocked(r2.output);
  }
  return ok(r2.record);
}

// =========================================================================================================
// Phase 2 — DIRECTION (TE.3, G2). THE MISSION IS THE HUMAN'S — this tool never authors/invents direction
// content, in EITHER interactive OR --auto-approve mode. It only ever proceeds when (a) the invariant is
// ALREADY satisfied (readable positioning found, or a documents.roles profile's templates are already
// filled — the common "nothing to do" case), or (b) a human has ALREADY supplied --direction-fill
// (already-gathered content TE.5 will apply verbatim). --auto-approve supplies NO default answer here.
// =========================================================================================================

export function phaseDirection(ctx: Ctx, selectionFile: string): GateResult<DirectionRecord> {
  const outFile = join(ctx.workDir, '02-direction.json');
  const argv = ['--record', selectionFile, '--out', outFile, '--json'];
  if (ctx.opts.filled?.length) argv.push('--filled', ctx.opts.filled.join(','));
  const r = runDirection(argv, ctx.profilesRoot);
  if (!r.record) return blocked(r.output);
  const rec = r.record;
  if (rec.invariant.satisfied) return ok(rec);
  if (ctx.opts.directionFill) {
    // Already-gathered content exists on disk; EXECUTE step 3 applies it and re-verifies the invariant
    // itself (stepDirectionFill) — a genuinely still-unsatisfied fill surfaces there as an EXECUTE blocker,
    // never silently waved through here.
    return ok(rec);
  }
  return paused(
    rec.detail,
    'G2 direction: the mission is yours to supply, this tool cannot invent it — capture the content ' +
      '(see the detail above) and re-invoke with --direction-fill <fill.json> (a JSON file: ' +
      '{"files":[{"path":"...","content":"..."}]}), and/or --filled <path1,path2,...> once shipped ' +
      'templates have been edited directly.',
  );
}

// =========================================================================================================
// Phase 3 — AUTHORIZE (TE.4, G3, batched). --auto-approve supplies safe defaults ONLY for the two consents
// that apply to every profile (spend cadence/WIP, harness-commit) — the GitHub admin/identity leg and the
// self-driving model-proxy leg are NAMED SECURITY BOUNDARIES the agent must not self-grant (DESIGN §Phase 3:
// "these are the human_required consent points; each is a boundary the agent must not self-authorize") and
// stay explicit-consent-only REGARDLESS of --auto-approve — a GitHub-target or self-driving-shaped proof run
// must supply --consent-gh-admin --identity <...> / --consent-proxy <...> deliberately, the same as a real
// interactive operator would.
// =========================================================================================================

export async function phaseAuthorize(ctx: Ctx, selectionFile: string): Promise<GateResult<AuthorizeRecord>> {
  const outFile = join(ctx.workDir, '03-authorize.json');
  const baseArgv = ['--record', selectionFile, '--out', outFile, '--json'];
  const r1 = await runAuthorize(baseArgv, ctx.profilesRoot, toProcFn(ctx.proc));
  let parsed: { batch: AuthorizeBatch };
  try {
    parsed = JSON.parse(r1.output);
  } catch {
    return blocked(`G3 authorize batch returned unparseable output: ${r1.output}`);
  }
  const batch = parsed.batch;
  const o = ctx.opts;

  // ⛔ --dry-run NEVER opens a real GitHub PR — --live-probe (TE.4's runProbePr) is the one operation in the
  // G1-G3 phases that is a genuine, real mutation against a real GitHub repo (open a throwaway PR, push a
  // branch), unlike every other DETECT/SELECT/DIRECTION/AUTHORIZE call, which is read-only. Refused loudly
  // here rather than silently dropped, so a caller who passed both flags together learns why nothing opened.
  if (ctx.opts.dryRun && o.liveProbe) {
    return blocked(
      `--live-probe ${o.liveProbe} opens a REAL throwaway PR against a real GitHub repo — refusing under --dry-run ` +
        '(the whole point of dry-run is zero live side effects). Re-run without --dry-run once you are ready for a real probe.',
    );
  }

  const spendCadence = o.spendCadence ?? (ctx.autoApprove ? '*/15' : undefined);
  const spendWip = o.spendWip ?? (ctx.autoApprove ? 1 : undefined);
  const consentHarness = o.consentHarnessCommit ?? ctx.autoApprove;
  if (spendCadence === undefined || spendWip === undefined || !consentHarness) {
    return paused(
      r1.output,
      're-invoke with --spend-cadence <cron> --spend-wip <n> --consent-harness-commit (the two universal G3 consents).',
    );
  }

  const argv2 = [...baseArgv, '--spend-cadence', spendCadence, '--spend-wip', String(spendWip), '--consent-harness-commit'];

  if (batch.ghProfile) {
    // NEVER auto-approved (see this function's own header) — must be explicit even under --auto-approve.
    if (!o.consentGhAdmin || !o.identity) {
      return paused(
        r1.output,
        'this is a GitHub profile: re-invoke with --consent-gh-admin --identity <own-token|bot-reviewer> — ' +
          'branch-protection/admin consent is a named security boundary this tool never self-grants, ' +
          '--auto-approve included.',
      );
    }
    argv2.push('--consent-gh-admin', '--identity', o.identity);
  }
  if (batch.selfDriving) {
    // NEVER auto-approved — a real infra/spend decision (deploy vs get allowlisted).
    if (!o.consentProxy) {
      return paused(
        r1.output,
        'this profile carries the proxy-ready rung: re-invoke with --consent-proxy <deploy-own|get-allowlisted> ' +
          '— never auto-approved, --auto-approve included (a real infra/spend decision).',
      );
    }
    argv2.push('--consent-proxy', o.consentProxy);
  }
  if (o.liveProbe) argv2.push('--live-probe', o.liveProbe);

  const r2 = await runAuthorize(argv2, ctx.profilesRoot, toProcFn(ctx.proc));
  if (!r2.ok || !r2.record) return blocked(r2.output);
  return ok(r2.record);
}

// =========================================================================================================
// Phase 4+5 — EXECUTE + VALIDATE (TE.5). Thin passthrough to TE.5's own orchestrator/report-composer —
// nothing re-derived here (see this file's own header on that discipline).
// =========================================================================================================

export async function phaseExecute(ctx: Ctx, selectionFile: string): Promise<ExecuteReport> {
  const authorizeFile = join(ctx.workDir, '03-authorize.json');
  const detectFile = join(ctx.workDir, '00-detect.json');
  const report = await runExecute({
    record: selectionFile,
    authorize: existsSync(authorizeFile) ? authorizeFile : undefined,
    directionFill: ctx.opts.directionFill,
    detect: detectFile,
    repoDir: ctx.repoDir,
    profilesRoot: ctx.profilesRoot,
    ownerRepo: ctx.opts.ownerRepo,
    force: ctx.opts.force,
    proc: ctx.proc,
    bringUp: ctx.opts.bringUp,
    dryRun: ctx.opts.dryRun,
  });
  writeWork(ctx, '04-execute.json', report);
  return report;
}

export async function phaseValidate(ctx: Ctx, selectionFile: string): Promise<ValidateReport> {
  const report = await runValidate({ record: selectionFile, repoDir: ctx.repoDir, profilesRoot: ctx.profilesRoot, proc: ctx.proc, live: true, dryRun: ctx.opts.dryRun });
  writeWork(ctx, '05-validate.json', report);
  return report;
}

// =========================================================================================================
// Phase 6 — HAND-OFF (TE.6, G4a). Verify, then (local only, once verified ready) perform the safe `oa
// resume` fence-lift for real, and construct-only for `oa start` — see file header's SAFETY note; no
// launch/spawn ever happens here. Always attempted (never a launch, even the real `resume()` is a single
// safe unlink, not a process spawn), even when G4a's own verification reports "not ready" — that is an
// honest, expected outcome (the board holds drafts only until a human promotes an item), never a defect
// this orchestrator should hide or refuse to report.
// =========================================================================================================

export function phaseHandoff(ctx: Ctx, selection: SelectionRecord): RunG4aReport {
  const report = runG4a({
    substrate: selection.substrate,
    repoDir: ctx.repoDir,
    profileDir: join(ctx.profilesRoot, selection.profile),
    ownerRepo: ctx.opts.ownerRepo,
    proc: ctx.proc,
    local: ctx.opts.launcher || ctx.opts.dryRun ? { launcher: ctx.opts.launcher, dryRun: ctx.opts.dryRun } : undefined,
    dryRun: ctx.opts.dryRun,
  });
  writeWork(ctx, '06-handoff.json', report);
  return report;
}

// =========================================================================================================
// Phase 7 — PROVE ADVANCING (TE.7). A point-in-time report, never a daemon (TE.7's own doctrine) — see that
// file's header. Always exits into an honest classification, never overclaims M5/M6.
// =========================================================================================================

export async function phaseProveAdvancing(ctx: Ctx, selection: SelectionRecord): Promise<ProveAdvancingReport> {
  const profileDir = join(ctx.profilesRoot, selection.profile);
  // --dry-run: PROVE ADVANCING's report computation is already read-only; its one real write is
  // `.open-autonomy/install.json` (writeInstallJson) — suppressed here for the same "target repo stays
  // byte-for-byte untouched" reason every other phase's real write is suppressed under dry-run.
  const report = await proveAdvancing(ctx.repoDir, profileDir, { proc: ctx.proc, repo: ctx.opts.ownerRepo, writeInstallJson: !ctx.opts.dryRun });
  writeWork(ctx, '07-prove-advancing.json', report);
  return report;
}

// =========================================================================================================
// The aggregate report + runInstall — the whole chain, one call.
// =========================================================================================================

export type InstallClassification = 'PAUSED' | 'BLOCKED' | 'COMPLETED';

export interface InstallReport {
  classification: InstallClassification;
  /** which phase/gate the run stopped at, when not COMPLETED. */
  stoppedAt?: 'G1' | 'G2' | 'G3' | 'EXECUTE';
  question?: string;
  resumeHint?: string;
  workDir: string;
  /** true iff this run was `--dry-run` — never a real side-effecting operation was performed anywhere in
   *  the chain (see runInstall's own comment + install.ts's file header). */
  dryRun?: boolean;
  detect?: DetectReport;
  selection?: SelectionRecord;
  direction?: DirectionRecord;
  authorize?: AuthorizeRecord;
  execute?: ExecuteReport;
  validate?: ValidateReport;
  handoff?: RunG4aReport;
  proveAdvancing?: ProveAdvancingReport;
}

/** LOW#6 fix (owner-mandated aggregate skeptic review of `oa install`): `classification === 'COMPLETED'`
 *  only means EXECUTE's own steps all reported ok/skipped — it says nothing about whether VALIDATE (the very
 *  next phase, using fresher/independent signals — doctor, live A13 protection, and a live re-read of the
 *  board) still finds the install isn't yet ready to advance. That gap is real, not hypothetical: EXECUTE's
 *  step 7 (`stepSeedBoardDrafts`) only checks that ITS OWN dispatch spawn exited 0 — the dispatched planner
 *  runs asynchronously and may not have filed a draft yet by the time VALIDATE's `checkBoardSeededWithDrafts`
 *  re-reads the board a moment later, which then reports `canAdvanceToG4=false` even though EXECUTE was
 *  entirely clean (bin/install.test.ts's own "FULL CHAIN dry-run" test hits exactly this: EXECUTE reports
 *  `ok: true`/COMPLETED, yet `report.handoff.verification.ready` is `false` because the mocked dispatch never
 *  actually filed anything). Exit 0 must mean "ready to advance", not merely "nothing errored" — a caller
 *  gating on exit code alone (`oa install ... && start-the-loop`) would otherwise wrongly proceed. This gives
 *  that state its OWN documented exit code (4), distinct from both 0 (fully ready) and 1 (a genuine step
 *  failure) — see USAGE's "Exit codes" line and renderInstallHuman's prominent "NOT READY: ..." line. */
export function installExitCode(report: InstallReport): number {
  if (report.classification === 'PAUSED') return 3;
  if (report.classification !== 'COMPLETED') return 1;
  if (report.validate && !report.validate.canAdvanceToG4) return 4;
  return 0;
}

export async function runInstall(opts: InstallOptions): Promise<InstallReport> {
  const proc = opts.proc ?? defaultProc;
  const dryRun = opts.dryRun === true;
  const profilesRoot = opts.profilesRoot ?? bundledProfilesRoot;
  // --dry-run defaults --work-dir OUTSIDE the target repo (a fresh tmp dir) rather than
  // `<repoDir>/.open-autonomy/install-work` (the real-run default) — every phase's own audit-trail write
  // (writeWork, below) is otherwise harmless bookkeeping, but a dry-run's whole promise is "the target repo
  // is left byte-for-byte untouched", so it must never create so much as an audit file inside repoDir unless
  // the caller explicitly asks (an explicit --work-dir still wins either way).
  const workDir = opts.workDir ?? (dryRun ? mkdtempSync(join(tmpdir(), 'oa-install-dry-run-')) : join(opts.repoDir, '.open-autonomy', 'install-work'));
  mkdirSync(workDir, { recursive: true });
  const ctx: Ctx = { repoDir: opts.repoDir, workDir, profilesRoot, proc, autoApprove: opts.autoApprove === true, opts };

  const detectReport = await phaseDetect(ctx);
  const detectFile = join(workDir, '00-detect.json');

  const g1 = await phaseSelect(ctx, detectFile);
  if (g1.status !== 'ok' || !g1.record) {
    return { classification: g1.status === 'paused' ? 'PAUSED' : 'BLOCKED', stoppedAt: 'G1', question: g1.question, resumeHint: g1.resumeHint, workDir, dryRun, detect: detectReport };
  }
  const selection = g1.record;
  const selectionFile = join(workDir, '01-selection.json');

  const g2 = phaseDirection(ctx, selectionFile);
  if (g2.status !== 'ok' || !g2.record) {
    return { classification: g2.status === 'paused' ? 'PAUSED' : 'BLOCKED', stoppedAt: 'G2', question: g2.question, resumeHint: g2.resumeHint, workDir, dryRun, detect: detectReport, selection };
  }

  const g3 = await phaseAuthorize(ctx, selectionFile);
  if (g3.status !== 'ok' || !g3.record) {
    return { classification: g3.status === 'paused' ? 'PAUSED' : 'BLOCKED', stoppedAt: 'G3', question: g3.question, resumeHint: g3.resumeHint, workDir, dryRun, detect: detectReport, selection, direction: g2.record };
  }

  const executeReport = await phaseExecute(ctx, selectionFile);
  // Real mode: a blocked EXECUTE halts the chain (VALIDATE/HAND-OFF/PROVE-ADVANCING all reason about REAL
  // post-EXECUTE state that never happened). Dry-run mode: EXECUTE's own steps never halt each other either
  // (see runExecute's header) — for the same reason, a PREDICTED block in one step must not hide every later
  // phase's own prediction from the operator; the whole point of --dry-run is seeing the full chain.
  if (!executeReport.ok && !dryRun) {
    return {
      classification: 'BLOCKED',
      stoppedAt: 'EXECUTE',
      question: executeReport.blocker,
      resumeHint: 'inspect the EXECUTE report above for the exact blocked step, fix it, and re-invoke (idempotent steps skip cleanly).',
      workDir,
      dryRun,
      detect: detectReport,
      selection,
      direction: g2.record,
      authorize: g3.record,
      execute: executeReport,
    };
  }

  const validateReport = await phaseValidate(ctx, selectionFile);
  const handoffReport = phaseHandoff(ctx, selection);
  const proveAdvancingReport = await phaseProveAdvancing(ctx, selection);

  return {
    // dry-run with a step that predicted a block still finishes the whole chain (above) but must not claim
    // COMPLETED — it honestly reports BLOCKED (a real run would have stopped there) while still attaching
    // every phase's report for full visibility.
    classification: !executeReport.ok ? 'BLOCKED' : 'COMPLETED',
    ...(!executeReport.ok ? { stoppedAt: 'EXECUTE' as const, question: executeReport.blocker } : {}),
    workDir,
    dryRun,
    detect: detectReport,
    selection,
    direction: g2.record,
    authorize: g3.record,
    execute: executeReport,
    validate: validateReport,
    handoff: handoffReport,
    proveAdvancing: proveAdvancingReport,
  };
}

// =========================================================================================================
// MEDIUM#4 FIX (aggregate-review round 2) — orphaned termfleet processes survive a killed orchestrator.
//
// ROOT CAUSE: EXECUTE step 5 (TG.1's own `bringUpProvider`, invoked via `phaseExecute` -> `runExecute` ->
// `stepProviderUp`) spawns the real termfleet console+provider as DETACHED child processes so they survive
// this orchestrator process exiting normally (the intended lifetime: they keep serving the install's
// ongoing autonomous loop long after `oa install` itself has finished). That same detachment means a
// SIGKILL — a dropped terminal, Ctrl-C escalating past a stuck handler, an OOM kill — leaves them running
// with nothing supervising them: a live, unsupervised termfleet provider an operator may not even know
// exists.
//
// FIX: trap SIGINT/SIGTERM (the two signals a Node process CAN observe — see the honest SIGKILL residual
// note below) for the duration of THIS invocation and, if fired, clean up the provider — but ONLY if THIS
// run is the one that (re)started it. Blindly killing on every signal would be WORSE than the bug: the
// provider is deliberately long-lived (a human re-running `oa install` later, e.g. to progress past a
// paused gate, must never have their Ctrl-C nuke an already-running provider serving live agent sessions
// from a previous run). `ProviderState.startedAt` (provider.ts's `bringUpProvider`/`startOn`) already
// records exactly when the CURRENTLY-RECORDED console/provider pids were spawned — comparing it against
// this invocation's own start timestamp distinguishes "I started this" ('started'/'restarted', a fresh
// startedAt) from "this predates me" ('noop', a stale startedAt) with zero new state and zero API surface
// added to install-execute.ts/provider.ts — reusing `providerDown` (the exact `oa provider down` primitive)
// verbatim for the actual kill.
//
// RESIDUAL LIMITATION (documented honestly, not hidden): SIGKILL cannot be trapped by the process it is
// sent to — POSIX delivers it straight to the kernel, no handler ever runs. A SIGKILL'd `oa install` still
// orphans a provider it just started; this fix cannot and does not claim otherwise. RECOVERY for that case
// already exists independent of this fix: `oa provider status`/`oa provider down` (packages/local-runner-
// cli/src/index.ts, wrapping `providerStatus`/`providerDown`) read this install's DURABLE on-disk state
// (.open-autonomy/runner-state/provider/state.json), not in-memory process tracking — an operator can
// discover and clean up an orphan after the fact regardless of which process (or none) is still alive to
// ask. `oa doctor --live` also independently probes the pinned provider's /healthz reachability
// (doctor.ts's `checkProviderHealth`), so an orphan's presence is discoverable through the normal health-
// check path too, not just the dedicated provider subcommand.
// =========================================================================================================

/** Exported for this unit's own live signal-handling proof (see bin/install.test.ts) — the exact function
 *  the SIGINT/SIGTERM handler below calls, so the test exercises the real decision logic, not a re-
 *  implementation of it. `sinceMs` is the invoking CLI's own start timestamp (`Date.now()`), captured BEFORE
 *  `runInstall` (and so before any `bringUpProvider` call it may make) begins. */
export function cleanupOrphanedProvider(repoDir: string, sinceMs: number, opts: { now?: () => string; kill?: (pid: number, signal: NodeJS.Signals) => void } = {}): { attempted: boolean; detail: string } {
  const state = readProviderState(repoDir);
  if (!state || state.stoppedAt) {
    return { attempted: false, detail: 'no provider (or already stopped) recorded for this install — nothing to clean up' };
  }
  if (new Date(state.startedAt).getTime() < sinceMs) {
    return {
      attempted: false,
      detail: `a provider is up but its recorded startedAt (${state.startedAt}) predates this invocation — it was NOT started by this run, leaving it running untouched (the intended steady state; use \`oa provider down\` if you actually want it stopped).`,
    };
  }
  const r = providerDown({ cwd: repoDir, now: opts.now, kill: opts.kill });
  return { attempted: true, detail: `this run's own termfleet provider (startedAt ${state.startedAt}) was orphaned by the signal — cleaned up: ${r.detail}` };
}

// DISCOVERED WHILE BUILDING THIS FIX'S LIVE PROOF — a second, pre-existing signal-handling hazard, closed
// as part of landing this one: `bin/doctor-checks.ts` (pulled in transitively by this file's own
// `install-select.ts` -> `install-detect.ts` import, for its `checkAuth`/`checkEnv`/`checkProvider` checks)
// registers ITS OWN module-level `process.on('SIGINT'|'SIGTERM'|'SIGHUP', ...)` handler (doctor-checks.ts's
// own `cleanupProbe` — cleans up ITS `oa doctor --live`'s worktree-probe artifact) that calls
// `process.exit(130)` UNCONDITIONALLY. Node/Bun invoke same-event listeners in REGISTRATION order, and a
// listener that calls `process.exit()` terminates the process immediately — no later-registered listener
// for that event ever runs. Because ES module imports are always evaluated before the importing module's
// own top-level code, doctor-checks.ts's handler is ALWAYS registered before this file's own `if
// (import.meta.main)` block runs — so a plain `process.on('SIGINT', ...)` registered below would NEVER
// fire (verified live: exit code was consistently doctor-checks.ts's own hardcoded 130, provider cleanup
// never ran). FIX: `process.prependListener` puts THIS handler first regardless of import-time registration
// order, and it explicitly also calls doctor-checks.ts's own exported `cleanupProbe()` (idempotent — a
// second/redundant call, including doctor-checks.ts's own listener never getting to run because this
// handler already calls `process.exit()`, is a safe no-op) so that hazard's own cleanup is never silently
// dropped by winning the race. (In practice `checkHarness`/`cleanupProbe`'s `activeProbe` is never armed
// during a normal `oa install` run — `phaseValidate` calls packages/local-runner-cli/src/doctor.ts's own
// smaller `doctor()`, a different function despite the similar name, never bin/doctor-checks.ts's
// `runDoctor`/`checkHarness` — so this call is currently always a no-op in THIS caller; it is kept as
// defense-in-depth against a future code path in this chain reaching `checkHarness`, and because it is the
// one-line fix that makes the listener-ordering hazard fully honest rather than merely worked around.)

/** Installs the SIGINT/SIGTERM orphan-provider-cleanup handlers for a `runInstall()` invocation covering
 *  `repoDir`, armed from `invocationStartedAtMs` (see `cleanupOrphanedProvider`'s own doc for what that
 *  timestamp scopes). Returns `disarm()` — call it the instant `runInstall()` returns, so a normal finish
 *  (COMPLETED/PAUSED/BLOCKED) never triggers signal-based cleanup (see this file's header comment: the
 *  provider staying up after a normal finish is the intended steady state).
 *
 *  Extracted into its own exported function (rather than inlined in the `import.meta.main` CLI block below)
 *  for exactly one reason: `import.meta.main` is false whenever this module is *imported* rather than run
 *  as the entrypoint, so the CLI block never executes under import — which is precisely how this unit's own
 *  live SIGINT proof drives `runInstall()` (it must inject a stub for the one dangerous real-agent-dispatch
 *  subprocess call, so it imports `runInstall` as a library rather than shelling out to a real `bun
 *  bin/install.ts` process). A hand-copied replica of this registration in the proof script would test its
 *  OWN logic, not this file's — and did, during this fix's own development, silently mask the exact
 *  prependListener/cleanupProbe fix below not yet existing. Calling this SAME exported function from both
 *  the real CLI and the live proof closes that gap: the proof exercises the literal code this file runs. */
export function installOrphanCleanupHandlers(repoDir: string, invocationStartedAtMs: number): { disarm: () => void } {
  let cleanupArmed = true;
  const onInterruptSignal = (signal: NodeJS.Signals) => {
    if (!cleanupArmed) return; // already handled (or already past runInstall) — never double-act
    cleanupArmed = false;
    // Run doctor-checks.ts's OWN cleanup FIRST (see this function's own header comment for the full
    // listener-ordering hazard this neutralizes) — idempotent/safe even though it is always a no-op for
    // this caller today.
    cleanupProbe();
    const c = cleanupOrphanedProvider(repoDir, invocationStartedAtMs);
    process.stderr.write(`\n[oa install] ${signal} received mid-run — ${c.detail}\n`);
    if (!c.attempted) {
      process.stderr.write(
        '[oa install] NOTE: SIGKILL cannot be trapped by this process at all (POSIX delivers it straight to the ' +
          'kernel) — a SIGKILL\'d run gets no cleanup chance and may still orphan a provider it started; recover ' +
          'via `oa provider status` / `oa provider down`, which read this install\'s durable on-disk state, not ' +
          'process liveness.\n',
      );
    }
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  // prependListener (NOT .on/.addListener): guarantees this handler runs BEFORE doctor-checks.ts's own
  // module-level SIGINT/SIGTERM listener (registered earlier, at import time) — otherwise that listener's
  // unconditional `process.exit(130)` would terminate the process before this one ever ran.
  process.prependListener('SIGINT', () => onInterruptSignal('SIGINT'));
  process.prependListener('SIGTERM', () => onInterruptSignal('SIGTERM'));
  return { disarm: () => { cleanupArmed = false; } };
}

// =========================================================================================================
// Rendering.
// =========================================================================================================

/** Collects every "[DRY-RUN] would ..." plan the EXECUTE/HAND-OFF phases recorded into one short recap, so
 *  an operator/reviewer never has to re-read the full step-by-step output just to see what a REAL run would
 *  have done. Purely a presentation convenience over data already on the report — nothing computed here. */
function renderDryRunSummary(report: InstallReport): string {
  const lines: string[] = ['DRY-RUN SUMMARY — what a REAL (non-dry-run) run would have done, phase by phase:'];
  const steps = report.execute?.steps ?? [];
  const byId = (id: string) => steps.find((s) => s.id === id);

  const deps = byId('install-deps');
  const wouldInstall = deps?.wouldInstall as string[] | undefined;
  lines.push(`  deps:      ${wouldInstall?.length ? `would run: ${wouldInstall.join('; ')}` : 'nothing to install (already present)'}`);

  const compile = byId('compile');
  const wouldWrite = compile?.wouldWrite as string[] | undefined;
  lines.push(`  compile:   ${wouldWrite ? `would write ${wouldWrite.length} file(s) into ${report.detect?.repoDir ?? report.selection?.detect.repoDir ?? '(repoDir)'}` : '(not reached)'}`);

  const commit = byId('commit-harness');
  const wouldCommit = commit?.wouldCommit as string[] | undefined;
  lines.push(`  commit:    ${wouldCommit?.length ? `would run: git add -f -- <${wouldCommit.length} file(s)> && git commit -m "Install the open-autonomy harness"` : '(nothing planned — see the commit-harness step above)'}`);

  const provider = byId('provider-up');
  const wouldBringUp = provider?.wouldBringUp as { action?: string; consoleUrl?: string; providerUrl?: string } | undefined;
  lines.push(`  provider:  ${wouldBringUp ? `${wouldBringUp.action} — console ${wouldBringUp.consoleUrl ?? '(n/a)'}, provider ${wouldBringUp.providerUrl ?? '(n/a)'}` : '(not reached, or substrate != local)'}`);

  const provision = byId('ci-and-provision');
  const wouldProvision = provision?.wouldProvision as { ownerRepo?: string; requiredChecks?: string[] } | undefined;
  lines.push(`  provision: ${wouldProvision ? `would provision ${wouldProvision.ownerRepo} with checks [${wouldProvision.requiredChecks?.join(', ')}]` : '(not reached, or substrate != gh-actions)'}`);

  const seed = byId('seed-board-drafts');
  lines.push(`  dispatch:  ${seed?.command ? `would run: ${(seed.command as { cmd: string; args: string[] }).cmd} ${(seed.command as { cmd: string; args: string[] }).args.join(' ')}` : '(not reached)'}`);

  const goLive = report.handoff?.goLive;
  if (goLive && 'startCommand' in goLive) {
    lines.push(`  go-live:   would run: ${goLive.startCommand.cmd} ${goLive.startCommand.args.join(' ')} (already construct-only even outside --dry-run)`);
  } else if (goLive && 'command' in goLive && goLive.command) {
    lines.push(`  go-live:   would run: ${goLive.command.cmd} ${goLive.command.args.join(' ')} (already construct-only even outside --dry-run)`);
  } else {
    lines.push(`  go-live:   not ready — ${report.handoff?.verification.message ?? '(hand-off not reached)'}`);
  }
  lines.push('');
  lines.push('Zero of the above were actually run. Re-invoke without --dry-run once you are ready for the real thing.');
  return lines.join('\n');
}

export function renderInstallHuman(report: InstallReport): string {
  const lines: string[] = [];
  lines.push('OA INSTALL — the one-shot install agent (TE.8)');
  lines.push('='.repeat(70));
  if (report.dryRun) {
    lines.push('');
    lines.push('*** DRY-RUN — THE SAFE WAY TO REHEARSE A REAL INSTALL — NO REAL SIDE EFFECTS WERE PERFORMED ***');
    lines.push(
      'Every phase below ran for real EXCEPT every mutating operation (npm/bun install, compile writes, git ' +
        'commit, termfleet provider bring-up, branch-protection/CI mutation, agent dispatch, go-live launch) — ' +
        'those are reported as PLANS ("[DRY-RUN] would ...") only, never performed. See DRY-RUN SUMMARY below.',
    );
  }
  lines.push(`work-dir: ${report.workDir}`);
  lines.push('');

  if (report.classification !== 'COMPLETED' && !report.execute) {
    // Paused/blocked before EXECUTE ever ran (G1/G2/G3) — nothing else to print.
    lines.push(`${report.classification} at ${report.stoppedAt}`);
    lines.push('');
    if (report.question) lines.push(report.question);
    if (report.resumeHint) {
      lines.push('');
      lines.push(`TO CONTINUE: ${report.resumeHint}`);
    }
    return lines.join('\n');
  }

  if (report.classification !== 'COMPLETED') {
    // dry-run only (see runInstall's own comment): EXECUTE predicted a block but the whole chain still ran
    // so every later phase's own prediction is visible too — say so plainly before the per-phase detail.
    lines.push(`${report.classification} at ${report.stoppedAt} — a REAL run would have stopped here (dry-run continues anyway to show every phase's plan):`);
    if (report.question) lines.push(`  ${report.question}`);
    lines.push('');
  }

  // LOW#6 fix (owner-mandated aggregate skeptic review): make it impossible to read this report as fully
  // done when it isn't — a completed-with-no-hard-failure chain can still leave VALIDATE's canAdvanceToG4
  // false (e.g. step 7 only checks that ITS OWN dispatch spawn exited 0, not that the dispatched planner
  // actually finished filing a draft before VALIDATE's board-seeded check ran). Surfaced prominently, right
  // up front — see also installExitCode(), which gives this state its own distinct nonzero exit code so a
  // script gating on exit code alone can't conflate "ran clean" with "ready to advance".
  if (report.classification === 'COMPLETED' && report.validate && !report.validate.canAdvanceToG4) {
    lines.push(`NOT READY: the chain completed with no hard step failure, but VALIDATE reports canAdvanceToG4 = false — ${report.validate.blockers.join('; ') || '(see VALIDATE detail below)'}`);
    lines.push('');
  }

  lines.push(`selected: ${report.selection!.profile} @ ${report.selection!.substrate} (G1: ${report.selection!.g1.answer})`);
  lines.push(`direction: ${report.direction!.action} — ${report.direction!.invariant.reason}`);
  lines.push(`authorize: ${report.authorize!.g3.answer}`);
  lines.push('');
  lines.push(renderExecuteHuman(report.execute!));
  lines.push('');
  lines.push(renderValidateHuman(report.validate!));
  lines.push('');
  lines.push('HAND-OFF (G4a) — verify, then (local) `oa resume` performed for real; `oa start` construct-only, NEVER executed by this tool:');
  lines.push(`  ${report.handoff!.verification.message}`);
  if (report.handoff!.goLive) {
    const gl = report.handoff!.goLive;
    lines.push(`  ${'message' in gl ? gl.message : JSON.stringify(gl)}`);
  }
  lines.push('');
  lines.push(renderProveAdvancingHuman(report.proveAdvancing!, report.detect!.repoDir));
  lines.push('');

  if (report.dryRun) {
    lines.push(renderDryRunSummary(report));
    lines.push('');
  }

  lines.push(
    `HONEST CEILING: this run never launches a real agent (board-seeding is the only real dispatch; go-` +
      `live's \`oa start\` launch half is construct-only, though \`oa resume\` — the safe fence-lift — is ` +
      `performed for real once G4a verifies readiness${report.dryRun ? ' (skipped entirely under --dry-run)' : ''}) — expect M3/INSTALLED or, once a human has promoted ` +
      `a board item, M4/ARMED; M5/RUNNING requires the human's own G4a promotion + running the printed \`oa ` +
      `start\` command themselves, and M6/ADVANCING is an async follow-up (DESIGN hardening #1/#2), never a ` +
      `same-session guarantee.`,
  );
  return lines.join('\n');
}

// =========================================================================================================
// CLI.
// =========================================================================================================

export interface CliOptions extends InstallOptions {
  json: boolean;
}

const USAGE = `usage: bun bin/install.ts <repoDir> [options]

*** --dry-run — THE SAFE WAY TO REHEARSE A REAL INSTALL. RUN THIS FIRST. ***
    Runs the ENTIRE chain (all 7 phases) against your REAL repo but NEVER performs a real side-effecting
    operation anywhere in it: no real npm/bun install, no real compile write, no real git commit,
    no real termfleet provider bring-up (the critical one — a real provider bring-up is itself half the
    hazard a real install carries), no real branch-protection/CI mutation, no real agent dispatch,
    no real go-live launch. Every one of those is reported instead as a plan ("[DRY-RUN] would ..."), and a
    DRY-RUN SUMMARY recaps every phase's plan at the end. This is the DEFAULT SAFE PATH for evaluating/
    testing this tool — combine with --auto-approve for a full non-interactive rehearsal:
      bun bin/install.ts <repoDir> --dry-run --auto-approve

Chains all 7 install phases (DETECT -> SELECT -> DIRECTION -> AUTHORIZE -> EXECUTE -> VALIDATE -> HAND-OFF
-> PROVE ADVANCING) into one command, pausing at each of the 4 human gates by default:

  G1 PROFILE    confirm/override the recommended profile+substrate (or validate a --pick)
  G2 DIRECTION  the mission is yours — this tool never invents it, only detects/applies what you supply
  G3 AUTHORIZE  spend cadence+WIP, harness-commit, (GitHub) admin+identity, (self-driving) model-proxy
  G4a GO-LIVE   verifies you already promoted the first board item to ready/oa-approved, then (local only)
                automatically performs the safe \`oa resume\` fence-lift, and constructs (never executes)
                \`oa start\` — the launch half — for you to run yourself

Global:
  --dry-run                     THE SAFE WAY TO REHEARSE — see the banner above. Orthogonal to
                                 --auto-approve (this flag only ever concerns REAL side effects, never
                                 interactive-gate pausing) — combine both for a full non-interactive rehearsal.
  --work-dir <dir>              default: <repoDir>/.open-autonomy/install-work (--dry-run default: a fresh
                                 tmp dir OUTSIDE <repoDir>, so the target repo stays byte-for-byte untouched)
  --profiles-root <dir>         default: this checkout's bundled profiles/
  --json                        machine-readable final report
  --owner-repo <owner/name>     required for a GitHub-target EXECUTE/HAND-OFF
  --force                       passthrough to the compile step's --force
  --auto-approve                PROOF/TEST HARNESS ONLY (see bin/install.ts's own file header) — drives G1
                                 (accept the recommendation) and G3's universal spend/harness-commit consents
                                 automatically. NEVER bypasses G2 (mission content) or G3's GitHub-admin/
                                 model-proxy consents — those stay explicit regardless. Alias: --non-interactive
  --help, -h                    this text

G1 SELECT answers:
  --pick <profile> [--substrate local|gh-actions]      pre-pick + validate (skips the recommend ask)
  --confirm-select <profile>@<substrate>                accept a previously-printed recommendation
  --override-select <profile>                           choose a different profile instead
  --hosted-runner | --no-hosted-runner
  --prefer-no-auto-merge
  --can-fund-proxy | --cannot-fund-proxy
  --demo
  --soc2

G2 DIRECTION answers:
  --direction-fill <fill.json>   {"files":[{"path":"...","content":"..."}]} — already-gathered content
  --filled <path1,path2,...>     confirm shipped templates were edited directly (documents.roles profiles)

G3 AUTHORIZE answers:
  --spend-cadence <cron> --spend-wip <n>
  --consent-harness-commit
  --consent-gh-admin --identity <own-token|bot-reviewer>     (GitHub profiles only)
  --consent-proxy <deploy-own|get-allowlisted>               (self-driving-shaped profiles only)
  --live-probe <owner/repo>       opens a REAL throwaway probe PR — real GitHub side effects, use deliberately
                                   (refused under --dry-run — never opens a real PR)

HAND-OFF:
  --launcher <tmux|nohup>        local go-live launcher shape (default tmux)

Exit codes: 0 completed the chain AND VALIDATE confirms it is ready to advance (through PROVE ADVANCING; the
FINAL maturity/M6 stage is a report, never a failure) · 1 blocked (a genuine defect — see the printed detail)
· 2 usage error · 3 paused at a gate (interactive, awaiting your answer — see "TO CONTINUE" in the output)
· 4 completed with NO hard step failure but NOT yet ready to advance (VALIDATE's canAdvanceToG4 = false —
see the printed "NOT READY: ..." line/blockers; an expected pre-G4 state on its own, e.g. the dispatched
planner hadn't finished filing a draft yet, never a defect by itself — but distinct from full readiness so a
script gating on exit code alone doesn't wrongly treat it as "done").
`;

export function parseArgs(argv: string[]): { opts: CliOptions; error?: string } {
  const opts: CliOptions = { repoDir: '', json: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const takeValue = (flag: string): string | undefined => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return undefined;
      i++;
      return v;
    };
    switch (a) {
      case '--work-dir': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.workDir = v;
        break;
      }
      case '--profiles-root': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.profilesRoot = v;
        break;
      }
      case '--json':
        opts.json = true;
        break;
      case '--owner-repo': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.ownerRepo = v;
        break;
      }
      case '--force':
        opts.force = true;
        break;
      case '--auto-approve':
      case '--non-interactive':
        opts.autoApprove = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--pick': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.pick = v;
        break;
      }
      case '--substrate': {
        const v = takeValue(a);
        if (v !== 'local' && v !== 'gh-actions') return { opts, error: `error: ${a} must be 'local' or 'gh-actions'` };
        opts.substrate = v;
        break;
      }
      case '--confirm-select': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (<profile>@<substrate>)` };
        opts.confirmSelect = v;
        break;
      }
      case '--override-select': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.overrideSelect = v;
        break;
      }
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
      case '--direction-fill': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.directionFill = v;
        break;
      }
      case '--filled': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.filled = v.split(',').map((s) => s.trim()).filter(Boolean);
        break;
      }
      case '--spend-cadence': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        opts.spendCadence = v;
        break;
      }
      case '--spend-wip': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value` };
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) return { opts, error: `error: ${a} must be a positive integer` };
        opts.spendWip = n;
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
        if (v !== 'own-token' && v !== 'bot-reviewer') return { opts, error: `error: ${a} must be 'own-token' or 'bot-reviewer'` };
        opts.identity = v;
        break;
      }
      case '--consent-proxy': {
        const v = takeValue(a);
        if (v !== 'deploy-own' && v !== 'get-allowlisted') return { opts, error: `error: ${a} must be 'deploy-own' or 'get-allowlisted'` };
        opts.consentProxy = v;
        break;
      }
      case '--live-probe': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (owner/repo)` };
        opts.liveProbe = v;
        break;
      }
      case '--launcher': {
        const v = takeValue(a);
        if (v !== 'tmux' && v !== 'nohup') return { opts, error: `error: ${a} must be 'tmux' or 'nohup'` };
        opts.launcher = v;
        break;
      }
      default:
        if (a.startsWith('--')) return { opts, error: `error: unknown flag "${a}"` };
        positional.push(a);
        break;
    }
  }
  opts.repoDir = positional[0] ?? '';
  return { opts };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    process.stdout.write(USAGE);
    process.exit(argv.length === 0 ? 2 : 0);
  }
  const { opts, error } = parseArgs(argv);
  if (error) {
    process.stderr.write(`${error}\n\n${USAGE}`);
    process.exit(2);
  }
  if (!opts.repoDir) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  if (!existsSync(opts.repoDir)) {
    process.stderr.write(`error: repoDir "${opts.repoDir}" does not exist\n`);
    process.exit(2);
  }

  // MEDIUM#4 fix — see `installOrphanCleanupHandlers`'s own doc (above `cleanupOrphanedProvider`) for the
  // full root cause + rationale. Armed for the duration of THIS invocation only; disarmed the instant
  // runInstall returns (a clean finish — COMPLETED, PAUSED, or BLOCKED — is the process exiting normally,
  // which is never a reason to touch the provider; only an interrupting SIGINT/SIGTERM mid-run is).
  const invocationStartedAtMs = Date.now();
  const { disarm } = installOrphanCleanupHandlers(opts.repoDir, invocationStartedAtMs);

  const report = await runInstall(opts);
  disarm(); // a normal finish never triggers signal-based provider cleanup — see comment above
  const out = opts.json ? JSON.stringify(report, null, 2) : renderInstallHuman(report);
  process.stdout.write(`${out}\n`);
  process.exit(installExitCode(report));
}

// Re-exported so a caller/test can print the G4b async babysit runbook without importing install-handoff.ts
// directly.
export { G4B_RUNBOOK };
