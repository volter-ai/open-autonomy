// `oa once` — fires every currently unfenced job once, with no cadence or backoff state.
import type { ProcRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { loadSchedule } from './config.ts';
import { buildTickEnv, fireCommands } from './env.ts';
import { runPreflight } from './preflight.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface OnceResult {
  ok: boolean;
  reason?: string;
  fired: number;
}

export async function once(
  opts: { cwd?: string; proc?: ProcRunner; ambient?: NodeJS.ProcessEnv; resolveDefault?: () => Promise<{ baseUrl: string; source: string }> } = {},
): Promise<OnceResult> {
  const cwd = opts.cwd ?? process.cwd();
  const proc = opts.proc ?? defaultProc;
  const ambient = opts.ambient ?? process.env;

  const schedule = loadSchedule(cwd);
  const globallyPaused = existsSync(join(cwd, '.open-autonomy', 'paused'));
  const activeJobs = schedule.jobs.filter((job) => !globallyPaused && (!job.fence || !existsSync(join(cwd, job.fence))));
  const cmds = activeJobs.map((job) => job.cmd);
  if (!cmds.length) return { ok: true, fired: 0 };

  // The full run.mjs guard chain (termfleet / OA-04 / OA-09 origin log + AUTONOMY_PROVIDER_URL_SOURCE
  // export / OA-03) — SHARED with `oa start` via runPreflight so the two modes can never drift apart on
  // what they refuse (the failure mode the pre-U4 template never had, because it was one file).
  const pre = await runPreflight({ ...schedule, jobs: activeJobs, scripts: activeJobs }, {
    cwd,
    proc,
    ambient,
    ...(opts.resolveDefault ? { resolveDefault: opts.resolveDefault } : {}),
  });
  if (!pre.ok) {
    const result: OnceResult = { ok: false, fired: 0 };
    if (pre.message) result.reason = pre.message;
    return result;
  }

  fireCommands(cmds, buildTickEnv(schedule.env, ambient, 'cron'), proc);
  return { ok: true, fired: cmds.length };
}
