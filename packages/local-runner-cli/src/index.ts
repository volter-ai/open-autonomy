// @volter/oa — the local substrate as a versioned CLI. Public API surface: every verb is both a callable
// function (for programmatic use — e.g. a future fleet console) and reachable via `runCli(argv)`, which
// `src/bin/oa.ts` (the `oa` executable) and an emitted `scheduler/run.mjs` shim (see
// packages/substrate-local/src/emit.ts's opt-in `policy.box.local.runner === "cli"`) both call.
export { start } from './reconciler.ts';
export type { StartOptions } from './reconciler.ts';
export { once } from './once.ts';
export type { OnceResult } from './once.ts';
export { pause, resume, isPaused, pausedMarkerPath, pausedMessage, pauseReasonText, DRAIN_NOTE } from './pause.ts';
export { status, formatStatus, readLastFires } from './status.ts';
export type { StatusReport, LastFireRecord } from './status.ts';
export { dispatch } from './dispatch.ts';
export type { DispatchResult } from './dispatch.ts';
export { doctor, formatDoctorReport } from './doctor.ts';
export type { DoctorReport, DoctorCheck } from './doctor.ts';
export { loadSchedule, normalizeSchedule, agentOf, reconciledScripts, otherScripts } from './config.ts';
export { hasDispatchableWork, resolveBoardKind, readMaturitySignals } from './board-readiness.ts';
export type { DispatchableWorkOptions, DispatchableWorkVerdict, BoardKind, BoardKindSource } from './board-readiness.ts';
export { missionAdvancingSignal } from './m6-signal.ts';
export type { Signal as MissionAdvancingSignal, MissionAdvancingContext, MissionAdvancingSignalFn } from './m6-signal.ts';
export type { NormalizedSchedule, NormalizedScript } from './types.ts';
export { bringUpProvider, providerStatus, providerDown } from './provider.ts';
export type { BringUpOptions, BringUpResult, ProviderState, ProviderStatusResult, ProviderDownResult } from './provider.ts';
export {
  a1GeneratedJsonValid,
  a2CompileClean,
  a3AutonomyYmlParses,
  a4PausedSeeded,
  a5PausedAbsent,
  a6HarnessCommitted,
  a8a10DoctorPass,
  a11PreflightPass,
  a12GhPreflightReady,
  a13ProvisionMatchesLiveProtection,
  a14BoardHasDispatchableWork,
  IMM_SIGNALS,
  collectImmSignals,
} from './imm-signals.ts';
export type { Signal, SignalFn, SignalContext } from './imm-signals.ts';
export { IMM_SIGNAL_IDS, signalSetFor } from './signal-sets.ts';
export { resolveInstallScript, runInstallDelegate, INSTALL_NOT_AVAILABLE_MESSAGE } from './install-delegate.ts';
export type { InstallDelegateResult, RunInstallDelegateOptions, SpawnFn } from './install-delegate.ts';
export type { ImmSignalId, SignalId, SignalSet, SignalSetPack, SkippedSignal, InstallTarget } from './signal-sets.ts';
export {
  computeMaturity,
  directionContentSignal,
  proxyReadySignal,
  humanSeamWiredSignal,
  evaluateExtraRung,
  declaredAgentNames,
  STAGE_NAMES,
  STAGE_ORDER,
  INSTALL_JSON_REL,
} from './maturity.ts';
export type { Stage, InstallRecord, InstallSignalEntry, InstallSkipEntry, MaturityOptions, PackInfo, SessionProbe } from './maturity.ts';

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './reconciler.ts';
import { once } from './once.ts';
import { pause, resume } from './pause.ts';
import { status, formatStatus } from './status.ts';
import { dispatch } from './dispatch.ts';
import { doctor, formatDoctorReport } from './doctor.ts';
import { bringUpProvider, providerStatus, providerDown } from './provider.ts';
import { computeMaturity } from './maturity.ts';
import type { MaturityOptions } from './maturity.ts';
import type { InstallTarget } from './signal-sets.ts';
import { runInstallDelegate } from './install-delegate.ts';

function pkgVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const HELP = `oa <command> [args]  (@volter/oa v${pkgVersion()}) — the local open-autonomy substrate as a CLI

  oa start                     continuous mode: the state-gated reconciler heartbeat (was: node scheduler/run.mjs)
  oa once                      fire the full schedule exactly once, unconditionally (was: node scheduler/run.mjs --once)
  oa pause [reason]             touch .open-autonomy/paused — blocks NEW waves; in-flight waves drain to completion
  oa resume                     remove .open-autonomy/paused — the operator's act, re-arms the reconciler
  oa status                     fence state + live sessions + last-fire info
  oa dispatch <agent>           fire exactly the one schedule line for <agent> now, bypassing the fence
  oa doctor [--live] [--json]   offline checks: dep-integrity + fence + schedule.json + prompts/skills;
                                --live additionally probes the termfleet provider's /healthz over the network
  oa maturity [--json] [--profile-dir <path>] [--profile <name>] [--target local|gh-actions]
                                [--repo <owner/name>] [--actor <name>] [--work-item <id>]
                                [--preflight-bin <path>] [--gh-preflight-script <path>]
                                composes the IMM stage verdict (M0..M6, DESIGN §Q1) from every deterministic
                                signal + the mission-advancing check and writes .open-autonomy/install.json
                                (idempotent overwrite every run). --profile-dir points at the SOURCE profile
                                (e.g. profiles/simple-sdlc) — without it, only the universal signal set runs
                                and profile-specific rungs report honestly unresolved. A report verb (like
                                'oa status'): always exits 0 — the stage itself is the payload.
  oa provider up                 bring up a repo-unique-port termfleet console+provider, verify its
                                identity, and pin TERMFLEET_PROVIDER_URL durably into schedule.json's env
                                (idempotent: no-ops on a healthy pin, restarts a dead one on the same ports)
  oa provider status             report whether the pinned provider is up and really answering as termfleet
  oa provider down                stop the provider/console this install brought up (best-effort SIGTERM)
  oa install [args]              (TE.8) the one-shot install agent — chains DETECT->SELECT->DIRECTION->
                                AUTHORIZE->EXECUTE->VALIDATE->HAND-OFF->PROVE-ADVANCING into one command,
                                pausing at the 4 human gates by default. Try 'oa install --dry-run' FIRST —
                                the safe way to rehearse the entire chain against a real repo with zero real
                                side effects (no real npm/git/compile writes, no real termfleet provider
                                bring-up, no real agent dispatch). Delegates (spawns, never imports) to the
                                monorepo's own bin/install.ts — SOURCE-CHECKOUT ONLY today (T0.1): run
                                'oa install --help' for the full flow, or see it directly with
                                'bun bin/install.ts --help'.

The '.open-autonomy/paused' marker file is the source of truth; this CLI is ergonomics over the file, never
a daemon holding its own state. schedule.json/autonomy.yml/prompts are read from the current working
directory (the repo root) — nothing is bundled or cached from a prior install.
`;

/** Legacy-argv-compatible entry point: an emitted `scheduler/run.mjs` shim calls this with
 *  `process.argv.slice(2)` exactly as the pre-U4 template did, so `node scheduler/run.mjs --once` /
 *  `node scheduler/run.mjs` (no args = continuous) keep working unchanged under the opt-in CLI emission. */
export async function runCli(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const cwd = process.cwd();

  if (!cmd || cmd === 'start') {
    try {
      await start({ cwd });
      return 0;
    } catch (e) {
      // A preflight failure already printed its guard message inside runPreflight; surface the summary +
      // exit nonzero — the exact behavior run.mjs had (process.exit(1) after the guard's console.error).
      console.error((e as Error)?.message ?? e);
      return 1;
    }
  }
  if (cmd === '--once' || cmd === 'once') {
    const r = await once({ cwd });
    return r.ok ? 0 : 1;
  }
  if (cmd === 'pause') {
    const r = pause({ cwd, reason: rest.length ? rest.join(' ') : undefined });
    console.log(`[oa] pause: ${r.alreadyPaused ? 'already paused' : 'paused'} (${r.path})`);
    return 0;
  }
  if (cmd === 'resume') {
    const r = resume({ cwd });
    console.log(`[oa] resume: ${r.wasPaused ? 'unpaused' : 'was not paused'} (${r.path})`);
    return 0;
  }
  if (cmd === 'status') {
    const r = await status({ cwd });
    console.log(formatStatus(r));
    return 0;
  }
  if (cmd === 'dispatch') {
    const agent = rest[0];
    if (!agent) {
      console.error('[oa] dispatch: requires an agent name — oa dispatch <agent>');
      return 1;
    }
    const r = dispatch(agent, { cwd });
    if (r.reason && !r.matched) console.error(r.reason);
    return r.ok ? 0 : 1;
  }
  if (cmd === 'doctor') {
    const json = rest.includes('--json');
    const live = rest.includes('--live');
    const r = await doctor({ cwd, live });
    console.log(json ? JSON.stringify(r, null, 2) : formatDoctorReport(r));
    return r.ok ? 0 : 1;
  }
  if (cmd === 'maturity') {
    const json = rest.includes('--json');
    const flag = (name: string): string | undefined => {
      const i = rest.indexOf(name);
      return i >= 0 && i + 1 < rest.length ? rest[i + 1] : undefined;
    };
    const profileDir = flag('--profile-dir');
    const profile = flag('--profile');
    const targetFlag = flag('--target');
    const repo = flag('--repo');
    const actor = flag('--actor');
    const workItemId = flag('--work-item');
    const preflightBin = flag('--preflight-bin');
    const ghPreflightScript = flag('--gh-preflight-script');

    const mOpts: MaturityOptions = { cwd };
    if (profileDir) mOpts.profileDir = profileDir;
    if (profile) mOpts.profile = profile;
    if (targetFlag === 'local' || targetFlag === 'gh-actions') mOpts.target = targetFlag as InstallTarget;
    if (repo) mOpts.repo = repo;
    if (actor) mOpts.actor = actor;
    if (workItemId) mOpts.workItemId = workItemId;
    if (preflightBin) mOpts.preflightBin = preflightBin;
    if (ghPreflightScript) mOpts.ghPreflightScript = ghPreflightScript;

    const record = await computeMaturity(mOpts);
    if (json) {
      console.log(JSON.stringify(record, null, 2));
    } else {
      console.log(`[oa] maturity: ${record.stage}/${record.stageName} (profile=${record.profile ?? '(unknown)'}, substrate=${record.substrate ?? '(unknown)'})`);
      for (const b of record.blockers) console.log(`[oa]   ${b}`);
      console.log(`[oa]   wrote ${join(cwd, '.open-autonomy', 'install.json')}`);
    }
    // A report verb, like `oa status` — the stage/blockers are the payload; the invocation itself never
    // "fails" just because the install isn't fully mature yet.
    return 0;
  }
  if (cmd === 'provider') {
    const sub = rest[0];
    if (sub === 'up') {
      const r = await bringUpProvider({ cwd });
      console.log(`[oa] provider up: ${r.action} — ${r.detail}`);
      return r.action === 'foreign-occupant-refused' ? 1 : 0;
    }
    if (sub === 'status') {
      const r = await providerStatus({ cwd });
      console.log(`[oa] provider status: ${r.detail}`);
      return r.running ? 0 : 1;
    }
    if (sub === 'down') {
      const r = providerDown({ cwd });
      console.log(`[oa] provider down: ${r.action} — ${r.detail}`);
      return 0;
    }
    console.error(`[oa] provider: unknown subcommand "${sub}" — usage: oa provider up|status|down`);
    return 1;
  }
  if (cmd === 'install') {
    const r = runInstallDelegate(rest, { cwd });
    if (r.message) console.error(r.message);
    return r.code;
  }
  if (cmd === '--help' || cmd === 'help' || cmd === '-h') {
    console.log(HELP);
    return 0;
  }
  console.error(`[oa] unknown command "${cmd}"\n\n${HELP}`);
  return 1;
}

export { HELP };
