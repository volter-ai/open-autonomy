// The resident local supervisor. It does not interpret tasks or policy: it periodically asks the atomic
// activator whether origin accepted a new generation, then runs the ordinary reconciler for the active
// root. Old reconcilers lose fire authority immediately and remain only long enough to drain their own
// sessions/effects.
import {
  activateAcceptedGeneration,
  completeGenerationDrain,
  readActivationConfig,
  readActivationState,
  rollbackActivation,
} from './activation.ts';
import { activationHome } from './activation-paths.ts';
import { start, type StartOptions } from './reconciler.ts';
import { defaultProc } from './proc.ts';
import type { ProcRunner } from './types.ts';

export interface SuperviseActivationOptions {
  cwd?: string;
  proc?: ProcRunner;
  signal?: AbortSignal;
  pollMs?: number;
  startGeneration?: typeof start;
  onActive?: (sha: string) => void;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  if (signal?.aborted) return resolve();
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});

export async function superviseActivation(opts: SuperviseActivationOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const proc = opts.proc ?? defaultProc;
  const config = readActivationConfig(cwd, proc);
  if (!config) throw new Error('activation is not configured; run `oa activate --profile <repo-relative-profile>`');
  const home = activationHome(cwd, proc);
  const run = opts.startGeneration ?? start;
  const running = new Map<string, Promise<void>>();

  const launch = async (sha: string, root: string): Promise<void> => {
    if (running.has(sha)) return;
    let ready!: () => void;
    const firstHeartbeat = new Promise<void>((resolve) => { ready = resolve; });
    const ambient: NodeJS.ProcessEnv = {
      ...process.env,
      AUTONOMY_ACTIVATION_HOME: home,
      AUTONOMY_CONTROL_ROOT: root,
      AUTONOMY_CONTROL_SHA: sha,
    };
    const runOptions: StartOptions = {
      cwd: root,
      proc,
      signal: opts.signal,
      ambient,
      generationSha: sha,
      canFire: () => readActivationState(cwd, proc).active?.sha === sha,
      stopWhenDrained: true,
      onHeartbeat: () => ready(),
    };
    const promise = run(runOptions)
      .then(() => {
        if (readActivationState(cwd, proc).active?.sha !== sha) completeGenerationDrain(sha, { cwd, proc });
      })
      .catch((error) => {
        const state = readActivationState(cwd, proc);
        if (state.active?.sha === sha && state.previous) {
          rollbackActivation({ cwd, proc, reason: `scheduler failed: ${(error as Error).message}` });
        } else {
          console.error(`[oa] draining generation ${sha.slice(0, 12)} failed: ${(error as Error).message}`);
        }
      })
      .finally(() => running.delete(sha));
    running.set(sha, promise);
    try {
      await Promise.race([firstHeartbeat, promise]);
      if (!running.has(sha)) throw new Error('generation scheduler exited before its first heartbeat');
      opts.onActive?.(sha);
    } catch (error) {
      const state = readActivationState(cwd, proc);
      if (state.active?.sha === sha && state.previous) {
        rollbackActivation({ cwd, proc, reason: `cold-start failed: ${(error as Error).message}` });
      }
      throw error;
    }
  };

  while (!opts.signal?.aborted) {
    const result = await activateAcceptedGeneration({ cwd, proc });
    if (!result.ok && !result.state.active) throw new Error(result.reason ?? 'no valid active generation');
    const active = result.state.active;
    if (active) await launch(active.sha, active.root);
    if (opts.signal?.aborted) break;
    // Retained draining generations are inspectable; if this process restarted during a drain, restart
    // their reconcilers in drain-only mode as well.
    for (const generation of result.state.draining) await launch(generation.sha, generation.root);
    await sleep(opts.pollMs ?? config.pollMs, opts.signal);
  }
  await Promise.allSettled(running.values());
}
