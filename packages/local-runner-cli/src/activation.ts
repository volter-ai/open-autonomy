// Atomic activation of accepted local-control generations. This is a deterministic promoter, not an
// agent: git decides which SHA the remote default branch accepted; this module only stages, validates,
// and atomically routes to those already-accepted bytes.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  ExecRunner,
  missingCopySourcesIn,
  parseIr,
  planUpgrade,
  runConformance,
  settingsMergeStrategies,
  validateSkillFrontmatterIn,
} from '@open-autonomy/core';
import { compileLocal, type LocalScheduleConfig } from '@open-autonomy/substrate-local';
import type { Ledger } from '@open-autonomy/dry-run';
import { doctor } from './doctor.ts';
import { defaultProc } from './proc.ts';
import type { ProcRunner } from './types.ts';
import { activationHome } from './activation-paths.ts';
export { activationHome } from './activation-paths.ts';

const SHA = /^[0-9a-f]{40}$/;
export const ACTIVATION_SCHEMA = 'open-autonomy.activation.v1' as const;

export interface ActivationConfig {
  schema: 'open-autonomy.activation-config.v1';
  profile: string;
  providerUrl?: string;
  localScheduleConfig?: string;
  pollMs: number;
}

export interface ActivationGeneration {
  sha: string;
  root: string;
  acceptedAt: string;
  validatedAt?: string;
  activatedAt?: string;
}

export interface ActivationFailure {
  sha: string;
  at: string;
  reason: string;
}

export type ActivationPhase = 'detected' | 'staged' | 'validated' | 'switched' | 'healthy';

export interface ActivationState {
  schema: typeof ACTIVATION_SCHEMA;
  active?: ActivationGeneration;
  previous?: ActivationGeneration;
  staged?: ActivationGeneration;
  draining: ActivationGeneration[];
  lastFailed?: ActivationFailure;
  transition?: { targetSha: string; previousSha?: string; phase: ActivationPhase };
}

export interface ActivationResult {
  ok: boolean;
  action: 'activated' | 'noop' | 'rejected' | 'rolled-back';
  state: ActivationState;
  reason?: string;
}

export interface ActivationOps {
  detectAccepted(): Promise<{ sha: string; acceptedAt: string }>;
  stage(sha: string): Promise<string>;
  validate(generation: ActivationGeneration): Promise<void>;
  health(generation: ActivationGeneration): Promise<void>;
}

export interface ActivationOptions {
  cwd?: string;
  ops?: ActivationOps;
  proc?: ProcRunner;
  ledger?: Ledger;
  now?: () => number;
  interruptAfter?: ActivationPhase;
}

function iso(now: () => number): string {
  return new Date(now()).toISOString();
}

function gitOutput(proc: ProcRunner, cwd: string, args: string[]): string {
  const result = proc('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0 || result.error) {
    throw new Error(`git ${args.join(' ')} failed: ${result.error?.message ?? (result.stderr || result.stdout)}`);
  }
  return result.stdout.trim();
}

export function activationStatePath(cwd = process.cwd(), proc: ProcRunner = defaultProc): string {
  return join(activationHome(cwd, proc), 'state.json');
}

export function activationConfigPath(cwd = process.cwd(), proc: ProcRunner = defaultProc): string {
  return join(activationHome(cwd, proc), 'config.json');
}

export function activationPausePath(cwd = process.cwd(), proc: ProcRunner = defaultProc): string | null {
  const home = activationHome(cwd, proc);
  return existsSync(join(home, 'config.json')) ? join(home, 'paused') : null;
}

export function readActivationState(cwd = process.cwd(), proc: ProcRunner = defaultProc): ActivationState {
  const path = activationStatePath(cwd, proc);
  if (!existsSync(path)) return { schema: ACTIVATION_SCHEMA, draining: [] };
  try {
    const state = JSON.parse(readFileSync(path, 'utf8')) as ActivationState;
    if (state.schema !== ACTIVATION_SCHEMA || !Array.isArray(state.draining)) throw new Error('invalid activation state');
    return state;
  } catch (error) {
    throw new Error(`activation state is corrupt at ${path}: ${(error as Error).message}`);
  }
}

export function readActivationConfig(cwd = process.cwd(), proc: ProcRunner = defaultProc): ActivationConfig | null {
  const path = activationConfigPath(cwd, proc);
  if (!existsSync(path)) return null;
  try {
    const config = JSON.parse(readFileSync(path, 'utf8')) as ActivationConfig;
    if (config.schema !== 'open-autonomy.activation-config.v1' || !config.profile) throw new Error('invalid activation config');
    return config;
  } catch (error) {
    throw new Error(`activation config is corrupt at ${path}: ${(error as Error).message}`);
  }
}

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

function writeState(cwd: string, proc: ProcRunner, state: ActivationState): void {
  atomicJson(activationStatePath(cwd, proc), state);
}

function safeRelativePath(path: string, label: string): string {
  if (!path || isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error(`${label} must be a safe repository-relative path`);
  return path;
}

/** Configure activation without changing pause intent. The first configuration imports the legacy
 * checkout-local pause marker once; subsequent configuration never changes the central marker. */
export function configureActivation(
  config: Omit<ActivationConfig, 'schema'>,
  opts: { cwd?: string; proc?: ProcRunner } = {},
): ActivationConfig {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const proc = opts.proc ?? defaultProc;
  const normalized: ActivationConfig = {
    schema: 'open-autonomy.activation-config.v1',
    profile: safeRelativePath(config.profile, 'profile'),
    ...(config.providerUrl ? { providerUrl: config.providerUrl } : {}),
    ...(config.localScheduleConfig ? { localScheduleConfig: safeRelativePath(config.localScheduleConfig, 'localScheduleConfig') } : {}),
    pollMs: Math.max(1000, Number(config.pollMs) || 60_000),
  };
  if (normalized.providerUrl) new URL(normalized.providerUrl);
  const home = activationHome(cwd, proc);
  const first = !existsSync(join(home, 'config.json'));
  if (first && existsSync(join(cwd, '.open-autonomy', 'paused'))) {
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'paused'), readFileSync(join(cwd, '.open-autonomy', 'paused')));
  }
  // Config is the activation-enabled bit. Publish it last so an interruption can never make schedulers
  // consult a central pause marker before the legacy pause intent has been imported.
  atomicJson(join(home, 'config.json'), normalized);
  return normalized;
}

function remoteDefaultBranch(proc: ProcRunner, cwd: string): string {
  const local = proc('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd, encoding: 'utf8' });
  if (local.status === 0 && local.stdout.trim().startsWith('origin/')) return local.stdout.trim().slice('origin/'.length);
  const remote = gitOutput(proc, cwd, ['ls-remote', '--symref', 'origin', 'HEAD']);
  return /^ref: refs\/heads\/([^\t]+)\tHEAD$/m.exec(remote)?.[1] ?? '';
}

function assertInside(root: string, child: string, label: string): void {
  const rel = relative(root, child);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${label} escapes generation root`);
}

export function liveActivationOps(cwd: string, config: ActivationConfig, proc: ProcRunner = defaultProc): ActivationOps {
  const routingRoot = realpathSync(resolve(cwd));
  const home = activationHome(routingRoot, proc);
  return {
    async detectAccepted() {
      const branch = remoteDefaultBranch(proc, routingRoot);
      if (!branch) throw new Error('cannot resolve origin default branch');
      gitOutput(proc, routingRoot, ['fetch', '--quiet', 'origin', branch]);
      const sha = gitOutput(proc, routingRoot, ['rev-parse', `refs/remotes/origin/${branch}`]).toLowerCase();
      if (!SHA.test(sha)) throw new Error(`origin/${branch} did not resolve to a commit SHA`);
      return { sha, acceptedAt: iso(Date.now) };
    },
    async stage(sha) {
      if (!SHA.test(sha)) throw new Error(`invalid accepted SHA: ${sha}`);
      const root = join(home, 'generations', sha);
      if (!existsSync(root)) {
        mkdirSync(dirname(root), { recursive: true });
        gitOutput(proc, routingRoot, ['worktree', 'add', '--detach', root, sha]);
      }
      const stagedSha = gitOutput(proc, root, ['rev-parse', 'HEAD']).toLowerCase();
      if (stagedSha !== sha) throw new Error(`immutable staging path ${root} contains ${stagedSha}, expected ${sha}`);
      const sourceModules = join(routingRoot, 'node_modules');
      const stagedModules = join(root, 'node_modules');
      if (existsSync(sourceModules) && !existsSync(stagedModules)) symlinkSync(sourceModules, stagedModules, 'dir');
      return realpathSync(root);
    },
    async validate(generation) {
      const root = realpathSync(generation.root);
      const profileDir = resolve(root, config.profile);
      assertInside(root, profileDir, 'profile');
      const irPath = join(profileDir, 'ir.yml');
      if (!existsSync(irPath)) throw new Error(`activation profile is missing: ${config.profile}/ir.yml`);
      const ir = parseIr(readFileSync(irPath, 'utf8'));
      if (!ir.targets.includes('local')) throw new Error(`activation profile ${config.profile} does not declare target local`);
      let scheduleConfig: LocalScheduleConfig | undefined;
      if (config.localScheduleConfig) {
        const path = resolve(routingRoot, config.localScheduleConfig);
        assertInside(routingRoot, path, 'localScheduleConfig');
        scheduleConfig = JSON.parse(readFileSync(path, 'utf8')) as LocalScheduleConfig;
      }
      const compiled = compileLocal(ir, { destDir: root, providerUrl: config.providerUrl, scheduleConfig });
      const errors = [
        ...missingCopySourcesIn(compiled, profileDir).map((path) => `missing copy source: ${path}`),
        ...validateSkillFrontmatterIn(ir, profileDir),
      ];
      if (errors.length) throw new Error(`profile lint failed: ${errors.join('; ')}`);
      const plan = planUpgrade(compiled, profileDir, root, { prune: true, mergeStrategies: settingsMergeStrategies });
      if (plan.changes.length) {
        throw new Error(`accepted generation is not converged with its local profile: ${plan.changes.map((c) => `${c.action}:${c.path}`).join(', ')}`);
      }
      const report = await doctor({ cwd: root, proc, live: false, env: {
        ...process.env,
        AUTONOMY_ACTIVATION_HOME: home,
        AUTONOMY_CONTROL_ROOT: root,
        AUTONOMY_CONTROL_SHA: generation.sha,
      } });
      if (!report.ok) throw new Error(`offline doctor failed: ${report.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join('; ')}`);
      const conformancePath = join(home, `conformance-${generation.sha}.json`);
      const conformance = await runConformance(new ExecRunner(conformancePath), { name: 'exec' });
      try { unlinkSync(conformancePath); } catch { /* diagnostic only */ }
      if (!conformance.passedCore) throw new Error('core runner conformance failed');
    },
    async health(generation) {
      const root = realpathSync(generation.root);
      if (gitOutput(proc, root, ['rev-parse', 'HEAD']).toLowerCase() !== generation.sha) throw new Error('generation HEAD changed before cold start');
      for (const path of ['scheduler/schedule.json', 'scheduler/run.mjs', 'scripts/runner.ts']) {
        if (!existsSync(join(root, path))) throw new Error(`cold-start input missing: ${path}`);
      }
      JSON.parse(readFileSync(join(root, 'scheduler', 'schedule.json'), 'utf8'));
    },
  };
}

function checkpoint(
  cwd: string,
  proc: ProcRunner,
  state: ActivationState,
  phase: ActivationPhase,
  targetSha: string,
  interruptAfter: ActivationPhase | undefined,
): void {
  const previousSha = state.transition?.targetSha === targetSha
    ? state.transition.previousSha
    : state.active?.sha;
  state.transition = { targetSha, ...(previousSha ? { previousSha } : {}), phase };
  writeState(cwd, proc, state);
  if (interruptAfter === phase) throw new Error(`[oa] activation interruption after ${phase}`);
}

/** Run or resume one activation transaction. Every checkpoint is durable and idempotent; the sole
 * routing decision is state.active, changed by one atomic rename. */
export async function activateAcceptedGeneration(opts: ActivationOptions = {}): Promise<ActivationResult> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const proc = opts.proc ?? defaultProc;
  const config = readActivationConfig(cwd, proc);
  if (!config && !opts.ops) throw new Error('activation is not configured; run `oa activate --profile <repo-relative-profile>`');
  const ops = opts.ops ?? liveActivationOps(cwd, config!, proc);
  const now = opts.now ?? Date.now;
  const ledger = opts.ledger;
  let state = readActivationState(cwd, proc);
  let target: { sha: string; acceptedAt: string };
  try {
    target = await ops.detectAccepted();
    ledger?.append('activation', 'accepted-update-detected', { sha: target.sha, active: state.active?.sha ?? null });
  } catch (error) {
    return { ok: false, action: 'rejected', state, reason: (error as Error).message };
  }
  if (!SHA.test(target.sha)) return { ok: false, action: 'rejected', state, reason: `detector returned invalid SHA: ${target.sha}` };
  if (state.active?.sha === target.sha && !state.transition) {
    ledger?.append('activation', 'noop', { sha: target.sha });
    return { ok: true, action: 'noop', state };
  }
  if (state.lastFailed?.sha === target.sha && !state.transition) {
    ledger?.append('activation', 'previously-rejected', { sha: target.sha, reason: state.lastFailed.reason });
    return { ok: false, action: 'rejected', state, reason: state.lastFailed.reason };
  }
  const previous = state.transition?.targetSha === target.sha && state.active?.sha === target.sha
    ? state.previous
    : state.active;
  try {
    checkpoint(cwd, proc, state, 'detected', target.sha, opts.interruptAfter);
    const root = await ops.stage(target.sha);
    const generation: ActivationGeneration = state.staged?.sha === target.sha
      ? state.staged
      : { sha: target.sha, root, acceptedAt: target.acceptedAt };
    state.staged = generation;
    ledger?.append('activation', 'stage', { sha: target.sha, root });
    checkpoint(cwd, proc, state, 'staged', target.sha, opts.interruptAfter);

    await ops.validate(generation);
    generation.validatedAt = iso(now);
    state.staged = generation;
    ledger?.append('activation', 'validate', { sha: target.sha, ok: true });
    checkpoint(cwd, proc, state, 'validated', target.sha, opts.interruptAfter);

    generation.activatedAt = iso(now);
    state.previous = previous;
    state.active = generation;
    state.staged = undefined;
    if (previous && previous.sha !== generation.sha && !state.draining.some((g) => g.sha === previous.sha)) state.draining.push(previous);
    ledger?.append('activation', 'switch', { from: previous?.sha ?? null, to: target.sha });
    checkpoint(cwd, proc, state, 'switched', target.sha, opts.interruptAfter);

    await ops.health(generation);
    ledger?.append('activation', 'cold-start-health', { sha: target.sha, ok: true });
    checkpoint(cwd, proc, state, 'healthy', target.sha, opts.interruptAfter);
    state.transition = undefined;
    writeState(cwd, proc, state);
    return { ok: true, action: 'activated', state };
  } catch (error) {
    const reason = (error as Error).message;
    // An injected interruption models process death: retain the checkpoint exactly as written so the
    // next invocation resumes/replays it. A real validation/startup failure is terminal for this SHA.
    if (reason.startsWith('[oa] activation interruption after')) throw error;
    state = readActivationState(cwd, proc);
    const switched = state.active?.sha === target.sha;
    if (switched) state.active = previous;
    state.staged = undefined;
    state.transition = undefined;
    state.lastFailed = { sha: target.sha, at: iso(now), reason };
    state.draining = state.draining.filter((generation) => generation.sha !== previous?.sha);
    writeState(cwd, proc, state);
    ledger?.append('activation', switched ? 'rollback' : 'reject', { sha: target.sha, reason, active: state.active?.sha ?? null });
    return { ok: false, action: switched ? 'rolled-back' : 'rejected', state, reason };
  }
}

export function rollbackActivation(
  opts: { cwd?: string; proc?: ProcRunner; sha?: string; reason?: string; now?: () => number } = {},
): ActivationResult {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const proc = opts.proc ?? defaultProc;
  const state = readActivationState(cwd, proc);
  const target = opts.sha
    ? [state.previous, ...state.draining].find((generation) => generation?.sha === opts.sha)
    : state.previous;
  if (!target) return { ok: false, action: 'rejected', state, reason: 'no retained generation matches rollback request' };
  const failed = state.active;
  state.active = target;
  state.previous = failed;
  state.draining = state.draining.filter((generation) => generation.sha !== target.sha);
  if (failed && failed.sha !== target.sha && !state.draining.some((generation) => generation.sha === failed.sha)) state.draining.push(failed);
  state.lastFailed = failed ? { sha: failed.sha, at: iso(opts.now ?? Date.now), reason: opts.reason ?? 'manual rollback' } : state.lastFailed;
  state.transition = undefined;
  writeState(cwd, proc, state);
  return { ok: true, action: 'rolled-back', state };
}

/** Mark the runtime work of an old generation drained while retaining its immutable worktree for
 * inspection/rollback. Safe to repeat after supervisor restarts. */
export function completeGenerationDrain(
  sha: string,
  opts: { cwd?: string; proc?: ProcRunner } = {},
): ActivationState {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const proc = opts.proc ?? defaultProc;
  const state = readActivationState(cwd, proc);
  if (state.active?.sha === sha) return state;
  state.draining = state.draining.filter((generation) => generation.sha !== sha);
  writeState(cwd, proc, state);
  return state;
}
