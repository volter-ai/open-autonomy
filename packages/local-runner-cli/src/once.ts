// `oa once` — makes one pass over unfenced jobs, bypassing cadence/backoff while retaining capacity.
import type { ProcResult, ProcRunner } from './types.ts';
import { defaultProc } from './proc.ts';
import { loadSchedule } from './config.ts';
import { buildTickEnv } from './env.ts';
import { runPreflight } from './preflight.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { activeScheduledSessionCount } from './capacity.ts';

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
  const activeJobs = schedule.jobs.filter((job) => !job.fence || !existsSync(join(cwd, job.fence)));
  if (!activeJobs.length) return { ok: true, fired: 0 };

  // The full run.mjs guard chain (termfleet / OA-04 / OA-09 origin log + AUTONOMY_PROVIDER_URL_SOURCE
  // export / OA-03) — SHARED with `oa start` via runPreflight so the two modes can never drift apart on
  // what they refuse.
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

  const env = buildTickEnv(schedule.env, ambient, 'cron');
  let active = Number.isFinite(schedule.maxConcurrent) && activeJobs.some((job) => job.agent)
    ? activeScheduledSessionCount(cwd, schedule, env, proc)
    : 0;
  if (active === null && activeJobs.some((job) => job.agent)) {
    return { ok: false, fired: 0, reason: `runner liveness is unavailable while maxConcurrent=${schedule.maxConcurrent} is enforced` };
  }
  const results: ProcResult[] = [];
  let skipped = 0;
  for (const job of activeJobs) {
    if (job.agent && active! >= schedule.maxConcurrent) {
      skipped += 1;
      continue;
    }
    const result = proc(job.cmd, [], { shell: true, stdio: 'inherit', env });
    results.push(result);
    if (job.agent && result.status === 0 && !result.error) active = (active ?? 0) + 1;
  }
  const failed = results.filter((result) => result.status !== 0 || result.error);
  if (failed.length) return { ok: false, fired: results.length, reason: `${failed.length} of ${results.length} fired job(s) failed` };
  return { ok: true, fired: results.length, ...(skipped ? { reason: `${skipped} job(s) deferred by maxConcurrent=${schedule.maxConcurrent}` } : {}) };
}
