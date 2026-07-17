import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultProc } from './proc.ts';
import type { ProcRunner } from './types.ts';

export function activationHome(cwd = process.cwd(), proc: ProcRunner = defaultProc): string {
  const result = proc('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8' });
  if (result.status !== 0 || result.error || !result.stdout.trim()) throw new Error('activation requires a git repository');
  return join(resolve(cwd, result.stdout.trim()), 'open-autonomy', 'activation');
}

export function configuredActivationHome(cwd = process.cwd(), proc: ProcRunner = defaultProc): string | null {
  try {
    const home = activationHome(cwd, proc);
    return existsSync(join(home, 'config.json')) ? home : null;
  } catch {
    return null;
  }
}

export interface ActivationRoutingState {
  active?: { sha: string; root: string; acceptedAt: string; validatedAt?: string; activatedAt?: string };
  previous?: { sha: string; root: string; acceptedAt: string; validatedAt?: string; activatedAt?: string };
  staged?: { sha: string; root: string; acceptedAt: string; validatedAt?: string; activatedAt?: string };
  draining: Array<{ sha: string; root: string; acceptedAt: string; validatedAt?: string; activatedAt?: string }>;
  lastFailed?: { sha: string; at: string; reason: string };
  transition?: { targetSha: string; previousSha?: string; phase: string };
}

export function readActivationRoutingState(cwd = process.cwd(), proc: ProcRunner = defaultProc): ActivationRoutingState | null {
  const home = configuredActivationHome(cwd, proc);
  if (!home) return null;
  const path = join(home, 'state.json');
  if (!existsSync(path)) return null;
  try {
    const state = JSON.parse(readFileSync(path, 'utf8')) as ActivationRoutingState & { schema?: string };
    if (state.schema !== 'open-autonomy.activation.v1' || !Array.isArray(state.draining)) throw new Error('invalid activation state');
    return state;
  } catch (error) {
    throw new Error(`activation state is corrupt at ${path}: ${(error as Error).message}`);
  }
}

export function resolvedFencePath(
  cwd: string,
  fence: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const activation = (env.AUTONOMY_ACTIVATION_HOME ?? '').trim();
  if (activation && fence === '.open-autonomy/paused') return join(resolve(activation), 'paused');
  return join(cwd, fence);
}
