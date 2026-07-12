#!/usr/bin/env bun
// TE.7 — Phase 7 PROVE ADVANCING (the FINAL unit of the one-shot install program)
// (OA-INSTALL-IMPLEMENTATION-TASKS.md#te7, DESIGN §Phase 7: "Watch the first wave (`oa status`); confirm a
// mission-linked issue closed via a gate-passed merged PR → declare M6 (ADVANCING). If it ticks without
// advancing (empty board / placeholder vision), loop back and report the specific missing rung.")
//
// THIS IS A THIN ORCHESTRATOR — it reimplements NO gate-check/linkage logic. It:
//   (a) reads the install's SetupPack (profile+substrate) via TS.1's `getSetupPack` — framing context only
//       (landing_mode / terminal_stage / declared m6_signal), never re-derived M6 logic;
//   (b) calls TF.1's `missionAdvancingSignal` (packages/local-runner-cli/src/m6-signal.ts) against the real
//       install/repo — the ONE real, profile-specific M6 check; this file never re-implements any of its
//       gate-check/linkage reasoning;
//   (c) present:true  -> reports M6/ADVANCING, passing TF.1's own evidence string through VERBATIM;
//   (d) present:false -> reads TB.2's `computeMaturity` (packages/local-runner-cli/src/maturity.ts) for the
//       install's CURRENT composed stage and distinguishes, per DESIGN's own phrasing:
//         - "ticked without advancing"  — the install reached M5/RUNNING (or would, since M6 is
//           evaluated last in TB.2's cumulative walk, M5 held) — i.e. the scheduler is actually ticking —
//           but M6 didn't fire. The "specific missing rung" here is TF.1's own M6 evidence (which is
//           exactly the DESIGN's own examples of this failure mode: "empty board" == TF.1's "nothing to
//           prove M6 against yet"; "placeholder vision" would show up as an M4 direction-content failure
//           reported by a PRIOR run of `oa maturity`, and TF.1's own gate/linkage evidence covers every
//           other reason a tick failed to advance the mission).
//         - "hasn't even reached M5 yet" — the install never got the loop running at all; the specific
//           missing rung is TB.2's own `blockers[0]` (the earliest unmet stage in its cumulative walk —
//           e.g. "M3 blocked: A13 branch-protection HARD signal failed...").
//
// WATCH = A POINT-IN-TIME CHECK, NOT A NEW POLLING DAEMON (interpretation note, stated honestly per the
// task brief's own ask). DESIGN's Phase 7 text says "Watch the first wave (`oa status`)" — `oa status` is
// itself a report verb (packages/local-runner-cli/src/status.ts), not a daemon; DESIGN's own hardening #2
// explicitly re-scopes the terminal claim: "the agent hands off at M5 and *schedules* the M6 check (`oa
// maturity --watch` / the cron audit)" — i.e. the watching is done by an EXTERNAL scheduler (a human
// operator re-running this, or a repo's own cron calling it periodically), never a long-running process
// this unit itself starts. `oa maturity` (TB.2) already ships as exactly this shape: a report verb that
// "always exits 0 — the stage itself is the payload" (index.ts's own HELP text) with no watch/daemon mode
// anywhere in its CLI surface. This tool follows the identical shape: one invocation, one point-in-time
// verdict, exit 0 always (a report verb never "fails" just because the install hasn't reached M6 yet —
// non-advancing is a fact to report, not an error). An operator or an audit cron invokes it repeatedly;
// this file starts no timer, no loop, no background process.
//
// REUSE (do not re-derive): `missionAdvancingSignal` (TF.1, m6-signal.ts) and `computeMaturity`/`STAGE_ORDER`
// (TB.2, maturity.ts) are imported and called as-is — every fact in this file's report is a pass-through of
// one of those two modules' own `{present, evidence}` / `InstallRecord` output, never summarized/paraphrased
// in a way that could drop a cited fact (the M6 evidence string is embedded VERBATIM in every report shape).
//
// HOME rationale (bin/, not packages/local-runner-cli/): identical reasoning to TE.1-TE.5's own header
// comments — this file takes a RUNTIME import of `@open-autonomy/core`'s `getSetupPack`, which only resolves
// under `bun`'s extension-free internal module resolution, never under plain Node ESM. `bin/` is this repo's
// own dev/install-time tooling; `packages/local-runner-cli` (`@volter/oa`) ships standalone to an adopter's
// repo and cannot take this monorepo-only dependency (see m6-signal.ts / maturity.ts's own "NO-CORE-IMPORTS
// RULE" headers — this file honors the same rule by importing `missionAdvancingSignal`/`computeMaturity` via
// their plain relative `packages/local-runner-cli/src/*.ts` paths, exactly as bin/install-execute.ts does).
//
// Test-glob note (same pattern as TA.3/TE.1-TE.5): `check:core`'s glob (`packages/*/src/*.test.ts`) does not
// reach `bin/`, so `bin/install-prove-advancing.test.ts` is wired into its own
// `check:install-prove-advancing` package.json script, added to the `check` composite.
import { existsSync, writeFileSync } from 'node:fs';
import { getSetupPack, type SetupPack } from '@open-autonomy/core';
import { missionAdvancingSignal, type MissionAdvancingContext, type Signal as MissionAdvancingSignalResult } from '../packages/local-runner-cli/src/m6-signal.ts';
import { computeMaturity, STAGE_ORDER, type InstallRecord, type MaturityOptions, type Stage } from '../packages/local-runner-cli/src/maturity.ts';
import { defaultProc } from '../packages/local-runner-cli/src/proc.ts';
import type { ProcRunner } from '../packages/local-runner-cli/src/types.ts';

// =========================================================================================================
// The report.
// =========================================================================================================

export type ProveAdvancingClassification = 'ADVANCING' | 'TICKED_WITHOUT_ADVANCING' | 'NOT_YET_M5';

export interface ProveAdvancingReport {
  classification: ProveAdvancingClassification;
  /** true iff classification === 'ADVANCING' — kept alongside classification for a trivial boolean check. */
  m6Present: boolean;
  /** TF.1's own evidence string, embedded VERBATIM — never paraphrased. */
  m6Evidence: string;
  /** The specific missing rung this report names (per DESIGN's own phrasing). For ADVANCING this restates
   *  the M6 evidence; for the two non-advancing classifications it's the citation the task brief demands. */
  missingRung: string;
  /** Framing context read from the pack (TS.1) — never re-derived M6 logic, just the declarative facts. */
  pack: { landingMode: string; terminalStage: string; m6Signal: string };
  /** Only populated when M6 is NOT present — the current composed stage read from TB.2 (`oa maturity`),
   *  reused rather than re-derived. Omitted (not merely empty) on the ADVANCING path, since TB.2 was never
   *  invoked there (this tool's own point (c)/(d) branching — see file header). */
  maturity?: { stage: Stage; stageName: string; blockers: string[] };
}

export function renderReportHuman(report: ProveAdvancingReport, installDir: string): string {
  const lines: string[] = [];
  lines.push(`PROVE ADVANCING — ${installDir}`);
  lines.push('='.repeat(60));
  lines.push(`classification: ${report.classification}`);
  lines.push(`pack: landing_mode=${report.pack.landingMode} terminal_stage=${report.pack.terminalStage} m6_signal=${report.pack.m6Signal}`);
  lines.push('');
  lines.push(`M6 signal (TF.1, verbatim): present=${report.m6Present}`);
  lines.push(`  ${report.m6Evidence}`);
  if (report.maturity) {
    lines.push('');
    lines.push(`current maturity (TB.2, reused): ${report.maturity.stage}/${report.maturity.stageName}`);
    for (const b of report.maturity.blockers) lines.push(`  ${b}`);
  }
  lines.push('');
  lines.push(`missing rung: ${report.missingRung}`);
  return lines.join('\n');
}

// =========================================================================================================
// The composer — pure function of its inputs (installDir, profileDir, ctx), testable without a CLI.
// =========================================================================================================

export interface ProveAdvancingOptions {
  proc?: ProcRunner;
  env?: NodeJS.ProcessEnv;
  repo?: string;
  workItemId?: string;
  scanLimit?: number;
  /** passed through to computeMaturity when the M6-not-present path needs it — see MaturityOptions. */
  target?: MaturityOptions['target'];
  /** passed through to computeMaturity's own A11/A12 overrides (see maturity.ts's own doc: these only
   *  resolve inside a real open-autonomy source checkout; a caller running against a synthetic fixture
   *  install points them elsewhere to get an honest `doctor-unavailable:` softening instead of a real,
   *  meaningless probe against fixture state). Never consulted on the ADVANCING path (computeMaturity is
   *  never invoked there). */
  preflightBin?: string;
  ghPreflightScript?: string;
  /** default false — this tool is a READ-ONLY point-in-time report (see file header's "never a daemon"
   *  note); it must not mutate `.open-autonomy/install.json` as a side effect of a read-only check against
   *  a real repo. Set true only when the caller explicitly wants TB.2's own durable-record write too (the
   *  same opt-in `oa maturity` itself defaults to true for). */
  writeInstallJson?: boolean;
}

export async function proveAdvancing(installDir: string, profileDir: string, opts: ProveAdvancingOptions = {}): Promise<ProveAdvancingReport> {
  const proc = opts.proc ?? defaultProc;
  const env = opts.env ?? process.env;

  // (a) read the pack — framing context only.
  const pack: SetupPack = getSetupPack(profileDir);
  const packInfo = { landingMode: pack.landing_mode, terminalStage: pack.terminal_stage, m6Signal: pack.maturity_signals.m6_signal };

  // (b) call TF.1's real, profile-specific M6 check — never re-derived here.
  const m6Ctx: MissionAdvancingContext = { proc, env, profileDir };
  if (opts.repo) m6Ctx.repo = opts.repo;
  if (opts.workItemId) m6Ctx.workItemId = opts.workItemId;
  if (opts.scanLimit) m6Ctx.scanLimit = opts.scanLimit;
  const m6: MissionAdvancingSignalResult = await missionAdvancingSignal(installDir, m6Ctx);

  if (m6.present) {
    // (c) present:true -> M6/ADVANCING, TF.1's evidence passed through unmodified.
    return {
      classification: 'ADVANCING',
      m6Present: true,
      m6Evidence: m6.evidence,
      missingRung: m6.evidence,
      pack: packInfo,
    };
  }

  // (d) present:false -> read TB.2's CURRENT composed stage (reused, never re-derived) to distinguish
  // "ticked without advancing" (M5 already reached — the loop runs, but M6 didn't fire) from "hasn't even
  // reached M5 yet" (the loop was never actually running).
  const mOpts: MaturityOptions = { cwd: installDir, profileDir, proc, env, write: opts.writeInstallJson === true };
  if (opts.repo) mOpts.repo = opts.repo;
  if (opts.workItemId) mOpts.workItemId = opts.workItemId;
  if (opts.scanLimit) mOpts.scanLimit = opts.scanLimit;
  if (opts.target) mOpts.target = opts.target;
  if (opts.preflightBin) mOpts.preflightBin = opts.preflightBin;
  if (opts.ghPreflightScript) mOpts.ghPreflightScript = opts.ghPreflightScript;
  const record: InstallRecord = await computeMaturity(mOpts);

  const reachedM5 = STAGE_ORDER.indexOf(record.stage) >= STAGE_ORDER.indexOf('M5');
  const classification: ProveAdvancingClassification = reachedM5 ? 'TICKED_WITHOUT_ADVANCING' : 'NOT_YET_M5';
  const missingRung = reachedM5
    ? `M6 not yet reached even though the install is at ${record.stage}/${record.stageName} (the loop IS ticking) — ${m6.evidence}`
    : `install has not yet reached M5/RUNNING (currently ${record.stage}/${record.stageName}) — ${record.blockers[0] ?? 'no blocker recorded (unexpected: stage < M5 with an empty blockers array)'}`;

  return {
    classification,
    m6Present: false,
    m6Evidence: m6.evidence,
    missingRung,
    pack: packInfo,
    maturity: { stage: record.stage, stageName: record.stageName, blockers: record.blockers },
  };
}

// =========================================================================================================
// CLI arg parsing + run() — the CLI's testable core (mirrors bin/install-select.ts's own conventions).
// =========================================================================================================

interface CliOptions {
  installDir?: string;
  profileDir?: string;
  json: boolean;
  out?: string;
  repo?: string;
  workItemId?: string;
  scanLimit?: number;
  target?: MaturityOptions['target'];
  writeInstallJson: boolean;
  preflightBin?: string;
  ghPreflightScript?: string;
}

export interface ParsedArgs {
  opts: CliOptions;
  error?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const opts: CliOptions = { json: false, writeInstallJson: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const takeValue = (flag: string): string | undefined => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return undefined;
      i++;
      return v;
    };
    switch (a) {
      case '--profile-dir': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (the SOURCE profile directory, e.g. profiles/self-driving)` };
        opts.profileDir = v;
        break;
      }
      case '--json':
        opts.json = true;
        break;
      case '--out': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (the file path to write the report to)` };
        opts.out = v;
        break;
      }
      case '--repo': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (owner/name)` };
        opts.repo = v;
        break;
      }
      case '--work-item': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a single work item id to check, instead of a board scan)` };
        opts.workItemId = v;
        break;
      }
      case '--scan-limit': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (an integer)` };
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return { opts, error: `error: ${a} must be a positive integer, got "${v}"` };
        opts.scanLimit = n;
        break;
      }
      case '--target': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value ('local' or 'gh-actions')` };
        if (v !== 'local' && v !== 'gh-actions') return { opts, error: `error: ${a} must be 'local' or 'gh-actions', got "${v}"` };
        opts.target = v;
        break;
      }
      case '--write-install-json':
        opts.writeInstallJson = true;
        break;
      case '--preflight-bin': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a path, passed through to TB.2's A11 override)` };
        opts.preflightBin = v;
        break;
      }
      case '--gh-preflight-script': {
        const v = takeValue(a);
        if (v === undefined) return { opts, error: `error: ${a} requires a value (a path, passed through to TB.2's A12 override)` };
        opts.ghPreflightScript = v;
        break;
      }
      default:
        if (a.startsWith('--')) return { opts, error: `error: unknown flag "${a}"` };
        positional.push(a);
        break;
    }
  }
  opts.installDir = positional[0];
  return { opts };
}

const USAGE = [
  'usage: bun bin/install-prove-advancing.ts <installDir> --profile-dir <profileDir> [--json] [--out <file>]',
  '                                            [--repo <owner/name>] [--work-item <id>] [--scan-limit <n>]',
  '                                            [--target local|gh-actions] [--write-install-json]',
  '                                            [--preflight-bin <path>] [--gh-preflight-script <path>]',
  '',
  'Phase 7 PROVE ADVANCING — a single point-in-time report (never a daemon; see the file header\'s',
  '"watch = point-in-time check" note). Calls TF.1\'s missionAdvancingSignal against <installDir>; on a',
  'negative it reads TB.2\'s computeMaturity to distinguish "ticked without advancing" (M5 already reached)',
  'from "hasn\'t even reached M5 yet", citing the specific missing rung either way. Always exits 0 — a',
  'report verb, like `oa status`/`oa maturity` (non-advancing is a fact to report, not a tool failure).',
].join('\n');

export interface RunResult {
  ok: boolean;
  output: string;
  report?: ProveAdvancingReport;
}

export async function run(argv: string[], opts: ProveAdvancingOptions = {}): Promise<RunResult> {
  const parsed = parseArgs(argv);
  if (parsed.error) return { ok: false, output: `${parsed.error}\n\n${USAGE}` };
  const cli = parsed.opts;
  if (!cli.installDir || !cli.profileDir) return { ok: false, output: USAGE };
  if (!existsSync(cli.installDir)) return { ok: false, output: `error: installDir "${cli.installDir}" does not exist` };
  if (!existsSync(cli.profileDir)) return { ok: false, output: `error: --profile-dir "${cli.profileDir}" does not exist` };

  let report: ProveAdvancingReport;
  try {
    report = await proveAdvancing(cli.installDir, cli.profileDir, {
      proc: opts.proc,
      env: opts.env,
      repo: cli.repo ?? opts.repo,
      workItemId: cli.workItemId ?? opts.workItemId,
      scanLimit: cli.scanLimit ?? opts.scanLimit,
      target: cli.target ?? opts.target,
      writeInstallJson: cli.writeInstallJson || opts.writeInstallJson === true,
      preflightBin: cli.preflightBin ?? opts.preflightBin,
      ghPreflightScript: cli.ghPreflightScript ?? opts.ghPreflightScript,
    });
  } catch (e) {
    return { ok: false, output: `error: ${(e as Error).message ?? e}` };
  }

  const output = cli.json ? JSON.stringify(report, null, 2) : renderReportHuman(report, cli.installDir);
  if (cli.out) writeFileSync(cli.out, output + '\n');
  return { ok: true, output, report };
}

// =========================================================================================================
// Standalone CLI. Always exits 0 (a report verb — see USAGE's own note) unless the invocation itself was
// malformed/erroring (bad args, unreadable installDir/profileDir, a thrown error from the underlying
// modules) — mirrors `oa maturity`'s own "the stage itself is the payload" posture.
// =========================================================================================================
if (import.meta.main) {
  const result = await run(process.argv.slice(2));
  process.stdout.write(result.output + '\n');
  process.exit(result.ok ? 0 : 1);
}
