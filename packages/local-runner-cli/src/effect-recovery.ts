// Explicit recovery for the immediately previous (generation-less) effect marker schema. Unknown work is
// parked, never guessed; an operator inspects it and binds it to the currently verified control SHA.
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { verifyControlGeneration } from './control-generation.ts';
import { defaultProc } from './proc.ts';
import type { ProcRunner } from './types.ts';

export interface RecoverEffectResult {
  ok: boolean;
  path?: string;
  reason?: string;
}

export function recoverEffect(
  markerPath: string,
  controlSha: string,
  opts: { cwd?: string; proc?: ProcRunner } = {},
): RecoverEffectResult {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const proc = opts.proc ?? defaultProc;
  try {
    verifyControlGeneration(cwd, controlSha, proc);
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
  let legacy: Record<string, unknown>;
  try {
    legacy = JSON.parse(readFileSync(resolve(markerPath), 'utf8')) as Record<string, unknown>;
  } catch (error) {
    return { ok: false, reason: `cannot read parked marker: ${(error as Error).message}` };
  }
  for (const field of ['id', 'agent', 'effect', 'worktree']) {
    if (typeof legacy[field] !== 'string' || !legacy[field]) {
      return { ok: false, reason: `parked marker has no valid ${field}` };
    }
  }
  const recovered = {
    ...legacy,
    schema: 'open-autonomy.effect-marker.v2',
    controlRoot: cwd,
    controlSha,
    env: {
      ...((legacy.env && typeof legacy.env === 'object') ? legacy.env as Record<string, string> : {}),
      AUTONOMY_CONTROL_ROOT: cwd,
      AUTONOMY_CONTROL_SHA: controlSha,
      AUTONOMY_TRUSTED_RUNNER: join(cwd, 'scripts', 'runner.ts'),
    },
  };
  const dir = join(cwd, '.open-autonomy', 'runner-state', 'effects');
  mkdirSync(dir, { recursive: true });
  const destination = join(dir, basename(markerPath));
  writeFileSync(destination, `${JSON.stringify(recovered, null, 2)}\n`, { flag: 'wx' });
  unlinkSync(resolve(markerPath));
  try { unlinkSync(`${resolve(markerPath)}.recovery.txt`); } catch { /* optional receipt */ }
  return { ok: true, path: destination };
}
